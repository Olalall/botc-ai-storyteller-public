const TERMINAL_GAME_END_STATUSES = new Set(['confirmed', 'rejected']);
const SCRIPT_ID = 'trouble-brewing';
const {
  DEMON_ROLE_IDS,
  MINION_ROLE_IDS,
  normalizeRoleId: normalizeAutomationRoleId
} = require('./RuleAutomation');

const OFFICIAL_TO_LOCAL_ROLE_IDS = Object.freeze({
  fortuneteller: 'fortune-teller',
  scarletwoman: 'scarlet-woman'
});

const ROLE_TEAMS = Object.freeze({
  washerwoman: 'townsfolk',
  librarian: 'townsfolk',
  investigator: 'townsfolk',
  chef: 'townsfolk',
  empath: 'townsfolk',
  fortuneteller: 'townsfolk',
  undertaker: 'townsfolk',
  monk: 'townsfolk',
  ravenkeeper: 'townsfolk',
  virgin: 'townsfolk',
  slayer: 'townsfolk',
  soldier: 'townsfolk',
  mayor: 'townsfolk',
  butler: 'outsider',
  drunk: 'outsider',
  recluse: 'outsider',
  saint: 'outsider',
  poisoner: 'minion',
  spy: 'minion',
  scarletwoman: 'minion',
  baron: 'minion',
  imp: 'demon'
});

const STAGE8_TWELVE_PLAYER_FIXTURE = Object.freeze([
  { seat: 1, name: 'P01', trueRoleId: 'washerwoman', shownRoleId: 'washerwoman' },
  { seat: 2, name: 'P02', trueRoleId: 'librarian', shownRoleId: 'librarian' },
  { seat: 3, name: 'P03', trueRoleId: 'chef', shownRoleId: 'chef' },
  { seat: 4, name: 'P04', trueRoleId: 'empath', shownRoleId: 'empath' },
  { seat: 5, name: 'P05', trueRoleId: 'fortuneteller', shownRoleId: 'fortuneteller' },
  { seat: 6, name: 'P06', trueRoleId: 'undertaker', shownRoleId: 'undertaker' },
  { seat: 7, name: 'P07', trueRoleId: 'monk', shownRoleId: 'monk' },
  { seat: 8, name: 'P08', trueRoleId: 'drunk', shownRoleId: 'ravenkeeper' },
  { seat: 9, name: 'P09', trueRoleId: 'saint', shownRoleId: 'saint' },
  { seat: 10, name: 'P10', trueRoleId: 'poisoner', shownRoleId: 'poisoner' },
  { seat: 11, name: 'P11', trueRoleId: 'scarletwoman', shownRoleId: 'scarletwoman' },
  { seat: 12, name: 'P12', trueRoleId: 'imp', shownRoleId: 'imp' }
]);

const STAGE8_TWELVE_PLAYER_DEMON_BLUFFS = Object.freeze(['investigator', 'mayor', 'soldier']);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function nowIso(now) {
  if (now instanceof Date) return now.toISOString();
  if (typeof now === 'string' && now.length > 0) return now;
  return new Date().toISOString();
}

function getRoomState(room) {
  return room?.state && typeof room.state === 'object' ? room.state : room;
}

function getPlayers(room) {
  return asArray(getRoomState(room)?.players)
    .slice()
    .sort((left, right) => Number(left.seat) - Number(right.seat));
}

function normalizeRoleId(value) {
  return String(value || '').toLowerCase();
}

function toLocalRoleId(roleId) {
  return OFFICIAL_TO_LOCAL_ROLE_IDS[roleId] || roleId;
}

function roleTeam(roleId) {
  const team = ROLE_TEAMS[roleId];
  if (!team) throw new Error(`Unknown Trouble Brewing role id: ${roleId}`);
  return team;
}

function buildStage8TwelvePlayerFixture({ localRoleIds = false } = {}) {
  const roleIdFor = localRoleIds ? toLocalRoleId : (roleId) => roleId;
  const seatCandidates = STAGE8_TWELVE_PLAYER_FIXTURE.map((player) => {
    const team = roleTeam(player.trueRoleId);
    const shownTeam = roleTeam(player.shownRoleId);
    return {
      seat: player.seat,
      name: player.name,
      trueRoleId: roleIdFor(player.trueRoleId),
      shownRoleId: roleIdFor(player.shownRoleId),
      roleId: roleIdFor(player.trueRoleId),
      team,
      shownTeam,
      source: 'stage8-fixed-fixture'
    };
  });

  return {
    scriptId: SCRIPT_ID,
    playerCount: 12,
    baseCounts: { townsfolk: 7, outsiders: 2, minions: 2, demons: 1 },
    effectiveCounts: { townsfolk: 7, outsiders: 2, minions: 2, demons: 1 },
    occupiedSeats: seatCandidates.map((candidate) => candidate.seat),
    seatCandidates,
    assignments: seatCandidates.map((candidate) => ({
      seat: candidate.seat,
      trueRoleId: candidate.trueRoleId,
      shownRoleId: candidate.shownRoleId
    })),
    demonBluffs: STAGE8_TWELVE_PLAYER_DEMON_BLUFFS.map(roleIdFor),
    boundary: {
      previewOnly: true,
      storytellerConfirmationRequired: true,
      roleLock: false,
      roleDeal: false,
      playerViewEmission: false,
      eventLogWrite: false,
      nightStart: false,
      stateMutation: false,
      aiCanLock: false
    }
  };
}

