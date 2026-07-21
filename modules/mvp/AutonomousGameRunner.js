const fs = require('fs');
const path = require('path');
const { createSetupCandidate } = require('./SetupCandidate');
const { dealRoles } = require('./DealRoles');
const {
  closeNightCollection,
  findForbiddenPlayerPromptPaths,
  getStorytellerSubmissionSummary,
  startNightCollection,
  submitNightAction
} = require('./NightCollection');
const {
  applyConfirmationCommand,
  confirmCandidateResolution,
  prepareCandidateResolutions,
  rejectCandidateResolution,
  requiresEffectiveImportedStatePatch,
  requiresVerifiedComplexRulingTemplate
} = require('./CandidateResolution');
const {
  buildPlayerDayVoteView,
  confirmExecution,
  countVote,
  createDayVoteState,
  findForbiddenPlayerViewPaths: findForbiddenDayVotePaths,
  openVote,
  recordNomination,
  submitPlayerVote
} = require('./DayVote');
const {
  confirmGameEndCandidate,
  prepareGameEndCandidate
} = require('./FullGameFixture');
const {
  buildBoardRoleLogicProfile
} = require('./RoleLogicProfile');
const {
  buildMvpReview,
  buildRuleContractExecutionSummary,
  scoreRecord
} = require('./GameScoring');
const {
  DEMON_ROLE_IDS,
  MINION_ROLE_IDS,
  getAlignmentForPlayer,
  normalizeRoleId
} = require('./RuleAutomation');
const {
  buildAiSelectionSeed,
  chooseDiversified
} = require('./AiTestTargetPolicy');
const {
  buildPlayerView,
  findForbiddenPlayerViewPaths
} = require('../PlayerViewProjection');

const SCHEMA_VERSION = 'mvp.autonomous-game-record.v1';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function nowIso(now) {
  if (now instanceof Date) return now.toISOString();
  if (typeof now === 'string' && now) return now;
  return new Date().toISOString();
}

function safeFilePart(value) {
  return String(value || 'game').replace(/[^0-9A-Za-z_-]/g, '-').slice(0, 80);
}

function getPlayers(roomState) {
  return asArray(roomState.players).slice().sort((left, right) => Number(left.seat) - Number(right.seat));
}

function roleIdOf(player) {
  return normalizeRoleId(player.trueRoleId || player.realRoleId || player.roleId || player.role || player.shownRoleId);
}

function isAlive(player) {
  return player.alive !== false;
}

function canBeExecutedNow(player) {
  return isAlive(player)
    && player.protected !== true
    && player.executionProtected !== true
    && !(roleIdOf(player) === 'fool' && player.foolDeathUsed !== true);
}

function isDemon(player) {
  const roleId = roleIdOf(player);
  const roleKind = String(player.trueRoleType || player.realRoleType || player.roleType || player.team || '').toLowerCase();
  return DEMON_ROLE_IDS.has(roleId) || roleKind === 'demon' || roleKind === 'demons';
}

function isMinion(player) {
  const roleId = roleIdOf(player);
  const roleKind = String(player.trueRoleType || player.realRoleType || player.roleType || player.team || '').toLowerCase();
  return MINION_ROLE_IDS.has(roleId) || roleKind === 'minion' || roleKind === 'minions';
}

function tokenFor(player) {
  return player.playerToken || player.token || player.playerTokenHash || `token-${player.seat}`;
}

function makePlayers(playerCount) {
  return Array.from({ length: playerCount }, (_value, index) => {
    const seat = index + 1;
    return {
      seat,
      name: `AI玩家${seat}`,
      playerToken: `ai-player-token-${seat}`,
      connected: true,
      aiTestPlayer: true,
      alive: true,
      deadVoteAvailable: true
    };
  });
}

function makeRoom({ scriptId, playerCount, gameId }) {
  return {
    id: gameId,
    roomId: gameId,
    scriptId,
    currentScript: scriptId,
    phase: 'setup',
    round: 0,
    playerCount,
    storytellerSessionId: 'ai-storyteller-test',
    authorizedStorytellerSessionIds: ['ai-storyteller-test'],
    players: makePlayers(playerCount),
    privateMessages: [],
    publicEvents: [],
    diaryEntries: [],
    actionHistory: [],
    nightBatches: [],
    nightSubmissions: [],
    candidateResolutions: [],
    gameEndCandidates: []
  };
}

