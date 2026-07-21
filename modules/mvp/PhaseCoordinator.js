const TERMINAL_NIGHT_CANDIDATE_STATUSES = new Set(['confirmed', 'rejected', 'superseded']);
const ACTIVE_NIGHT_BATCH_STATUSES = new Set(['collecting', 'closed', 'candidates_ready']);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getState(room) {
  return room?.state && typeof room.state === 'object' ? room.state : room;
}

function cloneRoomWithState(room, state) {
  if (room?.state && typeof room.state === 'object') {
    return { ...room, state };
  }
  return state;
}

function getLatestNightBatch(room) {
  const state = getState(room) || {};
  return asArray(state.nightBatches)
    .slice()
    .sort((left, right) => {
      const numberDelta = Number(right?.nightNumber || 0) - Number(left?.nightNumber || 0);
      if (numberDelta !== 0) return numberDelta;
      return String(right?.openedAt || '').localeCompare(String(left?.openedAt || ''));
    })[0] || null;
}

function getNightBatch(room, batchId) {
  if (!batchId) return getLatestNightBatch(room);
  return asArray(getState(room)?.nightBatches).find((batch) => batch?.batchId === batchId) || null;
}

function getPendingGameEndCandidate(room) {
  return asArray(getState(room)?.gameEndCandidates).find((candidate) => {
    return candidate?.status === 'pending-storyteller-confirmation';
  }) || null;
}

function isGameEnded(room) {
  const state = getState(room) || {};
  return state.phase === 'ended' || state.publicGameOver?.status === 'confirmed';
}

function rolesWereDealt(room) {
  const state = getState(room) || {};
  const candidate = state.confirmedSetupCandidate || {};
  return state.phase === 'roles-dealt'
    || Boolean(state.dealRoles?.commandId)
    || candidate.status === 'dealt'
    || candidate.boundary?.roleDeal === true;
}

function getNightCandidates(room, batchId) {
  const state = getState(room) || {};
  const batch = getNightBatch(room, batchId);
  if (!batch) return [];
  const ids = new Set(asArray(batch.candidateResolutionIds));
  return asArray(state.candidateResolutions).filter((candidate) => {
    return candidate?.batchId === batch.batchId || ids.has(candidate?.candidateId);
  });
}

function getNightCloseoutGate(room, { batchId } = {}) {
  const state = getState(room) || {};
  const batch = getNightBatch(room, batchId);
  if (isGameEnded(room)) return { ok: false, reason: 'game-ended', batch };
  if (getPendingGameEndCandidate(room)) return { ok: false, reason: 'game-end-pending', batch };
  if (state.phase !== 'night') return { ok: false, reason: 'not-night-phase', batch };
  if (!batch) return { ok: false, reason: 'missing-night-batch', batch };

  const candidates = getNightCandidates(room, batch.batchId);
  const pendingCandidates = candidates.filter((candidate) => {
    return !TERMINAL_NIGHT_CANDIDATE_STATUSES.has(String(candidate?.status || ''));
  });
  if (pendingCandidates.length > 0) {
    return {
      ok: false,
      reason: 'night-candidates-pending',
      batch,
      candidateCount: candidates.length,
      pendingCandidateCount: pendingCandidates.length
    };
  }
  if (batch.status === 'confirmed') {
    return {
      ok: true,
      reason: 'night-confirmed',
      batch,
      candidateCount: candidates.length,
      pendingCandidateCount: 0,
      emptyNight: candidates.length === 0
    };
  }
  if (candidates.length > 0) {
    return { ok: false, reason: 'night-batch-not-confirmed', batch, candidateCount: candidates.length };
  }

  const actions = asArray(batch.actions);
  const requiredActions = actions.filter((action) => action?.required === true);
  const lockedActionIds = new Set(asArray(state.nightSubmissions)
    .filter((submission) => submission?.batchId === batch.batchId && submission?.status === 'locked')
    .map((submission) => submission?.actionId));
  const unresolvedRequired = requiredActions.filter((action) => !lockedActionIds.has(action?.actionId));
  const hasAutoInfoActions = actions.some((action) => action?.autoSubmit === true || action?.promptKind === 'auto_info');
  const explicitEmptyNight = actions.length === 0
    || (batch.status === 'candidates_ready' && asArray(batch.candidateResolutionIds).length === 0 && unresolvedRequired.length === 0)
    || (requiredActions.length === 0 && !hasAutoInfoActions && ['collecting', 'closed'].includes(batch.status));
  if (!explicitEmptyNight) {
    return {
      ok: false,
      reason: unresolvedRequired.length > 0 ? 'night-actions-pending' : 'night-candidates-not-prepared',
      batch,
      candidateCount: 0,
      pendingActionCount: unresolvedRequired.length
    };
  }

  return {
    ok: true,
    reason: 'empty-night-confirmation-required',
    batch,
    candidateCount: 0,
    pendingCandidateCount: 0,
    emptyNight: true,
    requiresExplicitEmptyConfirmation: batch.status !== 'confirmed'
  };
}