function getTrueRoleId(player) {
  return normalizeRoleId(player.trueRoleId || player.realRoleId || player.roleId || player.role);
}

function isDemon(player) {
  const roleKind = normalizeRoleId(player.trueRoleType || player.realRoleType || player.roleType || player.team);
  return roleKind === 'demon' || roleKind === 'demons' || DEMON_ROLE_IDS.has(normalizeAutomationRoleId(getTrueRoleId(player)));
}

function isMinion(player) {
  const roleKind = normalizeRoleId(player.trueRoleType || player.realRoleType || player.roleType || player.team);
  const roleId = normalizeAutomationRoleId(getTrueRoleId(player));
  return roleKind === 'minion'
    || roleKind === 'minions'
    || MINION_ROLE_IDS.has(roleId);
}

function isMayor(player) {
  return getTrueRoleId(player) === 'mayor';
}

function getPlayerBySeat(players, seat) {
  return players.find((player) => Number(player.seat) === Number(seat)) || null;
}

function normalizeSeat(value) {
  if (value === null || value === undefined || value === '') return null;
  const seat = Number(value);
  return Number.isInteger(seat) ? seat : null;
}

function getLatestConfirmedExecutionSeat(roomState) {
  const dayVoteExecution = roomState.stage7DayVoteExecution?.execution;
  const dayVoteNomineeSeat = normalizeSeat(dayVoteExecution?.nomineeSeat);
  if (
    dayVoteExecution?.status === 'confirmed'
    && dayVoteExecution.effective === true
    && dayVoteNomineeSeat !== null
  ) {
    return dayVoteNomineeSeat;
  }

  const historyExecution = asArray(roomState.actionHistory).slice().reverse().find((entry) => {
    const seat = normalizeSeat(entry?.payload?.nomineeSeat);
    return entry?.type === 'execution_confirmed'
      && seat !== null;
  });
  if (historyExecution) return normalizeSeat(historyExecution.payload.nomineeSeat);

  const publicExecution = asArray(roomState.publicEvents).slice().reverse().find((entry) => {
    const seat = normalizeSeat(entry?.nomineeSeat ?? entry?.payload?.nomineeSeat);
    return entry?.type === 'execution_confirmed'
      && seat !== null;
  });
  if (publicExecution) return normalizeSeat(publicExecution.nomineeSeat ?? publicExecution.payload.nomineeSeat);

  return null;
}

function hasConfirmedNoExecution(roomState) {
  const dayVoteState = roomState.stage7DayVoteExecution || {};
  const dayVoteExecution = dayVoteState.execution;
  if (
    dayVoteExecution?.status === 'no-execution-confirmed'
    && dayVoteExecution.effective === false
  ) {
    return true;
  }

  if (asArray(dayVoteState.voteRounds).some((roundRecord) => (
    roundRecord?.executionStatus === 'no-execution-confirmed'
    && roundRecord?.effective === false
  ))) {
    return true;
  }

  return asArray(roomState.actionHistory).some((entry) => {
    return entry?.type === 'no_execution_confirmed'
      || entry?.type === 'execution_rejected'
      || entry?.payload?.executionStatus === 'no-execution-confirmed';
  }) || asArray(roomState.publicEvents).some((entry) => {
    return entry?.type === 'no_execution_confirmed'
      || entry?.executionStatus === 'no-execution-confirmed';
  });
}

function isAlive(player) {
  return player.alive !== false;
}

function makeGameEndCandidateId(roomState, now) {
  const roomId = roomState.roomId || roomState.id || 'room';
  return `game-end-${roomId}-${String(Date.parse(now) || Date.now())}`;
}

function getPendingGameEndCandidate(roomState) {
  return asArray(roomState.gameEndCandidates).find((candidate) => {
    return candidate?.status === 'pending-storyteller-confirmation';
  }) || null;
}

