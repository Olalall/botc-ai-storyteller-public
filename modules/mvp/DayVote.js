const {
  DEMON_ROLE_IDS,
  MINION_ROLE_IDS,
  TOWNSFOLK_ROLE_IDS,
  getAlignmentForPlayer,
  normalizeRoleId
} = require('./RuleAutomation');
const { applyRoleTransitionToPlayer } = require('./RoleStateTransition');

const FORBIDDEN_PLAYER_VIEW_KEYS = [
  'trueRoleId',
  'realAlignment',
  'drunk',
  'poisoned',
  'isDrunk',
  'isPoisoned',
  'redHerring',
  'reminders',
  'storytellerNotes',
  'candidateResolutions',
  'fullEventLog',
  'aiAudit',
  'allNightSubmissions',
  'playerToken',
  'playerTokenHash',
];

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso(now) {
  if (now instanceof Date) return now.toISOString();
  if (typeof now === 'string' && now.length > 0) return now;
  return new Date().toISOString();
}

function makeId(prefix, timestamp, parts = []) {
  const normalizedTimestamp = String(timestamp).replace(/[^0-9A-Za-z]/g, '').slice(0, 20);
  const suffix = parts.map((part) => String(part)).join('-');
  return `${prefix}-${normalizedTimestamp}${suffix ? `-${suffix}` : ''}`;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getState(room) {
  return room?.state ?? {};
}

function getPhase(room) {
  return getState(room).phase ?? room?.phase ?? null;
}

function getRound(room) {
  const round = getState(room).round ?? room?.round;
  return Number.isInteger(round) ? round : null;
}

function getSeats(room) {
  const state = getState(room);
  const sourceSeats = asArray(state.seats).length > 0 ? state.seats : room?.seats;
  const sourcePlayers = asArray(state.players).length > 0 ? state.players : room?.players;
  const seatRecords = asArray(sourceSeats).length > 0 ? sourceSeats : asArray(sourcePlayers);

  return seatRecords
    .map((seatRecord) => ({
      ...seatRecord,
      seat: Number(seatRecord.seat),
      alive: seatRecord.alive !== false,
      deadVoteAvailable: seatRecord.deadVoteAvailable !== false,
    }))
    .filter((seatRecord) => Number.isInteger(seatRecord.seat))
    .sort((left, right) => left.seat - right.seat);
}

function hasSeat(room, seat) {
  return getSeats(room).some((seatRecord) => seatRecord.seat === seat);
}

function getSeatRecord(room, seat) {
  return getSeats(room).find((seatRecord) => seatRecord.seat === seat) ?? null;
}

function getRoleId(seatRecord) {
  return normalizeRoleId(seatRecord?.trueRoleId || seatRecord?.realRoleId || seatRecord?.roleId || seatRecord?.role || seatRecord?.shownRoleId);
}

function isDemon(seatRecord) {
  const roleId = getRoleId(seatRecord);
  const roleKind = normalizeRoleId(seatRecord?.trueRoleType || seatRecord?.realRoleType || seatRecord?.roleType || seatRecord?.team);
  return DEMON_ROLE_IDS.has(roleId) || ['demon', 'demons'].includes(roleKind);
}

function isMinion(seatRecord) {
  const roleId = getRoleId(seatRecord);
  const roleKind = normalizeRoleId(seatRecord?.trueRoleType || seatRecord?.realRoleType || seatRecord?.roleType || seatRecord?.team);
  return MINION_ROLE_IDS.has(roleId) || ['minion', 'minions'].includes(roleKind);
}

function isTownsfolk(seatRecord) {
  const roleId = getRoleId(seatRecord);
  const roleKind = normalizeRoleId(seatRecord?.trueRoleType || seatRecord?.realRoleType || seatRecord?.roleType || seatRecord?.team);
  return TOWNSFOLK_ROLE_IDS.has(roleId) || roleKind === 'townsfolk';
}

function isGood(seatRecord) {
  return getAlignmentForPlayer(seatRecord) === 'good';
}

function isStoryteller(room, requester) {
  if (requester === 'storyteller') return true;
  if (requester?.role === 'storyteller') return true;
  const token = requester?.token ?? requester?.storytellerToken ?? requester;
  const storytellerToken = room?.storytellerToken
    ?? room?.storytellerSession?.token
    ?? getState(room).storytellerToken
    ?? getState(room).storytellerSession?.token;
  return Boolean(token && storytellerToken && token === storytellerToken);
}

function getDayVoteState(room) {
  return getState(room).stage7DayVoteExecution ?? createDayVoteState({
    phase: getPhase(room),
    round: getRound(room),
  });
}

function createDayVoteState({ phase = 'day', round = 1 } = {}) {
  return {
    phase,
    round,
    dayTimer: {
      status: 'not-started',
      startedAt: null,
      durationSeconds: null,
      startedBy: null,
      pausedAt: null,
      endedAt: null,
    },
    nomination: {
      status: 'closed',
      nominationId: null,
      nominatorSeat: null,
      nomineeSeat: null,
      recordedBy: null,
      recordedAt: null,
    },
    voting: {
      status: 'closed',
      voteId: null,
      sourceNominationId: null,
      openedAt: null,
      openedBy: null,
      votes: [],
    },
    voteCount: {
      status: 'not-counted',
      yes: 0,
      no: 0,
      total: 0,
      aliveVoteCount: 0,
      deadVoteCount: 0,
      candidateExecution: null,
      countedAt: null,
      countedBy: null,
    },
    execution: {
      status: 'not-confirmed',
      executionId: null,
      nomineeSeat: null,
      passes: false,
      confirmedAt: null,
      confirmedBy: null,
      effective: false,
    },
    standingExecution: createEmptyStandingExecution(),
    voteRounds: [],
  };
}

function createEmptyStandingExecution() {
  return {
    status: 'none',
    nomineeSeat: null,
    yesVotes: 0,
    requiredVotes: 0,
    sourceVoteId: null,
    sourceRoundId: null,
    tied: false,
    updatedAt: null,
  };
}

function createClosedNominationState() {
  return {
    status: 'closed',
    nominationId: null,
    nominatorSeat: null,
    nomineeSeat: null,
    recordedBy: null,
    recordedAt: null,
  };
}

function createClosedVotingState() {
  return {
    status: 'closed',
    voteId: null,
    sourceNominationId: null,
    openedAt: null,
    openedBy: null,
    votes: [],
  };
}

function createNotCountedVoteState() {
  return {
    status: 'not-counted',
    yes: 0,
    no: 0,
    total: 0,
    aliveVoteCount: 0,
    deadVoteCount: 0,
    candidateExecution: null,
    countedAt: null,
    countedBy: null,
  };
}

function createNotConfirmedExecutionState() {
  return {
    status: 'not-confirmed',
    executionId: null,
    nomineeSeat: null,
    passes: false,
    confirmedAt: null,
    confirmedBy: null,
    effective: false,
  };
}

function normalizeStandingExecution(dayVoteState = {}) {
  const standing = dayVoteState.standingExecution;
  if (!standing || typeof standing !== 'object') return createEmptyStandingExecution();
  return {
    ...createEmptyStandingExecution(),
    ...standing,
    nomineeSeat: Number.isInteger(Number(standing.nomineeSeat)) ? Number(standing.nomineeSeat) : null,
    yesVotes: Math.max(0, Number(standing.yesVotes || 0)),
    requiredVotes: Math.max(0, Number(standing.requiredVotes || 0)),
    tied: standing.status === 'tied' || standing.tied === true,
  };
}

function updateStandingExecution(dayVoteState, candidateExecution, completedRound, timestamp) {
  const current = normalizeStandingExecution(dayVoteState);
  if (candidateExecution?.passes !== true) return current;
  const candidateVotes = Math.max(0, Number(candidateExecution.yesVotes || 0));
  const currentVotes = Math.max(0, Number(current.yesVotes || 0));
  if (candidateVotes < currentVotes) return current;
  if (candidateVotes === currentVotes && currentVotes > 0) {
    return {
      status: 'tied',
      nomineeSeat: null,
      yesVotes: currentVotes,
      requiredVotes: Number(candidateExecution.requiredVotes || current.requiredVotes || 0),
      sourceVoteId: candidateExecution.sourceVoteId || null,
      sourceRoundId: completedRound?.roundId || null,
      tied: true,
      updatedAt: timestamp,
    };
  }
  return {
    status: 'on-the-block',
    nomineeSeat: Number(candidateExecution.nomineeSeat),
    yesVotes: candidateVotes,
    requiredVotes: Number(candidateExecution.requiredVotes || 0),
    sourceVoteId: candidateExecution.sourceVoteId || null,
    sourceRoundId: completedRound?.roundId || null,
    tied: false,
    updatedAt: timestamp,
  };
}

function getCompletedVoteRounds(dayVoteState = {}) {
  return asArray(dayVoteState.voteRounds);
}

function getUsedNominatorSeats(dayVoteState = {}) {
  return new Set(getCompletedVoteRounds(dayVoteState)
    .map((round) => Number(round.nominatorSeat))
    .filter((seat) => Number.isInteger(seat)));
}

function buildCompletedVoteRound(dayVoteState = {}, execution = {}, timestamp = nowIso()) {
  const nomination = dayVoteState.nomination || {};
  const voting = dayVoteState.voting || {};
  const voteCount = dayVoteState.voteCount || {};
  const candidateExecution = voteCount.candidateExecution || {};
  return {
    roundId: makeId('vote-round', timestamp, [nomination.nominatorSeat, nomination.nomineeSeat]),
    day: dayVoteState.round,
    nominationId: nomination.nominationId,
    voteId: voting.voteId,
    nominatorSeat: nomination.nominatorSeat,
    nomineeSeat: nomination.nomineeSeat,
    yes: Number(voteCount.yes || candidateExecution.yesVotes || 0),
    no: Number(voteCount.no || 0),
    total: Number(voteCount.total || asArray(voting.votes).length || 0),
    requiredVotes: Number(candidateExecution.requiredVotes || 0),
    passes: candidateExecution.passes === true,
    executionStatus: execution.status || 'no-execution-confirmed',
    effective: execution.effective === true,
    recordedAt: timestamp,
    votes: cloneValue(asArray(voting.votes)),
  };
}

function updateDayVoteState(room, dayVoteState) {
  const state = getState(room);
  return {
    ...room,
    state: {
      ...state,
      stage7DayVoteExecution: dayVoteState,
    },
  };
}

function updateSeats(room, updater) {
  const state = getState(room);
  if (Array.isArray(state.seats)) {
    return {
      ...room,
      state: {
        ...state,
        seats: state.seats.map(updater),
      },
    };
  }

  if (Array.isArray(state.players)) {
    return {
      ...room,
      state: {
        ...state,
        players: state.players.map(updater),
      },
    };
  }

  if (Array.isArray(room.seats)) {
    return {
      ...room,
      seats: room.seats.map(updater),
    };
  }

  return {
    ...room,
    players: asArray(room.players).map(updater),
  };
}

function buildResult(room, type, data) {
  return {
    room,
    response: {
      type,
      data,
    },
  };
}

function buildRefusal(room, type, reason) {
  return buildResult(room, type, {
    reason,
    serverMutation: false,
  });
}

function requireStoryteller(room, requester, refusalType) {
  if (!isStoryteller(room, requester)) {
    return buildRefusal(room, refusalType, 'not-storyteller');
  }
  return null;
}

function requireDayPhase(room, refusalType) {
  if (getPhase(room) !== 'day') {
    return buildRefusal(room, refusalType, 'not-day-phase');
  }
  return null;
}

function validateRoom(room, refusalType) {
  if (!room || typeof room !== 'object') {
    return buildRefusal(room, refusalType, 'missing-room');
  }
  return null;
}

function startDayTimer(room, { requester, round, durationSeconds, now } = {}) {
  const roomRefusal = validateRoom(room, 'day_timer_refused');
  if (roomRefusal) return roomRefusal;
  const storytellerRefusal = requireStoryteller(room, requester, 'day_timer_refused');
  if (storytellerRefusal) return storytellerRefusal;
  const phaseRefusal = requireDayPhase(room, 'day_timer_refused');
  if (phaseRefusal) return phaseRefusal;
  if (getRound(room) !== round) return buildRefusal(room, 'day_timer_refused', 'round-mismatch');
  if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) {
    return buildRefusal(room, 'day_timer_refused', 'invalid-duration');
  }

  const timestamp = nowIso(now);
  const previousDayVoteState = getDayVoteState(room);
  const dayVoteState = previousDayVoteState.round === round
    ? previousDayVoteState
    : createDayVoteState({ phase: 'day', round });
  const nextDayVoteState = {
    ...dayVoteState,
    phase: 'day',
    round,
    dayTimer: {
      ...dayVoteState.dayTimer,
      status: 'running',
      startedAt: timestamp,
      durationSeconds,
      startedBy: 'storyteller',
      pausedAt: null,
      endedAt: null,
    },
  };

  return buildResult(updateDayVoteState(room, nextDayVoteState), 'day_timer_started', {
    status: 'running',
    round,
    durationSeconds,
    serverMutation: 'dayTimer-only',
  });
}