function defaultForceExcludes(scriptId) {
  if (scriptId === 'trouble-brewing') return ['scarletwoman'];
  return [];
}

function normalizeDealRoleId(roleId, scriptId) {
  if (scriptId !== 'trouble-brewing') return roleId;
  const aliases = {
    fortuneteller: 'fortune-teller',
    scarletwoman: 'scarlet-woman'
  };
  return aliases[roleId] || roleId;
}

function createConfirmedSetup({ room, seed, forceIncludeRoleIds = [], forceExcludeRoleIds = [] }) {
  const candidate = createSetupCandidate({
    roomId: room.id,
    scriptId: room.scriptId,
    playerCount: room.playerCount,
    occupiedSeats: room.players.map((player) => player.seat),
    seed,
    forceIncludeRoleIds,
    forceExcludeRoleIds: [
      ...defaultForceExcludes(room.scriptId),
      ...forceExcludeRoleIds
    ],
    source: 'ai-test-autonomous-runner'
  });

  return {
    ...candidate,
    id: candidate.candidateId,
    assignments: asArray(candidate.assignments).length > 0
      ? candidate.assignments.map((assignment) => ({
          ...assignment,
          trueRoleId: normalizeDealRoleId(assignment.trueRoleId || assignment.roleId, room.scriptId),
          shownRoleId: normalizeDealRoleId(assignment.shownRoleId || assignment.roleId, room.scriptId)
        }))
      : asArray(candidate.seatCandidates).map((seatCandidate) => ({
          seat: seatCandidate.seat,
          trueRoleId: normalizeDealRoleId(seatCandidate.trueRoleId || seatCandidate.roleId, room.scriptId),
          shownRoleId: normalizeDealRoleId(seatCandidate.shownRoleId || seatCandidate.roleId, room.scriptId)
        })),
    demonBluffs: asArray(candidate.demonBluffs).map((roleId) => normalizeDealRoleId(roleId, room.scriptId)),
    status: 'confirmed',
    confirmed: true,
    storytellerConfirmed: true,
    confirmedBy: 'ai-storyteller-test'
  };
}

function dealInitialRoles(room, setupCandidate, now) {
  return dealRoles({
    room: {
      ...room,
      setupCandidates: [setupCandidate],
      confirmedSetupCandidate: setupCandidate
    },
    command: {
      command: 'storyteller_deal_roles',
      commandId: `deal-${setupCandidate.candidateId}`,
      candidateId: setupCandidate.candidateId,
      storytellerSessionId: 'ai-storyteller-test'
    },
    now
  }).room;
}

function legalOptions(prompt) {
  return asArray(prompt.options)
    .map((option) => ({
      seat: Number(option.seat),
      alive: option.alive !== false
    }))
    .filter((option) => Number.isInteger(option.seat));
}

function chooseTargetsFromPrompt(roomState, prompt, count) {
  const rules = prompt.targetRules || {};
  const options = legalOptions(prompt).filter((seat) => {
    if (rules.allowSelf === false && Number(seat.seat) === Number(prompt.seat)) return false;
    if (rules.mustBeDead === true && seat.alive !== false) return false;
    if (rules.allowDead === false && seat.alive === false) return false;
    return true;
  });
  return chooseDiversified(
    options,
    count,
    buildAiSelectionSeed(roomState, prompt, 'autonomous-target')
  ).map((option) => option.seat);
}

function chooseRoleFromPrompt(roomState, prompt) {
  const [selected] = chooseDiversified(
    asArray(prompt.roleOptions),
    1,
    buildAiSelectionSeed(roomState, prompt, 'autonomous-role')
  );
  return selected?.roleId || selected?.id || prompt.roleIdAtPrompt || null;
}