function confirmEmptyNightCloseout(room, { batchId, now } = {}) {
  const gate = getNightCloseoutGate(room, { batchId });
  if (!gate.ok) return { ok: false, reason: gate.reason, room, gate };
  if (!gate.emptyNight || gate.batch?.status === 'confirmed') {
    return { ok: true, room, batch: gate.batch, duplicate: gate.batch?.status === 'confirmed' };
  }
  const timestamp = typeof now === 'string' && now ? now : new Date().toISOString();
  const state = getState(room) || {};
  const nextState = {
    ...state,
    nightBatches: asArray(state.nightBatches).map((batch) => {
      if (batch?.batchId !== gate.batch.batchId) return batch;
      return {
        ...batch,
        status: 'confirmed',
        closedAt: batch.closedAt || timestamp,
        confirmedAt: timestamp,
        emptyCloseoutConfirmedAt: timestamp,
        candidateResolutionIds: []
      };
    })
  };
  return {
    ok: true,
    room: cloneRoomWithState(room, nextState),
    batch: getNightBatch(nextState, gate.batch.batchId),
    duplicate: false
  };
}

function getDayCloseoutGate(room) {
  const state = getState(room) || {};
  const dayVote = state.stage7DayVoteExecution || {};
  if (isGameEnded(room)) return { ok: false, reason: 'game-ended', dayVote };
  if (getPendingGameEndCandidate(room)) return { ok: false, reason: 'game-end-pending', dayVote };
  if (dayVote.dayClosed?.status === 'confirmed') {
    return { ok: true, reason: 'day-already-closed', dayVote, duplicate: true };
  }
  if (state.phase !== 'day') return { ok: false, reason: 'not-day-phase', dayVote };
  if (!dayVote.round || Number(dayVote.round) !== Number(state.round || dayVote.round)) {
    return { ok: false, reason: 'day-round-mismatch', dayVote };
  }
  const voting = dayVote.voting || {};
  const nomination = dayVote.nomination || {};
  const candidateExecution = dayVote.voteCount?.candidateExecution || null;
  const standingExecution = dayVote.standingExecution || { status: 'none' };
  if (voting.status === 'open') return { ok: false, reason: 'vote-still-open', dayVote };
  if (candidateExecution?.status === 'pending-storyteller-confirmation') {
    return { ok: false, reason: 'vote-result-unresolved', dayVote, candidateExecution, standingExecution };
  }
  if (
    voting.status === 'closed-for-counting'
    && candidateExecution?.status !== 'pending-storyteller-confirmation'
    && dayVote.execution?.status !== 'confirmed'
  ) {
    return { ok: false, reason: 'vote-result-unresolved', dayVote };
  }
  if (nomination.status === 'recorded' && !candidateExecution) {
    return { ok: false, reason: 'nomination-not-voted', dayVote };
  }
  return {
    ok: true,
    reason: standingExecution.status === 'on-the-block' && dayVote.execution?.status !== 'confirmed'
      ? 'standing-execution-ready'
      : 'day-ready-to-close',
    dayVote,
    candidateExecution,
    standingExecution,
    duplicate: false
  };
}

