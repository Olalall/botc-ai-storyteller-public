const {
  buildRoleCatalog,
  getScriptById,
} = require('../ScriptCatalog');
const {
  buildPlayerView,
  findForbiddenPlayerViewPaths
} = require('../PlayerViewProjection');

const MIN_SUPPORTED_PLAYERS = 7;
const MAX_SUPPORTED_PLAYERS = 15;
const DEALT_PHASE = 'roles-dealt';

class DealRolesError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DealRolesError';
    this.code = code;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getPlayerCount(room) {
  if (Number.isInteger(room.playerCount)) return room.playerCount;
  if (Number.isInteger(room.setupLock?.playerCount)) return room.setupLock.playerCount;
  return asArray(room.players).length;
}

function getStorytellerSessionId(room) {
  return room.storytellerSessionId
    ?? room.storytellerSession?.id
    ?? room.storyteller?.sessionId
    ?? null;
}

function isStorytellerAuthorized(room, sessionId) {
  if (!sessionId) return false;
  const allowedSessions = asArray(room.authorizedStorytellerSessionIds);
  if (allowedSessions.includes(sessionId)) return true;
  return getStorytellerSessionId(room) === sessionId;
}

function getCandidate(room, candidateId) {
  const candidates = [
    ...asArray(room.setupCandidates),
    room.confirmedSetupCandidate,
    room.setupCandidate
  ].filter(Boolean);

  if (!candidateId) {
    return candidates.find((candidate) => isCandidateConfirmed(candidate)) || null;
  }

  return candidates.find((candidate) => {
    return candidate.id === candidateId
      || candidate.candidateId === candidateId
      || candidate.setupCandidateId === candidateId;
  }) || null;
}

function isCandidateConfirmed(candidate) {
  return candidate.confirmed === true
    || candidate.status === 'confirmed'
    || candidate.state === 'confirmed'
    || candidate.storytellerConfirmed === true;
}

function getScriptId(room) {
  return room.scriptId ?? room.currentScript ?? 'trouble-brewing';
}

function roleFor(roleId, scriptId = 'trouble-brewing') {
  return buildRoleCatalog(scriptId).get(roleId) || null;
}

function getAssignmentSeat(assignment) {
  return Number(assignment.seat ?? assignment.seatNumber);
}

function getTrueRoleId(assignment) {
  return assignment.trueRoleId
    ?? assignment.realRoleId
    ?? assignment.roleId
    ?? null;
}

function getShownRoleId(assignment) {
  return assignment.shownRoleId
    ?? assignment.displayRoleId
    ?? assignment.visibleRoleId
    ?? getTrueRoleId(assignment);
}

function assert(condition, code, message) {
  if (!condition) {
    throw new DealRolesError(code, message);
  }
}

function validatePlayers(room, playerCount) {
  const players = asArray(room.players);
  assert(players.length === playerCount, 'players_not_ready', 'Player count does not match seated players');

  const seenSeats = new Set();
  for (const player of players) {
    const seat = Number(player.seat);
    assert(Number.isInteger(seat) && seat >= 1 && seat <= playerCount, 'invalid_seat', 'Invalid player seat');
    assert(!seenSeats.has(seat), 'duplicate_seat', 'Duplicate player seat');
    seenSeats.add(seat);
    assert(player.playerToken || player.token || player.playerTokenHash, 'missing_token', 'Player seat is missing token');
  }

  for (let seat = 1; seat <= playerCount; seat += 1) {
    assert(seenSeats.has(seat), 'missing_seat', `Seat ${seat} is not occupied`);
  }
}

function validateDemonBluffs(candidate, assignments, scriptId) {
  const demonBluffs = asArray(candidate.demonBluffs);
  assert(demonBluffs.length === 3, 'invalid_demon_bluffs', 'Demon must receive exactly three bluffs');

  const inPlayRoleIds = new Set(assignments.map((assignment) => getTrueRoleId(assignment)));
  for (const bluff of demonBluffs) {
    const roleId = typeof bluff === 'string' ? bluff : bluff.roleId ?? bluff.id;
    const role = roleFor(roleId, scriptId);
    assert(role, 'invalid_demon_bluff_role', `Unknown demon bluff role: ${roleId}`);
    assert(role.alignment === 'good', 'invalid_demon_bluff_alignment', 'Demon bluffs must be good roles');
    assert(!inPlayRoleIds.has(roleId), 'demon_bluff_in_play', 'Demon bluff role is already in play');
  }
}