function buildAiPlayerNightPayload(roomState, prompt) {
  if (prompt.promptKind === 'auto_info') return { kind: 'auto_info' };
  if (prompt.promptKind === 'waiting') return null;
  if (prompt.promptKind === 'select_1') {
    const [target] = chooseTargetsFromPrompt(roomState, prompt, 1);
    return Number.isInteger(target) ? { kind: 'select_1', target } : null;
  }
  if (prompt.promptKind === 'select_2') {
    const targets = chooseTargetsFromPrompt(roomState, prompt, 2);
    return targets.length === 2 ? { kind: 'select_2', targets } : null;
  }
  if (prompt.promptKind === 'select_3') {
    const targets = chooseTargetsFromPrompt(roomState, prompt, 3);
    return targets.length === 3 ? { kind: 'select_3', targets } : null;
  }
  if (prompt.promptKind === 'select_4') {
    const targets = chooseTargetsFromPrompt(roomState, prompt, 4);
    return targets.length === 4 ? { kind: 'select_4', targets } : null;
  }
  if (prompt.promptKind === 'select_role') {
    const roleId = chooseRoleFromPrompt(roomState, prompt);
    return roleId ? { kind: 'select_role', roleId } : null;
  }
  if (prompt.promptKind === 'select_player_role') {
    const [target] = chooseTargetsFromPrompt(roomState, prompt, 1);
    const roleId = chooseRoleFromPrompt(roomState, prompt);
    return Number.isInteger(target) && roleId ? { kind: 'select_player_role', target, roleId, guessedRoleId: roleId } : null;
  }
  return null;
}

function scanAllPlayerViews(roomState) {
  const hits = [];
  for (const player of getPlayers(roomState)) {
    const view = buildPlayerView(roomState, player.seat);
    hits.push(...findForbiddenPlayerViewPaths(view).map((hit) => `seat${player.seat}:${hit}`));
  }
  return hits;
}

function scanDayVoteViews(room) {
  const hits = [];
  for (const player of getPlayers(room.state)) {
    const view = buildPlayerDayVoteView(room, { playerToken: tokenFor(player) });
    hits.push(...findForbiddenDayVotePaths(view).map((hit) => `seat${player.seat}:${hit}`));
  }
  return hits;
}

function recordEvent(record, type, data = {}) {
  record.events.push({
    sequence: record.events.length + 1,
    type,
    at: nowIso(data.at || record.currentNow),
    data: clone({ ...data, at: undefined })
  });
}

function getPlayerDecisionHistory(record, seat) {
  const publicEventTypes = new Set([
    'nomination-recorded',
    'vote-counted',
    'execution-confirmed',
    'ai-strategy-nomination-selected'
  ]);
  return record.events.filter((event) => {
    if (publicEventTypes.has(event.type)) return true;
    if (!['ai-player-night-submitted', 'ai-player-day-voted'].includes(event.type)) return false;
    return Number(event.data?.seat) === Number(seat);
  });
}

function normalizePolicyDecision(decision, valueKey, fallbackValue) {
  if (decision === null || decision === undefined) {
    return { value: fallbackValue, rationale: null, checks: [] };
  }
  if (typeof decision !== 'object' || Array.isArray(decision)) {
    return { value: decision, rationale: null, checks: [] };
  }
  if (!Object.prototype.hasOwnProperty.call(decision, valueKey)) {
    return { value: decision, rationale: null, checks: [] };
  }
  return {
    value: decision[valueKey],
    rationale: decision.rationale || null,
    checks: asArray(decision.checks)
  };
}

function strategyDecisionAudit(decisionPolicy, normalized) {
  if (!decisionPolicy) return null;
  return {
    policy: decisionPolicy.name || 'custom-decision-policy',
    authority: decisionPolicy.authority || 'suggestion-only',
    rationale: normalized.rationale,
    checks: normalized.checks
  };
}

function applyRoomResult(record, result, type) {
  if (!result || !result.room) {
    record.failures.push(`${type}:missing-room-result`);
    return null;
  }
  if (result.response?.type?.endsWith('_refused')) {
    record.failures.push(`${type}:${result.response.data?.reason || result.response.type}`);
  }
  recordEvent(record, type, result.response || {});
  return result.room;
}