function inferGameEndCandidate(room, options = {}) {
  const roomState = getRoomState(room);
  const players = getPlayers(roomState);
  const alivePlayers = players.filter(isAlive);
  const aliveDemons = alivePlayers.filter(isDemon);
  const aliveMinions = alivePlayers.filter(isMinion);
  const latestExecutedSeat = getLatestConfirmedExecutionSeat(roomState);
  const latestExecutedPlayer = getPlayerBySeat(players, latestExecutedSeat);
  const timestamp = nowIso(options.now);

  if (latestExecutedPlayer && getTrueRoleId(latestExecutedPlayer) === 'saint') {
    return {
      candidateId: makeGameEndCandidateId(roomState, timestamp),
      status: 'pending-storyteller-confirmation',
      generatedBy: 'rules',
      candidateKind: 'game-end',
      winningTeam: 'evil',
      reasonCode: 'saint-executed',
      publicSummaryDraft: '圣徒被处决。邪恶阵营胜利。',
      storytellerSummary: `规则候选：${latestExecutedSeat} 号圣徒被处决；需要说书人确认后公开邪恶阵营胜利。`,
      requiresStorytellerConfirmation: true,
      eventLogWritten: false,
      stateChanged: false,
      publicResultPublished: false,
      createdAt: timestamp,
      confirmedAt: null,
      confirmedBy: null
    };
  }

  if (aliveDemons.length === 0 && players.some(isDemon)) {
    return {
      candidateId: makeGameEndCandidateId(roomState, timestamp),
      status: 'pending-storyteller-confirmation',
      generatedBy: 'rules',
      candidateKind: 'game-end',
      winningTeam: 'good',
      reasonCode: 'no-alive-demon',
      publicSummaryDraft: '恶魔已死亡。好人阵营胜利。',
      storytellerSummary: `规则候选：场上无存活恶魔；存活爪牙 ${aliveMinions.map((player) => player.seat).join('、') || '无'}。`,
      requiresStorytellerConfirmation: true,
      eventLogWritten: false,
      stateChanged: false,
      publicResultPublished: false,
      createdAt: timestamp,
      confirmedAt: null,
      confirmedBy: null
    };
  }

  if (
    alivePlayers.length === 3
    && alivePlayers.some(isMayor)
    && hasConfirmedNoExecution(roomState)
  ) {
    return {
      candidateId: makeGameEndCandidateId(roomState, timestamp),
      status: 'pending-storyteller-confirmation',
      generatedBy: 'rules',
      candidateKind: 'game-end',
      winningTeam: 'good',
      reasonCode: 'mayor-three-alive-no-execution',
      publicSummaryDraft: '仅剩三名存活玩家且今日无人被处决。好人阵营胜利。',
      storytellerSummary: `规则候选：存活玩家 ${alivePlayers.map((player) => player.seat).join('、')}，市长存活且处决候选被确认不处决。`,
      requiresStorytellerConfirmation: true,
      eventLogWritten: false,
      stateChanged: false,
      publicResultPublished: false,
      createdAt: timestamp,
      confirmedAt: null,
      confirmedBy: null
    };
  }

  if (alivePlayers.length <= 2 && aliveDemons.length > 0) {
    return {
      candidateId: makeGameEndCandidateId(roomState, timestamp),
      status: 'pending-storyteller-confirmation',
      generatedBy: 'rules',
      candidateKind: 'game-end',
      winningTeam: 'evil',
      reasonCode: 'two-alive-with-demon',
      publicSummaryDraft: '场上仅剩两名存活玩家且恶魔仍存活。邪恶阵营胜利。',
      storytellerSummary: `规则候选：存活玩家 ${alivePlayers.map((player) => player.seat).join('、')}，恶魔仍存活。`,
      requiresStorytellerConfirmation: true,
      eventLogWritten: false,
      stateChanged: false,
      publicResultPublished: false,
      createdAt: timestamp,
      confirmedAt: null,
      confirmedBy: null
    };
  }

  return null;
}