function updateDayTimer(room, { requester, action, now } = {}) {
  const roomRefusal = validateRoom(room, 'day_timer_refused');
  if (roomRefusal) return roomRefusal;
  const storytellerRefusal = requireStoryteller(room, requester, 'day_timer_refused');
  if (storytellerRefusal) return storytellerRefusal;
  const phaseRefusal = requireDayPhase(room, 'day_timer_refused');
  if (phaseRefusal) return phaseRefusal;
  if (!['pause', 'resume', 'end'].includes(action)) {
    return buildRefusal(room, 'day_timer_refused', 'invalid-timer-action');
  }

  const timestamp = nowIso(now);
  const dayVoteState = getDayVoteState(room);
  const nextTimer = {
    ...dayVoteState.dayTimer,
  };

  if (action === 'pause') {
    nextTimer.status = 'paused';
    nextTimer.pausedAt = timestamp;
  } else if (action === 'resume') {
    nextTimer.status = 'running';
    nextTimer.pausedAt = null;
  } else {
    nextTimer.status = 'ended';
    nextTimer.endedAt = timestamp;
  }

  return buildResult(updateDayVoteState(room, {
    ...dayVoteState,
    dayTimer: nextTimer,
  }), 'day_timer_updated', {
    status: nextTimer.status,
    action,
    serverMutation: 'dayTimer-only',
  });
}