function confirmNightCandidates(record, roomState, batchId) {
  const prepared = prepareCandidateResolutions(roomState, { batchId, aiMode: 'disabled', now: record.currentNow });
  recordEvent(record, 'night-candidates-prepared', {
    batchId,
    candidateCount: prepared.candidates.length,
    summary: prepared.summary
  });

  let nextRoomState = {
    ...roomState,
    candidateResolutions: [
      ...asArray(roomState.candidateResolutions),
      ...prepared.candidates
    ],
    aiAuditRecords: [
      ...asArray(roomState.aiAuditRecords),
      ...prepared.aiAuditRecords
    ]
  };

  for (const candidate of prepared.candidates) {
    const candidateHasEffectivePatch = (candidate.stateChangeDraft?.patches || []).some((patch) => (
      patch?.op === 'set' && String(patch?.path || '').trim()
    ));
    const missingEffectiveStatePatch = requiresEffectiveImportedStatePatch(candidate) && !candidateHasEffectivePatch;
    const missingSafeComplexTemplate = requiresVerifiedComplexRulingTemplate(candidate);
    if (missingEffectiveStatePatch || missingSafeComplexTemplate) {
      rejectCandidateResolution(prepared.candidates, candidate.candidateId, {
        reviewedBy: 'ai-storyteller-test',
        reason: missingSafeComplexTemplate
          ? 'test runner cannot safely resolve imported multi-effect or delayed effects without a verified template'
          : 'test runner cannot safely resolve generic imported status or role-change effects',
        now: record.currentNow
      });
      record.aiStoryteller.rejectedManualRulings += 1;
      recordEvent(record, 'ai-storyteller-deferred-manual-night-candidate', {
        candidateId: candidate.candidateId,
        seat: candidate.seat,
        roleId: candidate.roleId,
        stateChangeType: candidate.stateChangeDraft?.type || null,
        rulingGateReasons: candidate.complexRulingGate?.reasons || []
      });
      continue;
    }
    let confirmed;
    try {
      confirmed = confirmCandidateResolution(prepared.candidates, candidate.candidateId, {
        reviewedBy: 'ai-storyteller-test',
        now: record.currentNow
      });
    } catch (error) {
      if (error.code !== 'unsafe-final-visible-result') throw error;
      confirmed = confirmCandidateResolution(prepared.candidates, candidate.candidateId, {
        reviewedBy: 'ai-storyteller-test',
        now: record.currentNow,
        finalVisibleResult: candidate.visibleResultDraft
          ? {
              ...candidate.visibleResultDraft,
              text: 'Recorded.'
            }
          : null
      });
      recordEvent(record, 'ai-storyteller-redacted-unsafe-visible-result', {
        candidateId: candidate.candidateId,
        roleId: candidate.roleId
      });
    }
    nextRoomState = applyConfirmationCommand(nextRoomState, confirmed.command);
    record.aiStoryteller.confirmedCandidates += 1;
    recordEvent(record, 'ai-storyteller-confirmed-night-candidate', {
      candidateId: candidate.candidateId,
      seat: candidate.seat,
      roleId: candidate.roleId,
      candidateKind: candidate.candidateKind,
      stateChanged: confirmed.command.effects.statePatches.length > 0,
      privateMessages: confirmed.command.effects.privateMessages.length
    });
  }

  return nextRoomState;
}

