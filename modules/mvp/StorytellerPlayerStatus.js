const STATUS_FIELDS = Object.freeze([
  'alive',
  'poisoned',
  'drunk',
  'protected',
  'deadVoteAvailable'
]);
const REQUEST_FIELDS = new Set(['requestId', 'roomId', 'seat', ...STATUS_FIELDS]);
const REQUEST_LEDGER_LIMIT = 100;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function getCurrentStatus(player) {
  if (!player) return null;
  return {
    alive: player.alive !== false,
    poisoned: player.poisoned === true,
    drunk: player.drunk === true,
    protected: player.protected === true,
    deadVoteAvailable: player.deadVoteAvailable !== false
  };
}

function getRequestIdentity(request) {
  return {
    requestId: typeof request?.requestId === 'string' && request.requestId.trim()
      ? request.requestId.trim()
      : null,
    seat: Number.isInteger(request?.seat) ? request.seat : null
  };
}

function buildBoundaryData(overrides = {}) {
  return {
    status: overrides.status || 'refused',
    reason: overrides.reason || null,
    requestId: overrides.requestId ?? null,
    seat: overrides.seat ?? null,
    changed: overrides.changed || {},
    current: overrides.current || null,
    correctionOnly: true,
    duplicate: overrides.duplicate === true,
    serverMutation: overrides.serverMutation || false,
    phaseChanged: false,
    roundChanged: false,
    phaseCoordinatorInvoked: false,
    gameEndCheckInvoked: false
  };
}

function refuse(room, request, reason, current = null) {
  const identity = getRequestIdentity(request);
  return {
    room,
    response: {
      type: 'storyteller_player_status_refused',
      data: buildBoundaryData({
        status: 'refused',
        reason,
        requestId: identity.requestId,
        seat: identity.seat,
        current
      })
    },
    applied: false,
    duplicate: false,
    historyRequired: false,
    ledgerUpdated: false,
    previous: current,
    current,
    changed: {}
  };
}

function normalizeChanges(request) {
  const changes = {};
  for (const field of STATUS_FIELDS) {
    if (hasOwn(request, field)) changes[field] = request[field];
  }
  return changes;
}

function buildRequestSignature(roomId, seat, changes) {
  return JSON.stringify({
    roomId,
    seat,
    changes: STATUS_FIELDS.reduce((result, field) => {
      if (hasOwn(changes, field)) result[field] = changes[field];
      return result;
    }, {})
  });
}

function updateStorytellerPlayerStatus(room, request = {}, options = {}) {
  if (!room?.state) return refuse(room, request, 'room-not-found');
  if (options.storytellerAuthorized !== true) {
    return refuse(room, request, 'unauthorized-storyteller');
  }
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return refuse(room, request, 'invalid-request');
  }

  if (!hasOwn(request, 'requestId') || request.requestId === '') {
    return refuse(room, request, 'missing-request-id');
  }
  if (
    typeof request.requestId !== 'string'
    || !request.requestId.trim()
    || request.requestId.trim().length > 120
  ) {
    return refuse(room, request, 'invalid-request-id');
  }
  const requestId = request.requestId.trim();

  if (!hasOwn(request, 'roomId') || request.roomId === '') {
    return refuse(room, { ...request, requestId }, 'missing-room-id');
  }
  if (typeof request.roomId !== 'string' || request.roomId.trim() !== room.id) {
    return refuse(room, { ...request, requestId }, 'room-id-mismatch');
  }

  const seat = request.seat;
  const maxSeat = Number.isInteger(room.state.playerCount) ? room.state.playerCount : 15;
  if (!Number.isInteger(seat) || seat < 1 || seat > maxSeat) {
    return refuse(room, { ...request, requestId }, 'invalid-seat');
  }

  const player = (room.state.players || []).find((item) => Number(item?.seat) === seat);
  if (!player) {
    return refuse(room, { ...request, requestId }, 'player-not-found');
  }
  const current = getCurrentStatus(player);

  const unsupportedField = Object.keys(request).find((field) => !REQUEST_FIELDS.has(field));
  if (unsupportedField) {
    return refuse(room, { ...request, requestId }, 'unsupported-status-field', current);
  }

  const changes = normalizeChanges(request);
  if (Object.keys(changes).length === 0) {
    return refuse(room, { ...request, requestId }, 'missing-status-change', current);
  }
  if (Object.values(changes).some((value) => typeof value !== 'boolean')) {
    return refuse(room, { ...request, requestId }, 'invalid-status-value', current);
  }

  const signature = buildRequestSignature(room.id, seat, changes);
  const ledger = Array.isArray(room.state.storytellerPlayerStatusRequests)
    ? room.state.storytellerPlayerStatusRequests
    : [];
  const existingReceipt = ledger.find((entry) => entry?.requestId === requestId);
  if (existingReceipt) {
    if (existingReceipt.signature !== signature) {
      return refuse(room, { ...request, requestId }, 'request-id-conflict', current);
    }
    return {
      room,
      response: {
        type: 'storyteller_player_status_updated',
        data: buildBoundaryData({
          status: 'updated',
          requestId,
          seat,
          changed: {},
          current,
          duplicate: true,
          serverMutation: false
        })
      },
      applied: false,
      duplicate: true,
      historyRequired: false,
      ledgerUpdated: false,
      previous: current,
      current,
      changed: {}
    };
  }

  const changed = {};
  for (const [field, value] of Object.entries(changes)) {
    if (current[field] !== value) changed[field] = value;
  }
  const applied = Object.keys(changed).length > 0;
  const nextPlayers = (room.state.players || []).map((item) => {
    if (Number(item?.seat) !== seat) return item;
    return { ...item, ...changed };
  });
  const nextCurrent = { ...current, ...changed };
  const responseData = buildBoundaryData({
    status: 'updated',
    requestId,
    seat,
    changed,
    current: nextCurrent,
    duplicate: !applied,
    serverMutation: applied ? 'player-status-correction-only' : false
  });
  const receipt = {
    requestId,
    seat,
    changes: clone(changes),
    signature,
    responseData: clone(responseData),
    createdAt: options.now || new Date().toISOString()
  };
  const nextLedger = [...ledger, receipt].slice(-REQUEST_LEDGER_LIMIT);
  const nextRoom = {
    ...room,
    state: {
      ...room.state,
      players: nextPlayers,
      storytellerPlayerStatusRequests: nextLedger
    }
  };

  return {
    room: nextRoom,
    response: {
      type: 'storyteller_player_status_updated',
      data: responseData
    },
    applied,
    duplicate: !applied,
    historyRequired: applied,
    ledgerUpdated: true,
    previous: current,
    current: nextCurrent,
    changed
  };
}

module.exports = {
  REQUEST_LEDGER_LIMIT,
  STATUS_FIELDS,
  getCurrentStatus,
  updateStorytellerPlayerStatus
};