function recordNomination(room, { requester, round, nominatorSeat, nomineeSeat, now } = {}) {
  const roomRefusal = validateRoom(room, 'nomination_refused');
  if (roomRefusal) return roomRefusal;
  const storytellerRefusal = requireStoryteller(room, requester, 'nomination_refused');
  if (storytellerRefusal) return storytellerRefusal;
  const phaseRefusal = requireDayPhase(room, 'nomination_refused');
  if (phaseRefusal) return phaseRefusal;
  if (getRound(room) !== round) return buildRefusal(room, 'nomination_refused', 'round-mismatch');
  if (!Number.isInteger(nominatorSeat)) return buildRefusal(room, 'nomination_refused', 'invalid-nominator-seat');
  if (!Number.isInteger(nomineeSeat)) return buildRefusal(room, 'nomination_refused', 'invalid-nominee-seat');
  if (!hasSeat(room, nominatorSeat)) return buildRefusal(room, 'nomination_refused', 'invalid-nominator-seat');
  if (!hasSeat(room, nomineeSeat)) return buildRefusal(room, 'nomination_refused', 'invalid-nominee-seat');

  const nominator = getSeatRecord(room, nominatorSeat);
  const nominee = getSeatRecord(room, nomineeSeat);
  if (!nominator?.alive) return buildRefusal(room, 'nomination_refused', 'ineligible-nominator');
  if (!nominee?.alive) return buildRefusal(room, 'nomination_refused', 'ineligible-nominee');

  const dayVoteState = getDayVoteState(room);
  if (dayVoteState.execution?.status === 'confirmed') {
    return buildRefusal(room, 'nomination_refused', 'execution-already-resolved');
  }
  if (['recorded', 'active'].includes(dayVoteState.nomination?.status)) {
    return buildRefusal(room, 'nomination_refused', 'active-nomination-exists');
  }
  if (getUsedNominatorSeats(dayVoteState).has(Number(nominatorSeat))) {
    return buildRefusal(room, 'nomination_refused', 'nominator-already-used-today');
  }

  const timestamp = nowIso(now);
  const nominationId = makeId('nom', timestamp, [nominatorSeat, nomineeSeat]);
  const nextDayVoteState = {
    ...dayVoteState,
    nomination: {
      status: 'recorded',
      nominationId,
      nominatorSeat,
      nomineeSeat,
      recordedBy: 'storyteller',
      recordedAt: timestamp,
    },
  };

  const roomWithNomination = updateDayVoteState(room, nextDayVoteState);
  const triggerResult = applyNominationRuleTriggers(roomWithNomination, {
    nominationId,
    nominatorSeat,
    nomineeSeat
  });

  return buildResult(triggerResult.room, 'nomination_recorded', {
    nominationId,
    nominatorSeat,
    nomineeSeat,
    recordedBy: 'storyteller',
    ruleEffects: triggerResult.effects,
    serverMutation: triggerResult.effects.length > 0 ? 'nomination-and-rule-effects' : 'nomination-only',
  });
}

function openVote(room, { requester, nominationId, now } = {}) {
  const roomRefusal = validateRoom(room, 'vote_open_refused');
  if (roomRefusal) return roomRefusal;
  const storytellerRefusal = requireStoryteller(room, requester, 'vote_open_refused');
  if (storytellerRefusal) return storytellerRefusal;
  const phaseRefusal = requireDayPhase(room, 'vote_open_refused');
  if (phaseRefusal) return phaseRefusal;

  const dayVoteState = getDayVoteState(room);
  const nomination = dayVoteState.nomination;
  if (nomination?.status !== 'recorded') return buildRefusal(room, 'vote_open_refused', 'missing-nomination');
  if (nomination.nominationId !== nominationId) return buildRefusal(room, 'vote_open_refused', 'stale-nomination-id');
  if (dayVoteState.voting?.status === 'open') return buildRefusal(room, 'vote_open_refused', 'active-vote-exists');

  const timestamp = nowIso(now);
  const voteId = makeId('vote', timestamp, [nomination.nomineeSeat]);
  const nextDayVoteState = {
    ...dayVoteState,
    nomination: {
      ...nomination,
      status: 'active',
    },
    voting: {
      status: 'open',
      voteId,
      sourceNominationId: nominationId,
      openedAt: timestamp,
      openedBy: 'storyteller',
      votes: [],
    },
  };

  return buildResult(updateDayVoteState(room, nextDayVoteState), 'vote_opened', {
    voteId,
    sourceNominationId: nominationId,
    nomineeSeat: nomination.nomineeSeat,
    serverMutation: 'voting-open-only',
  });
}