function runNight(record, room, { nightNumber, isFirstNight, decisionPolicy = null }) {
  room.state = {
    ...room.state,
    phase: 'night',
    round: nightNumber,
    nightNumber
  };

  const started = startNightCollection(room.state, {
    nightNumber,
    isFirstNight,
    batchId: `auto-night-${nightNumber}-${isFirstNight ? 'first' : 'other'}`,
    now: record.currentNow
  });
  room.state = started.roomState;
  recordEvent(record, 'night-started', {
    nightNumber,
    isFirstNight,
    batchId: started.batch.batchId,
    promptCount: started.playerPrompts.length
  });

  for (const prompt of started.playerPrompts) {
    const promptLeaks = findForbiddenPlayerPromptPaths(prompt);
    if (promptLeaks.length > 0) {
      record.privacy.promptForbiddenFieldHits.push(...promptLeaks.map((hit) => `seat${prompt.seat}:${hit}`));
    }
    const player = getPlayers(room.state).find((item) => Number(item.seat) === Number(prompt.seat));
    const defaultPayload = buildAiPlayerNightPayload(room.state, prompt);
    const normalizedDecision = decisionPolicy && typeof decisionPolicy.buildNightPayload === 'function'
      ? normalizePolicyDecision(decisionPolicy.buildNightPayload({
          playerView: clone(buildPlayerView(room.state, player.seat)),
          prompt: clone(prompt),
          history: clone(getPlayerDecisionHistory(record, player.seat)),
          defaultPayload: clone(defaultPayload),
          seed: record.seed
        }), 'payload', defaultPayload)
      : normalizePolicyDecision(null, 'payload', defaultPayload);
    const payload = normalizedDecision.value;
    if (!payload) {
      if (prompt.required) record.failures.push(`night-${nightNumber}:missing-ai-payload-seat-${prompt.seat}`);
      continue;
    }
    const submitted = submitNightAction(room.state, {
      batchId: prompt.batchId,
      promptId: prompt.promptId,
      playerToken: tokenFor(player),
      payload
    }, { now: record.currentNow });
    room.state = submitted.roomState;
    record.aiPlayers.nightSubmissions += 1;
    recordEvent(record, 'ai-player-night-submitted', {
      seat: player.seat,
      roleId: prompt.roleIdAtPrompt || prompt.roleId || prompt.role?.roleId || null,
      promptKind: prompt.promptKind,
      payloadKind: payload.kind,
      selectedTargetSeats: [payload.target, ...asArray(payload.targets)]
        .filter((seat) => Number.isInteger(Number(seat)))
        .map(Number),
      selectedRoleId: payload.roleId || payload.guessedRoleId || null,
      targetPolicy: decisionPolicy?.name || 'deterministic-diversified-v1',
      ...(decisionPolicy
        ? { strategyDecision: strategyDecisionAudit(decisionPolicy, normalizedDecision) }
        : {}),
      batchId: prompt.batchId
    });
  }

  const closed = closeNightCollection(room.state, { batchId: started.batch.batchId }, { now: record.currentNow });
  room.state = closed.roomState;
  const summary = getStorytellerSubmissionSummary(room.state, started.batch.batchId);
  const missing = summary.filter((entry) => entry.required && !['submitted', 'locked'].includes(entry.submissionStatus));
  if (missing.length > 0) record.failures.push(`night-${nightNumber}:missing-required-submissions`);
  recordEvent(record, 'night-closed', {
    batchId: started.batch.batchId,
    summary
  });

  room.state = confirmNightCandidates(record, room.state, started.batch.batchId);
  record.privacy.playerViewForbiddenFieldHits.push(...scanAllPlayerViews(room.state));
  return room;
}

function firstAlive(players, predicate = () => true) {
  return players.find((player) => isAlive(player) && predicate(player)) || null;
}

function firstExecutable(players, predicate = () => true) {
  return players.find((player) => canBeExecutedNow(player) && predicate(player)) || null;
}

function chooseNominee(room, dayNumber) {
  const players = getPlayers(room.state);
  if (
    room.state.scriptId === 'bad-moon-rising'
    && dayNumber <= 1
    && players.some((player) => isAlive(player) && roleIdOf(player) === 'professor')
  ) {
    return firstExecutable(players, (player) => {
      return roleIdOf(player) !== 'professor'
        && !isDemon(player)
        && !isMinion(player)
        && getAlignmentForPlayer(player) === 'good';
    }) || firstExecutable(players, (player) => !isDemon(player)) || firstAlive(players, (player) => !isDemon(player));
  }
  if (dayNumber <= 1) {
    return firstExecutable(players, (player) => isMinion(player) && !isDemon(player))
      || firstExecutable(players, (player) => !isDemon(player))
      || firstAlive(players, (player) => isMinion(player) && !isDemon(player))
      || firstAlive(players, (player) => !isDemon(player));
  }
  return firstExecutable(players, isDemon) || firstAlive(players, isDemon) || firstExecutable(players) || firstAlive(players);
}

function chooseNominator(room, nomineeSeat) {
  return firstAlive(getPlayers(room.state), (player) => Number(player.seat) !== Number(nomineeSeat))
    || firstAlive(getPlayers(room.state));
}