function markDayClosed(room, { now } = {}) {
  const gate = getDayCloseoutGate(room);
  if (!gate.ok) return { ok: false, reason: gate.reason, room, gate };
  if (gate.duplicate) return { ok: true, room, dayVote: gate.dayVote, duplicate: true };
  if (gate.candidateExecution?.status === 'pending-storyteller-confirmation') {
    return { ok: false, reason: 'execution-candidate-not-confirmed', room, gate };
  }
  if (gate.standingExecution?.status === 'on-the-block' && gate.dayVote?.execution?.status !== 'confirmed') {
    return { ok: false, reason: 'standing-execution-not-finalized', room, gate };
  }

  const state = getState(room) || {};
  const timestamp = typeof now === 'string' && now ? now : new Date().toISOString();
  const dayVote = state.stage7DayVoteExecution || {};
  const executionConfirmed = dayVote.execution?.status === 'confirmed';
  const execution = executionConfirmed
    ? dayVote.execution
    : {
        status: 'no-execution-confirmed',
        executionId: null,
        nomineeSeat: null,
        passes: false,
        confirmedAt: timestamp,
        confirmedBy: 'storyteller',
        effective: false
      };
  const nextDayVote = {
    ...dayVote,
    execution,
    dayClosed: {
      status: 'confirmed',
      round: Number(dayVote.round || state.round || 1),
      closedAt: timestamp,
      closedBy: 'storyteller',
      outcome: executionConfirmed ? 'execution' : 'no-execution',
      executedSeat: executionConfirmed ? execution.nomineeSeat : null,
      died: executionConfirmed ? execution.effective === true : false
    }
  };
  const nextState = { ...state, stage7DayVoteExecution: nextDayVote };
  return {
    ok: true,
    room: cloneRoomWithState(room, nextState),
    dayVote: nextDayVote,
    duplicate: false
  };
}

function getStartDayGate(room, { round } = {}) {
  const state = getState(room) || {};
  const nightGate = getNightCloseoutGate(room);
  if (!nightGate.ok) return { ok: false, reason: nightGate.reason, nightGate };
  const expectedRound = Number(nightGate.batch?.nightNumber || state.round || 1);
  if (round !== undefined && Number(round) !== expectedRound) {
    return { ok: false, reason: 'day-round-mismatch', expectedRound, nightGate };
  }
  return { ok: true, expectedRound, nightGate };
}

function getStartNightGate(room, { nightNumber } = {}) {
  const state = getState(room) || {};
  const requestedNight = Number(nightNumber || 1);
  if (!Number.isInteger(requestedNight) || requestedNight <= 0) {
    return { ok: false, reason: 'invalid-night-number' };
  }
  if (!rolesWereDealt(room)) return { ok: false, reason: 'roles-not-dealt' };
  if (isGameEnded(room)) return { ok: false, reason: 'game-ended' };
  if (getPendingGameEndCandidate(room)) return { ok: false, reason: 'game-end-pending' };

  const existingBatch = asArray(state.nightBatches).find((batch) => Number(batch?.nightNumber) === requestedNight);
  if (existingBatch) {
    return {
      ok: false,
      reason: ACTIVE_NIGHT_BATCH_STATUSES.has(existingBatch.status) || existingBatch.status === 'confirmed'
        ? 'night-batch-already-exists'
        : 'night-batch-conflict',
      existingBatch
    };
  }
  if (requestedNight === 1) {
    if (!['roles-dealt', 'identity'].includes(String(state.phase || ''))) {
      return { ok: false, reason: 'first-night-not-ready' };
    }
    return { ok: true, nightNumber: 1, isFirstNight: true };
  }

  const dayVote = state.stage7DayVoteExecution || {};
  if (state.phase !== 'day') return { ok: false, reason: 'not-day-phase' };
  if (dayVote.dayClosed?.status !== 'confirmed') return { ok: false, reason: 'day-not-closed' };
  const expectedNight = Number(dayVote.round || state.round || 1) + 1;
  if (requestedNight !== expectedNight) {
    return { ok: false, reason: 'night-number-mismatch', expectedNight };
  }
  return { ok: true, nightNumber: requestedNight, isFirstNight: false };
}