function resolveSeatByToken(room, playerToken) {
  if (!playerToken) {
    return {
      status: 'invalid-token',
      seat: null,
    };
  }

  const matches = getSeats(room).filter((seatRecord) => {
    return seatRecord.playerToken === playerToken
      || seatRecord.token === playerToken
      || seatRecord.playerTokenHash === playerToken
      || seatRecord.tokenHash === playerToken;
  });

  if (matches.length === 0) {
    return {
      status: 'invalid-token',
      seat: null,
    };
  }

  if (matches.length > 1) {
    return {
      status: 'ambiguous-token-seat',
      seat: null,
    };
  }

  return {
    status: 'ok',
    seat: matches[0].seat,
  };
}

function getVoting(room) {
  return getDayVoteState(room).voting ?? {};
}

function validateActiveVote(room, voteId, refusalType) {
  const voting = getVoting(room);
  if (voting.status !== 'open') return buildRefusal(room, refusalType, 'vote-not-open');
  if (voting.voteId !== voteId) return buildRefusal(room, refusalType, 'stale-vote-id');
  return null;
}

function hasVoteForSeat(voting, voterSeat) {
  return asArray(voting.votes).some((voteEntry) => voteEntry.voterSeat === voterSeat);
}

function validateVoteEligibility(room, voterSeat, refusalType) {
  const voter = getSeatRecord(room, voterSeat);
  if (!voter) return buildRefusal(room, refusalType, 'invalid-voter-seat');
  if (voter.alive === false && voter.deadVoteAvailable === false) {
    return buildRefusal(room, refusalType, 'dead-vote-unavailable');
  }
  return null;
}

function buildVoteLogEntry(voting, voteEntry, { action = 'recorded', previousVote = null } = {}) {
  const existingLog = asArray(voting.voteLog);
  return {
    ...voteEntry,
    action,
    previousVote,
    logId: `${voteEntry.recordedAt || nowIso()}-${voteEntry.voterSeat}-${existingLog.length + 1}`
  };
}

function appendVote(room, voteEntry) {
  const dayVoteState = getDayVoteState(room);
  const voting = dayVoteState.voting;
  const nextDayVoteState = {
    ...dayVoteState,
    voting: {
      ...voting,
      votes: [
        ...asArray(voting.votes),
        voteEntry,
      ],
      voteLog: [
        ...asArray(voting.voteLog),
        buildVoteLogEntry(voting, voteEntry, { action: 'recorded' }),
      ],
    },
  };
  return updateDayVoteState(room, nextDayVoteState);
}

function upsertVote(room, voteEntry) {
  const dayVoteState = getDayVoteState(room);
  const voting = dayVoteState.voting;
  const existingVotes = asArray(voting.votes);
  const previousVote = existingVotes.find((entry) => Number(entry?.voterSeat) === Number(voteEntry.voterSeat));
  const isUpdate = Boolean(previousVote);
  const nextVotes = isUpdate
    ? existingVotes.map((entry) => (Number(entry?.voterSeat) === Number(voteEntry.voterSeat) ? voteEntry : entry))
    : [...existingVotes, voteEntry];
  const nextDayVoteState = {
    ...dayVoteState,
    voting: {
      ...voting,
      votes: nextVotes,
      voteLog: [
        ...asArray(voting.voteLog),
        buildVoteLogEntry(voting, voteEntry, {
          action: isUpdate ? 'updated' : 'recorded',
          previousVote: isUpdate ? previousVote.vote : null
        }),
      ],
    },
  };
  return updateDayVoteState(room, nextDayVoteState);
}

function applyNominationRuleTriggers(room, nomination) {
  const nominee = getSeatRecord(room, nomination.nomineeSeat);
  const nominator = getSeatRecord(room, nomination.nominatorSeat);
  const effects = [];
  let nextRoom = room;

  if (
    getRoleId(nominee) === 'virgin'
    && nominee.virginTriggered !== true
    && isTownsfolk(nominator)
    && nominator?.alive !== false
  ) {
    nextRoom = updateSeats(nextRoom, (seatRecord) => {
      if (Number(seatRecord.seat) === Number(nomination.nomineeSeat)) {
        return {
          ...seatRecord,
          virginTriggered: true
        };
      }
      if (Number(seatRecord.seat) === Number(nomination.nominatorSeat)) {
        return {
          ...seatRecord,
          alive: false,
          executedByVirgin: true
        };
      }
      return seatRecord;
    });
    effects.push({
      type: 'virgin-nomination-trigger',
      nomineeSeat: nomination.nomineeSeat,
      nominatorSeat: nomination.nominatorSeat
    });
  }

  return { room: nextRoom, effects };
}

function submitPlayerVote(room, { playerToken, seat, voteId, vote, now } = {}) {
  const roomRefusal = validateRoom(room, 'vote_refused');
  if (roomRefusal) return roomRefusal;
  const phaseRefusal = requireDayPhase(room, 'vote_refused');
  if (phaseRefusal) return phaseRefusal;
  const activeVoteRefusal = validateActiveVote(room, voteId, 'vote_refused');
  if (activeVoteRefusal) return activeVoteRefusal;
  if (typeof vote !== 'boolean') return buildRefusal(room, 'vote_refused', 'invalid-vote');

  const tokenSeat = resolveSeatByToken(room, playerToken);
  if (tokenSeat.status !== 'ok') return buildRefusal(room, 'vote_refused', tokenSeat.status);
  if (seat !== tokenSeat.seat) return buildRefusal(room, 'vote_refused', 'seat-token-mismatch');

  const voterRefusal = validateVoteEligibility(room, tokenSeat.seat, 'vote_refused');
  if (voterRefusal) return voterRefusal;

  const voting = getVoting(room);
  if (hasVoteForSeat(voting, tokenSeat.seat)) return buildRefusal(room, 'vote_refused', 'duplicate-vote');

  const voteEntry = {
    voterSeat: tokenSeat.seat,
    vote,
    recordedBy: 'player',
    recordedBySeat: tokenSeat.seat,
    recordedAt: nowIso(now),
    source: 'player-token',
  };
  const nextRoom = appendVote(room, voteEntry);

  return buildResult(nextRoom, 'vote_recorded', {
    voteId,
    voterSeat: tokenSeat.seat,
    vote,
    recordedBy: 'player',
    serverMutation: 'vote-record-only',
  });
}