function runDay(record, room, { dayNumber, decisionPolicy = null }) {
  room.state = {
    ...room.state,
    phase: 'day',
    round: dayNumber,
    stage7DayVoteExecution: createDayVoteState({ phase: 'day', round: dayNumber })
  };

  const players = getPlayers(room.state);
  const defaultNominee = chooseNominee(room, dayNumber);
  const nomineeCandidates = players.filter(canBeExecutedNow);
  const nomineeDecision = decisionPolicy && typeof decisionPolicy.chooseNominee === 'function'
    ? normalizePolicyDecision(decisionPolicy.chooseNominee({
        roomState: clone(room.state),
        candidates: clone(nomineeCandidates),
        dayNumber,
        defaultSeat: defaultNominee?.seat || null,
        history: clone(record.events),
        seed: record.seed
      }), 'seat', defaultNominee?.seat || null)
    : normalizePolicyDecision(null, 'seat', defaultNominee?.seat || null);
  const nominee = nomineeCandidates.find((player) => Number(player.seat) === Number(nomineeDecision.value))
    || defaultNominee;
  const defaultNominator = nominee ? chooseNominator(room, nominee.seat) : null;
  const nominatorCandidates = players.filter((player) => isAlive(player) && Number(player.seat) !== Number(nominee?.seat));
  const nominatorDecision = nominee && decisionPolicy && typeof decisionPolicy.chooseNominator === 'function'
    ? normalizePolicyDecision(decisionPolicy.chooseNominator({
        roomState: clone(room.state),
        candidates: clone(nominatorCandidates),
        nomineeSeat: nominee.seat,
        defaultSeat: defaultNominator?.seat || null,
        history: clone(record.events),
        seed: record.seed
      }), 'seat', defaultNominator?.seat || null)
    : normalizePolicyDecision(null, 'seat', defaultNominator?.seat || null);
  const nominator = nominatorCandidates.find((player) => Number(player.seat) === Number(nominatorDecision.value))
    || defaultNominator;
  if (!nominee || !nominator) {
    record.failures.push(`day-${dayNumber}:missing-nomination`);
    return room;
  }

  if (decisionPolicy) {
    recordEvent(record, 'ai-strategy-nomination-selected', {
      dayNumber,
      nomineeSeat: nominee.seat,
      nominatorSeat: nominator.seat,
      nomineeDecision: strategyDecisionAudit(decisionPolicy, nomineeDecision),
      nominatorDecision: strategyDecisionAudit(decisionPolicy, nominatorDecision)
    });
  }

  room = applyRoomResult(record, recordNomination(room, {
    requester: 'storyteller',
    round: dayNumber,
    nominatorSeat: nominator.seat,
    nomineeSeat: nominee.seat,
    now: record.currentNow
  }), 'nomination-recorded') || room;

  const nominationId = room.state.stage7DayVoteExecution?.nomination?.nominationId;
  room = applyRoomResult(record, openVote(room, {
    requester: 'storyteller',
    nominationId,
    now: record.currentNow
  }), 'vote-opened') || room;

  const voteId = room.state.stage7DayVoteExecution?.voting?.voteId;
  for (const player of getPlayers(room.state)) {
    if (!isAlive(player) && player.deadVoteAvailable === false) continue;
    const view = buildPlayerDayVoteView(room, { playerToken: tokenFor(player) });
    const dayLeaks = findForbiddenDayVotePaths(view);
    if (dayLeaks.length > 0) {
      record.privacy.dayVoteForbiddenFieldHits.push(...dayLeaks.map((hit) => `seat${player.seat}:${hit}`));
    }
    if (view.privateView?.canVote !== true) continue;
    const playerView = buildPlayerView(room.state, player.seat);
    const voteDecision = decisionPolicy && typeof decisionPolicy.chooseVote === 'function'
      ? normalizePolicyDecision(decisionPolicy.chooseVote({
          playerView: clone(playerView),
          voteView: clone(view),
          nomineeSeat: nominee.seat,
          dayNumber,
          defaultVote: true,
          history: clone(getPlayerDecisionHistory(record, player.seat)),
          seed: record.seed
        }), 'vote', true)
      : normalizePolicyDecision(null, 'vote', true);
    const vote = Boolean(voteDecision.value);
    const voteResult = submitPlayerVote(room, {
      playerToken: tokenFor(player),
      seat: player.seat,
      voteId,
      vote,
      now: record.currentNow
    });
    room = applyRoomResult(record, voteResult, 'player-vote-recorded') || room;
    record.aiPlayers.dayVotes += 1;
    recordEvent(record, 'ai-player-day-voted', {
      seat: player.seat,
      voteId,
      vote,
      ...(decisionPolicy
        ? {
            nomineeSeat: nominee.seat,
            strategyDecision: strategyDecisionAudit(decisionPolicy, voteDecision)
          }
        : {})
    });
  }

  room = applyRoomResult(record, countVote(room, {
    requester: 'storyteller',
    voteId,
    now: record.currentNow
  }), 'vote-counted') || room;

  room = applyRoomResult(record, confirmExecution(room, {
    requester: 'storyteller',
    voteId,
    nomineeSeat: nominee.seat,
    confirm: true,
    now: record.currentNow
  }), 'execution-confirmed') || room;
  record.aiStoryteller.confirmedExecutions += 1;

  record.privacy.playerViewForbiddenFieldHits.push(...scanAllPlayerViews(room.state));
  record.privacy.dayVoteForbiddenFieldHits.push(...scanDayVoteViews(room));
  return room;
}