function getNightStatus(room, batch) {
  if (!batch) return { code: 'night-ready', label: '当前', detail: '等待开始夜晚' };
  const candidates = getNightCandidates(room, batch.batchId);
  const pending = candidates.filter((candidate) => !TERMINAL_NIGHT_CANDIDATE_STATUSES.has(String(candidate?.status || '')));
  if (pending.length > 0) return { code: 'night-ruling', label: '裁决中', detail: `还剩 ${pending.length} 条结果待确认` };
  if (batch.status === 'confirmed') return { code: 'night-complete', label: '已完成', detail: `下一步：进入第 ${batch.nightNumber || 1} 天白天` };
  const actions = asArray(batch.actions);
  const requiredActions = actions.filter((action) => action?.required === true);
  const lockedActionIds = new Set(asArray(getState(room)?.nightSubmissions)
    .filter((submission) => submission?.batchId === batch.batchId && submission?.status === 'locked')
    .map((submission) => submission?.actionId));
  const pendingCount = requiredActions.filter((action) => !lockedActionIds.has(action?.actionId)).length;
  return {
    code: pendingCount > 0 ? 'night-collecting' : 'night-ready-for-ruling',
    label: pendingCount > 0 ? '行动中' : '待裁决',
    detail: pendingCount > 0 ? `等待 ${pendingCount} 名玩家行动` : '可确认夜晚技能结果'
  };
}

function getDayStatus(room, dayVote) {
  if (dayVote.dayClosed?.status === 'confirmed') {
    const execution = dayVote.dayClosed.outcome === 'execution';
    return {
      code: 'day-complete',
      label: '已结束',
      detail: execution ? `${dayVote.dayClosed.executedSeat}号处决，正在检查结局` : '无处决，正在检查结局'
    };
  }
  if (dayVote.voting?.status === 'open') {
    return { code: 'day-voting', label: '投票中', detail: `已记录 ${asArray(dayVote.voteRounds).length} 次提名，当前投票进行中` };
  }
  if (dayVote.voteCount?.status === 'counted') {
    return {
      code: 'day-counted',
      label: '待确认',
      detail: '本轮已计票，确认后更新暂列处决'
    };
  }
  const standing = dayVote.standingExecution || {};
  const standingText = standing.status === 'on-the-block'
    ? `；${standing.nomineeSeat}号以${standing.yesVotes || 0}票暂列处决`
    : standing.status === 'tied'
      ? `；最高${standing.yesVotes || 0}票平票，当前无处决候选`
      : '';
  return {
    code: 'day-open',
    label: '当前',
    detail: `已记录 ${asArray(dayVote.voteRounds).length} 次提名，尚未结束今日投票${standingText}`
  };
}

function phaseLabel(kind, number) {
  if (kind === 'night') return `第 ${number || 1} 天夜晚`;
  if (kind === 'day') return `第 ${number || 1} 天白天`;
  if (kind === 'game-end') return '结局确认';
  if (kind === 'ended') return '本局结束';
  return '开局准备';
}