function validateAssignments(candidate, playerCount, scriptId) {
  const assignments = asArray(candidate.assignments ?? candidate.roleAssignments);
  assert(assignments.length === playerCount, 'invalid_assignments', 'Candidate assignments do not match player count');

  const seenSeats = new Set();
  let demonCount = 0;

  for (const assignment of assignments) {
    const seat = getAssignmentSeat(assignment);
    assert(Number.isInteger(seat) && seat >= 1 && seat <= playerCount, 'invalid_assignment_seat', 'Invalid assignment seat');
    assert(!seenSeats.has(seat), 'duplicate_assignment_seat', 'Duplicate assignment seat');
    seenSeats.add(seat);

    const trueRole = roleFor(getTrueRoleId(assignment), scriptId);
    const shownRole = roleFor(getShownRoleId(assignment), scriptId);
    assert(trueRole, 'invalid_true_role', 'Assignment contains an unknown true role');
    assert(shownRole, 'invalid_shown_role', 'Assignment contains an unknown shown role');

    if (trueRole.group === 'demons') demonCount += 1;
    if (trueRole.id === 'drunk') {
      assert(shownRole.group === 'townsfolk', 'invalid_drunk_shown_role', 'Drunk must be shown a townsfolk role');
    }
  }

  assert(demonCount === 1, 'invalid_demon_count', 'MVP runtime requires exactly one demon');
  validateDemonBluffs(candidate, assignments, scriptId);
  return assignments;
}

function normalizeBluff(bluff, scriptId) {
  const roleId = typeof bluff === 'string' ? bluff : bluff.roleId ?? bluff.id;
  const role = roleFor(roleId, scriptId);
  return {
    roleId: role.id,
    roleName: role.name,
    roleNameEn: role.nameEn,
    ability: role.ability,
    team: 'good'
  };
}

function applyAssignmentToPlayer(player, assignment, scriptId) {
  const trueRole = roleFor(getTrueRoleId(assignment), scriptId);
  const shownRole = roleFor(getShownRoleId(assignment), scriptId);

  return {
    ...player,
    trueRoleId: trueRole.id,
    trueRoleType: trueRole.group.replace(/s$/, ''),
    trueAlignment: trueRole.alignment,
    shownRoleId: shownRole.id,
    shownRoleName: shownRole.name,
    shownRoleNameEn: shownRole.nameEn,
    shownAbility: shownRole.ability,
    shownTeam: shownRole.group,
    shownAlignment: shownRole.alignment,
    connected: player.connected === true,
    alive: player.alive !== false,
    deadVoteAvailable: player.deadVoteAvailable !== false
  };
}

function makeIdentityMessage(player, commandId, createdAt) {
  return {
    id: `${commandId}:identity:${player.seat}`,
    type: 'identity',
    privateToSeat: player.seat,
    title: '你的身份',
    text: `你的身份是 ${player.shownRoleName}。阵营：${player.shownAlignment === 'evil' ? '邪恶' : '好人'}。能力：${player.shownAbility}`,
    createdAt,
    readAt: null
  };
}

function buildStorytellerView(room) {
  return {
    roomId: room.id ?? room.roomId ?? null,
    scriptId: room.scriptId ?? room.currentScript ?? 'trouble-brewing',
    phase: room.phase,
    playerCount: getPlayerCount(room),
    players: asArray(room.players).map((player) => ({
      seat: player.seat,
      name: player.name ?? `Player ${player.seat}`,
      trueRoleId: player.trueRoleId,
      shownRoleId: player.shownRoleId,
      trueAlignment: player.trueAlignment,
      shownAlignment: player.shownAlignment,
      alive: player.alive !== false
    })),
    demonBluffs: asArray(room.demonBluffs),
    dealRoles: room.dealRoles
  };
}