function proxyVote(room, { requester, voteId, voterSeat, vote, now } = {}) {
  const roomRefusal = validateRoom(room, 'proxy_vote_refused');
  if (roomRefusal) return roomRefusal;
  const storytellerRefusal = requireStoryteller(room, requester, 'proxy_vote_refused');
  if (storytellerRefusal) return storytellerRefusal;
  const phaseRefusal = requireDayPhase(room, 'proxy_vote_refused');
  if (phaseRefusal) return phaseRefusal;
  const activeVoteRefusal = validateActiveVote(room, voteId, 'proxy_vote_refused');
  if (activeVoteRefusal) return activeVoteRefusal;
  if (!Number.isInteger(voterSeat)) return buildRefusal(room, 'proxy_vote_refused', 'invalid-voter-seat');
  if (typeof vote !== 'boolean') return buildRefusal(room, 'proxy_vote_refused', 'invalid-vote');

  const voterRefusal = validateVoteEligibility(room, voterSeat, 'proxy_vote_refused');
  if (voterRefusal) return voterRefusal;

  const voteEntry = {
    voterSeat,
    vote,
    recordedBy: 'storyteller',
    recordedByStoryteller: true,
    recordedBySeat: null,
    proxyForSeat: voterSeat,
    recordedAt: nowIso(now),
    source: 'storyteller-proxy',
  };
  const nextRoom = upsertVote(room, voteEntry);

  return buildResult(nextRoom, 'proxy_vote_recorded', {
    voteId,
    voterSeat,
    vote,
    recordedBy: 'storyteller',
    proxyForSeat: voterSeat,
    serverMutation: 'vote-record-only',
  });
}

function getNomineeSeat(dayVoteState) {
  return dayVoteState.nomination?.nomineeSeat ?? null;
}

function countAlivePlayers(room) {
  return getSeats(room).filter((seatRecord) => seatRecord.alive !== false).length;
}

function validateVotes(room, voting) {
  const seenSeats = new Set();
  for (const voteEntry of asArray(voting.votes)) {
    if (!Number.isInteger(voteEntry.voterSeat)) return 'malformed-votes';
    if (typeof voteEntry.vote !== 'boolean') return 'malformed-votes';
    if (!hasSeat(room, voteEntry.voterSeat)) return 'malformed-votes';
    if (seenSeats.has(voteEntry.voterSeat)) return 'duplicate-voter-seat';
    seenSeats.add(voteEntry.voterSeat);
  }
  return null;
}

function countVote(room, { requester, voteId, now } = {}) {
  const roomRefusal = validateRoom(room, 'vote_count_refused');
  if (roomRefusal) return roomRefusal;
  const storytellerRefusal = requireStoryteller(room, requester, 'vote_count_refused');
  if (storytellerRefusal) return storytellerRefusal;
  const phaseRefusal = requireDayPhase(room, 'vote_count_refused');
  if (phaseRefusal) return phaseRefusal;
  const activeVoteRefusal = validateActiveVote(room, voteId, 'vote_count_refused');
  if (activeVoteRefusal) return activeVoteRefusal;

  const dayVoteState = getDayVoteState(room);
  const voting = dayVoteState.voting;
  if (!Array.isArray(voting.votes)) return buildRefusal(room, 'vote_count_refused', 'missing-votes');
  const voteValidationError = validateVotes(room, voting);
  if (voteValidationError) return buildRefusal(room, 'vote_count_refused', voteValidationError);

  const yesVotes = voting.votes.filter((voteEntry) => voteEntry.vote === true);
  const noVotes = voting.votes.filter((voteEntry) => voteEntry.vote === false);
  const aliveVoteCount = yesVotes.filter((voteEntry) => getSeatRecord(room, voteEntry.voterSeat)?.alive !== false).length;
  const deadVoteCount = yesVotes.length - aliveVoteCount;
  const requiredVotes = Math.ceil(countAlivePlayers(room) / 2);
  const nomineeSeat = getNomineeSeat(dayVoteState);
  const passes = yesVotes.length >= requiredVotes;
  const candidateExecution = {
    nomineeSeat,
    passes,
    yesVotes: yesVotes.length,
    requiredVotes,
    sourceVoteId: voteId,
    status: 'pending-storyteller-confirmation',
  };
  const nextDayVoteState = {
    ...dayVoteState,
    voting: {
      ...voting,
      status: 'closed-for-counting',
    },
    voteCount: {
      status: 'counted',
      yes: yesVotes.length,
      no: noVotes.length,
      total: voting.votes.length,
      aliveVoteCount,
      deadVoteCount,
      candidateExecution,
      countedAt: nowIso(now),
      countedBy: 'storyteller',
    },
  };
  const nextRoom = updateDayVoteState(room, nextDayVoteState);

  return buildResult(nextRoom, 'vote_counted', {
    voteId,
    yes: yesVotes.length,
    no: noVotes.length,
    total: voting.votes.length,
    candidateExecution,
    serverMutation: 'vote-count-candidate-only',
  });
}

function markExecutedSeat(room, nomineeSeat, shouldConsumeDeadVotes, yesDeadVoteSeats) {
  const roomWithNomineeDead = updateSeats(room, (seatRecord) => {
    if (Number(seatRecord.seat) !== nomineeSeat) return seatRecord;
    return {
      ...seatRecord,
      alive: false,
    };
  });

  if (!shouldConsumeDeadVotes) return roomWithNomineeDead;

  return updateSeats(roomWithNomineeDead, (seatRecord) => {
    if (!yesDeadVoteSeats.has(Number(seatRecord.seat))) return seatRecord;
    return {
      ...seatRecord,
      deadVoteAvailable: false,
    };
  });
}

function consumeDeadYesVotesForRound(room, voting = {}) {
  const deadYesVoteSeats = new Set(
    asArray(voting.votes)
      .filter((voteEntry) => voteEntry.vote === true)
      .filter((voteEntry) => getSeatRecord(room, voteEntry.voterSeat)?.alive === false)
      .map((voteEntry) => Number(voteEntry.voterSeat))
  );
  if (deadYesVoteSeats.size === 0) return room;
  return updateSeats(room, (seatRecord) => {
    if (!deadYesVoteSeats.has(Number(seatRecord.seat))) return seatRecord;
    return {
      ...seatRecord,
      deadVoteAvailable: false,
    };
  });
}

function getExecutionDeathPrevention(room, nomineeSeat) {
  const nominee = getSeatRecord(room, nomineeSeat);
  if (!nominee) return null;
  if (nominee.executionProtected === true) {
    return {
      type: 'execution-protected',
      patch: { executionProtected: false }
    };
  }
  if (getRoleId(nominee) === 'fool' && nominee.foolDeathUsed !== true) {
    return {
      type: 'fool-first-death',
      patch: { foolDeathUsed: true }
    };
  }
  return null;
}