function maybeConfirmGameEnd(record, room) {
  const prepared = prepareGameEndCandidate(room, { now: record.currentNow });
  room = prepared.room || room;
  if (!prepared.candidate) return { room, ended: false };
  recordEvent(record, 'game-end-candidate-prepared', {
    candidateId: prepared.candidate.candidateId,
    winningTeam: prepared.candidate.winningTeam,
    reasonCode: prepared.candidate.reasonCode
  });
  const confirmed = confirmGameEndCandidate(room, {
    candidateId: prepared.candidate.candidateId,
    confirm: true,
    now: record.currentNow
  });
  room = confirmed.room || room;
  record.aiStoryteller.confirmedGameEnd += 1;
  recordEvent(record, 'game-end-confirmed', confirmed.response || {});
  return { room, ended: true };
}

function writeRecord(record, { rootDir = process.cwd() } = {}) {
  const outDir = path.join(rootDir, 'docs', 'autonomous-game-records');
  fs.mkdirSync(outDir, { recursive: true });
  const recordPath = path.join(outDir, `${safeFilePart(record.gameId)}.json`);
  record.artifacts.recordPath = path.relative(rootDir, recordPath).replace(/\//g, '\\');
  record.ruleContracts = buildRuleContractExecutionSummary(record);
  record.scoring = scoreRecord(record);
  record.mvpReview = buildMvpReview(record, record.scoring);
  fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return recordPath;
}

function runAutonomousGame(options = {}) {
  const scriptId = options.scriptId || 'trouble-brewing';
  const playerCount = Number(options.playerCount || 7);
  const maxDays = Number.isInteger(Number(options.maxDays)) ? Number(options.maxDays) : 5;
  const seed = options.seed || `${scriptId}-${playerCount}-ai-autonomous-mvp`;
  const gameId = options.gameId || `auto-${safeFilePart(scriptId)}-${playerCount}-${Date.now()}`;
  const startedAt = nowIso(options.now);
  const decisionPolicy = options.decisionPolicy || null;
  const record = {
    schemaVersion: SCHEMA_VERSION,
    mode: 'test-only-ai-storyteller-and-ai-players',
    gameId,
    scriptId,
    playerCount,
    seed,
    ...(decisionPolicy
      ? {
          decisionPolicy: {
            name: decisionPolicy.name || 'custom-decision-policy',
            authority: decisionPolicy.authority || 'suggestion-only'
          }
        }
      : {}),
    startedAt,
    endedAt: null,
    currentNow: startedAt,
    roleLogic: buildBoardRoleLogicProfile({ scriptId }),
    setup: null,
    storytellerView: null,
    result: { status: 'running', winningTeam: null, reasonCode: null },
    aiStoryteller: {
      confirmedCandidates: 0,
      rejectedManualRulings: 0,
      confirmedExecutions: 0,
      confirmedGameEnd: 0,
      authority: 'test-mode-only'
    },
    aiPlayers: {
      nightSubmissions: 0,
      dayVotes: 0,
      inputSource: 'player-view-and-player-prompts-only'
    },
    privacy: {
      playerViewForbiddenFieldHits: [],
      promptForbiddenFieldHits: [],
      dayVoteForbiddenFieldHits: []
    },
    failures: [],
    events: [],
    artifacts: {
      recordPath: null
    },
    scoring: null
  };

  let roomState = makeRoom({ scriptId, playerCount, gameId });
  const setupCandidate = createConfirmedSetup({
    room: roomState,
    seed,
    forceIncludeRoleIds: options.forceIncludeRoleIds || [],
    forceExcludeRoleIds: options.forceExcludeRoleIds || []
  });
  record.setup = {
    candidateId: setupCandidate.candidateId,
    baseCounts: setupCandidate.baseCounts,
    effectiveCounts: setupCandidate.effectiveCounts,
    demonBluffs: setupCandidate.demonBluffs,
    assignments: setupCandidate.assignments
  };
  recordEvent(record, 'setup-candidate-confirmed', {
    candidateId: setupCandidate.candidateId,
    roleCount: setupCandidate.assignments.length
  });

  roomState = dealInitialRoles(roomState, setupCandidate, startedAt);
  record.storytellerView = {
    players: getPlayers(roomState).map((player) => ({
      seat: player.seat,
      trueRoleId: player.trueRoleId,
      shownRoleId: player.shownRoleId,
      trueAlignment: player.trueAlignment,
      shownAlignment: player.shownAlignment
    }))
  };
  recordEvent(record, 'roles-dealt', { playerCount: getPlayers(roomState).length });
  record.privacy.playerViewForbiddenFieldHits.push(...scanAllPlayerViews(roomState));
  record.ruleContracts = buildRuleContractExecutionSummary(record);
  recordEvent(record, 'role-rule-contracts-indexed', {
    highRiskRoleIds: record.ruleContracts.presentHighRiskRoleIds,
    supportedHighRiskRoleIds: record.ruleContracts.supportedHighRiskRoleIds,
    directAiStateMutationAllowedRoleIds: record.ruleContracts.directAiStateMutationAllowedRoleIds
  });

  let room = { id: gameId, roomId: gameId, state: roomState };
  try {
    let gameEnd = { room, ended: false };
    for (let dayNumber = 1; dayNumber <= maxDays; dayNumber += 1) {
      room = runNight(record, room, {
        nightNumber: dayNumber,
        isFirstNight: dayNumber === 1,
        decisionPolicy
      });
      room = runDay(record, room, { dayNumber, decisionPolicy });
      gameEnd = maybeConfirmGameEnd(record, room);
      room = gameEnd.room;
      if (gameEnd.ended) break;
    }
  } catch (error) {
    record.failures.push(error.code ? `${error.code}:${error.message}` : error.message);
  }

  const finalState = room.state || room;
  const finalGameEnd = finalState.publicGameOver || null;
  record.endedAt = nowIso();
  record.result = finalGameEnd
    ? {
        status: 'ended',
        winningTeam: finalGameEnd.winningTeam,
        reasonCode: finalGameEnd.reasonCode,
        summary: finalGameEnd.summary
      }
    : {
        status: 'not-ended',
        winningTeam: null,
        reasonCode: null,
        summary: null
      };
  record.finalState = {
    phase: finalState.phase,
    round: finalState.round,
    aliveSeats: getPlayers(finalState).filter(isAlive).map((player) => player.seat),
    players: getPlayers(finalState).map((player) => ({
      seat: player.seat,
      trueRoleId: player.trueRoleId,
      shownRoleId: player.shownRoleId,
      alive: player.alive !== false,
      alignment: getAlignmentForPlayer(player)
    })),
    privateMessageCount: asArray(finalState.privateMessages).length,
    publicEventCount: asArray(finalState.publicEvents).length
  };
  record.ruleContracts = buildRuleContractExecutionSummary(record);

  writeRecord(record, { rootDir: options.rootDir || process.cwd() });
  return record;
}

module.exports = {
  SCHEMA_VERSION,
  runAutonomousGame,
  scoreRecord
};