function validateCommand({ room, command }) {
  assert(room && typeof room === 'object', 'missing_room', 'Room is required');
  assert(command && typeof command === 'object', 'missing_command', 'Command is required');
  assert(command.command === 'storyteller_deal_roles', 'invalid_command', 'Unsupported command');
  assert(command.commandId, 'missing_command_id', 'Command id is required');
  assert(isStorytellerAuthorized(room, command.storytellerSessionId), 'forbidden', 'Only storyteller can deal roles');

  const scriptId = getScriptId(room);
  assert(getScriptById(scriptId), 'invalid_script', `Unsupported script: ${scriptId}`);

  const playerCount = getPlayerCount(room);
  assert(
    playerCount >= MIN_SUPPORTED_PLAYERS && playerCount <= MAX_SUPPORTED_PLAYERS,
    'unsupported_player_count',
    'Stage 4 supports 7-15 players'
  );

  if (room.dealRoles?.commandId) {
    assert(room.dealRoles.commandId === command.commandId, 'already_dealt', 'Roles have already been dealt');
    return { playerCount, candidate: null, assignments: null, alreadyDealt: true };
  }

  validatePlayers(room, playerCount);

  const candidate = getCandidate(room, command.candidateId);
  assert(candidate, 'candidate_not_found', 'Setup candidate was not found');
  assert(isCandidateConfirmed(candidate), 'candidate_not_confirmed', 'Setup candidate is not confirmed');

  const candidateId = candidate.id ?? candidate.candidateId ?? candidate.setupCandidateId ?? null;
  assert(!command.candidateId || candidateId === command.candidateId, 'candidate_mismatch', 'Setup candidate id mismatch');

  return {
    playerCount,
    candidate,
    assignments: validateAssignments(candidate, playerCount, scriptId),
    alreadyDealt: false
  };
}

function buildAllPlayerViews(room) {
  const views = {};
  for (const player of asArray(room.players)) {
    views[player.seat] = buildPlayerView(room, player.seat);
  }
  return views;
}

function dealRoles(input) {
  const room = clone(input.room);
  const command = clone(input.command);
  const createdAt = input.now ?? new Date().toISOString();
  const validation = validateCommand({ room, command });
  const scriptId = getScriptId(room);

  if (validation.alreadyDealt) {
    return {
      ok: true,
      idempotent: true,
      room,
      storytellerView: buildStorytellerView(room),
      playerViews: buildAllPlayerViews(room)
    };
  }

  const assignmentsBySeat = new Map(
    validation.assignments.map((assignment) => [getAssignmentSeat(assignment), assignment])
  );

  const players = asArray(room.players)
    .slice()
    .sort((left, right) => Number(left.seat) - Number(right.seat))
    .map((player) => applyAssignmentToPlayer(player, assignmentsBySeat.get(Number(player.seat)), scriptId));

  const identityMessages = players.map((player) => makeIdentityMessage(player, command.commandId, createdAt));
  const nextRoom = {
    ...room,
    phase: DEALT_PHASE,
    playerCount: validation.playerCount,
    players,
    demonBluffs: asArray(validation.candidate.demonBluffs).map((bluff) => normalizeBluff(bluff, scriptId)),
    privateMessages: [
      ...asArray(room.privateMessages),
      ...identityMessages
    ],
    dealRoles: {
      commandId: command.commandId,
      candidateId: validation.candidate.id ?? validation.candidate.candidateId ?? null,
      dealtAt: createdAt,
      dealtBy: command.storytellerSessionId
    },
    actionHistory: [
      ...asArray(room.actionHistory),
      {
        type: 'storyteller_deal_roles',
        commandId: command.commandId,
        candidateId: validation.candidate.id ?? validation.candidate.candidateId ?? null,
        createdAt
      }
    ]
  };

  const playerViews = buildAllPlayerViews(nextRoom);
  const leakPaths = Object.entries(playerViews)
    .flatMap(([seat, view]) => findForbiddenPlayerViewPaths(view).map((path) => `seat${seat}:${path}`));
  assert(leakPaths.length === 0, 'player_view_leak', `Forbidden player view fields: ${leakPaths.join(', ')}`);

  return {
    ok: true,
    idempotent: false,
    room: nextRoom,
    storytellerView: buildStorytellerView(nextRoom),
    playerViews
  };
}

module.exports = {
  DEALT_PHASE,
  DealRolesError,
  buildAllPlayerViews,
  dealRoles
};