function applyExecutionDeathPrevention(room, nomineeSeat, prevention) {
  if (!prevention?.patch) return room;
  return updateSeats(room, (seatRecord) => {
    if (Number(seatRecord.seat) !== Number(nomineeSeat)) return seatRecord;
    return {
      ...seatRecord,
      ...prevention.patch
    };
  });
}

function applyPostExecutionRuleEffects(room, nomineeSeat, beforeDeathRoom) {
  const nomineeBefore = getSeatRecord(beforeDeathRoom, nomineeSeat) || getSeatRecord(room, nomineeSeat);
  const nomineeRoleId = getRoleId(nomineeBefore);
  const effects = [];
  let nextRoom = room;

  if (isDemon(nomineeBefore) && countAlivePlayers(beforeDeathRoom) >= 5) {
    const scarletWoman = getSeats(nextRoom).find((seatRecord) => {
      return seatRecord.alive !== false && getRoleId(seatRecord) === 'scarlet-woman';
    });
    if (scarletWoman) {
      nextRoom = updateSeats(nextRoom, (seatRecord) => {
        if (Number(seatRecord.seat) !== Number(scarletWoman.seat)) return seatRecord;
        return {
          ...applyRoleTransitionToPlayer(nextRoom, seatRecord, 'imp'),
          becameDemonByScarletWoman: true
        };
      });
      effects.push({
        type: 'scarlet-woman-demon-transfer',
        seat: scarletWoman.seat,
        deadDemonSeat: nomineeSeat
      });
    }
  }

  if (nomineeRoleId === 'sweetheart') {
    const drunkTarget = getSeats(nextRoom).find((seatRecord) => {
      return seatRecord.alive !== false && Number(seatRecord.seat) !== Number(nomineeSeat);
    });
    if (drunkTarget) {
      nextRoom = updateSeats(nextRoom, (seatRecord) => {
        if (Number(seatRecord.seat) !== Number(drunkTarget.seat)) return seatRecord;
        return {
          ...seatRecord,
          drunk: true,
          drunkBySweetheart: true
        };
      });
      effects.push({
        type: 'sweetheart-death-drunk',
        seat: drunkTarget.seat,
        sourceSeat: nomineeSeat
      });
    }
  }

  const cannibal = getSeats(nextRoom).find((seatRecord) => {
    return seatRecord.alive !== false && getRoleId(seatRecord) === 'cannibal';
  });
  if (cannibal && Number(cannibal.seat) !== Number(nomineeSeat)) {
    nextRoom = updateSeats(nextRoom, (seatRecord) => {
      if (Number(seatRecord.seat) !== Number(cannibal.seat)) return seatRecord;
      return {
        ...seatRecord,
        cannibalAbilityRoleId: nomineeRoleId,
        poisonedByEvilExecutee: isGood(nomineeBefore) ? false : true
      };
    });
    effects.push({
      type: 'cannibal-gains-executee-ability',
      seat: cannibal.seat,
      roleId: nomineeRoleId,
      poisoned: !isGood(nomineeBefore)
    });
  }

  return {
    room: nextRoom,
    effects
  };
}

function closeVoteRound(room, { requester, voteId, nomineeSeat, now, acceptStanding = true } = {}) {
  const roomRefusal = validateRoom(room, 'vote_round_close_refused');
  if (roomRefusal) return roomRefusal;
  const storytellerRefusal = requireStoryteller(room, requester, 'vote_round_close_refused');
  if (storytellerRefusal) return storytellerRefusal;
  const phaseRefusal = requireDayPhase(room, 'vote_round_close_refused');
  if (phaseRefusal) return phaseRefusal;

  const dayVoteState = getDayVoteState(room);
  const voting = dayVoteState.voting;
  const voteCount = dayVoteState.voteCount;
  const candidateExecution = voteCount?.candidateExecution;
  if (voting?.voteId !== voteId) return buildRefusal(room, 'vote_round_close_refused', 'stale-vote-id');
  if (voteCount?.status !== 'counted') return buildRefusal(room, 'vote_round_close_refused', 'missing-vote-count');
  if (!candidateExecution || candidateExecution.status !== 'pending-storyteller-confirmation') {
    return buildRefusal(room, 'vote_round_close_refused', 'missing-candidate-execution');
  }
  if (candidateExecution.nomineeSeat !== nomineeSeat) {
    return buildRefusal(room, 'vote_round_close_refused', 'stale-nominee-seat');
  }

  const timestamp = nowIso(now);
  const roundResult = {
    status: !acceptStanding
      ? 'rejected'
      : candidateExecution.passes === true
        ? 'standing'
        : 'no-execution-confirmed',
    executionId: null,
    nomineeSeat,
    passes: candidateExecution.passes === true,
    confirmedAt: timestamp,
    confirmedBy: 'storyteller',
    effective: false,
  };
  const completedRound = buildCompletedVoteRound(dayVoteState, roundResult, timestamp);
  const standingExecution = acceptStanding
    ? updateStandingExecution(dayVoteState, candidateExecution, completedRound, timestamp)
    : normalizeStandingExecution(dayVoteState);
  const closedRoundState = {
    ...dayVoteState,
    nomination: createClosedNominationState(),
    voting: createClosedVotingState(),
    voteCount: createNotCountedVoteState(),
    execution: createNotConfirmedExecutionState(),
    standingExecution,
    voteRounds: [
      ...getCompletedVoteRounds(dayVoteState),
      completedRound,
    ],
  };
  const roomAfterGhostVotes = consumeDeadYesVotesForRound(room, voting);
  const nextRoom = updateDayVoteState(roomAfterGhostVotes, closedRoundState);
  return buildResult(nextRoom, 'vote_round_closed', {
    voteId,
    nomineeSeat,
    passes: candidateExecution.passes === true,
    effective: false,
    completedRound,
    standingExecution,
    serverMutation: candidateExecution.passes === true && acceptStanding
      ? 'vote-round-closed-standing-execution-updated'
      : 'vote-round-closed-no-execution',
  });
}