function getAuthoritativePhaseSnapshot(room) {
  const state = getState(room) || {};
  const phase = String(state.phase || 'waiting');
  const round = Number(state.round || 0);
  const opening = !rolesWereDealt(room);
  if (opening) {
    const occupied = asArray(state.players).filter((player) => player?.occupied !== false).length;
    const playerCount = Number(state.playerCount || asArray(state.players).length || 0);
    const hasSetup = Boolean(state.confirmedSetupCandidate || asArray(state.setupCandidates).length);
    return {
      schemaVersion: 'botc.phase-snapshot.v1',
      mode: 'opening',
      phase,
      round,
      openingSteps: [
        { key: 'seating', label: '玩家落座', status: occupied >= playerCount && playerCount > 0 ? 'done' : 'current' },
        { key: 'setup', label: '配板', status: hasSetup ? 'done' : (occupied >= playerCount && playerCount > 0 ? 'current' : 'next') },
        { key: 'identity', label: '发身份', status: 'next' }
      ]
    };
  }

  const latestNight = getLatestNightBatch(room);
  const dayVote = state.stage7DayVoteExecution || {};
  let currentKind = phase === 'ended' ? 'ended' : (phase === 'game-end' ? 'game-end' : (phase === 'day' ? 'day' : 'night'));
  let currentNumber = currentKind === 'day'
    ? Number(dayVote.round || round || latestNight?.nightNumber || 1)
    : Number(latestNight?.nightNumber || round || dayVote.round || 1);
  let status = currentKind === 'day'
    ? getDayStatus(room, dayVote)
    : (currentKind === 'night' ? getNightStatus(room, latestNight) : {
        code: currentKind === 'ended' ? 'game-ended' : 'game-end-pending',
        label: currentKind === 'ended' ? '已结束' : '待确认',
        detail: currentKind === 'ended' ? '结局已公开' : '胜负检查已生成结局候选'
      });
  let previous;
  let next;
  if (currentKind === 'day') {
    previous = { kind: 'night', number: currentNumber, label: phaseLabel('night', currentNumber), status: 'done' };
    next = { kind: 'night', number: currentNumber + 1, label: phaseLabel('night', currentNumber + 1), status: 'next' };
  } else if (currentKind === 'night') {
    previous = currentNumber > 1
      ? { kind: 'day', number: currentNumber - 1, label: phaseLabel('day', currentNumber - 1), status: 'done' }
      : { kind: 'identity', number: 0, label: '身份已发出', status: 'done' };
    next = { kind: 'day', number: currentNumber, label: phaseLabel('day', currentNumber), status: 'next' };
  } else {
    previous = { kind: phase === 'game-end' ? (dayVote.round ? 'day' : 'night') : 'game-end', number: Number(dayVote.round || latestNight?.nightNumber || round || 1), label: phase === 'game-end' ? '胜负检查' : '结局确认', status: 'done' };
    next = { kind: currentKind, number: currentNumber, label: currentKind === 'ended' ? '复盘' : '确认结局', status: 'next' };
  }

  return {
    schemaVersion: 'botc.phase-snapshot.v1',
    mode: 'cycle',
    phase: currentKind,
    round: currentNumber,
    nightNumber: Number(latestNight?.nightNumber || (currentKind === 'night' ? currentNumber : dayVote.round || currentNumber)),
    dayNumber: Number(dayVote.round || (currentKind === 'day' ? currentNumber : latestNight?.nightNumber || currentNumber)),
    status,
    cycle: {
      previous,
      current: { kind: currentKind, number: currentNumber, label: phaseLabel(currentKind, currentNumber), status: 'current' },
      next
    }
  };
}

module.exports = {
  TERMINAL_NIGHT_CANDIDATE_STATUSES,
  confirmEmptyNightCloseout,
  getAuthoritativePhaseSnapshot,
  getDayCloseoutGate,
  getLatestNightBatch,
  getNightCloseoutGate,
  getPendingGameEndCandidate,
  getStartDayGate,
  getStartNightGate,
  markDayClosed
};