function prepareGameEndCandidate(room, options = {}) {
  const roomState = getRoomState(room);
  const existingPending = getPendingGameEndCandidate(roomState);
  if (existingPending) {
    return {
      room,
      candidate: clone(existingPending),
      response: {
        type: 'game_end_candidate_prepared',
        data: {
          candidate: clone(existingPending),
          serverMutation: false,
          reason: 'existing-pending-candidate'
        }
      }
    };
  }

  const candidate = inferGameEndCandidate(roomState, options);
  if (!candidate) {
    return {
      room,
      candidate: null,
      response: {
        type: 'game_end_candidate_refused',
        data: {
          reason: 'no-rules-game-end-candidate',
          serverMutation: false
        }
      }
    };
  }

  const nextRoom = {
    ...room,
    state: {
      ...roomState,
      gameEndCandidates: [
        ...asArray(roomState.gameEndCandidates).filter((item) => !TERMINAL_GAME_END_STATUSES.has(item.status)),
        candidate
      ],
      stage8GameEnd: {
        status: 'candidate-ready',
        pendingCandidateId: candidate.candidateId,
        lastPreparedAt: candidate.createdAt
      }
    }
  };

  return {
    room: nextRoom,
    candidate,
    response: {
      type: 'game_end_candidate_prepared',
      data: {
        candidate,
        serverMutation: 'candidate-only',
        publicResultPublished: false,
        requiresStorytellerConfirmation: true
      }
    }
  };
}

function confirmGameEndCandidate(room, { candidateId, confirm, now } = {}) {
  const roomState = getRoomState(room);
  const candidate = asArray(roomState.gameEndCandidates).find((item) => item.candidateId === candidateId);
  const timestamp = nowIso(now);

  if (!candidate) {
    return {
      room,
      response: {
        type: 'game_end_confirmation_refused',
        data: { reason: 'missing-candidate', serverMutation: false }
      }
    };
  }

  if (candidate.status !== 'pending-storyteller-confirmation') {
    return {
      room,
      response: {
        type: 'game_end_confirmation_refused',
        data: { reason: 'candidate-not-pending', serverMutation: false }
      }
    };
  }

  if (confirm !== true) {
    const rejected = {
      ...candidate,
      status: 'rejected',
      confirmedAt: timestamp,
      confirmedBy: 'storyteller'
    };
    return {
      room: {
        ...room,
        state: {
          ...roomState,
          gameEndCandidates: asArray(roomState.gameEndCandidates).map((item) => {
            return item.candidateId === candidateId ? rejected : item;
          }),
          stage8GameEnd: {
            status: 'candidate-rejected',
            rejectedCandidateId: candidateId,
            rejectedAt: timestamp
          }
        }
      },
      response: {
        type: 'game_end_rejected',
        data: {
          candidate: rejected,
          serverMutation: 'candidate-closed-only',
          publicResultPublished: false
        }
      }
    };
  }

  const confirmed = {
    ...candidate,
    status: 'confirmed',
    confirmedAt: timestamp,
    confirmedBy: 'storyteller',
    eventLogWritten: true,
    stateChanged: true,
    publicResultPublished: true
  };
  const publicGameOver = {
    status: 'confirmed',
    winningTeam: confirmed.winningTeam,
    reasonCode: confirmed.reasonCode,
    summary: confirmed.publicSummaryDraft,
    confirmedAt: timestamp
  };
  const publicEvent = {
    id: `public-game-end-${confirmed.candidateId}`,
    type: 'game_end_confirmed',
    winningTeam: confirmed.winningTeam,
    reasonCode: confirmed.reasonCode,
    summary: confirmed.publicSummaryDraft,
    createdAt: timestamp
  };
  const storytellerDiary = {
    id: `diary-game-end-${confirmed.candidateId}`,
    scope: 'storyteller',
    text: confirmed.storytellerSummary,
    createdAt: timestamp,
    sourceCandidateId: confirmed.candidateId
  };

  return {
    room: {
      ...room,
      state: {
        ...roomState,
        phase: 'ended',
        gameEndCandidates: asArray(roomState.gameEndCandidates).map((item) => {
          return item.candidateId === candidateId ? confirmed : item;
        }),
        stage8GameEnd: {
          status: 'confirmed',
          confirmedCandidateId: confirmed.candidateId,
          winningTeam: confirmed.winningTeam,
          confirmedAt: timestamp
        },
        publicGameOver,
        publicEvents: [...asArray(roomState.publicEvents), publicEvent],
        diaryEntries: [...asArray(roomState.diaryEntries), storytellerDiary]
      }
    },
    response: {
      type: 'game_end_confirmed',
      data: {
        candidate: confirmed,
        publicGameOver,
        publicEvent,
        serverMutation: 'game-end-confirmed',
        publicResultPublished: true
      }
    }
  };
}

function buildStorytellerGameEndView(room) {
  const roomState = getRoomState(room);
  return {
    stage8GameEnd: clone(roomState.stage8GameEnd || null),
    candidates: clone(asArray(roomState.gameEndCandidates)),
    publicGameOver: clone(roomState.publicGameOver || null)
  };
}

module.exports = {
  buildStage8TwelvePlayerFixture,
  buildStorytellerGameEndView,
  confirmGameEndCandidate,
  prepareGameEndCandidate,
  toLocalRoleId
};