function finalizeStandingExecution(room, { requester, now } = {}) {
  const roomRefusal = validateRoom(room, 'execution_refused');
  if (roomRefusal) return roomRefusal;
  const storytellerRefusal = requireStoryteller(room, requester, 'execution_refused');
  if (storytellerRefusal) return storytellerRefusal;
  const phaseRefusal = requireDayPhase(room, 'execution_refused');
  if (phaseRefusal) return phaseRefusal;

  const dayVoteState = getDayVoteState(room);
  if (dayVoteState.execution?.status === 'confirmed') {
    return buildRefusal(room, 'execution_refused', 'execution-already-resolved');
  }
  if (dayVoteState.voting?.status === 'open' || dayVoteState.voteCount?.status === 'counted') {
    return buildRefusal(room, 'execution_refused', 'vote-result-unresolved');
  }
  const standingExecution = normalizeStandingExecution(dayVoteState);
  if (standingExecution.status !== 'on-the-block' || !Number.isInteger(standingExecution.nomineeSeat)) {
    return buildRefusal(room, 'execution_refused', 'missing-standing-execution');
  }
  const nomineeSeat = standingExecution.nomineeSeat;
  const nominee = getSeatRecord(room, nomineeSeat);
  if (!nominee || nominee.alive === false) {
    return buildRefusal(room, 'execution_refused', 'nominee-not-alive');
  }

  const timestamp = nowIso(now);
  const executionId = makeId('exec', timestamp, [nomineeSeat]);
  const confirmedExecution = {
    status: 'confirmed',
    executionId,
    nomineeSeat,
    passes: true,
    confirmedAt: timestamp,
    confirmedBy: 'storyteller',
    effective: true,
    source: 'standing-execution',
    sourceVoteId: standingExecution.sourceVoteId,
  };
  const finalizedStanding = {
    ...standingExecution,
    status: 'finalized',
    finalizedAt: timestamp,
  };
  const dayVoteStateAfterExecution = {
    ...dayVoteState,
    execution: confirmedExecution,
    standingExecution: finalizedStanding,
  };
  const roomWithExecutionState = updateDayVoteState(room, dayVoteStateAfterExecution);
  const prevention = getExecutionDeathPrevention(roomWithExecutionState, nomineeSeat);
  if (prevention) {
    const finalExecution = {
      ...confirmedExecution,
      effective: false,
      deathPrevented: true,
    };
    const roomAfterPrevention = applyExecutionDeathPrevention(roomWithExecutionState, nomineeSeat, prevention);
    const nextRoom = updateDayVoteState(roomAfterPrevention, {
      ...dayVoteStateAfterExecution,
      execution: finalExecution,
    });
    return buildResult(nextRoom, 'execution_confirmed', {
      executionId,
      voteId: standingExecution.sourceVoteId,
      nomineeSeat,
      passes: true,
      effective: false,
      deathPrevented: true,
      ruleEffects: [{ type: prevention.type, nomineeSeat }],
      confirmedBy: 'storyteller',
      standingExecution: finalizedStanding,
      serverMutation: 'standing-execution-finalized-death-prevented',
    });
  }

  const roomWithNomineeDead = markExecutedSeat(roomWithExecutionState, nomineeSeat, false, new Set());
  const postExecution = applyPostExecutionRuleEffects(roomWithNomineeDead, nomineeSeat, roomWithExecutionState);
  const nextRoom = updateDayVoteState(postExecution.room, dayVoteStateAfterExecution);
  return buildResult(nextRoom, 'execution_confirmed', {
    executionId,
    voteId: standingExecution.sourceVoteId,
    nomineeSeat,
    passes: true,
    effective: true,
    deathPrevented: false,
    ruleEffects: postExecution.effects,
    confirmedBy: 'storyteller',
    standingExecution: finalizedStanding,
    serverMutation: postExecution.effects.length > 0
      ? 'standing-execution-finalized-and-rule-effects'
      : 'standing-execution-finalized',
  });
}

function confirmExecution(room, { requester, voteId, nomineeSeat, confirm, now } = {}) {
  if (typeof confirm !== 'boolean') return buildRefusal(room, 'execution_refused', 'invalid-confirm');
  const candidate = getDayVoteState(room).voteCount?.candidateExecution || null;
  const roundResult = closeVoteRound(room, {
    requester,
    voteId,
    nomineeSeat,
    now,
    acceptStanding: confirm,
  });
  if (roundResult.response.type !== 'vote_round_closed') {
    return buildResult(roundResult.room, 'execution_refused', roundResult.response.data);
  }
  if (!confirm || candidate?.passes !== true) {
    return buildResult(roundResult.room, 'execution_rejected', {
      ...roundResult.response.data,
      serverMutation: 'vote-round-closed-no-execution',
    });
  }
  const executionResult = finalizeStandingExecution(roundResult.room, { requester, now });
  if (executionResult.response.type !== 'execution_confirmed') return executionResult;
  const executionDayVote = getDayVoteState(executionResult.room);
  const legacyRounds = getCompletedVoteRounds(executionDayVote);
  const finalizedRounds = legacyRounds.map((round, index) => index === legacyRounds.length - 1
    ? {
        ...round,
        executionStatus: 'confirmed',
        effective: executionResult.response.data.effective === true,
      }
    : round);
  const legacyCompatibleRoom = updateDayVoteState(executionResult.room, {
    ...executionDayVote,
    voteRounds: finalizedRounds,
  });
  return buildResult(legacyCompatibleRoom, 'execution_confirmed', {
    ...executionResult.response.data,
    completedRound: finalizedRounds.at(-1) || roundResult.response.data.completedRound,
  });
}

