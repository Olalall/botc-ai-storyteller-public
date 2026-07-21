const AI_CONTROL_MODES = new Set(['auto', 'manual']);
const SAFE_AI_INTENTS = new Set(['refresh-suggestions', 'summarize-storyteller-state']);
const HIGH_RISK_AI_INTENTS = new Set([
  'deal_roles',
  'confirm_setup_candidate',
  'confirm_resolution',
  'send_private_message',
  'confirm_execution',
  'confirm_game_end',
  'write_event_log',
  'mutate_state'
]);

const DEFAULT_AI_CONTROL = {
  schemaVersion: 'mvp.ai-control-mode.v1',
  mode: 'manual',
  status: 'manual-takeover',
  updatedAt: null,
  lastTickAt: null,
  lastIntent: null,
  lastResult: null,
  safeTickCount: 0,
  rejectedHighRiskCount: 0,
  auditLog: []
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso(now = new Date()) {
  if (typeof now === 'string') return now;
  return now.toISOString();
}

function normalizeMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return AI_CONTROL_MODES.has(mode) ? mode : 'manual';
}

function normalizeAiControl(value) {
  return {
    ...clone(DEFAULT_AI_CONTROL),
    ...(value && typeof value === 'object' ? clone(value) : {}),
    auditLog: Array.isArray(value?.auditLog) ? value.auditLog.slice(-20) : []
  };
}

function ensureAiControl(roomState) {
  const control = normalizeAiControl(roomState?.aiControl);
  if (roomState) {
    roomState.aiControl = control;
  }
  return control;
}

function appendAudit(control, entry) {
  control.auditLog = [
    ...(Array.isArray(control.auditLog) ? control.auditLog : []),
    entry
  ].slice(-20);
  return entry;
}

function getPendingStorytellerWork(roomState) {
  const candidates = Array.isArray(roomState?.candidateResolutions) ? roomState.candidateResolutions : [];
  const gameEndCandidates = Array.isArray(roomState?.gameEndCandidates) ? roomState.gameEndCandidates : [];
  const pendingCandidateCount = candidates.filter((candidate) => (
    ['pending-storyteller', 'needs-storyteller-ruling'].includes(candidate?.status)
  )).length;
  const pendingGameEndCount = gameEndCandidates.filter((candidate) => (
    candidate && candidate.status !== 'confirmed' && candidate.status !== 'rejected'
  )).length;
  const dayVote = roomState?.stage7DayVoteExecution || {};
  const pendingDayVoteCount = [
    dayVote.nomination?.status === 'open',
    dayVote.voting?.status === 'open' || dayVote.vote?.status === 'open',
    dayVote.voteCount?.candidateExecution?.status === 'pending-storyteller-confirmation',
    dayVote.executionCandidate?.status === 'pending-storyteller'
  ].filter(Boolean).length;

  return {
    pendingCandidateCount,
    pendingGameEndCount,
    pendingDayVoteCount,
    total: pendingCandidateCount + pendingGameEndCount + pendingDayVoteCount
  };
}

function getAiControlSnapshot(roomState) {
  const control = normalizeAiControl(roomState?.aiControl);
  const pending = getPendingStorytellerWork(roomState);
  return {
    schemaVersion: control.schemaVersion,
    mode: control.mode,
    status: control.mode === 'auto' ? 'auto-safe-suggestions-only' : 'manual-takeover',
    updatedAt: control.updatedAt,
    lastTickAt: control.lastTickAt,
    lastIntent: control.lastIntent,
    lastResult: control.lastResult,
    safeTickCount: control.safeTickCount,
    rejectedHighRiskCount: control.rejectedHighRiskCount,
    auditCount: control.auditLog.length,
    lastAudit: control.auditLog.at(-1) || null,
    pendingStorytellerWork: pending,
    allowedAutoIntents: [...SAFE_AI_INTENTS],
    blockedHighRiskIntents: [...HIGH_RISK_AI_INTENTS],
    runtimeBoundary: {
      playerVisible: false,
      eventLogWritten: false,
      actionHistoryWritten: false,
      authoritativeStateChanged: false,
      highRiskCommandsExecutable: false,
      storytellerConfirmationRequired: true
    }
  };
}

function setAiControlMode(roomState, input = {}, now = new Date()) {
  if (!roomState) throw new Error('missing-room-state');
  const at = nowIso(now);
  const control = ensureAiControl(roomState);
  const previousMode = control.mode;
  const mode = normalizeMode(input.mode);

  control.mode = mode;
  control.status = mode === 'auto' ? 'auto-safe-suggestions-only' : 'manual-takeover';
  control.updatedAt = at;
  control.lastResult = 'mode-updated';
  appendAudit(control, {
    type: 'mode-switch',
    previousMode,
    mode,
    actor: input.actor || 'storyteller',
    at,
    eventLogWritten: false,
    actionHistoryWritten: false,
    authoritativeStateChanged: false
  });

  return getAiControlSnapshot(roomState);
}

function runAiControlTick(roomState, input = {}, now = new Date()) {
  if (!roomState) throw new Error('missing-room-state');
  const at = nowIso(now);
  const control = ensureAiControl(roomState);
  const intent = String(input.intent || 'refresh-suggestions').trim().toLowerCase();

  control.lastTickAt = at;
  control.lastIntent = intent;

  if (control.mode !== 'auto') {
    control.lastResult = 'manual-takeover-noop';
    appendAudit(control, {
      type: 'manual-takeover-noop',
      intent,
      at,
      eventLogWritten: false,
      actionHistoryWritten: false,
      authoritativeStateChanged: false
    });
    return {
      accepted: false,
      reason: 'manual-takeover-active',
      snapshot: getAiControlSnapshot(roomState)
    };
  }

  if (!SAFE_AI_INTENTS.has(intent) || HIGH_RISK_AI_INTENTS.has(intent)) {
    control.rejectedHighRiskCount += 1;
    control.lastResult = 'high-risk-intent-rejected';
    appendAudit(control, {
      type: 'high-risk-intent-rejected',
      intent,
      at,
      eventLogWritten: false,
      actionHistoryWritten: false,
      authoritativeStateChanged: false
    });
    return {
      accepted: false,
      reason: 'high-risk-intent-rejected',
      snapshot: getAiControlSnapshot(roomState)
    };
  }

  control.safeTickCount += 1;
  control.lastResult = 'safe-suggestions-refreshed';
  appendAudit(control, {
    type: 'safe-suggestions-refreshed',
    intent,
    pendingStorytellerWork: getPendingStorytellerWork(roomState),
    at,
    eventLogWritten: false,
    actionHistoryWritten: false,
    authoritativeStateChanged: false
  });

  return {
    accepted: true,
    reason: 'safe-suggestions-refreshed',
    snapshot: getAiControlSnapshot(roomState)
  };
}

module.exports = {
  AI_CONTROL_MODES,
  HIGH_RISK_AI_INTENTS,
  SAFE_AI_INTENTS,
  getAiControlSnapshot,
  normalizeAiControl,
  runAiControlTick,
  setAiControlMode
};