function manualExecution(room, { requester, nomineeSeat, reason, now } = {}) {
  const roomRefusal = validateRoom(room, 'manual_execution_refused');
  if (roomRefusal) return roomRefusal;
  const storytellerRefusal = requireStoryteller(room, requester, 'manual_execution_refused');
  if (storytellerRefusal) return storytellerRefusal;
  const phaseRefusal = requireDayPhase(room, 'manual_execution_refused');
  if (phaseRefusal) return phaseRefusal;
  if (!Number.isInteger(nomineeSeat)) return buildRefusal(room, 'manual_execution_refused', 'invalid-nominee-seat');
  if (!hasSeat(room, nomineeSeat)) return buildRefusal(room, 'manual_execution_refused', 'invalid-nominee-seat');

  const nominee = getSeatRecord(room, nomineeSeat);
  if (!nominee || nominee.alive === false) {
    return buildRefusal(room, 'manual_execution_refused', 'nominee-not-alive');
  }

  const dayVoteState = getDayVoteState(room);
  if (dayVoteState.execution?.status === 'confirmed' || dayVoteState.execution?.confirmedAt) {
    return buildRefusal(room, 'manual_execution_refused', 'execution-already-resolved');
  }

  const timestamp = nowIso(now);
  const executionId = makeId('manual-exec', timestamp, [nomineeSeat]);
  const cleanReason = String(reason || 'storyteller-ruling')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80) || 'storyteller-ruling';
  const manualCandidateExecution = {
    nomineeSeat,
    passes: true,
    yesVotes: null,
    requiredVotes: null,
    sourceVoteId: null,
    source: 'storyteller-manual',
    reason: cleanReason,
    status: 'confirmed',
  };
  const dayVoteStateAfterExecution = {
    ...dayVoteState,
    voteCount: {
      ...dayVoteState.voteCount,
      status: dayVoteState.voteCount?.status === 'counted' ? 'counted' : 'manual-execution',
      candidateExecution: manualCandidateExecution,
      countedAt: dayVoteState.voteCount?.countedAt ?? timestamp,
      countedBy: dayVoteState.voteCount?.countedBy ?? 'storyteller',
    },
    execution: {
      status: 'confirmed',
      executionId,
      nomineeSeat,
      passes: true,
      confirmedAt: timestamp,
      confirmedBy: 'storyteller',
      effective: true,
      source: 'storyteller-manual',
      reason: cleanReason,
    },
  };
  const roomWithExecutionState = updateDayVoteState(room, dayVoteStateAfterExecution);
  const prevention = getExecutionDeathPrevention(roomWithExecutionState, nomineeSeat);
  if (prevention) {
    const nextRoom = applyExecutionDeathPrevention(roomWithExecutionState, nomineeSeat, prevention);
    return buildResult(nextRoom, 'execution_confirmed', {
      executionId,
      voteId: null,
      nomineeSeat,
      passes: true,
      effective: false,
      deathPrevented: true,
      source: 'storyteller-manual',
      reason: cleanReason,
      ruleEffects: [{ type: prevention.type, nomineeSeat }],
      confirmedBy: 'storyteller',
      serverMutation: 'manual-execution-confirmed-death-prevented',
    });
  }

  const roomWithNomineeDead = markExecutedSeat(roomWithExecutionState, nomineeSeat, false, new Set());
  const postExecution = applyPostExecutionRuleEffects(roomWithNomineeDead, nomineeSeat, roomWithExecutionState);
  const nextRoom = postExecution.room;

  return buildResult(nextRoom, 'execution_confirmed', {
    executionId,
    voteId: null,
    nomineeSeat,
    passes: true,
    effective: true,
    deathPrevented: false,
    source: 'storyteller-manual',
    reason: cleanReason,
    ruleEffects: postExecution.effects,
    confirmedBy: 'storyteller',
    serverMutation: postExecution.effects.length > 0 ? 'manual-execution-confirmed-and-rule-effects' : 'manual-execution-confirmed',
  });
}

function buildPublicDayVoteView(room) {
  const dayVoteState = getDayVoteState(room);
  const publicView = {
    dayTimer: cloneValue(dayVoteState.dayTimer),
    nomination: dayVoteState.nomination?.status === 'closed'
      ? null
      : {
        status: dayVoteState.nomination.status,
        nominatorSeat: dayVoteState.nomination.nominatorSeat,
        nomineeSeat: dayVoteState.nomination.nomineeSeat,
      },
    vote: {
      status: dayVoteState.voting?.status ?? 'closed',
      voteId: dayVoteState.voting?.voteId ?? null,
      nomineeSeat: dayVoteState.nomination?.nomineeSeat ?? null,
      result: dayVoteState.voteCount?.status === 'counted'
        ? {
          yes: dayVoteState.voteCount.yes,
          no: dayVoteState.voteCount.no,
          total: dayVoteState.voteCount.total,
        }
        : null,
    },
    execution: dayVoteState.execution?.effective
      ? {
        status: dayVoteState.execution.status,
        nomineeSeat: dayVoteState.execution.nomineeSeat,
        effective: true,
      }
      : null,
    standingExecution: (() => {
      const standing = normalizeStandingExecution(dayVoteState);
      return {
        status: standing.status,
        nomineeSeat: standing.nomineeSeat,
        yesVotes: standing.yesVotes,
        requiredVotes: standing.requiredVotes,
        tied: standing.tied === true,
      };
    })(),
  };
  const leakPaths = findForbiddenPlayerViewPaths(publicView);
  if (leakPaths.length > 0) {
    throw new Error(`Forbidden public day vote fields: ${leakPaths.join(', ')}`);
  }
  return publicView;
}

function buildPlayerDayVoteView(room, { playerToken } = {}) {
  const tokenSeat = resolveSeatByToken(room, playerToken);
  if (tokenSeat.status !== 'ok') {
    return {
      publicView: buildPublicDayVoteView(room),
      privateView: {
        canVote: false,
        vote: null,
        refusalReason: tokenSeat.status,
      },
    };
  }

  const dayVoteState = getDayVoteState(room);
  const voting = dayVoteState.voting ?? {};
  const ownVote = asArray(voting.votes).find((voteEntry) => voteEntry.voterSeat === tokenSeat.seat) ?? null;
  const privateView = {
    seat: tokenSeat.seat,
    canVote: voting.status === 'open' && !ownVote,
    vote: ownVote
      ? {
        voteId: voting.voteId,
        voterSeat: ownVote.voterSeat,
        vote: ownVote.vote,
        recordedBy: ownVote.recordedBy,
      }
      : null,
    deadVoteAvailable: getSeatRecord(room, tokenSeat.seat)?.deadVoteAvailable !== false,
  };
  const playerView = {
    publicView: buildPublicDayVoteView(room),
    privateView,
  };
  const leakPaths = findForbiddenPlayerViewPaths(playerView);
  if (leakPaths.length > 0) {
    throw new Error(`Forbidden player day vote fields: ${leakPaths.join(', ')}`);
  }
  return playerView;
}

function findForbiddenPlayerViewPaths(value, path = '$') {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenPlayerViewPaths(item, `${path}[${index}]`));
  }

  const paths = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_PLAYER_VIEW_KEYS.includes(key)) {
      paths.push(childPath);
    }
    paths.push(...findForbiddenPlayerViewPaths(child, childPath));
  }
  return paths;
}

module.exports = {
  FORBIDDEN_PLAYER_VIEW_KEYS,
  buildPlayerDayVoteView,
  buildPublicDayVoteView,
  closeVoteRound,
  confirmExecution,
  countVote,
  createDayVoteState,
  findForbiddenPlayerViewPaths,
  finalizeStandingExecution,
  manualExecution,
  openVote,
  proxyVote,
  recordNomination,
  resolveSeatByToken,
  startDayTimer,
  submitPlayerVote,
  updateDayTimer,
};
