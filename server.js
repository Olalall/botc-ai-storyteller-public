const express = require('express');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const crypto = require('crypto');
const ScriptManager = require('./modules/ScriptManager');
const RoleDistributor = require('./modules/RoleDistributor');
const NightOrderManager = require('./modules/NightOrderManager');
const AbilityEngine = require('./modules/AbilityEngine');
const { buildPlayerView } = require('./modules/PlayerViewProjection');
const { buildRoleCatalog } = require('./modules/ScriptCatalog');
const {
  createSetupCandidate,
  countSeatCandidateTeams
} = require('./modules/mvp/SetupCandidate');
const {
  dealRoles: dealMvpRoles,
  DealRolesError
} = require('./modules/mvp/DealRoles');
const {
  closeNightCollection: closeMvpNightCollection,
  getStorytellerSubmissionSummary: getMvpNightSubmissionSummary,
  startNightCollection: startMvpNightCollection,
  submitNightAction: submitMvpNightAction,
  withdrawNightAction: withdrawMvpNightAction
} = require('./modules/mvp/NightCollection');
const {
  applyConfirmationCommand: applyMvpCandidateConfirmationCommand,
  confirmCandidateResolution: confirmMvpCandidateResolution,
  prepareCandidateResolutions: prepareMvpCandidateResolutions,
  prepareCandidateResolutionsWithAiProvider: prepareMvpCandidateResolutionsWithAiProvider,
  rejectCandidateResolution: rejectMvpCandidateResolution
} = require('./modules/mvp/CandidateResolution');
const { getRoleAutomationPolicy } = require('./modules/mvp/RoleAutomationSafety');
const {
  buildAiSelectionSeed,
  chooseDiversified
} = require('./modules/mvp/AiTestTargetPolicy');
const { createAiProviderFromEnv } = require('./modules/mvp/AiProvider');
const {
  applyRuntimeAiSettings,
  getAiSettingsEnv,
  getRedactedAiSettings,
  runMockAiSettingsCheck
} = require('./modules/mvp/AiSettings');
const {
  getAiControlSnapshot,
  runAiControlTick,
  setAiControlMode
} = require('./modules/mvp/AiControlMode');
const {
  buildPlayerDayVoteView,
  buildPublicDayVoteView,
  closeVoteRound: closeMvpDayVoteRound,
  confirmExecution: confirmMvpDayExecution,
  countVote: countMvpDayVote,
  finalizeStandingExecution: finalizeMvpStandingExecution,
  manualExecution: manualMvpDayExecution,
  openVote: openMvpDayVote,
  proxyVote: proxyMvpDayVote,
  recordNomination: recordMvpDayNomination,
  startDayTimer: startMvpDayTimer,
  submitPlayerVote: submitMvpPlayerVote
} = require('./modules/mvp/DayVote');
const {
  buildStage8TwelvePlayerFixture,
  buildStorytellerGameEndView,
  confirmGameEndCandidate: confirmMvpGameEndCandidate,
  prepareGameEndCandidate: prepareMvpGameEndCandidate
} = require('./modules/mvp/FullGameFixture');
const {
  confirmEmptyNightCloseout,
  getAuthoritativePhaseSnapshot,
  getDayCloseoutGate,
  getLatestNightBatch,
  getNightCloseoutGate,
  getPendingGameEndCandidate,
  getStartDayGate,
  getStartNightGate,
  markDayClosed
} = require('./modules/mvp/PhaseCoordinator');
const {
  attachVerifiedPlayerToken,
  loadRoomSnapshots,
  saveRoomSnapshots,
  verifyPlayerTokenHash
} = require('./modules/mvp/RoomSnapshotStore');
const {
  buildMvpReview,
  buildRuleContractExecutionSummary,
  scoreRecord
} = require('./modules/mvp/GameScoring');
const {
  updateStorytellerPlayerStatus
} = require('./modules/mvp/StorytellerPlayerStatus');

const ONE_MIB = 1024 * 1024;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const app = express();
const server = http.createServer(app);
const WEBSOCKET_MAX_PAYLOAD_BYTES = getWebSocketMaxPayloadBytes(process.env);
const WEBSOCKET_RATE_LIMIT_WINDOW_MS = getWebSocketRateWindowMs(process.env);
const WEBSOCKET_RATE_LIMIT_MAX_MESSAGES = getWebSocketRateMaxMessages(process.env);
const WEBSOCKET_ALLOW_MISSING_ORIGIN = getWebSocketAllowMissingOrigin(process.env);
const WEBSOCKET_ALLOWED_ORIGINS = getWebSocketAllowedOrigins(process.env);
const PRIVATE_DIRECT_MESSAGE_RETENTION_LIMIT = getPrivateDirectMessageRetentionLimit(process.env);
const PRIVATE_DIRECT_MESSAGE_MAX_AGE_MS = getPrivateDirectMessageMaxAgeMs(process.env);
const LEGACY_WEBSOCKET_COMMANDS_ALLOWED = getLegacyWebSocketCommandsAllowed(process.env);
const LEGACY_PAGES_ALLOWED = getLegacyPagesAllowed(process.env);
const wss = new WebSocket.Server({
  server,
  maxPayload: WEBSOCKET_MAX_PAYLOAD_BYTES
});

// 初始化所有管理器
const scriptManager = new ScriptManager();
const roleDistributor = new RoleDistributor(scriptManager);
const nightOrderManager = new NightOrderManager(scriptManager);
const abilityEngine = new AbilityEngine(scriptManager);
const RESERVED_RUNTIME_SCRIPT_IDS = new Set(scriptManager.getScriptList().map((script) => script.id));
const BUILT_IN_STORYTELLER_LIBRARY_SCRIPT_IDS = new Set([
  'to-cast-large-shadow'
]);
const STORYTELLER_ROOM_LIST_LIMIT = 80;
const FORMAL_DISABLED_LEGACY_WEBSOCKET_COMMANDS = new Set([
  'auto_distribute_roles',
  'distribute_roles',
  'start_night',
  'next_phase',
  'get_current_action',
  'mark_action_waiting',
  'mark_action_completed',
  'player_action',
  'update_player_status',
  'night_action_complete',
  'send_message',
  'broadcast_message'
]);
const LEGACY_PAGE_REDIRECTS = new Map([
  ['/storyteller.html', '/storyteller-v2.html'],
  ['/grimoire.html', '/storyteller-v2.html'],
  ['/player.html', '/player-v2.html']
]);

function parseIntegerEnv(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function parseBooleanEnv(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function getWebSocketMaxPayloadBytes(env = process.env) {
  return parseIntegerEnv(env.BOTC_WS_MAX_PAYLOAD_BYTES, 2 * ONE_MIB, {
    min: 4 * 1024,
    max: 10 * ONE_MIB
  });
}

function getWebSocketRateWindowMs(env = process.env) {
  return parseIntegerEnv(env.BOTC_WS_RATE_WINDOW_MS, 10_000, {
    min: 1000,
    max: 60_000
  });
}

function getWebSocketRateMaxMessages(env = process.env) {
  return parseIntegerEnv(env.BOTC_WS_RATE_MAX_MESSAGES, 240, {
    min: 20,
    max: 5000
  });
}

function getWebSocketAllowMissingOrigin(env = process.env) {
  if (env.BOTC_WS_ALLOW_MISSING_ORIGIN !== undefined && env.BOTC_WS_ALLOW_MISSING_ORIGIN !== '') {
    return parseBooleanEnv(env.BOTC_WS_ALLOW_MISSING_ORIGIN, true);
  }
  return env.NODE_ENV === 'production' ? false : true;
}

function normalizeOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
  } catch {
    return '';
  }
}

function getWebSocketAllowedOrigins(env = process.env) {
  return new Set(String(env.BOTC_WS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean));
}

function getRequestOriginForHost(req) {
  const host = String(req?.headers?.host || '').trim().toLowerCase();
  if (!host) return '';
  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const proto = forwardedProto || (req?.socket?.encrypted ? 'https' : 'http');
  return normalizeOrigin(`${proto}://${host}`);
}

function getWebSocketOriginGate(req) {
  const rawOrigin = req?.headers?.origin;
  const origin = normalizeOrigin(rawOrigin);
  if (!rawOrigin) {
    return WEBSOCKET_ALLOW_MISSING_ORIGIN
      ? { ok: true, reason: 'missing-origin-allowed' }
      : { ok: false, reason: 'websocket-origin-required' };
  }
  if (!origin) return { ok: false, reason: 'websocket-origin-invalid' };
  if (WEBSOCKET_ALLOWED_ORIGINS.has(origin)) return { ok: true, reason: 'allowed-origin' };
  const requestOrigin = getRequestOriginForHost(req);
  if (origin && requestOrigin && origin === requestOrigin) return { ok: true, reason: 'same-origin' };
  return { ok: false, reason: 'websocket-origin-refused', origin };
}

function getWebSocketMessageByteLength(message) {
  if (Buffer.isBuffer(message)) return message.byteLength;
  if (message instanceof ArrayBuffer) return message.byteLength;
  if (Array.isArray(message)) return message.reduce((sum, item) => sum + getWebSocketMessageByteLength(item), 0);
  return Buffer.byteLength(String(message || ''), 'utf8');
}

function createWebSocketRateLimiter() {
  const timestamps = [];
  return function checkWebSocketRateLimit(now = Date.now()) {
    const windowStart = now - WEBSOCKET_RATE_LIMIT_WINDOW_MS;
    while (timestamps.length > 0 && timestamps[0] <= windowStart) {
      timestamps.shift();
    }
    if (timestamps.length >= WEBSOCKET_RATE_LIMIT_MAX_MESSAGES) {
      return {
        ok: false,
        retryAfterMs: Math.max(0, WEBSOCKET_RATE_LIMIT_WINDOW_MS - (now - timestamps[0])),
        limit: WEBSOCKET_RATE_LIMIT_MAX_MESSAGES,
        windowMs: WEBSOCKET_RATE_LIMIT_WINDOW_MS
      };
    }
    timestamps.push(now);
    return { ok: true };
  };
}

function getPrivateDirectMessageRetentionLimit(env = process.env) {
  return parseIntegerEnv(env.BOTC_PRIVATE_MESSAGE_RETENTION_LIMIT, 200, {
    min: 1,
    max: 5000
  });
}

function getPrivateDirectMessageMaxAgeMs(env = process.env) {
  return parseIntegerEnv(env.BOTC_PRIVATE_MESSAGE_MAX_AGE_MS, 14 * ONE_DAY_MS, {
    min: 0,
    max: 365 * ONE_DAY_MS
  });
}

function getLegacyWebSocketCommandsAllowed(env = process.env) {
  // Legacy phase commands can bypass the authoritative V2.5 coordinator.
  // Keep the setting for compatibility with old configuration files, but do
  // not allow those commands in any environment.
  return false;
}

function getLegacyPagesAllowed(env = process.env) {
  if (String(env.NODE_ENV || '').trim().toLowerCase() === 'production') return false;
  return parseBooleanEnv(env.BOTC_ALLOW_LEGACY_PAGES, false);
}

function canReadHealthDetails(req) {
  if (isLoopbackRequest(req)) return true;
  const expectedToken = String(process.env.BOTC_HEALTHZ_ADMIN_TOKEN || '');
  if (!expectedToken) return false;
  const providedToken = String(
    req.get('X-BOTC-Healthz-Token')
      || req.get('Authorization')?.replace(/^Bearer\s+/i, '')
      || ''
  );
  return providedToken === expectedToken;
}

function getLegacyPageRedirectTarget(req) {
  const pathname = String(req?.path || '').toLowerCase();
  return LEGACY_PAGE_REDIRECTS.get(pathname) || null;
}

function shouldRefuseLegacyWebSocketCommand(type) {
  return !LEGACY_WEBSOCKET_COMMANDS_ALLOWED
    && FORMAL_DISABLED_LEGACY_WEBSOCKET_COMMANDS.has(String(type || ''));
}

function sendLegacyWebSocketCommandRefused(ws, command) {
  sendError(ws, 'legacy-websocket-command-disabled', 'legacy-websocket-command-disabled', {
    command,
    allowEnv: 'BOTC_ALLOW_LEGACY_WS_COMMANDS=1'
  });
}

function isDirectPrivateChatMessage(message) {
  return message?.type === 'storyteller-direct' || message?.type === 'player-direct';
}

function getPrivateMessageCreatedTime(message) {
  const parsed = Date.parse(message?.createdAt || message?.sentAt || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function prunePrivateMessageDedupe(room) {
  if (!Array.isArray(room?.state?.playerPrivateMessageDedupe)) return;
  const liveMessageIds = new Set((room.state.privateMessages || []).map((message) => String(message.id || '')));
  room.state.playerPrivateMessageDedupe = room.state.playerPrivateMessageDedupe
    .filter((item) => item?.messageId && liveMessageIds.has(String(item.messageId)))
    .slice(-100);
}

function pruneRoomPrivateMessages(room, { now = Date.now() } = {}) {
  if (!room?.state || !Array.isArray(room.state.privateMessages)) {
    return { removedExpired: 0, removedByLimit: 0, before: 0, after: 0, directAfter: 0 };
  }

  const before = room.state.privateMessages.length;
  const maxAgeMs = PRIVATE_DIRECT_MESSAGE_MAX_AGE_MS;
  const cutoff = maxAgeMs > 0 ? now - maxAgeMs : null;
  let removedExpired = 0;

  const unexpiredMessages = room.state.privateMessages.filter((message) => {
    if (!isDirectPrivateChatMessage(message) || cutoff === null) return true;
    const createdAt = getPrivateMessageCreatedTime(message);
    if (createdAt > 0 && createdAt < cutoff) {
      removedExpired += 1;
      return false;
    }
    return true;
  });

  const directMessages = unexpiredMessages
    .map((message, index) => ({ message, index, createdAt: getPrivateMessageCreatedTime(message) }))
    .filter((item) => isDirectPrivateChatMessage(item.message));
  const keepDirectIds = new Set();
  let removedByLimit = 0;

  if (directMessages.length > PRIVATE_DIRECT_MESSAGE_RETENTION_LIMIT) {
    const keep = directMessages
      .slice()
      .sort((left, right) => {
        if (right.createdAt !== left.createdAt) return right.createdAt - left.createdAt;
        return right.index - left.index;
      })
      .slice(0, PRIVATE_DIRECT_MESSAGE_RETENTION_LIMIT);
    keep.forEach((item) => keepDirectIds.add(String(item.message.id || `index:${item.index}`)));
    removedByLimit = directMessages.length - keep.length;
  } else {
    directMessages.forEach((item) => keepDirectIds.add(String(item.message.id || `index:${item.index}`)));
  }

  room.state.privateMessages = unexpiredMessages.filter((message, index) => {
    if (!isDirectPrivateChatMessage(message)) return true;
    return keepDirectIds.has(String(message.id || `index:${index}`));
  });
  prunePrivateMessageDedupe(room);

  return {
    removedExpired,
    removedByLimit,
    before,
    after: room.state.privateMessages.length,
    directAfter: room.state.privateMessages.filter(isDirectPrivateChatMessage).length
  };
}

function getRoomAutoClearIntervalMs(env = process.env) {
  const raw = env.BOTC_ROOM_AUTO_CLEAR_INTERVAL_MS;
  if (raw === undefined || raw === '') return ONE_DAY_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 100) return ONE_DAY_MS;
  return Math.floor(parsed);
}

const ROOM_AUTO_CLEAR_INTERVAL_MS = getRoomAutoClearIntervalMs();

app.use(express.json());
app.get(['/storyteller.html', '/grimoire.html', '/player.html'], (req, res, next) => {
  if (LEGACY_PAGES_ALLOWED) return next();
  const target = getLegacyPageRedirectTarget(req);
  if (!target) return next();
  res.redirect(302, target);
});
app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (req, res) => {
  const includeDetails = canReadHealthDetails(req);
  const aiProvider = createAiProviderFromEnv(getAiSettingsEnv());
  const aiSettings = getRedactedAiSettings();
  const memory = process.memoryUsage();
  const payload = {
    status: 'ok',
    service: 'blood-on-clocktower-server',
    runtimeFullAutomationEnabled: false
  };
  if (includeDetails) {
    payload.aiProviderEnabled = aiProvider.config.enabled === true;
    payload.aiProvider = {
      provider: aiProvider.config.provider,
      model: aiProvider.config.enabled ? aiProvider.config.model : 'disabled',
      reason: aiProvider.config.enabled ? null : aiProvider.config.reason,
      source: aiSettings.source,
      apiKeyConfigured: aiSettings.apiKeyConfigured
    };
    payload.runtime = {
      nodeEnv: process.env.NODE_ENV || 'development',
      uptimeSeconds: Math.round(process.uptime()),
      memory: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        externalBytes: memory.external,
        arrayBuffersBytes: memory.arrayBuffers
      },
      activeRooms: rooms.size,
      activeConnections: connections.size,
      activeWebSocketClients: wss.clients.size
    };
  }
  res.json(payload);
});

function isLoopbackRequest(req) {
  const address = String(req.ip || req.socket?.remoteAddress || '');
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address) || address.startsWith('::ffff:127.');
}

function ensureAiSettingsAdminRequest(req, res) {
  const expectedToken = process.env.BOTC_AI_SETTINGS_ADMIN_TOKEN;
  if (expectedToken) {
    const providedToken = req.get('X-BOTC-AI-Settings-Token') || req.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (providedToken === expectedToken) return true;
    res.status(403).json({ status: 'NO_GO', reason: 'ai-settings-admin-token-required' });
    return false;
  }
  if (isLoopbackRequest(req)) return true;
  res.status(403).json({ status: 'NO_GO', reason: 'ai-settings-local-only' });
  return false;
}

app.get('/api/storyteller/ai-settings', (req, res) => {
  if (!ensureAiSettingsAdminRequest(req, res)) return;
  res.json({
    status: 'GO',
    settings: getRedactedAiSettings()
  });
});

app.post('/api/storyteller/ai-settings', (req, res) => {
  if (!ensureAiSettingsAdminRequest(req, res)) return;
  const settings = applyRuntimeAiSettings(req.body || {});
  res.json({
    status: 'GO',
    settings
  });
});

app.post('/api/storyteller/ai-settings/test', (req, res) => {
  if (!ensureAiSettingsAdminRequest(req, res)) return;
  res.json(runMockAiSettingsCheck());
});

const ROOM_GAME_RECORDS_DIR = path.join(__dirname, 'docs', 'game-records');
const AUTONOMOUS_GAME_RECORDS_DIR = path.join(__dirname, 'docs', 'autonomous-game-records');
const IMPORTED_SCRIPTS_DIR = process.env.BOTC_IMPORTED_SCRIPTS_DIR
  ? path.resolve(__dirname, process.env.BOTC_IMPORTED_SCRIPTS_DIR)
  : path.join(__dirname, '.botc-imported-scripts');
const GAME_RECORD_REVIEW_DIRS = [
  { source: 'room', dir: ROOM_GAME_RECORDS_DIR },
  { source: 'autonomous', dir: AUTONOMOUS_GAME_RECORDS_DIR }
];
const GAME_RECORDS_LIMIT_MAX = 80;

function ensureStorytellerRecordsRequest(req, res) {
  if (['1', 'true', 'yes'].includes(String(process.env.BOTC_GAME_RECORDS_PUBLIC || '').toLowerCase())) return true;
  const expectedToken = process.env.BOTC_GAME_RECORDS_ADMIN_TOKEN;
  const providedToken = req.get('X-BOTC-Game-Records-Token') || req.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const requiresToken = process.env.NODE_ENV === 'production' || process.env.BOTC_RECORDS_REQUIRE_TOKEN === '1';
  if (expectedToken && providedToken === expectedToken) return true;
  if (!requiresToken && isLoopbackRequest(req)) return true;
  res.status(403).json({
    status: 'NO_GO',
    reason: expectedToken ? 'game-records-admin-token-required' : 'game-records-local-only'
  });
  return false;
}

function parseJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function safeCount(value) {
  return Array.isArray(value) ? value.length : Number(value || 0);
}

function buildGameRecordSummary(record, fileName, stat, source = 'unknown') {
  const privacyHits = safeCount(record.privacy?.playerViewForbiddenFieldHits)
    + safeCount(record.privacy?.promptForbiddenFieldHits)
    + safeCount(record.privacy?.dayVoteForbiddenFieldHits);
  return {
    fileName,
    source,
    gameId: record.gameId || fileName.replace(/\.json$/i, ''),
    roomId: record.roomId || null,
    gameNumber: Number(record.gameNumber || 1),
    scriptId: record.scriptId || 'unknown',
    playerCount: Number(record.playerCount || record.finalState?.players?.length || 0),
    mode: record.mode || 'unknown',
    startedAt: record.startedAt || null,
    endedAt: record.endedAt || null,
    modifiedAt: stat.mtime.toISOString(),
    result: {
      status: record.result?.status || 'unknown',
      winningTeam: record.result?.winningTeam || null,
      reasonCode: record.result?.reasonCode || null
    },
    score: {
      total: Number(record.scoring?.total ?? record.score?.total ?? 0),
      grade: record.scoring?.grade || record.score?.grade || null
    },
    structuredScoring: record.mvpReview?.structuredScoring === true || Array.isArray(record.scoring?.playerScores),
    scoringVersion: record.scoring?.reviewSummary?.scoringVersion || record.mvpReview?.scoringVersion || null,
    mvpCandidateCount: safeCount(record.scoring?.mvpCandidates || record.mvpReview?.mvpCandidates),
    teamAwardCount: safeCount(record.scoring?.teamAwards || record.mvpReview?.teamAwards),
    reviewBulletCount: safeCount(record.scoring?.reviewNarrative?.bullets || record.mvpReview?.reviewNarrative?.bullets),
    mvpReview: {
      completeGame: record.mvpReview?.completeGame === true,
      allRoleContractsSupported: record.mvpReview?.allRoleContractsSupported === true,
      highRiskRoleContractsSupported: record.mvpReview?.highRiskRoleContractsSupported === true,
      playerPrivacyClean: record.mvpReview?.playerPrivacyClean === true,
      aiStorytellerAutoConfirmed: record.mvpReview?.aiStorytellerAutoConfirmed === true,
      aiPlayersAutoSubmitted: record.mvpReview?.aiPlayersAutoSubmitted === true
    },
    aiStoryteller: {
      confirmedCandidates: Number(record.aiStoryteller?.confirmedCandidates || 0),
      confirmedExecutions: Number(record.aiStoryteller?.confirmedExecutions || 0),
      confirmedGameEnd: Number(record.aiStoryteller?.confirmedGameEnd || 0)
    },
    aiPlayers: {
      nightSubmissions: Number(record.aiPlayers?.nightSubmissions || 0),
      dayVotes: Number(record.aiPlayers?.dayVotes || 0)
    },
    privacyHits,
    failureCount: safeCount(record.failures),
    eventCount: safeCount(record.events)
  };
}

function listGameRecordFiles() {
  return GAME_RECORD_REVIEW_DIRS.flatMap(({ source, dir }) => {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => {
        const filePath = path.join(dir, entry.name);
        return { source, dir, fileName: entry.name, filePath, stat: fs.statSync(filePath) };
      });
  })
    .sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs);
}

function sanitizeRecordPart(value) {
  return String(value || 'record')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'record';
}

function countRoomActions(room, predicate) {
  const entries = Array.isArray(room?.state?.actionHistory) ? room.state.actionHistory : [];
  return entries.filter(predicate).length;
}

function buildRoomGameRecord(room) {
  const now = new Date().toISOString();
  const state = room?.state || {};
  const publicGameOver = state.publicGameOver || null;
  const players = Array.isArray(state.players) ? state.players : [];
  const gameNumber = Number.isInteger(state.gameNumber)
    ? state.gameNumber
    : (Number.isInteger(state.series?.currentGameNumber) ? state.series.currentGameNumber : 1);
  const events = (Array.isArray(state.actionHistory) ? state.actionHistory : []).map((entry, index) => ({
    sequence: Number(entry.id || index + 1),
    type: entry.type || 'action',
    at: entry.at || entry.createdAt || now,
    actor: entry.actor || null,
    actorSeat: entry.actorSeat || null,
    data: cloneForHistory(entry.payload || entry.data || {})
  }));
  const gameId = `room-${sanitizeRecordPart(room?.id)}-${Date.now()}`;

  const record = {
    schemaVersion: 'mvp.room-game-record.v1',
    mode: 'storyteller-room-confirmed',
    gameId,
    roomId: room?.id || null,
    gameNumber,
    scriptId: state.currentScript || 'unknown',
    playerCount: Number(state.playerCount || players.length || 0),
    startedAt: events[0]?.at || now,
    endedAt: publicGameOver?.confirmedAt || now,
    currentNow: now,
    result: {
      status: publicGameOver?.status || state.phase || 'unknown',
      winningTeam: publicGameOver?.winningTeam || null,
      reasonCode: publicGameOver?.reasonCode || null,
      summary: publicGameOver?.summary || null
    },
    aiStoryteller: {
      confirmedCandidates: countRoomActions(room, (entry) => entry.type === 'night_candidate_confirmed'),
      confirmedExecutions: countRoomActions(room, (entry) => entry.type === 'execution_confirmed'),
      confirmedGameEnd: countRoomActions(room, (entry) => entry.type === 'game_end_confirmed'),
      authority: 'storyteller-confirmed-room'
    },
    aiPlayers: {
      nightSubmissions: countRoomActions(room, (entry) => entry.type === 'ai_test_night_actions_submitted' || entry.type === 'player_night_action_submitted'),
      dayVotes: countRoomActions(room, (entry) => entry.type === 'player_vote_recorded' || entry.type === 'storyteller_proxy_vote_recorded'),
      inputSource: 'room-action-history'
    },
    privacy: {
      playerViewForbiddenFieldHits: [],
      promptForbiddenFieldHits: [],
      dayVoteForbiddenFieldHits: []
    },
    failures: [],
    events,
    artifacts: {},
    ruleContracts: null,
    scoring: null,
    finalState: {
      phase: state.phase || null,
      round: Number.isInteger(state.round) ? state.round : null,
      aliveSeats: players.filter((player) => player.alive !== false).map((player) => Number(player.seat)),
      players: players.map((player) => ({
        seat: Number(player.seat),
        name: player.name || null,
        trueRoleId: player.trueRoleId || player.roleId || player.role || null,
        shownRoleId: player.shownRoleId || player.roleId || player.role || null,
        alive: player.alive !== false,
        alignment: player.alignment || player.trueAlignment || player.shownAlignment || null
      })),
      privateMessageCount: safeCount(state.privateMessages),
      publicEventCount: safeCount(state.publicEvents)
    },
    mvpReview: null
  };

  record.ruleContracts = buildRuleContractExecutionSummary(record);
  record.scoring = scoreRecord(record);
  record.mvpReview = buildMvpReview(record, record.scoring);
  return record;
}

function writeRoomGameRecord(room) {
  fs.mkdirSync(ROOM_GAME_RECORDS_DIR, { recursive: true });
  const record = buildRoomGameRecord(room);
  const fileName = `${sanitizeRecordPart(record.gameId)}.json`;
  const filePath = path.join(ROOM_GAME_RECORDS_DIR, fileName);
  record.artifacts.recordPath = path.relative(__dirname, filePath).replace(/\//g, '\\');
  fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return { fileName, filePath, record };
}

app.get('/api/storyteller/game-records', (req, res) => {
  if (!ensureStorytellerRecordsRequest(req, res)) return;
  const limit = Math.max(1, Math.min(GAME_RECORDS_LIMIT_MAX, Number(req.query.limit || 30)));
  const scriptId = String(req.query.scriptId || '').trim();
  const summaries = [];
  const failures = [];

  for (const file of listGameRecordFiles()) {
    try {
      const record = parseJsonFile(file.filePath);
      if (scriptId && record.scriptId !== scriptId) continue;
      summaries.push(buildGameRecordSummary(record, file.fileName, file.stat, file.source));
      if (summaries.length >= limit) break;
    } catch (error) {
      failures.push({ fileName: file.fileName, reason: error.message || String(error) });
    }
  }

  res.json({
    status: 'GO',
    generatedAt: new Date().toISOString(),
    recordCount: summaries.length,
    records: summaries,
    parseFailures: failures
  });
});

app.get('/api/storyteller/game-records/:fileName', (req, res) => {
  if (!ensureStorytellerRecordsRequest(req, res)) return;
  const fileName = path.basename(String(req.params.fileName || ''));
  if (!/^[A-Za-z0-9._-]+\.json$/.test(fileName)) {
    res.status(400).json({ status: 'NO_GO', reason: 'invalid-record-file-name' });
    return;
  }

  const file = listGameRecordFiles().find((item) => item.fileName === fileName);
  if (!file) {
    res.status(404).json({ status: 'NO_GO', reason: 'record-not-found' });
    return;
  }

  try {
    const record = parseJsonFile(file.filePath);
    res.json({
      status: 'GO',
      fileName,
      source: file.source,
      summary: buildGameRecordSummary(record, fileName, file.stat, file.source),
      record
    });
  } catch (error) {
    res.status(500).json({ status: 'NO_GO', reason: error.message || String(error) });
  }
});

app.get('/api/storyteller/imported-scripts', (req, res) => {
  const scripts = [];
  const failures = [];
  const includedScriptIds = new Set();
  for (const item of listPersistedImportedScripts()) {
    try {
      scripts.push({
        ...buildImportedScriptSummary(item),
        script: item.script
      });
      includedScriptIds.add(item.script.id);
    } catch (error) {
      failures.push({ fileName: item.fileName, reason: error.message || String(error) });
    }
  }
  for (const scriptId of BUILT_IN_STORYTELLER_LIBRARY_SCRIPT_IDS) {
    if (includedScriptIds.has(scriptId)) continue;
    const runtimeScript = scriptManager.getScript(scriptId);
    if (!runtimeScript) {
      failures.push({ fileName: null, reason: `built-in script unavailable: ${scriptId}` });
      continue;
    }
    const publicScript = buildPublicRuntimeScriptPayload(runtimeScript);
    scripts.push({
      ...buildImportedScriptSummary({
        fileName: `built-in:${scriptId}`,
        savedAt: null,
        script: publicScript
      }),
      source: 'built-in',
      script: publicScript
    });
    includedScriptIds.add(scriptId);
  }

  res.json({
    status: 'GO',
    generatedAt: new Date().toISOString(),
    scriptCount: scripts.length,
    scripts,
    parseFailures: failures
  });
});

// 默认进入当前 V2.5 说书人端；旧魔典仍可通过显式路径访问，但不再作为主入口。
app.get('/', (req, res) => {
  res.redirect('/storyteller-v2.html');
});

const rooms = new Map();
const connections = new Map();

function restoreRoomSnapshotsAtStartup() {
  try {
    const restored = loadRoomSnapshots({ rootDir: __dirname });
    for (const room of restored.rooms) {
      pruneRoomPrivateMessages(room);
      rooms.set(room.id, room);
    }
    if (restored.rooms.length > 0) {
      console.log(`Restored ${restored.rooms.length} room snapshot(s) from ${restored.snapshotDir}`);
    }
  } catch (error) {
    console.warn('Room snapshot restore skipped:', error.message || error);
  }
}

function persistRoomSnapshots() {
  try {
    for (const room of rooms.values()) {
      pruneRoomPrivateMessages(room);
    }
    saveRoomSnapshots(rooms, { rootDir: __dirname });
  } catch (error) {
    console.warn('Room snapshot save failed:', error.message || error);
  }
}

function sendRoomClearedAndClose(room, reason) {
  if (!room) return;
  const payload = JSON.stringify({
    type: 'room_dissolved',
    data: {
      roomId: room.id,
      reason
    }
  });
  for (const clientWs of room.clients?.values?.() || []) {
    if (clientWs?.readyState === WebSocket.OPEN) {
      clientWs.send(payload);
      clientWs.close(4002, 'Room cleared');
    }
  }
  if (room.storyteller?.readyState === WebSocket.OPEN) {
    room.storyteller.send(payload);
    room.storyteller.close(4002, 'Room cleared');
  }
}

function clearAllRooms(reason = '24-hour-auto-clear') {
  const roomIds = Array.from(rooms.keys());
  if (!roomIds.length) return { cleared: 0, roomIds };
  for (const room of rooms.values()) {
    sendRoomClearedAndClose(room, reason);
  }
  rooms.clear();
  persistRoomSnapshots();
  console.log(`Cleared ${roomIds.length} room(s): ${reason}`);
  return { cleared: roomIds.length, roomIds };
}

function getRoomCreatedAtMs(room) {
  const timestamp = Date.parse(room?.state?.createdAt || room?.state?.lastUpdatedAt || '');
  return Number.isFinite(timestamp) ? timestamp : null;
}

function clearRestoredRoomsIfExpired() {
  if (!rooms.size) return { cleared: 0, reason: 'no-rooms' };
  const createdAtValues = Array.from(rooms.values())
    .map(getRoomCreatedAtMs)
    .filter((value) => Number.isFinite(value));
  if (!createdAtValues.length) return { cleared: 0, reason: 'no-created-at' };
  const oldestCreatedAt = Math.min(...createdAtValues);
  if (Date.now() - oldestCreatedAt < ROOM_AUTO_CLEAR_INTERVAL_MS) {
    return { cleared: 0, reason: 'not-expired' };
  }
  return clearAllRooms('24-hour-auto-clear-startup');
}

function startRoomAutoClearTimer() {
  const timer = setInterval(() => {
    clearAllRooms('24-hour-auto-clear');
  }, ROOM_AUTO_CLEAR_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

restoreRoomSnapshotsAtStartup();
clearRestoredRoomsIfExpired();
const roomAutoClearTimer = startRoomAutoClearTimer();

const STAGE4_SETUP_LOCK_CONTRACT_VERSION = 'stage4-setup-lock-v1';
const STAGE4_TROUBLE_BREWING_ROLE_IDS = new Set([
  'chef',
  'investigator',
  'washerwoman',
  'librarian',
  'empath',
  'fortuneteller',
  'undertaker',
  'monk',
  'slayer',
  'soldier',
  'ravenkeeper',
  'mayor',
  'virgin',
  'butler',
  'drunk',
  'recluse',
  'saint',
  'poisoner',
  'spy',
  'scarletwoman',
  'baron',
  'imp'
]);
const STAGE4_LOCAL_ROLE_ID_ALIASES = new Map([
  ['fortuneteller', 'fortune-teller'],
  ['scarletwoman', 'scarlet-woman']
]);
const MVP_DEAL_ROLE_ID_ALIASES = new Map([
  ['fortuneteller', 'fortune-teller'],
  ['scarletwoman', 'scarlet-woman']
]);

function cloneForHistory(value) {
  if (value === undefined) {
    return null;
  }

  return JSON.parse(JSON.stringify(value));
}

function ensureActionHistory(room) {
  if (!Array.isArray(room.state.actionHistory)) {
    room.state.actionHistory = [];
  }

  if (!Array.isArray(room.state.history)) {
    room.state.history = [];
  }

  if (typeof room.state.nextActionId !== 'number') {
    const existingMaxId = room.state.actionHistory.reduce((maxId, entry) => {
      return typeof entry?.id === 'number' ? Math.max(maxId, entry.id) : maxId;
    }, 0);
    room.state.nextActionId = existingMaxId + 1;
  }
}

function appendActionHistory(room, type, payload = {}, options = {}) {
  ensureActionHistory(room);

  const entry = {
    id: room.state.nextActionId,
    type,
    actor: options.actor || 'system',
    actorSeat: options.actorSeat ?? null,
    phase: room.state.phase,
    round: room.state.round,
    payload: cloneForHistory(payload),
  };

  room.state.nextActionId += 1;
  room.state.actionHistory.push(entry);
  room.state.history.push(entry);
  return entry;
}

function countAlivePlayers(room) {
  return (room?.state?.players || []).filter((player) => player?.alive !== false).length;
}

function appendPublicEvent(room, event = {}) {
  if (!room?.state) return null;
  if (!Array.isArray(room.state.publicEvents)) {
    room.state.publicEvents = [];
  }

  const id = event.id || `public:${room.id}:${Date.now()}:${room.state.publicEvents.length + 1}`;
  const publicEvent = {
    id,
    type: event.type || 'public_announcement',
    title: event.title || '公开公告',
    summary: event.summary || event.publicText || event.text || '',
    createdAt: event.createdAt || new Date().toISOString(),
    phase: event.phase || room.state.phase || null,
    round: Number.isInteger(Number(event.round)) ? Number(event.round) : room.state.round,
    day: event.day,
    night: event.night,
    seat: event.seat,
    seats: event.seats,
    fromSeat: event.fromSeat,
    toSeat: event.toSeat,
    nominatorSeat: event.nominatorSeat,
    nomineeSeat: event.nomineeSeat,
    executedSeat: event.executedSeat,
    killedSeat: event.killedSeat,
    deadSeats: event.deadSeats,
    winningTeam: event.winningTeam
  };

  Object.keys(publicEvent).forEach((key) => {
    if (publicEvent[key] === undefined) delete publicEvent[key];
  });

  const existingIndex = room.state.publicEvents.findIndex((item) => item?.id === id);
  if (existingIndex >= 0) {
    room.state.publicEvents[existingIndex] = publicEvent;
  } else {
    room.state.publicEvents.push(publicEvent);
  }

  return publicEvent;
}

function getAliveSeatSet(room) {
  return new Set(
    (room?.state?.players || [])
      .filter((player) => player?.alive !== false && Number.isInteger(Number(player?.seat)))
      .map((player) => Number(player.seat))
  );
}

function markNightBatchPublicStart(room, batchId) {
  if (!room?.state || !batchId) return;
  const aliveSeats = [...getAliveSeatSet(room)].sort((left, right) => left - right);
  room.state.nightBatches = (room.state.nightBatches || []).map((batch) => {
    if (batch.batchId !== batchId) return batch;
    return {
      ...batch,
      publicStartAliveSeats: Array.isArray(batch.publicStartAliveSeats) ? batch.publicStartAliveSeats : aliveSeats
    };
  });
}

function appendNightCloseoutPublicEvent(room, batchId) {
  if (!room?.state || !batchId) return null;
  const batch = (room.state.nightBatches || []).find((item) => item.batchId === batchId);
  if (!batch || batch.status !== 'confirmed') return null;

  const startAlive = new Set(
    (Array.isArray(batch.publicStartAliveSeats) ? batch.publicStartAliveSeats : [])
      .map((seat) => Number(seat))
      .filter((seat) => Number.isInteger(seat))
  );
  const currentAlive = getAliveSeatSet(room);
  const deadSeats = [...startAlive]
    .filter((seat) => !currentAlive.has(seat))
    .sort((left, right) => left - right);
  const nightNumber = Number.isInteger(Number(batch.nightNumber)) ? Number(batch.nightNumber) : room.state.round || 1;
  const deathText = deadSeats.length
    ? `昨夜 ${deadSeats.join('、')} 号死亡。`
    : '昨夜无人公开死亡。';

  return appendPublicEvent(room, {
    id: `night-closeout:${room.state.gameNumber || 1}:${nightNumber}:${batchId}`,
    type: 'night_closeout',
    title: `第 ${nightNumber} 天夜晚结束`,
    summary: `${deathText} 当前存活：${countAlivePlayers(room)} 人。`,
    phase: 'night',
    round: nightNumber,
    night: nightNumber,
    deadSeats
  });
}

function normalizePrivateMessageText(value, maxLength) {
  return String(value || '').trim().replace(/\s+\n/g, '\n').slice(0, maxLength);
}

function createStorytellerPrivateMessage(room, payload = {}) {
  const targetSeat = Number(payload.seat);
  const text = normalizePrivateMessageText(payload.text || payload.message, 1200);
  const title = normalizePrivateMessageText(payload.title, 80) || '说书人私信';
  const player = (room?.state?.players || []).find((item) => Number(item.seat) === targetSeat);

  if (!Number.isInteger(targetSeat)) {
    const error = new Error('invalid-private-message-seat');
    error.code = 'invalid-private-message-seat';
    throw error;
  }
  if (!player) {
    const error = new Error('private-message-target-not-found');
    error.code = 'private-message-target-not-found';
    throw error;
  }
  if (!text) {
    const error = new Error('private-message-text-required');
    error.code = 'private-message-text-required';
    throw error;
  }

  if (!Array.isArray(room.state.privateMessages)) {
    room.state.privateMessages = [];
  }

  const createdAt = new Date().toISOString();
  const message = {
    id: `msg-storyteller-${room.id}-${targetSeat}-${Date.now()}`,
    toSeat: targetSeat,
    type: 'storyteller-direct',
    title,
    text,
    createdAt,
    source: 'storyteller',
    readAt: null
  };

  room.state.privateMessages.push(message);
  const retention = pruneRoomPrivateMessages(room);
  appendActionHistory(room, 'storyteller_private_message_sent', {
    toSeat: targetSeat,
    title,
    textLength: text.length,
    messageId: message.id
  }, { actor: 'storyteller', actorSeat: null });

  return {
    message,
    retention,
    recipient: {
      seat: targetSeat,
      name: player.name || null,
      connected: room.clients.has(targetSeat)
    }
  };
}

function buildStage4SetupLockRefusal(reason, details = {}) {
  return {
    type: 'stage4_setup_lock_contract_refused',
    data: {
      status: 'refused',
      reason,
      contractVersion: STAGE4_SETUP_LOCK_CONTRACT_VERSION,
      serverMutation: false,
      executionOpened: false,
      ...details
    }
  };
}

function validateStage4SetupLockContract({ room, ws, setupLock }) {
  if (!room) {
    return buildStage4SetupLockRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage4SetupLockRefusal('unauthorized-storyteller');
  }

  if (!setupLock || typeof setupLock !== 'object') {
    return buildStage4SetupLockRefusal('missing-setup-lock');
  }

  if (setupLock.slice !== 'stage3-storyteller-confirmed-setup-lock') {
    return buildStage4SetupLockRefusal('invalid-setup-lock-slice');
  }

  if (setupLock.status !== 'client-preview-locked') {
    return buildStage4SetupLockRefusal('invalid-setup-lock-status');
  }

  if (typeof setupLock.lockId !== 'string' || setupLock.lockId.trim() === '') {
    return buildStage4SetupLockRefusal('missing-lock-id');
  }

  if (typeof setupLock.candidateId !== 'string' || setupLock.candidateId.trim() === '') {
    return buildStage4SetupLockRefusal('missing-candidate-id');
  }

  if (setupLock.scriptId !== 'trouble-brewing') {
    return buildStage4SetupLockRefusal('invalid-script', { scriptId: setupLock.scriptId ?? null });
  }

  if (!Number.isInteger(setupLock.playerCount) || setupLock.playerCount < 5 || setupLock.playerCount > 15) {
    return buildStage4SetupLockRefusal('invalid-player-count', { playerCount: setupLock.playerCount ?? null });
  }

  if (
    !Array.isArray(setupLock.officialRoleIds)
    || !Array.isArray(setupLock.localRoleIds)
    || setupLock.officialRoleIds.length !== setupLock.playerCount
    || setupLock.localRoleIds.length !== setupLock.playerCount
  ) {
    return buildStage4SetupLockRefusal('role-count-mismatch', {
      playerCount: setupLock.playerCount,
      officialRoleCount: Array.isArray(setupLock.officialRoleIds) ? setupLock.officialRoleIds.length : null,
      localRoleCount: Array.isArray(setupLock.localRoleIds) ? setupLock.localRoleIds.length : null
    });
  }

  const duplicateRoleIds = setupLock.officialRoleIds.filter((roleId, index, roleIds) => roleIds.indexOf(roleId) !== index);
  if (duplicateRoleIds.length > 0) {
    return buildStage4SetupLockRefusal('duplicate-official-role-id', { duplicateRoleIds: [...new Set(duplicateRoleIds)] });
  }

  const invalidRoleIds = setupLock.officialRoleIds.filter((roleId) => !STAGE4_TROUBLE_BREWING_ROLE_IDS.has(roleId));
  if (invalidRoleIds.length > 0) {
    return buildStage4SetupLockRefusal('invalid-official-role-id', { invalidRoleIds });
  }

  const currentPlayerCount = Array.isArray(room.state?.players) ? room.state.players.length : 0;
  if (currentPlayerCount !== setupLock.playerCount) {
    return buildStage4SetupLockRefusal('stale-player-count', {
      playerCount: setupLock.playerCount,
      currentPlayerCount
    });
  }

  return {
    type: 'stage4_setup_lock_contract_validated',
    data: {
      status: 'accepted-contract-only',
      lockId: setupLock.lockId,
      candidateId: setupLock.candidateId,
      scriptId: setupLock.scriptId,
      playerCount: setupLock.playerCount,
      officialRoleIds: [...setupLock.officialRoleIds],
      localRoleIds: [...setupLock.localRoleIds],
      contractVersion: STAGE4_SETUP_LOCK_CONTRACT_VERSION,
      serverMutation: false,
      executionOpened: false
    }
  };
}

function buildStage4SetupLockExecutionRefusal(reason, details = {}) {
  return {
    type: 'stage4_setup_lock_execution_refused',
    data: {
      status: 'refused',
      reason,
      contractVersion: STAGE4_SETUP_LOCK_CONTRACT_VERSION,
      mutationScope: 'room.state.stage4SetupLock-only',
      serverMutation: false,
      roleDeal: false,
      seatAssignment: false,
      nightQueueCreation: false,
      playerPrompts: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      executionOpenedBeyondSetupLock: false,
      ...details
    }
  };
}

function commitStage4SetupLock({ room, ws, setupLock }) {
  const validationResponse = validateStage4SetupLockContract({ room, ws, setupLock });
  if (validationResponse.type !== 'stage4_setup_lock_contract_validated') {
    return buildStage4SetupLockExecutionRefusal(validationResponse.data.reason, {
      validationResponse: validationResponse.data
    });
  }

  const validated = validationResponse.data;
  const previousSetupLock = room.state.stage4SetupLock ?? null;
  if (previousSetupLock && previousSetupLock.lockId !== validated.lockId) {
    return buildStage4SetupLockExecutionRefusal('setup-lock-already-committed', {
      existingLockId: previousSetupLock.lockId,
      requestedLockId: validated.lockId
    });
  }

  let mutationApplied = false;
  try {
    const committedAt = new Date().toISOString();
    const committedSetupLock = {
      status: 'server-setup-lock-committed',
      lockId: validated.lockId,
      candidateId: validated.candidateId,
      scriptId: validated.scriptId,
      playerCount: validated.playerCount,
      officialRoleIds: [...validated.officialRoleIds],
      localRoleIds: [...validated.localRoleIds],
      contractVersion: STAGE4_SETUP_LOCK_CONTRACT_VERSION,
      committedAt,
      committedBy: 'storyteller'
    };

    room.state.stage4SetupLock = committedSetupLock;
    mutationApplied = true;

    return {
      type: 'stage4_setup_lock_execution_committed',
      data: {
        ...committedSetupLock,
        mutationScope: 'room.state.stage4SetupLock-only',
        serverMutation: true,
        roleDeal: false,
        seatAssignment: false,
        nightQueueCreation: false,
        playerPrompts: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false,
        executionOpenedBeyondSetupLock: false
      }
    };
  } catch (error) {
    if (mutationApplied) {
      room.state.stage4SetupLock = previousSetupLock;
    }

    return buildStage4SetupLockExecutionRefusal('setup-lock-commit-failed', {
      rollbackApplied: mutationApplied,
      message: error.message
    });
  }
}

function buildStage4RoleAssignmentCandidateRefusal(reason, details = {}) {
  return {
    type: 'stage4_role_assignment_candidate_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'candidate-only',
      serverMutation: false,
      playerRoleMutation: false,
      roleDeal: false,
      seatAssignmentCommitted: false,
      nightQueueCreation: false,
      playerPrompts: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      ...details
    }
  };
}

function buildStage4RoleAssignmentCandidate({ room, ws }) {
  if (!room) {
    return buildStage4RoleAssignmentCandidateRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage4RoleAssignmentCandidateRefusal('unauthorized-storyteller');
  }

  const setupLock = room.state.stage4SetupLock;
  if (!setupLock || setupLock.status !== 'server-setup-lock-committed') {
    return buildStage4RoleAssignmentCandidateRefusal('missing-setup-lock');
  }

  const players = Array.isArray(room.state.players) ? [...room.state.players].sort((left, right) => left.seat - right.seat) : [];
  if (players.length !== setupLock.playerCount) {
    return buildStage4RoleAssignmentCandidateRefusal('stale-player-count', {
      playerCount: setupLock.playerCount,
      currentPlayerCount: players.length
    });
  }

  const seats = players.map((player) => player.seat);
  if (seats.some((seat) => !Number.isInteger(seat))) {
    return buildStage4RoleAssignmentCandidateRefusal('invalid-seat');
  }

  const duplicateSeats = seats.filter((seat, index, allSeats) => allSeats.indexOf(seat) !== index);
  if (duplicateSeats.length > 0) {
    return buildStage4RoleAssignmentCandidateRefusal('duplicate-seat', { duplicateSeats: [...new Set(duplicateSeats)] });
  }

  if (!Array.isArray(setupLock.officialRoleIds) || setupLock.officialRoleIds.length !== setupLock.playerCount) {
    return buildStage4RoleAssignmentCandidateRefusal('role-count-mismatch', {
      playerCount: setupLock.playerCount,
      officialRoleCount: Array.isArray(setupLock.officialRoleIds) ? setupLock.officialRoleIds.length : null
    });
  }

  const duplicateRoleIds = setupLock.officialRoleIds.filter((roleId, index, roleIds) => roleIds.indexOf(roleId) !== index);
  if (duplicateRoleIds.length > 0) {
    return buildStage4RoleAssignmentCandidateRefusal('duplicate-official-role-id', { duplicateRoleIds: [...new Set(duplicateRoleIds)] });
  }

  const invalidRoleIds = setupLock.officialRoleIds.filter((roleId) => !STAGE4_TROUBLE_BREWING_ROLE_IDS.has(roleId));
  if (invalidRoleIds.length > 0) {
    return buildStage4RoleAssignmentCandidateRefusal('invalid-official-role-id', { invalidRoleIds });
  }

  const assignments = seats.map((seat, index) => ({
    seat,
    roleId: setupLock.officialRoleIds[index]
  }));

  return {
    type: 'stage4_role_assignment_candidate_ready',
    data: {
      status: 'server-role-assignment-candidate-ready',
      setupLockId: setupLock.lockId,
      assignmentCandidateId: `role-assignment-candidate-${setupLock.lockId}`,
      scriptId: setupLock.scriptId,
      playerCount: setupLock.playerCount,
      assignments,
      mutationScope: 'candidate-only',
      serverMutation: false,
      playerRoleMutation: false,
      roleDeal: false,
      seatAssignmentCommitted: false,
      nightQueueCreation: false,
      playerPrompts: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false
    }
  };
}

function buildStage4RoleAssignmentCommitRefusal(reason, details = {}) {
  return {
    type: 'stage4_role_assignment_commit_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.stage4RoleAssignment-only',
      serverMutation: false,
      assignmentLockWritten: false,
      candidatePersistedToRoomState: false,
      seatAssignmentCommitted: false,
      playerRoleMutation: false,
      roleDeal: false,
      phaseMutation: false,
      roundMutation: false,
      nightQueueCreation: false,
      playerPrompts: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      ...details
    }
  };
}

function commitStage4RoleAssignment({ room, ws, setupLockId, assignmentCandidateId, assignments }) {
  if (!room) {
    return buildStage4RoleAssignmentCommitRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage4RoleAssignmentCommitRefusal('unauthorized-storyteller');
  }

  const setupLock = room.state.stage4SetupLock;
  if (!setupLock || setupLock.status !== 'server-setup-lock-committed') {
    return buildStage4RoleAssignmentCommitRefusal('missing-setup-lock');
  }

  if (setupLockId !== setupLock.lockId) {
    return buildStage4RoleAssignmentCommitRefusal('setup-lock-id-mismatch', {
      expectedSetupLockId: setupLock.lockId,
      receivedSetupLockId: setupLockId ?? null
    });
  }

  const expectedAssignmentCandidateId = `role-assignment-candidate-${setupLock.lockId}`;
  if (assignmentCandidateId !== expectedAssignmentCandidateId) {
    return buildStage4RoleAssignmentCommitRefusal('assignment-candidate-id-mismatch', {
      expectedAssignmentCandidateId,
      receivedAssignmentCandidateId: assignmentCandidateId ?? null
    });
  }

  const players = Array.isArray(room.state.players) ? [...room.state.players].sort((left, right) => left.seat - right.seat) : [];
  if (players.length !== setupLock.playerCount) {
    return buildStage4RoleAssignmentCommitRefusal('stale-player-count', {
      playerCount: setupLock.playerCount,
      currentPlayerCount: players.length
    });
  }

  const seats = players.map((player) => player.seat);
  if (seats.some((seat) => !Number.isInteger(seat))) {
    return buildStage4RoleAssignmentCommitRefusal('invalid-seat');
  }

  const duplicateSeats = seats.filter((seat, index, allSeats) => allSeats.indexOf(seat) !== index);
  if (duplicateSeats.length > 0) {
    return buildStage4RoleAssignmentCommitRefusal('duplicate-seat', { duplicateSeats: [...new Set(duplicateSeats)] });
  }

  if (!Array.isArray(assignments) || assignments.length !== setupLock.playerCount) {
    return buildStage4RoleAssignmentCommitRefusal('assignment-count-mismatch', {
      playerCount: setupLock.playerCount,
      assignmentCount: Array.isArray(assignments) ? assignments.length : null
    });
  }

  const sortedAssignments = [...assignments].sort((left, right) => left.seat - right.seat);
  const assignmentSeats = sortedAssignments.map((assignment) => assignment.seat);
  if (assignmentSeats.some((seat) => !Number.isInteger(seat))) {
    return buildStage4RoleAssignmentCommitRefusal('invalid-assignment-seat');
  }

  const duplicateAssignmentSeats = assignmentSeats.filter((seat, index, allSeats) => allSeats.indexOf(seat) !== index);
  if (duplicateAssignmentSeats.length > 0) {
    return buildStage4RoleAssignmentCommitRefusal('duplicate-assignment-seat', {
      duplicateAssignmentSeats: [...new Set(duplicateAssignmentSeats)]
    });
  }

  const seatMismatch = assignmentSeats.some((seat, index) => seat !== seats[index]);
  if (seatMismatch) {
    return buildStage4RoleAssignmentCommitRefusal('assignment-seat-mismatch', {
      expectedSeats: seats,
      receivedSeats: assignmentSeats
    });
  }

  if (!Array.isArray(setupLock.officialRoleIds) || setupLock.officialRoleIds.length !== setupLock.playerCount) {
    return buildStage4RoleAssignmentCommitRefusal('role-count-mismatch', {
      playerCount: setupLock.playerCount,
      officialRoleCount: Array.isArray(setupLock.officialRoleIds) ? setupLock.officialRoleIds.length : null
    });
  }

  const submittedRoleIds = sortedAssignments.map((assignment) => assignment.roleId);
  if (submittedRoleIds.some((roleId) => typeof roleId !== 'string' || roleId.trim() === '')) {
    return buildStage4RoleAssignmentCommitRefusal('missing-assignment-role-id');
  }

  const duplicateSubmittedRoleIds = submittedRoleIds.filter((roleId, index, roleIds) => roleIds.indexOf(roleId) !== index);
  if (duplicateSubmittedRoleIds.length > 0) {
    return buildStage4RoleAssignmentCommitRefusal('duplicate-assignment-role-id', {
      duplicateSubmittedRoleIds: [...new Set(duplicateSubmittedRoleIds)]
    });
  }

  const invalidSubmittedRoleIds = submittedRoleIds.filter((roleId) => !STAGE4_TROUBLE_BREWING_ROLE_IDS.has(roleId));
  if (invalidSubmittedRoleIds.length > 0) {
    return buildStage4RoleAssignmentCommitRefusal('invalid-assignment-role-id', { invalidSubmittedRoleIds });
  }

  const roleMismatch = submittedRoleIds.some((roleId, index) => roleId !== setupLock.officialRoleIds[index]);
  if (roleMismatch) {
    return buildStage4RoleAssignmentCommitRefusal('assignment-role-mismatch', {
      expectedRoleIds: setupLock.officialRoleIds,
      receivedRoleIds: submittedRoleIds
    });
  }

  const previousAssignmentLock = room.state.stage4RoleAssignment ?? null;
  if (
    previousAssignmentLock
    && (
      previousAssignmentLock.setupLockId !== setupLock.lockId
      || previousAssignmentLock.assignmentCandidateId !== assignmentCandidateId
    )
  ) {
    return buildStage4RoleAssignmentCommitRefusal('assignment-lock-already-committed', {
      existingSetupLockId: previousAssignmentLock.setupLockId ?? null,
      existingAssignmentCandidateId: previousAssignmentLock.assignmentCandidateId ?? null,
      requestedSetupLockId: setupLock.lockId,
      requestedAssignmentCandidateId: assignmentCandidateId
    });
  }

  let mutationApplied = false;
  try {
    const committedAt = new Date().toISOString();
    const committedAssignmentLock = {
      status: 'server-role-assignment-committed',
      setupLockId: setupLock.lockId,
      assignmentCandidateId,
      scriptId: setupLock.scriptId,
      playerCount: setupLock.playerCount,
      assignments: sortedAssignments.map((assignment) => ({
        seat: assignment.seat,
        roleId: assignment.roleId
      })),
      committedAt,
      committedBy: 'storyteller',
      mutationScope: 'room.state.stage4RoleAssignment-only'
    };

    room.state.stage4RoleAssignment = committedAssignmentLock;
    mutationApplied = true;

    return {
      type: 'stage4_role_assignment_commit_committed',
      data: {
        ...committedAssignmentLock,
        serverMutation: true,
        assignmentLockWritten: true,
        candidatePersistedToRoomState: false,
        seatAssignmentCommitted: true,
        playerRoleMutation: false,
        roleDeal: false,
        phaseMutation: false,
        roundMutation: false,
        nightQueueCreation: false,
        playerPrompts: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false
      }
    };
  } catch (error) {
    if (mutationApplied) {
      room.state.stage4RoleAssignment = previousAssignmentLock;
    }

    return buildStage4RoleAssignmentCommitRefusal('assignment-lock-commit-failed', {
      rollbackApplied: mutationApplied,
      message: error.message
    });
  }
}

function findStage4RoleCharacter(scriptId, roleId) {
  const localRoleId = STAGE4_LOCAL_ROLE_ID_ALIASES.get(roleId) || roleId;
  return scriptManager.findCharacter(scriptId, localRoleId);
}

function buildStage4RoleDealRefusal(reason, details = {}) {
  return {
    type: 'stage4_role_deal_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.players-role-fields-only',
      serverMutation: false,
      roleDeal: false,
      privateRoleMessagesSent: false,
      playerRoleMutation: false,
      assignmentLockMutation: false,
      phaseMutation: false,
      roundMutation: false,
      nightQueueCreation: false,
      playerNightPrompts: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      ...details
    }
  };
}

function dealStage4PrivateRoles({ room, ws }) {
  if (!room) {
    return buildStage4RoleDealRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage4RoleDealRefusal('unauthorized-storyteller');
  }

  const setupLock = room.state.stage4SetupLock;
  if (!setupLock || setupLock.status !== 'server-setup-lock-committed') {
    return buildStage4RoleDealRefusal('missing-setup-lock');
  }

  const assignmentLock = room.state.stage4RoleAssignment;
  if (!assignmentLock || assignmentLock.status !== 'server-role-assignment-committed') {
    return buildStage4RoleDealRefusal('missing-assignment-lock');
  }

  if (assignmentLock.setupLockId !== setupLock.lockId) {
    return buildStage4RoleDealRefusal('assignment-setup-lock-mismatch', {
      setupLockId: setupLock.lockId,
      assignmentSetupLockId: assignmentLock.setupLockId ?? null
    });
  }

  const players = Array.isArray(room.state.players) ? [...room.state.players].sort((left, right) => left.seat - right.seat) : [];
  if (players.length !== assignmentLock.playerCount) {
    return buildStage4RoleDealRefusal('stale-player-count', {
      playerCount: assignmentLock.playerCount,
      currentPlayerCount: players.length
    });
  }

  const seats = players.map((player) => player.seat);
  if (seats.some((seat) => !Number.isInteger(seat))) {
    return buildStage4RoleDealRefusal('invalid-seat');
  }

  const duplicateSeats = seats.filter((seat, index, allSeats) => allSeats.indexOf(seat) !== index);
  if (duplicateSeats.length > 0) {
    return buildStage4RoleDealRefusal('duplicate-seat', { duplicateSeats: [...new Set(duplicateSeats)] });
  }

  if (!Array.isArray(assignmentLock.assignments) || assignmentLock.assignments.length !== assignmentLock.playerCount) {
    return buildStage4RoleDealRefusal('assignment-count-mismatch', {
      playerCount: assignmentLock.playerCount,
      assignmentCount: Array.isArray(assignmentLock.assignments) ? assignmentLock.assignments.length : null
    });
  }

  const sortedAssignments = [...assignmentLock.assignments].sort((left, right) => left.seat - right.seat);
  const assignmentSeats = sortedAssignments.map((assignment) => assignment.seat);
  if (assignmentSeats.some((seat) => !Number.isInteger(seat))) {
    return buildStage4RoleDealRefusal('invalid-assignment-seat');
  }

  const duplicateAssignmentSeats = assignmentSeats.filter((seat, index, allSeats) => allSeats.indexOf(seat) !== index);
  if (duplicateAssignmentSeats.length > 0) {
    return buildStage4RoleDealRefusal('duplicate-assignment-seat', {
      duplicateAssignmentSeats: [...new Set(duplicateAssignmentSeats)]
    });
  }

  const seatMismatch = assignmentSeats.some((seat, index) => seat !== seats[index]);
  if (seatMismatch) {
    return buildStage4RoleDealRefusal('assignment-seat-mismatch', {
      expectedSeats: seats,
      receivedSeats: assignmentSeats
    });
  }

  const submittedRoleIds = sortedAssignments.map((assignment) => assignment.roleId);
  if (submittedRoleIds.some((roleId) => typeof roleId !== 'string' || roleId.trim() === '')) {
    return buildStage4RoleDealRefusal('missing-assignment-role-id');
  }

  const duplicateSubmittedRoleIds = submittedRoleIds.filter((roleId, index, roleIds) => roleIds.indexOf(roleId) !== index);
  if (duplicateSubmittedRoleIds.length > 0) {
    return buildStage4RoleDealRefusal('duplicate-assignment-role-id', {
      duplicateSubmittedRoleIds: [...new Set(duplicateSubmittedRoleIds)]
    });
  }

  const invalidSubmittedRoleIds = submittedRoleIds.filter((roleId) => !STAGE4_TROUBLE_BREWING_ROLE_IDS.has(roleId));
  if (invalidSubmittedRoleIds.length > 0) {
    return buildStage4RoleDealRefusal('invalid-assignment-role-id', { invalidSubmittedRoleIds });
  }

  const roleMismatch = submittedRoleIds.some((roleId, index) => roleId !== setupLock.officialRoleIds[index]);
  if (roleMismatch) {
    return buildStage4RoleDealRefusal('assignment-role-mismatch', {
      expectedRoleIds: setupLock.officialRoleIds,
      receivedRoleIds: submittedRoleIds
    });
  }

  const rolePayloads = [];
  for (const assignment of sortedAssignments) {
    const targetPlayer = players.find((player) => player.seat === assignment.seat);
    const targetWs = room.clients.get(assignment.seat);
    const role = findStage4RoleCharacter(setupLock.scriptId, assignment.roleId);
    if (!targetPlayer) {
      return buildStage4RoleDealRefusal('assigned-player-missing', { seat: assignment.seat });
    }
    if (!targetWs || targetWs.readyState !== WebSocket.OPEN) {
      return buildStage4RoleDealRefusal('assigned-player-connection-missing', { seat: assignment.seat });
    }
    if (!role) {
      return buildStage4RoleDealRefusal('role-metadata-missing', { roleId: assignment.roleId });
    }

    rolePayloads.push({
      player: targetPlayer,
      targetWs,
      seat: assignment.seat,
      roleId: assignment.roleId,
      roleName: role.name,
      roleNameEn: role.nameEn,
      alignment: ['minions', 'demons'].includes(role.type) ? 'evil' : 'good'
    });
  }

  const previousRoleFields = rolePayloads.map((payload) => ({
    player: payload.player,
    fields: ['role', 'roleName', 'roleNameEn', 'alignment'].map((field) => ({
      field,
      hadValue: Object.prototype.hasOwnProperty.call(payload.player, field),
      value: payload.player[field]
    }))
  }));

  let mutationApplied = false;
  try {
    for (const payload of rolePayloads) {
      payload.player.role = payload.roleId;
      payload.player.roleName = payload.roleName;
      payload.player.roleNameEn = payload.roleNameEn;
      payload.player.alignment = payload.alignment;
    }
    mutationApplied = true;

    for (const payload of rolePayloads) {
      payload.targetWs.send(JSON.stringify({
        type: 'stage4_private_role_dealt',
        data: {
          seat: payload.seat,
          roleId: payload.roleId,
          roleName: payload.roleName,
          roleNameEn: payload.roleNameEn,
          alignment: payload.alignment,
          privateToSeat: payload.seat
        }
      }));
    }

    return {
      type: 'stage4_role_deal_private_messages_sent',
      data: {
        status: 'server-private-role-messages-sent',
        setupLockId: setupLock.lockId,
        assignmentCandidateId: assignmentLock.assignmentCandidateId,
        playerCount: assignmentLock.playerCount,
        deliveredSeats: rolePayloads.map((payload) => payload.seat),
        mutationScope: 'room.state.players-role-fields-only',
        serverMutation: true,
        roleDeal: true,
        privateRoleMessagesSent: true,
        playerRoleMutation: true,
        assignmentLockMutation: false,
        phaseMutation: false,
        roundMutation: false,
        nightQueueCreation: false,
        playerNightPrompts: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false
      }
    };
  } catch (error) {
    if (mutationApplied) {
      for (const previous of previousRoleFields) {
        for (const fieldState of previous.fields) {
          if (fieldState.hadValue) {
            previous.player[fieldState.field] = fieldState.value;
          } else {
            delete previous.player[fieldState.field];
          }
        }
      }
    }

    return buildStage4RoleDealRefusal('private-role-deal-failed', {
      rollbackApplied: mutationApplied,
      message: error.message
    });
  }
}

function buildStage4NightQueueRefusal(reason, details = {}) {
  return {
    type: 'stage4_night_queue_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.stage4NightQueue-only',
      serverMutation: false,
      nightQueueCreation: false,
      legacyNightQueueMutation: false,
      playerNightPrompts: false,
      abilityExecution: false,
      phaseMutation: false,
      roundMutation: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      ...details
    }
  };
}

function normalizeStage4LocalRoleId(localRoleId) {
  for (const [officialRoleId, mappedLocalRoleId] of STAGE4_LOCAL_ROLE_ID_ALIASES.entries()) {
    if (mappedLocalRoleId === localRoleId) {
      return officialRoleId;
    }
  }

  return localRoleId;
}

function createStage4NightQueue({ room, ws }) {
  if (!room) {
    return buildStage4NightQueueRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage4NightQueueRefusal('unauthorized-storyteller');
  }

  const setupLock = room.state.stage4SetupLock;
  if (!setupLock || setupLock.status !== 'server-setup-lock-committed') {
    return buildStage4NightQueueRefusal('missing-setup-lock');
  }

  const assignmentLock = room.state.stage4RoleAssignment;
  if (!assignmentLock || assignmentLock.status !== 'server-role-assignment-committed') {
    return buildStage4NightQueueRefusal('missing-assignment-lock');
  }

  if (assignmentLock.setupLockId !== setupLock.lockId) {
    return buildStage4NightQueueRefusal('assignment-setup-lock-mismatch', {
      setupLockId: setupLock.lockId,
      assignmentSetupLockId: assignmentLock.setupLockId ?? null
    });
  }

  const players = Array.isArray(room.state.players) ? [...room.state.players].sort((left, right) => left.seat - right.seat) : [];
  if (players.length !== assignmentLock.playerCount) {
    return buildStage4NightQueueRefusal('stale-player-count', {
      playerCount: assignmentLock.playerCount,
      currentPlayerCount: players.length
    });
  }

  if (!Array.isArray(assignmentLock.assignments) || assignmentLock.assignments.length !== assignmentLock.playerCount) {
    return buildStage4NightQueueRefusal('assignment-count-mismatch', {
      playerCount: assignmentLock.playerCount,
      assignmentCount: Array.isArray(assignmentLock.assignments) ? assignmentLock.assignments.length : null
    });
  }

  const sortedAssignments = [...assignmentLock.assignments].sort((left, right) => left.seat - right.seat);
  const assignmentSeats = sortedAssignments.map((assignment) => assignment.seat);
  const playerSeats = players.map((player) => player.seat);
  if (playerSeats.some((seat) => !Number.isInteger(seat)) || assignmentSeats.some((seat) => !Number.isInteger(seat))) {
    return buildStage4NightQueueRefusal('invalid-seat');
  }

  const seatMismatch = assignmentSeats.some((seat, index) => seat !== playerSeats[index]);
  if (seatMismatch) {
    return buildStage4NightQueueRefusal('assignment-seat-mismatch', {
      expectedSeats: assignmentSeats,
      currentSeats: playerSeats
    });
  }

  const missingRoleFieldSeats = players
    .filter((player) => ['role', 'roleName', 'roleNameEn', 'alignment'].some((field) => player[field] === undefined || player[field] === null || player[field] === ''))
    .map((player) => player.seat);
  if (missingRoleFieldSeats.length > 0) {
    return buildStage4NightQueueRefusal('missing-player-role-fields', { missingRoleFieldSeats });
  }

  const roleFieldMismatch = sortedAssignments.some((assignment, index) => {
    const player = players[index];
    return player.role !== assignment.roleId;
  });
  if (roleFieldMismatch) {
    return buildStage4NightQueueRefusal('player-role-assignment-mismatch', {
      expectedAssignments: sortedAssignments.map((assignment) => ({ seat: assignment.seat, roleId: assignment.roleId })),
      currentAssignments: players.map((player) => ({ seat: player.seat, roleId: player.role }))
    });
  }

  const existingQueue = room.state.stage4NightQueue;
  if (
    existingQueue
    && existingQueue.setupLockId === setupLock.lockId
    && existingQueue.assignmentCandidateId === assignmentLock.assignmentCandidateId
    && existingQueue.night === 'first'
  ) {
    return buildStage4NightQueueRefusal('stage4-night-queue-already-created', {
      nightQueueId: existingQueue.nightQueueId ?? null
    });
  }

  const script = scriptManager.getScript(setupLock.scriptId);
  const firstNightOrder = script?.nightOrder?.first;
  if (!Array.isArray(firstNightOrder)) {
    return buildStage4NightQueueRefusal('first-night-order-missing', { scriptId: setupLock.scriptId });
  }

  const playersByRoleId = new Map(players.map((player) => [player.role, player]));
  const queue = [];
  let order = 1;
  for (const localRoleId of firstNightOrder) {
    if (localRoleId === 'dusk' || localRoleId === 'dawn') {
      continue;
    }

    if (localRoleId === 'minion-info' || localRoleId === 'demon-info') {
      queue.push({
        order: order++,
        roleId: localRoleId,
        type: 'info',
        status: 'pending',
        seat: null,
        privatePromptCreated: false,
        abilityExecuted: false
      });
      continue;
    }

    const officialRoleId = normalizeStage4LocalRoleId(localRoleId);
    const player = playersByRoleId.get(officialRoleId);
    if (!player) {
      continue;
    }

    const role = findStage4RoleCharacter(setupLock.scriptId, officialRoleId);
    if (!role || !role.firstNight) {
      return buildStage4NightQueueRefusal('first-night-role-metadata-missing', { roleId: officialRoleId });
    }

    queue.push({
      order: order++,
      roleId: officialRoleId,
      seat: player.seat,
      type: role.setup ? 'setup' : 'action',
      status: 'pending',
      character: {
        id: officialRoleId,
        name: role.name,
        nameEn: role.nameEn,
        actionType: role.actionType
      },
      privatePromptCreated: false,
      abilityExecuted: false
    });
  }

  if (queue.length === 0) {
    return buildStage4NightQueueRefusal('first-night-queue-empty');
  }

  const stage4NightQueue = {
    status: 'server-night-queue-created',
    nightQueueId: `stage4-night-queue-${setupLock.lockId}-${assignmentLock.assignmentCandidateId}-first`,
    setupLockId: setupLock.lockId,
    assignmentCandidateId: assignmentLock.assignmentCandidateId,
    night: 'first',
    playerCount: assignmentLock.playerCount,
    mutationScope: 'room.state.stage4NightQueue-only',
    queue,
    serverMutation: true,
    nightQueueCreation: true,
    legacyNightQueueMutation: false,
    playerNightPrompts: false,
    abilityExecution: false,
    phaseMutation: false,
    roundMutation: false,
    actionHistoryAppended: false,
    eventLogWritten: false,
    authoritativeHistoryExpanded: false
  };

  const previousStage4NightQueue = room.state.stage4NightQueue;
  let mutationApplied = false;
  try {
    room.state.stage4NightQueue = stage4NightQueue;
    mutationApplied = true;

    return {
      type: 'stage4_night_queue_created',
      data: {
        status: 'server-night-queue-created',
        setupLockId: setupLock.lockId,
        assignmentCandidateId: assignmentLock.assignmentCandidateId,
        nightQueueId: stage4NightQueue.nightQueueId,
        night: 'first',
        playerCount: assignmentLock.playerCount,
        queueLength: queue.length,
        orderedSeats: queue.map((action) => action.seat),
        mutationScope: 'room.state.stage4NightQueue-only',
        serverMutation: true,
        nightQueueCreation: true,
        legacyNightQueueMutation: false,
        playerNightPrompts: false,
        abilityExecution: false,
        phaseMutation: false,
        roundMutation: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false
      }
    };
  } catch (error) {
    if (mutationApplied) {
      room.state.stage4NightQueue = previousStage4NightQueue;
    }

    return buildStage4NightQueueRefusal('stage4-night-queue-create-failed', {
      rollbackApplied: mutationApplied,
      message: error.message
    });
  }
}

function buildStage4PlayerNightPromptRefusal(reason, details = {}) {
  return {
    type: 'stage4_player_night_prompt_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.stage4NightQueue.current-action-prompt-fields-only',
      serverMutation: false,
      playerNightPrompts: false,
      abilityExecution: false,
      legacyNightQueueMutation: false,
      phaseMutation: false,
      roundMutation: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      ...details
    }
  };
}

function sendStage4PlayerNightPrompt({ room, ws }) {
  if (!room) {
    return buildStage4PlayerNightPromptRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage4PlayerNightPromptRefusal('unauthorized-storyteller');
  }

  const stage4NightQueue = room.state.stage4NightQueue;
  if (!stage4NightQueue || stage4NightQueue.status !== 'server-night-queue-created') {
    return buildStage4PlayerNightPromptRefusal('missing-stage4-night-queue');
  }

  if (stage4NightQueue.night !== 'first') {
    return buildStage4PlayerNightPromptRefusal('unsupported-night', { night: stage4NightQueue.night ?? null });
  }

  if (!Array.isArray(stage4NightQueue.queue)) {
    return buildStage4PlayerNightPromptRefusal('invalid-stage4-night-queue');
  }

  const nextAction = stage4NightQueue.queue.find((action) => {
    return action
      && action.status === 'pending'
      && action.abilityExecuted === false
      && Number.isInteger(action.seat);
  });
  if (!nextAction) {
    return buildStage4PlayerNightPromptRefusal('no-pending-player-action');
  }

  if (nextAction.privatePromptCreated === true) {
    return buildStage4PlayerNightPromptRefusal('next-action-already-prompted', {
      nightQueueId: stage4NightQueue.nightQueueId ?? null,
      order: nextAction.order ?? null,
      seat: nextAction.seat ?? null,
      roleId: nextAction.roleId ?? null
    });
  }

  if (nextAction.abilityExecuted === true) {
    return buildStage4PlayerNightPromptRefusal('next-action-already-executed', {
      nightQueueId: stage4NightQueue.nightQueueId ?? null,
      order: nextAction.order ?? null,
      seat: nextAction.seat ?? null,
      roleId: nextAction.roleId ?? null
    });
  }

  const targetPlayer = Array.isArray(room.state.players)
    ? room.state.players.find((player) => player.seat === nextAction.seat)
    : null;
  if (!targetPlayer) {
    return buildStage4PlayerNightPromptRefusal('target-player-missing', { seat: nextAction.seat });
  }

  if (!targetPlayer.role || targetPlayer.role !== nextAction.roleId) {
    return buildStage4PlayerNightPromptRefusal('target-player-role-mismatch', {
      seat: nextAction.seat,
      expectedRoleId: nextAction.roleId ?? null,
      currentRoleId: targetPlayer.role ?? null
    });
  }

  const targetWs = room.clients.get(nextAction.seat);
  if (!targetWs || targetWs.readyState !== WebSocket.OPEN) {
    return buildStage4PlayerNightPromptRefusal('target-player-connection-missing', { seat: nextAction.seat });
  }

  const actionId = `stage4-night-action-${stage4NightQueue.nightQueueId}-${nextAction.order}`;
  const promptSentAt = new Date().toISOString();
  const previousPromptFields = {
    privatePromptCreated: nextAction.privatePromptCreated,
    hadPromptStatus: Object.prototype.hasOwnProperty.call(nextAction, 'promptStatus'),
    promptStatus: nextAction.promptStatus,
    hadPromptSentAt: Object.prototype.hasOwnProperty.call(nextAction, 'promptSentAt'),
    promptSentAt: nextAction.promptSentAt
  };

  let mutationApplied = false;
  try {
    nextAction.privatePromptCreated = true;
    nextAction.promptStatus = 'sent';
    nextAction.promptSentAt = promptSentAt;
    mutationApplied = true;

    targetWs.send(JSON.stringify({
      type: 'stage4_player_night_prompt',
      data: {
        status: 'server-player-night-prompt',
        nightQueueId: stage4NightQueue.nightQueueId,
        actionId,
        order: nextAction.order,
        seat: nextAction.seat,
        roleId: nextAction.roleId,
        roleName: nextAction.character?.name ?? targetPlayer.roleName ?? null,
        roleNameEn: nextAction.character?.nameEn ?? targetPlayer.roleNameEn ?? null,
        actionType: nextAction.character?.actionType ?? null,
        promptStatus: 'sent',
        privateToSeat: nextAction.seat,
        abilityExecution: false,
        eventLogWritten: false
      }
    }));

    return {
      type: 'stage4_player_night_prompt_sent',
      data: {
        status: 'server-player-night-prompt-sent',
        nightQueueId: stage4NightQueue.nightQueueId,
        actionId,
        order: nextAction.order,
        seat: nextAction.seat,
        roleId: nextAction.roleId,
        mutationScope: 'room.state.stage4NightQueue.current-action-prompt-fields-only',
        serverMutation: true,
        playerNightPrompts: true,
        abilityExecution: false,
        legacyNightQueueMutation: false,
        phaseMutation: false,
        roundMutation: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false
      }
    };
  } catch (error) {
    if (mutationApplied) {
      nextAction.privatePromptCreated = previousPromptFields.privatePromptCreated;
      if (previousPromptFields.hadPromptStatus) {
        nextAction.promptStatus = previousPromptFields.promptStatus;
      } else {
        delete nextAction.promptStatus;
      }
      if (previousPromptFields.hadPromptSentAt) {
        nextAction.promptSentAt = previousPromptFields.promptSentAt;
      } else {
        delete nextAction.promptSentAt;
      }
    }

    return buildStage4PlayerNightPromptRefusal('player-night-prompt-send-failed', {
      rollbackApplied: mutationApplied,
      message: error.message
    });
  }
}

function buildStage4PlayerNightResponseRefusal(reason, details = {}) {
  return {
    type: 'stage4_player_night_response_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.stage4NightQueue.current-action-response-fields-only',
      serverMutation: false,
      playerNightResponse: false,
      abilityExecution: false,
      legacyNightQueueMutation: false,
      phaseMutation: false,
      roundMutation: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      ...details
    }
  };
}

function cloneStage4PlayerNightResponsePayload(responsePayload) {
  if (responsePayload === undefined || responsePayload === null) {
    return null;
  }

  return JSON.parse(JSON.stringify(responsePayload));
}

function submitStage4PlayerNightResponse({ room, ws, seat, responsePayload }) {
  if (!room) {
    return buildStage4PlayerNightResponseRefusal('missing-room');
  }

  if (!Number.isInteger(seat)) {
    return buildStage4PlayerNightResponseRefusal('missing-current-player-seat');
  }

  if (room.clients.get(seat) !== ws) {
    return buildStage4PlayerNightResponseRefusal('requester-seat-connection-mismatch', { seat });
  }

  const stage4NightQueue = room.state.stage4NightQueue;
  if (!stage4NightQueue || stage4NightQueue.status !== 'server-night-queue-created') {
    return buildStage4PlayerNightResponseRefusal('missing-stage4-night-queue');
  }

  if (!Array.isArray(stage4NightQueue.queue)) {
    return buildStage4PlayerNightResponseRefusal('invalid-stage4-night-queue');
  }

  const promptedAction = stage4NightQueue.queue.find((action) => {
    return action
      && action.privatePromptCreated === true
      && action.promptStatus === 'sent'
      && action.abilityExecuted === false
      && action.responseSubmitted !== true
      && Number.isInteger(action.seat);
  });
  if (!promptedAction) {
    return buildStage4PlayerNightResponseRefusal('no-currently-prompted-player-action');
  }

  if (promptedAction.seat !== seat) {
    return buildStage4PlayerNightResponseRefusal('prompted-action-seat-mismatch', {
      expectedSeat: promptedAction.seat,
      receivedSeat: seat
    });
  }

  if (promptedAction.privatePromptCreated !== true) {
    return buildStage4PlayerNightResponseRefusal('prompt-not-created', { seat });
  }

  if (promptedAction.promptStatus !== 'sent') {
    return buildStage4PlayerNightResponseRefusal('prompt-not-sent', {
      seat,
      promptStatus: promptedAction.promptStatus ?? null
    });
  }

  if (promptedAction.responseSubmitted === true) {
    return buildStage4PlayerNightResponseRefusal('response-already-submitted', { seat });
  }

  if (promptedAction.abilityExecuted === true) {
    return buildStage4PlayerNightResponseRefusal('action-already-executed', { seat });
  }

  const targetPlayer = Array.isArray(room.state.players)
    ? room.state.players.find((player) => player.seat === seat)
    : null;
  if (!targetPlayer) {
    return buildStage4PlayerNightResponseRefusal('target-player-missing', { seat });
  }

  if (!targetPlayer.role || targetPlayer.role !== promptedAction.roleId) {
    return buildStage4PlayerNightResponseRefusal('target-player-role-mismatch', {
      seat,
      expectedRoleId: promptedAction.roleId ?? null,
      currentRoleId: targetPlayer.role ?? null
    });
  }

  if (responsePayload === undefined || responsePayload === null) {
    return buildStage4PlayerNightResponseRefusal('missing-response-payload', { seat });
  }

  let normalizedResponsePayload;
  try {
    normalizedResponsePayload = cloneStage4PlayerNightResponsePayload(responsePayload);
  } catch (error) {
    return buildStage4PlayerNightResponseRefusal('invalid-response-payload', {
      seat,
      message: error.message
    });
  }

  const actionId = `stage4-night-action-${stage4NightQueue.nightQueueId}-${promptedAction.order}`;
  const responseReceivedAt = new Date().toISOString();
  const previousResponseFields = {
    hadResponseSubmitted: Object.prototype.hasOwnProperty.call(promptedAction, 'responseSubmitted'),
    responseSubmitted: promptedAction.responseSubmitted,
    hadResponseStatus: Object.prototype.hasOwnProperty.call(promptedAction, 'responseStatus'),
    responseStatus: promptedAction.responseStatus,
    hadResponseReceivedAt: Object.prototype.hasOwnProperty.call(promptedAction, 'responseReceivedAt'),
    responseReceivedAt: promptedAction.responseReceivedAt,
    hadResponsePayload: Object.prototype.hasOwnProperty.call(promptedAction, 'responsePayload'),
    responsePayload: promptedAction.responsePayload
  };

  let mutationApplied = false;
  try {
    promptedAction.responseSubmitted = true;
    promptedAction.responseStatus = 'recorded';
    promptedAction.responseReceivedAt = responseReceivedAt;
    promptedAction.responsePayload = normalizedResponsePayload;
    mutationApplied = true;

    if (room.storyteller && room.storyteller.readyState === WebSocket.OPEN) {
      room.storyteller.send(JSON.stringify({
        type: 'stage4_player_night_response_received',
        data: {
          status: 'server-player-night-response-received',
          nightQueueId: stage4NightQueue.nightQueueId,
          actionId,
          order: promptedAction.order,
          seat,
          roleId: promptedAction.roleId,
          responseStatus: 'recorded',
          abilityExecution: false,
          eventLogWritten: false
        }
      }));
    }

    return {
      type: 'stage4_player_night_response_recorded',
      data: {
        status: 'server-player-night-response-recorded',
        nightQueueId: stage4NightQueue.nightQueueId,
        actionId,
        order: promptedAction.order,
        seat,
        roleId: promptedAction.roleId,
        mutationScope: 'room.state.stage4NightQueue.current-action-response-fields-only',
        serverMutation: true,
        playerNightResponse: true,
        abilityExecution: false,
        legacyNightQueueMutation: false,
        phaseMutation: false,
        roundMutation: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false
      }
    };
  } catch (error) {
    if (mutationApplied) {
      for (const fieldState of [
        ['responseSubmitted', 'hadResponseSubmitted'],
        ['responseStatus', 'hadResponseStatus'],
        ['responseReceivedAt', 'hadResponseReceivedAt'],
        ['responsePayload', 'hadResponsePayload']
      ]) {
        const [field, hadField] = fieldState;
        if (previousResponseFields[hadField]) {
          promptedAction[field] = previousResponseFields[field];
        } else {
          delete promptedAction[field];
        }
      }
    }

    return buildStage4PlayerNightResponseRefusal('player-night-response-record-failed', {
      rollbackApplied: mutationApplied,
      message: error.message
    });
  }
}

function buildStage4PlayerNightResolutionRefusal(reason, details = {}) {
  return {
    type: 'stage4_player_night_resolution_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.stage4NightQueue.current-action-resolution-fields-only',
      serverMutation: false,
      playerNightResolution: false,
      abilityExecution: false,
      queueAdvancement: false,
      legacyNightQueueMutation: false,
      phaseMutation: false,
      roundMutation: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      ...details
    }
  };
}

function resolveStage4PlayerNightResponse({ room, ws }) {
  if (!room) {
    return buildStage4PlayerNightResolutionRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage4PlayerNightResolutionRefusal('unauthorized-storyteller');
  }

  const stage4NightQueue = room.state.stage4NightQueue;
  if (!stage4NightQueue || stage4NightQueue.status !== 'server-night-queue-created') {
    return buildStage4PlayerNightResolutionRefusal('missing-stage4-night-queue');
  }

  if (!Array.isArray(stage4NightQueue.queue)) {
    return buildStage4PlayerNightResolutionRefusal('invalid-stage4-night-queue');
  }

  const recordedAction = stage4NightQueue.queue.find((action) => {
    return action
      && action.responseSubmitted === true
      && action.responseStatus === 'recorded'
      && action.abilityExecuted === false
      && action.resolutionPrepared !== true
      && Number.isInteger(action.seat);
  });
  if (!recordedAction) {
    return buildStage4PlayerNightResolutionRefusal('no-current-recorded-player-action');
  }

  if (recordedAction.responseSubmitted !== true) {
    return buildStage4PlayerNightResolutionRefusal('response-not-submitted', {
      order: recordedAction.order ?? null,
      seat: recordedAction.seat ?? null,
      roleId: recordedAction.roleId ?? null
    });
  }

  if (recordedAction.responseStatus !== 'recorded') {
    return buildStage4PlayerNightResolutionRefusal('response-not-recorded', {
      order: recordedAction.order ?? null,
      seat: recordedAction.seat ?? null,
      roleId: recordedAction.roleId ?? null,
      responseStatus: recordedAction.responseStatus ?? null
    });
  }

  if (recordedAction.abilityExecuted === true) {
    return buildStage4PlayerNightResolutionRefusal('action-already-executed', {
      order: recordedAction.order ?? null,
      seat: recordedAction.seat ?? null,
      roleId: recordedAction.roleId ?? null
    });
  }

  if (recordedAction.resolutionPrepared === true) {
    return buildStage4PlayerNightResolutionRefusal('resolution-already-prepared', {
      order: recordedAction.order ?? null,
      seat: recordedAction.seat ?? null,
      roleId: recordedAction.roleId ?? null
    });
  }

  if (recordedAction.responsePayload === undefined || recordedAction.responsePayload === null) {
    return buildStage4PlayerNightResolutionRefusal('missing-response-payload', {
      order: recordedAction.order ?? null,
      seat: recordedAction.seat ?? null,
      roleId: recordedAction.roleId ?? null
    });
  }

  let normalizedResponsePayload;
  try {
    normalizedResponsePayload = cloneStage4PlayerNightResponsePayload(recordedAction.responsePayload);
  } catch (error) {
    return buildStage4PlayerNightResolutionRefusal('invalid-response-payload', {
      order: recordedAction.order ?? null,
      seat: recordedAction.seat ?? null,
      roleId: recordedAction.roleId ?? null,
      message: error.message
    });
  }

  const targetPlayer = Array.isArray(room.state.players)
    ? room.state.players.find((player) => player.seat === recordedAction.seat)
    : null;
  if (!targetPlayer) {
    return buildStage4PlayerNightResolutionRefusal('target-player-missing', { seat: recordedAction.seat });
  }

  if (!targetPlayer.role || targetPlayer.role !== recordedAction.roleId) {
    return buildStage4PlayerNightResolutionRefusal('target-player-role-mismatch', {
      seat: recordedAction.seat,
      expectedRoleId: recordedAction.roleId ?? null,
      currentRoleId: targetPlayer.role ?? null
    });
  }

  const actionId = `stage4-night-action-${stage4NightQueue.nightQueueId}-${recordedAction.order}`;
  const resolutionPreparedAt = new Date().toISOString();
  const resolutionPayload = {
    resolutionType: 'recorded-response-metadata',
    resolutionStatus: 'prepared',
    actionId,
    nightQueueId: stage4NightQueue.nightQueueId,
    order: recordedAction.order,
    seat: recordedAction.seat,
    roleId: recordedAction.roleId,
    responseStatus: recordedAction.responseStatus,
    responseReceivedAt: recordedAction.responseReceivedAt ?? null,
    responsePayload: normalizedResponsePayload,
    abilityExecution: false,
    queueAdvancement: false,
    eventLogWritten: false
  };
  const previousResolutionFields = {
    hadResolutionPrepared: Object.prototype.hasOwnProperty.call(recordedAction, 'resolutionPrepared'),
    resolutionPrepared: recordedAction.resolutionPrepared,
    hadResolutionStatus: Object.prototype.hasOwnProperty.call(recordedAction, 'resolutionStatus'),
    resolutionStatus: recordedAction.resolutionStatus,
    hadResolutionPreparedAt: Object.prototype.hasOwnProperty.call(recordedAction, 'resolutionPreparedAt'),
    resolutionPreparedAt: recordedAction.resolutionPreparedAt,
    hadResolutionPayload: Object.prototype.hasOwnProperty.call(recordedAction, 'resolutionPayload'),
    resolutionPayload: recordedAction.resolutionPayload
  };

  let mutationApplied = false;
  try {
    recordedAction.resolutionPrepared = true;
    recordedAction.resolutionStatus = 'prepared';
    recordedAction.resolutionPreparedAt = resolutionPreparedAt;
    recordedAction.resolutionPayload = resolutionPayload;
    mutationApplied = true;

    return {
      type: 'stage4_player_night_resolution_prepared',
      data: {
        status: 'server-player-night-resolution-prepared',
        nightQueueId: stage4NightQueue.nightQueueId,
        actionId,
        order: recordedAction.order,
        seat: recordedAction.seat,
        roleId: recordedAction.roleId,
        resolutionStatus: 'prepared',
        mutationScope: 'room.state.stage4NightQueue.current-action-resolution-fields-only',
        serverMutation: true,
        playerNightResolution: true,
        abilityExecution: false,
        queueAdvancement: false,
        legacyNightQueueMutation: false,
        phaseMutation: false,
        roundMutation: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false
      }
    };
  } catch (error) {
    if (mutationApplied) {
      for (const fieldState of [
        ['resolutionPrepared', 'hadResolutionPrepared'],
        ['resolutionStatus', 'hadResolutionStatus'],
        ['resolutionPreparedAt', 'hadResolutionPreparedAt'],
        ['resolutionPayload', 'hadResolutionPayload']
      ]) {
        const [field, hadField] = fieldState;
        if (previousResolutionFields[hadField]) {
          recordedAction[field] = previousResolutionFields[field];
        } else {
          delete recordedAction[field];
        }
      }
    }

    return buildStage4PlayerNightResolutionRefusal('player-night-resolution-prepare-failed', {
      rollbackApplied: mutationApplied,
      message: error.message
    });
  }
}

function buildStage4PlayerNightAbilityExecutionRefusal(reason, details = {}) {
  return {
    type: 'stage4_player_night_ability_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.stage4NightQueue.current-action-ability-fields-only',
      serverMutation: false,
      playerNightAbilityExecution: false,
      abilityExecution: false,
      abilityEffectsApplied: false,
      queueAdvancement: false,
      actionCompletion: false,
      nextPrompt: false,
      legacyNightQueueMutation: false,
      phaseMutation: false,
      roundMutation: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      ...details
    }
  };
}

function extractStage4AbilityTargets(responsePayload) {
  if (!responsePayload || typeof responsePayload !== 'object') {
    return responsePayload;
  }

  if (Object.prototype.hasOwnProperty.call(responsePayload, 'targets')) {
    return responsePayload.targets;
  }

  if (Object.prototype.hasOwnProperty.call(responsePayload, 'target')) {
    return { target: responsePayload.target };
  }

  return responsePayload;
}

async function executeStage4PlayerNightAbility({ room, ws }) {
  if (!room) {
    return buildStage4PlayerNightAbilityExecutionRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage4PlayerNightAbilityExecutionRefusal('unauthorized-storyteller');
  }

  const stage4NightQueue = room.state.stage4NightQueue;
  if (!stage4NightQueue || stage4NightQueue.status !== 'server-night-queue-created') {
    return buildStage4PlayerNightAbilityExecutionRefusal('missing-stage4-night-queue');
  }

  if (!Array.isArray(stage4NightQueue.queue)) {
    return buildStage4PlayerNightAbilityExecutionRefusal('invalid-stage4-night-queue');
  }

  const preparedAction = stage4NightQueue.queue.find((action) => {
    return action
      && action.resolutionPrepared === true
      && action.resolutionStatus === 'prepared'
      && action.abilityExecuted === false
      && Number.isInteger(action.seat);
  });
  if (!preparedAction) {
    return buildStage4PlayerNightAbilityExecutionRefusal('no-current-prepared-player-action');
  }

  if (preparedAction.resolutionPrepared !== true) {
    return buildStage4PlayerNightAbilityExecutionRefusal('resolution-not-prepared', {
      order: preparedAction.order ?? null,
      seat: preparedAction.seat ?? null,
      roleId: preparedAction.roleId ?? null
    });
  }

  if (preparedAction.resolutionStatus !== 'prepared') {
    return buildStage4PlayerNightAbilityExecutionRefusal('resolution-status-not-prepared', {
      order: preparedAction.order ?? null,
      seat: preparedAction.seat ?? null,
      roleId: preparedAction.roleId ?? null,
      resolutionStatus: preparedAction.resolutionStatus ?? null
    });
  }

  if (preparedAction.abilityExecuted === true) {
    return buildStage4PlayerNightAbilityExecutionRefusal('ability-already-executed', {
      order: preparedAction.order ?? null,
      seat: preparedAction.seat ?? null,
      roleId: preparedAction.roleId ?? null
    });
  }

  if (preparedAction.resolutionPayload === undefined || preparedAction.resolutionPayload === null) {
    return buildStage4PlayerNightAbilityExecutionRefusal('missing-resolution-payload', {
      order: preparedAction.order ?? null,
      seat: preparedAction.seat ?? null,
      roleId: preparedAction.roleId ?? null
    });
  }

  if (preparedAction.responsePayload === undefined || preparedAction.responsePayload === null) {
    return buildStage4PlayerNightAbilityExecutionRefusal('missing-response-payload', {
      order: preparedAction.order ?? null,
      seat: preparedAction.seat ?? null,
      roleId: preparedAction.roleId ?? null
    });
  }

  let normalizedResolutionPayload;
  let normalizedResponsePayload;
  try {
    normalizedResolutionPayload = cloneStage4PlayerNightResponsePayload(preparedAction.resolutionPayload);
    normalizedResponsePayload = cloneStage4PlayerNightResponsePayload(preparedAction.responsePayload);
  } catch (error) {
    return buildStage4PlayerNightAbilityExecutionRefusal('invalid-prepared-payload', {
      order: preparedAction.order ?? null,
      seat: preparedAction.seat ?? null,
      roleId: preparedAction.roleId ?? null,
      message: error.message
    });
  }

  const targetPlayer = Array.isArray(room.state.players)
    ? room.state.players.find((player) => player.seat === preparedAction.seat)
    : null;
  if (!targetPlayer) {
    return buildStage4PlayerNightAbilityExecutionRefusal('target-player-missing', { seat: preparedAction.seat });
  }

  if (!targetPlayer.role || targetPlayer.role !== preparedAction.roleId) {
    return buildStage4PlayerNightAbilityExecutionRefusal('target-player-role-mismatch', {
      seat: preparedAction.seat,
      expectedRoleId: preparedAction.roleId ?? null,
      currentRoleId: targetPlayer.role ?? null
    });
  }

  let isolatedGameState;
  try {
    isolatedGameState = cloneForHistory(room.state);
  } catch (error) {
    return buildStage4PlayerNightAbilityExecutionRefusal('game-state-clone-failed', {
      order: preparedAction.order ?? null,
      seat: preparedAction.seat ?? null,
      roleId: preparedAction.roleId ?? null,
      message: error.message
    });
  }

  const isolatedPlayer = Array.isArray(isolatedGameState.players)
    ? isolatedGameState.players.find((player) => player.seat === preparedAction.seat)
    : null;
  if (!isolatedPlayer) {
    return buildStage4PlayerNightAbilityExecutionRefusal('isolated-target-player-missing', {
      seat: preparedAction.seat
    });
  }

  const abilityRoleId = normalizeStage4LocalRoleId(preparedAction.roleId);
  const abilityTargets = extractStage4AbilityTargets(normalizedResponsePayload);
  let calculatedAbilityResult;
  try {
    calculatedAbilityResult = await abilityEngine.calculateAbility(
      abilityRoleId,
      isolatedPlayer,
      abilityTargets,
      isolatedGameState
    );
  } catch (error) {
    return buildStage4PlayerNightAbilityExecutionRefusal('ability-engine-threw', {
      order: preparedAction.order ?? null,
      seat: preparedAction.seat ?? null,
      roleId: preparedAction.roleId ?? null,
      abilityRoleId,
      message: error.message
    });
  }

  if (!calculatedAbilityResult || typeof calculatedAbilityResult !== 'object') {
    return buildStage4PlayerNightAbilityExecutionRefusal('invalid-ability-result', {
      order: preparedAction.order ?? null,
      seat: preparedAction.seat ?? null,
      roleId: preparedAction.roleId ?? null,
      abilityRoleId
    });
  }

  const actionId = `stage4-night-action-${stage4NightQueue.nightQueueId}-${preparedAction.order}`;
  const abilityExecutedAt = new Date().toISOString();
  const abilityResult = {
    resultType: 'current-action-ability-result-metadata',
    actionId,
    nightQueueId: stage4NightQueue.nightQueueId,
    order: preparedAction.order,
    seat: preparedAction.seat,
    roleId: preparedAction.roleId,
    abilityRoleId,
    resolutionPayload: normalizedResolutionPayload,
    responsePayload: normalizedResponsePayload,
    targets: abilityTargets,
    result: cloneStage4PlayerNightResponsePayload(calculatedAbilityResult),
    abilityEffectsApplied: false,
    queueAdvancement: false,
    actionCompletion: false,
    eventLogWritten: false
  };
  const previousAbilityFields = {
    abilityExecuted: preparedAction.abilityExecuted,
    hadAbilityStatus: Object.prototype.hasOwnProperty.call(preparedAction, 'abilityStatus'),
    abilityStatus: preparedAction.abilityStatus,
    hadAbilityExecutedAt: Object.prototype.hasOwnProperty.call(preparedAction, 'abilityExecutedAt'),
    abilityExecutedAt: preparedAction.abilityExecutedAt,
    hadAbilityResult: Object.prototype.hasOwnProperty.call(preparedAction, 'abilityResult'),
    abilityResult: preparedAction.abilityResult
  };

  let mutationApplied = false;
  try {
    preparedAction.abilityExecuted = true;
    preparedAction.abilityStatus = 'executed';
    preparedAction.abilityExecutedAt = abilityExecutedAt;
    preparedAction.abilityResult = abilityResult;
    mutationApplied = true;

    return {
      type: 'stage4_player_night_ability_executed',
      data: {
        status: 'server-player-night-ability-executed',
        nightQueueId: stage4NightQueue.nightQueueId,
        actionId,
        order: preparedAction.order,
        seat: preparedAction.seat,
        roleId: preparedAction.roleId,
        abilityRoleId,
        abilityStatus: 'executed',
        mutationScope: 'room.state.stage4NightQueue.current-action-ability-fields-only',
        serverMutation: true,
        playerNightAbilityExecution: true,
        abilityExecution: true,
        abilityEffectsApplied: false,
        queueAdvancement: false,
        actionCompletion: false,
        nextPrompt: false,
        legacyNightQueueMutation: false,
        phaseMutation: false,
        roundMutation: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false
      }
    };
  } catch (error) {
    if (mutationApplied) {
      preparedAction.abilityExecuted = previousAbilityFields.abilityExecuted;
      if (previousAbilityFields.hadAbilityStatus) {
        preparedAction.abilityStatus = previousAbilityFields.abilityStatus;
      } else {
        delete preparedAction.abilityStatus;
      }
      if (previousAbilityFields.hadAbilityExecutedAt) {
        preparedAction.abilityExecutedAt = previousAbilityFields.abilityExecutedAt;
      } else {
        delete preparedAction.abilityExecutedAt;
      }
      if (previousAbilityFields.hadAbilityResult) {
        preparedAction.abilityResult = previousAbilityFields.abilityResult;
      } else {
        delete preparedAction.abilityResult;
      }
    }

    return buildStage4PlayerNightAbilityExecutionRefusal('player-night-ability-execution-store-failed', {
      rollbackApplied: mutationApplied,
      message: error.message
    });
  }
}

function buildStage4PlayerNightActionCompletionRefusal(reason, details = {}) {
  return {
    type: 'stage4_player_night_action_completion_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.stage4NightQueue.current-action-completion-fields-plus-limited-player-effect',
      serverMutation: false,
      playerNightActionCompletion: false,
      abilityEffectsApplied: false,
      queueAdvancement: false,
      actionCompletion: false,
      nextPrompt: false,
      legacyNightQueueMutation: false,
      phaseMutation: false,
      roundMutation: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      ...details
    }
  };
}

function getStage4StoredAbilityEffect(abilityResult) {
  if (!abilityResult || typeof abilityResult !== 'object') {
    return null;
  }

  const calculatedResult = abilityResult.result;
  if (!calculatedResult || typeof calculatedResult !== 'object') {
    return null;
  }

  const effect = calculatedResult.effect;
  if (!effect || typeof effect !== 'object') {
    return null;
  }

  return effect;
}

function completeStage4PlayerNightAction({ room, ws }) {
  if (!room) {
    return buildStage4PlayerNightActionCompletionRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage4PlayerNightActionCompletionRefusal('unauthorized-storyteller');
  }

  const stage4NightQueue = room.state.stage4NightQueue;
  if (!stage4NightQueue || stage4NightQueue.status !== 'server-night-queue-created') {
    return buildStage4PlayerNightActionCompletionRefusal('missing-stage4-night-queue');
  }

  if (!Array.isArray(stage4NightQueue.queue)) {
    return buildStage4PlayerNightActionCompletionRefusal('invalid-stage4-night-queue');
  }

  const executedAction = stage4NightQueue.queue.find((action) => {
    return action
      && action.abilityExecuted === true
      && action.abilityStatus === 'executed'
      && action.status !== 'completed'
      && Number.isInteger(action.seat);
  });
  if (!executedAction) {
    return buildStage4PlayerNightActionCompletionRefusal('no-current-executed-player-action');
  }

  if (executedAction.abilityExecuted !== true) {
    return buildStage4PlayerNightActionCompletionRefusal('ability-not-executed', {
      order: executedAction.order ?? null,
      seat: executedAction.seat ?? null,
      roleId: executedAction.roleId ?? null
    });
  }

  if (executedAction.abilityStatus !== 'executed') {
    return buildStage4PlayerNightActionCompletionRefusal('ability-status-not-executed', {
      order: executedAction.order ?? null,
      seat: executedAction.seat ?? null,
      roleId: executedAction.roleId ?? null,
      abilityStatus: executedAction.abilityStatus ?? null
    });
  }

  if (executedAction.status === 'completed') {
    return buildStage4PlayerNightActionCompletionRefusal('action-already-completed', {
      order: executedAction.order ?? null,
      seat: executedAction.seat ?? null,
      roleId: executedAction.roleId ?? null
    });
  }

  if (!executedAction.abilityResult || typeof executedAction.abilityResult !== 'object') {
    return buildStage4PlayerNightActionCompletionRefusal('missing-ability-result', {
      order: executedAction.order ?? null,
      seat: executedAction.seat ?? null,
      roleId: executedAction.roleId ?? null
    });
  }

  const storedEffect = getStage4StoredAbilityEffect(executedAction.abilityResult);
  let effectTargetSeat = null;
  let effectTargetPlayer = null;
  if (storedEffect) {
    if (!['kill', 'poison', 'protect'].includes(storedEffect.type)) {
      return buildStage4PlayerNightActionCompletionRefusal('unsupported-stored-effect-type', {
        order: executedAction.order ?? null,
        seat: executedAction.seat ?? null,
        roleId: executedAction.roleId ?? null,
        effectType: storedEffect.type ?? null
      });
    }

    effectTargetSeat = Number.parseInt(storedEffect.target, 10);
    if (!Number.isInteger(effectTargetSeat)) {
      return buildStage4PlayerNightActionCompletionRefusal('invalid-stored-effect-target', {
        order: executedAction.order ?? null,
        seat: executedAction.seat ?? null,
        roleId: executedAction.roleId ?? null,
        effectType: storedEffect.type ?? null,
        effectTarget: storedEffect.target ?? null
      });
    }

    effectTargetPlayer = Array.isArray(room.state.players)
      ? room.state.players.find((player) => player.seat === effectTargetSeat)
      : null;
    if (!effectTargetPlayer) {
      return buildStage4PlayerNightActionCompletionRefusal('stored-effect-target-player-missing', {
        order: executedAction.order ?? null,
        seat: executedAction.seat ?? null,
        roleId: executedAction.roleId ?? null,
        effectType: storedEffect.type ?? null,
        effectTarget: effectTargetSeat
      });
    }
  }

  const actionId = `stage4-night-action-${stage4NightQueue.nightQueueId}-${executedAction.order}`;
  const completedAt = new Date().toISOString();
  const previousCompletionFields = {
    hadStatus: Object.prototype.hasOwnProperty.call(executedAction, 'status'),
    status: executedAction.status,
    hadCompletedAt: Object.prototype.hasOwnProperty.call(executedAction, 'completedAt'),
    completedAt: executedAction.completedAt,
    hadCompletionStatus: Object.prototype.hasOwnProperty.call(executedAction, 'completionStatus'),
    completionStatus: executedAction.completionStatus,
    hadAbilityEffectsApplied: Object.prototype.hasOwnProperty.call(executedAction, 'abilityEffectsApplied'),
    abilityEffectsApplied: executedAction.abilityEffectsApplied,
    hadQueueAdvancement: Object.prototype.hasOwnProperty.call(executedAction, 'queueAdvancement'),
    queueAdvancement: executedAction.queueAdvancement,
    hadNextActionAvailable: Object.prototype.hasOwnProperty.call(executedAction, 'nextActionAvailable'),
    nextActionAvailable: executedAction.nextActionAvailable,
    hadCompletionResult: Object.prototype.hasOwnProperty.call(executedAction, 'completionResult'),
    completionResult: executedAction.completionResult
  };
  const previousEffectFields = effectTargetPlayer
    ? {
        hadAlive: Object.prototype.hasOwnProperty.call(effectTargetPlayer, 'alive'),
        alive: effectTargetPlayer.alive,
        hadPoisoned: Object.prototype.hasOwnProperty.call(effectTargetPlayer, 'poisoned'),
        poisoned: effectTargetPlayer.poisoned,
        hadProtected: Object.prototype.hasOwnProperty.call(effectTargetPlayer, 'protected'),
        protected: effectTargetPlayer.protected
      }
    : null;

  let mutationApplied = false;
  try {
    let effectApplied = false;
    const effectSummary = storedEffect
      ? { type: storedEffect.type, target: effectTargetSeat, applied: false }
      : { type: null, target: null, applied: false };

    if (storedEffect?.type === 'kill') {
      effectTargetPlayer.alive = false;
      effectApplied = true;
      effectSummary.applied = true;
    } else if (storedEffect?.type === 'poison') {
      effectTargetPlayer.poisoned = true;
      effectApplied = true;
      effectSummary.applied = true;
    } else if (storedEffect?.type === 'protect') {
      effectTargetPlayer.protected = true;
      effectApplied = true;
      effectSummary.applied = true;
    }

    executedAction.status = 'completed';
    executedAction.completedAt = completedAt;
    executedAction.completionStatus = 'completed';
    executedAction.abilityEffectsApplied = effectApplied;
    executedAction.queueAdvancement = true;
    executedAction.nextActionAvailable = stage4NightQueue.queue.some((action) => {
      return action
        && action !== executedAction
        && action.status === 'pending'
        && action.abilityExecuted === false
        && Number.isInteger(action.seat);
    });
    executedAction.completionResult = {
      resultType: 'current-action-completion-and-queue-boundary',
      actionId,
      nightQueueId: stage4NightQueue.nightQueueId,
      order: executedAction.order,
      seat: executedAction.seat,
      roleId: executedAction.roleId,
      effect: effectSummary,
      actionCompletion: true,
      queueAdvancement: true,
      nextActionAvailable: executedAction.nextActionAvailable,
      nextPrompt: false,
      eventLogWritten: false
    };
    mutationApplied = true;

    return {
      type: 'stage4_player_night_action_completed',
      data: {
        status: 'server-player-night-action-completed',
        nightQueueId: stage4NightQueue.nightQueueId,
        actionId,
        order: executedAction.order,
        seat: executedAction.seat,
        roleId: executedAction.roleId,
        completionStatus: 'completed',
        effect: effectSummary,
        nextActionAvailable: executedAction.nextActionAvailable,
        mutationScope: 'room.state.stage4NightQueue.current-action-completion-fields-plus-limited-player-effect',
        serverMutation: true,
        playerNightActionCompletion: true,
        abilityEffectsApplied: effectApplied,
        queueAdvancement: true,
        actionCompletion: true,
        nextPrompt: false,
        legacyNightQueueMutation: false,
        phaseMutation: false,
        roundMutation: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false
      }
    };
  } catch (error) {
    if (mutationApplied) {
      for (const fieldState of [
        ['status', 'hadStatus'],
        ['completedAt', 'hadCompletedAt'],
        ['completionStatus', 'hadCompletionStatus'],
        ['abilityEffectsApplied', 'hadAbilityEffectsApplied'],
        ['queueAdvancement', 'hadQueueAdvancement'],
        ['nextActionAvailable', 'hadNextActionAvailable'],
        ['completionResult', 'hadCompletionResult']
      ]) {
        const [field, hadField] = fieldState;
        if (previousCompletionFields[hadField]) {
          executedAction[field] = previousCompletionFields[field];
        } else {
          delete executedAction[field];
        }
      }

      if (effectTargetPlayer && previousEffectFields) {
        for (const fieldState of [
          ['alive', 'hadAlive'],
          ['poisoned', 'hadPoisoned'],
          ['protected', 'hadProtected']
        ]) {
          const [field, hadField] = fieldState;
          if (previousEffectFields[hadField]) {
            effectTargetPlayer[field] = previousEffectFields[field];
          } else {
            delete effectTargetPlayer[field];
          }
        }
      }
    }

    return buildStage4PlayerNightActionCompletionRefusal('player-night-action-completion-failed', {
      rollbackApplied: mutationApplied,
      message: error.message
    });
  }
}

function buildStage5NightCloseoutRefusal(reason, details = {}) {
  return {
    type: 'stage5_night_closeout_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.stage5NightCloseout.current-readiness-fields-only',
      serverMutation: false,
      allStage4NightActionsCompleted: false,
      nightCloseoutReady: false,
      dayTransition: false,
      phaseMutation: false,
      roundMutation: false,
      legacyNightQueueMutation: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      ...details
    }
  };
}

function buildStage5NightActionId(stage4NightQueue, action) {
  if (typeof action?.completionResult?.actionId === 'string' && action.completionResult.actionId.trim() !== '') {
    return action.completionResult.actionId;
  }

  return `stage4-night-action-${stage4NightQueue.nightQueueId}-${action.order}`;
}

function prepareStage5NightCloseout({ room, ws }) {
  if (!room) {
    return buildStage5NightCloseoutRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage5NightCloseoutRefusal('unauthorized-storyteller');
  }

  const stage4NightQueue = room.state.stage4NightQueue;
  if (!stage4NightQueue || stage4NightQueue.status !== 'server-night-queue-created') {
    return buildStage5NightCloseoutRefusal('missing-stage4-night-queue');
  }

  if (stage4NightQueue.night !== 'first') {
    return buildStage5NightCloseoutRefusal('unsupported-night-closeout', {
      night: stage4NightQueue.night ?? null
    });
  }

  if (!Array.isArray(stage4NightQueue.queue)) {
    return buildStage5NightCloseoutRefusal('invalid-stage4-night-queue');
  }

  const playerActions = stage4NightQueue.queue.filter((action) => {
    return action && Number.isInteger(action.seat);
  });
  if (playerActions.length === 0) {
    return buildStage5NightCloseoutRefusal('missing-stage4-player-actions', {
      nightQueueId: stage4NightQueue.nightQueueId ?? null
    });
  }

  const incompleteActions = playerActions.filter((action) => {
    return action.status !== 'completed'
      || action.abilityExecuted !== true
      || action.completionStatus !== 'completed';
  });
  if (incompleteActions.length > 0) {
    return buildStage5NightCloseoutRefusal('stage4-night-actions-incomplete', {
      nightQueueId: stage4NightQueue.nightQueueId ?? null,
      incompleteActions: incompleteActions.map((action) => ({
        order: action.order ?? null,
        seat: action.seat ?? null,
        roleId: action.roleId ?? null,
        status: action.status ?? null,
        abilityExecuted: action.abilityExecuted === true,
        completionStatus: action.completionStatus ?? null
      }))
    });
  }

  const readyAt = new Date().toISOString();
  const previousStage5NightCloseout = room.state.stage5NightCloseout;
  const hadStage5NightCloseout = Object.prototype.hasOwnProperty.call(room.state, 'stage5NightCloseout');

  try {
    const completedActionIds = playerActions.map((action) => buildStage5NightActionId(stage4NightQueue, action));
    room.state.stage5NightCloseout = {
      ready: true,
      readyAt,
      sourceNightQueueId: stage4NightQueue.nightQueueId,
      completedActionIds,
      requestedBy: 'storyteller'
    };

    return {
      type: 'stage5_night_closeout_ready',
      data: {
        status: 'server-night-closeout-ready',
        nightQueueId: stage4NightQueue.nightQueueId,
        readyAt,
        completedActionIds,
        requestedBy: 'storyteller',
        mutationScope: 'room.state.stage5NightCloseout.current-readiness-fields-only',
        serverMutation: true,
        allStage4NightActionsCompleted: true,
        nightCloseoutReady: true,
        dayTransition: false,
        phaseMutation: false,
        roundMutation: false,
        legacyNightQueueMutation: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false
      }
    };
  } catch (error) {
    if (hadStage5NightCloseout) {
      room.state.stage5NightCloseout = previousStage5NightCloseout;
    } else {
      delete room.state.stage5NightCloseout;
    }

    return buildStage5NightCloseoutRefusal('stage5-night-closeout-store-failed', {
      rollbackApplied: true,
      message: error.message
    });
  }
}

function buildStage5DayTransitionRefusal(reason, details = {}) {
  return {
    type: 'stage5_day_transition_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.phase-and-round-day-transition-only',
      serverMutation: false,
      dayTransition: false,
      phaseMutation: false,
      roundMutation: false,
      legacyNightQueueMutation: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      ...details
    }
  };
}

function startStage5DayTransition({ room, ws }) {
  if (!room) {
    return buildStage5DayTransitionRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage5DayTransitionRefusal('unauthorized-storyteller');
  }

  const closeoutReadiness = room.state.stage5NightCloseout;
  if (!closeoutReadiness || closeoutReadiness.ready !== true) {
    return buildStage5DayTransitionRefusal('missing-night-closeout-readiness');
  }

  if (
    typeof closeoutReadiness.sourceNightQueueId !== 'string'
    || closeoutReadiness.sourceNightQueueId.trim() === ''
    || !Array.isArray(closeoutReadiness.completedActionIds)
    || closeoutReadiness.completedActionIds.length === 0
  ) {
    return buildStage5DayTransitionRefusal('invalid-night-closeout-readiness', {
      sourceNightQueueId: closeoutReadiness.sourceNightQueueId ?? null,
      completedActionCount: Array.isArray(closeoutReadiness.completedActionIds)
        ? closeoutReadiness.completedActionIds.length
        : null
    });
  }

  if (room.state.phase === 'day' && room.state.round === 1) {
    return buildStage5DayTransitionRefusal('day-transition-already-started', {
      phase: room.state.phase,
      round: room.state.round
    });
  }

  const startedAt = new Date().toISOString();
  const previousPhase = room.state.phase;
  const previousRound = room.state.round;
  const previousStage5DayTransition = room.state.stage5DayTransition;
  const hadStage5DayTransition = Object.prototype.hasOwnProperty.call(room.state, 'stage5DayTransition');

  try {
    const completedActionIds = [...closeoutReadiness.completedActionIds];
    room.state.phase = 'day';
    room.state.round = 1;
    room.state.stage5DayTransition = {
      started: true,
      startedAt,
      sourceNightQueueId: closeoutReadiness.sourceNightQueueId,
      completedActionIds,
      requestedBy: 'storyteller'
    };

    return {
      type: 'stage5_day_transition_started',
      data: {
        status: 'server-day-transition-started',
        phase: 'day',
        round: 1,
        startedAt,
        sourceNightQueueId: closeoutReadiness.sourceNightQueueId,
        completedActionIds,
        requestedBy: 'storyteller',
        mutationScope: 'room.state.phase-and-round-day-transition-only',
        transitionMarkerScope: 'room.state.stage5DayTransition.current-transition-fields-only',
        serverMutation: true,
        dayTransition: true,
        phaseMutation: true,
        roundMutation: true,
        legacyNightQueueMutation: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false
      }
    };
  } catch (error) {
    room.state.phase = previousPhase;
    room.state.round = previousRound;
    if (hadStage5DayTransition) {
      room.state.stage5DayTransition = previousStage5DayTransition;
    } else {
      delete room.state.stage5DayTransition;
    }

    return buildStage5DayTransitionRefusal('stage5-day-transition-store-failed', {
      rollbackApplied: true,
      message: error.message
    });
  }
}

function buildStage5DayInteractionRefusal(reason, details = {}) {
  return {
    type: 'stage5_day_interaction_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.stage5DayInteraction.current-readiness-fields-only',
      readModel: 'room.state.stage5DayInteraction.first-day-readiness-read-model-only',
      serverMutation: false,
      dayInteractionReady: false,
      nominationsOpened: false,
      votingOpened: false,
      voteResolution: false,
      phaseMutation: false,
      roundMutation: false,
      playerStateMutation: false,
      legacyNightQueueMutation: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      aiIntegration: false,
      ...details
    }
  };
}

function prepareStage5DayInteraction({ room, ws }) {
  if (!room) {
    return buildStage5DayInteractionRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage5DayInteractionRefusal('unauthorized-storyteller');
  }

  if (room.state.phase !== 'day') {
    return buildStage5DayInteractionRefusal('invalid-phase-for-day-interaction', {
      phase: room.state.phase ?? null
    });
  }

  if (room.state.round !== 1) {
    return buildStage5DayInteractionRefusal('invalid-round-for-day-interaction', {
      round: room.state.round ?? null
    });
  }

  const dayTransition = room.state.stage5DayTransition;
  if (!dayTransition || dayTransition.started !== true) {
    return buildStage5DayInteractionRefusal('missing-day-transition');
  }

  if (
    typeof dayTransition.sourceNightQueueId !== 'string'
    || dayTransition.sourceNightQueueId.trim() === ''
    || !Array.isArray(dayTransition.completedActionIds)
    || dayTransition.completedActionIds.length === 0
  ) {
    return buildStage5DayInteractionRefusal('invalid-day-transition', {
      sourceNightQueueId: dayTransition.sourceNightQueueId ?? null,
      completedActionCount: Array.isArray(dayTransition.completedActionIds)
        ? dayTransition.completedActionIds.length
        : null
    });
  }

  if (room.state.stage5DayInteraction?.ready === true) {
    return buildStage5DayInteractionRefusal('day-interaction-already-ready', {
      readyAt: room.state.stage5DayInteraction.readyAt ?? null
    });
  }

  const readyAt = new Date().toISOString();
  const sourceTransitionId = `${dayTransition.sourceNightQueueId}:day-1`;
  const previousStage5DayInteraction = room.state.stage5DayInteraction;
  const hadStage5DayInteraction = Object.prototype.hasOwnProperty.call(room.state, 'stage5DayInteraction');

  try {
    room.state.stage5DayInteraction = {
      ready: true,
      readyAt,
      phase: room.state.phase,
      round: room.state.round,
      sourceTransitionId,
      requestedBy: 'storyteller'
    };

    return {
      type: 'stage5_day_interaction_ready',
      data: {
        status: 'server-day-interaction-ready',
        readyAt,
        phase: room.state.phase,
        round: room.state.round,
        sourceTransitionId,
        completedActionCount: dayTransition.completedActionIds.length,
        requestedBy: 'storyteller',
        mutationScope: 'room.state.stage5DayInteraction.current-readiness-fields-only',
        readModel: 'room.state.stage5DayInteraction.first-day-readiness-read-model-only',
        serverMutation: true,
        dayInteractionReady: true,
        nominationsOpened: false,
        votingOpened: false,
        voteResolution: false,
        phaseMutation: false,
        roundMutation: false,
        playerStateMutation: false,
        legacyNightQueueMutation: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false,
        aiIntegration: false
      }
    };
  } catch (error) {
    if (hadStage5DayInteraction) {
      room.state.stage5DayInteraction = previousStage5DayInteraction;
    } else {
      delete room.state.stage5DayInteraction;
    }

    return buildStage5DayInteractionRefusal('stage5-day-interaction-store-failed', {
      rollbackApplied: true,
      message: error.message
    });
  }
}

function buildStage5NominationRefusal(reason, details = {}) {
  return {
    type: 'stage5_nomination_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.stage5Nomination.current-readiness-fields-only',
      readModel: 'room.state.stage5Nomination.alive-player-eligibility-read-model-only',
      serverMutation: false,
      nominationReady: false,
      nominationRecorded: false,
      votingOpened: false,
      voteResolution: false,
      phaseMutation: false,
      roundMutation: false,
      playerStateMutation: false,
      legacyNightQueueMutation: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      aiIntegration: false,
      ...details
    }
  };
}

function buildStage5AliveNominationEligibility(players) {
  return players
    .filter((player) => Number.isInteger(player?.seat) && player.alive !== false)
    .map((player) => player.seat)
    .sort((left, right) => left - right);
}

function prepareStage5Nomination({ room, ws }) {
  if (!room) {
    return buildStage5NominationRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage5NominationRefusal('unauthorized-storyteller');
  }

  if (room.state.phase !== 'day') {
    return buildStage5NominationRefusal('invalid-phase-for-nomination', {
      phase: room.state.phase ?? null
    });
  }

  if (room.state.round !== 1) {
    return buildStage5NominationRefusal('invalid-round-for-nomination', {
      round: room.state.round ?? null
    });
  }

  const dayInteraction = room.state.stage5DayInteraction;
  if (!dayInteraction || dayInteraction.ready !== true) {
    return buildStage5NominationRefusal('missing-day-interaction-readiness');
  }

  if (
    typeof dayInteraction.sourceTransitionId !== 'string'
    || dayInteraction.sourceTransitionId.trim() === ''
  ) {
    return buildStage5NominationRefusal('invalid-day-interaction-readiness', {
      sourceTransitionId: dayInteraction.sourceTransitionId ?? null
    });
  }

  if (!Array.isArray(room.state.players)) {
    return buildStage5NominationRefusal('invalid-player-list');
  }

  const eligibleNominatorSeats = buildStage5AliveNominationEligibility(room.state.players);
  const eligibleNomineeSeats = [...eligibleNominatorSeats];
  if (eligibleNominatorSeats.length === 0) {
    return buildStage5NominationRefusal('missing-alive-players');
  }

  if (room.state.stage5Nomination?.ready === true) {
    return buildStage5NominationRefusal('nomination-already-ready', {
      readyAt: room.state.stage5Nomination.readyAt ?? null
    });
  }

  const readyAt = new Date().toISOString();
  const previousStage5Nomination = room.state.stage5Nomination;
  const hadStage5Nomination = Object.prototype.hasOwnProperty.call(room.state, 'stage5Nomination');

  try {
    room.state.stage5Nomination = {
      ready: true,
      readyAt,
      phase: room.state.phase,
      round: room.state.round,
      sourceDayInteractionId: dayInteraction.sourceTransitionId,
      eligibleNominatorSeats,
      eligibleNomineeSeats,
      requestedBy: 'storyteller'
    };

    return {
      type: 'stage5_nomination_ready',
      data: {
        status: 'server-nomination-ready',
        readyAt,
        phase: room.state.phase,
        round: room.state.round,
        sourceDayInteractionId: dayInteraction.sourceTransitionId,
        eligibleNominatorSeats,
        eligibleNomineeSeats,
        requestedBy: 'storyteller',
        mutationScope: 'room.state.stage5Nomination.current-readiness-fields-only',
        readModel: 'room.state.stage5Nomination.alive-player-eligibility-read-model-only',
        serverMutation: true,
        nominationReady: true,
        nominationRecorded: false,
        votingOpened: false,
        voteResolution: false,
        phaseMutation: false,
        roundMutation: false,
        playerStateMutation: false,
        legacyNightQueueMutation: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false,
        aiIntegration: false
      }
    };
  } catch (error) {
    if (hadStage5Nomination) {
      room.state.stage5Nomination = previousStage5Nomination;
    } else {
      delete room.state.stage5Nomination;
    }

    return buildStage5NominationRefusal('stage5-nomination-store-failed', {
      rollbackApplied: true,
      message: error.message
    });
  }
}

function buildStage5NominationRecordingRefusal(reason, details = {}) {
  return {
    type: 'stage5_nomination_recording_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.stage5Nomination.current-recording-fields-only',
      readModel: 'room.state.stage5Nomination.recording-eligibility-read-model-only',
      serverMutation: false,
      nominationRecorded: false,
      votingOpened: false,
      voteResolution: false,
      phaseMutation: false,
      roundMutation: false,
      playerStateMutation: false,
      legacyNightQueueMutation: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      aiIntegration: false,
      ...details
    }
  };
}

function recordStage5Nomination({ room, ws, nominatorSeat, nomineeSeat }) {
  if (!room) {
    return buildStage5NominationRecordingRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage5NominationRecordingRefusal('unauthorized-storyteller');
  }

  if (room.state.phase !== 'day') {
    return buildStage5NominationRecordingRefusal('invalid-phase-for-nomination-recording', {
      phase: room.state.phase ?? null
    });
  }

  if (room.state.round !== 1) {
    return buildStage5NominationRecordingRefusal('invalid-round-for-nomination-recording', {
      round: room.state.round ?? null
    });
  }

  const nominationReadiness = room.state.stage5Nomination;
  if (!nominationReadiness || nominationReadiness.ready !== true) {
    return buildStage5NominationRecordingRefusal('missing-nomination-readiness');
  }

  if (
    !Array.isArray(nominationReadiness.eligibleNominatorSeats)
    || !Array.isArray(nominationReadiness.eligibleNomineeSeats)
  ) {
    return buildStage5NominationRecordingRefusal('invalid-nomination-eligibility-lists');
  }

  if (!Number.isInteger(nominatorSeat)) {
    return buildStage5NominationRecordingRefusal('invalid-nominator-seat', {
      nominatorSeat: nominatorSeat ?? null
    });
  }

  if (!Number.isInteger(nomineeSeat)) {
    return buildStage5NominationRecordingRefusal('invalid-nominee-seat', {
      nomineeSeat: nomineeSeat ?? null
    });
  }

  if (nominatorSeat === nomineeSeat) {
    return buildStage5NominationRecordingRefusal('nominator-and-nominee-match', {
      nominatorSeat,
      nomineeSeat
    });
  }

  if (!nominationReadiness.eligibleNominatorSeats.includes(nominatorSeat)) {
    return buildStage5NominationRecordingRefusal('ineligible-nominator-seat', {
      nominatorSeat,
      eligibleNominatorSeats: [...nominationReadiness.eligibleNominatorSeats]
    });
  }

  if (!nominationReadiness.eligibleNomineeSeats.includes(nomineeSeat)) {
    return buildStage5NominationRecordingRefusal('ineligible-nominee-seat', {
      nomineeSeat,
      eligibleNomineeSeats: [...nominationReadiness.eligibleNomineeSeats]
    });
  }

  if (nominationReadiness.nominationRecorded === true || nominationReadiness.currentNomination) {
    return buildStage5NominationRecordingRefusal('nomination-already-recorded', {
      currentNomination: nominationReadiness.currentNomination ?? null
    });
  }

  const recordedAt = new Date().toISOString();
  const previousStage5Nomination = cloneForHistory(room.state.stage5Nomination);
  const currentNomination = {
    nominatorSeat,
    nomineeSeat,
    recordedAt,
    sourceDayInteractionId: nominationReadiness.sourceDayInteractionId,
    requestedBy: 'storyteller'
  };

  try {
    room.state.stage5Nomination = {
      ...nominationReadiness,
      currentNomination,
      nominationRecorded: true
    };

    return {
      type: 'stage5_nomination_recorded',
      data: {
        status: 'server-nomination-recorded',
        currentNomination,
        nominatorSeat,
        nomineeSeat,
        recordedAt,
        sourceDayInteractionId: nominationReadiness.sourceDayInteractionId,
        requestedBy: 'storyteller',
        mutationScope: 'room.state.stage5Nomination.current-recording-fields-only',
        readModel: 'room.state.stage5Nomination.recording-eligibility-read-model-only',
        serverMutation: true,
        nominationRecorded: true,
        votingOpened: false,
        voteResolution: false,
        phaseMutation: false,
        roundMutation: false,
        playerStateMutation: false,
        legacyNightQueueMutation: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false,
        aiIntegration: false
      }
    };
  } catch (error) {
    room.state.stage5Nomination = previousStage5Nomination;

    return buildStage5NominationRecordingRefusal('stage5-nomination-recording-store-failed', {
      rollbackApplied: true,
      message: error.message
    });
  }
}

function buildStage5VotingRefusal(reason, details = {}) {
  return {
    type: 'stage5_voting_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.stage5Voting.current-voting-fields-only',
      readModel: 'room.state.stage5Voting.recorded-nomination-read-model-only',
      serverMutation: false,
      votingOpened: false,
      voteCollectionOpened: false,
      voteCountingOpened: false,
      voteResolution: false,
      phaseMutation: false,
      roundMutation: false,
      playerStateMutation: false,
      legacyNightQueueMutation: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      aiIntegration: false,
      ...details
    }
  };
}

function startStage5Voting({ room, ws }) {
  if (!room) {
    return buildStage5VotingRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage5VotingRefusal('unauthorized-storyteller');
  }

  if (room.state.phase !== 'day') {
    return buildStage5VotingRefusal('invalid-phase-for-voting-start', {
      phase: room.state.phase ?? null
    });
  }

  if (room.state.round !== 1) {
    return buildStage5VotingRefusal('invalid-round-for-voting-start', {
      round: room.state.round ?? null
    });
  }

  const nomination = room.state.stage5Nomination;
  if (!nomination || nomination.nominationRecorded !== true) {
    return buildStage5VotingRefusal('missing-recorded-nomination');
  }

  const currentNomination = nomination.currentNomination;
  if (!currentNomination || typeof currentNomination !== 'object') {
    return buildStage5VotingRefusal('missing-current-nomination');
  }

  if (!Number.isInteger(currentNomination.nominatorSeat)) {
    return buildStage5VotingRefusal('invalid-current-nomination-nominator-seat', {
      nominatorSeat: currentNomination.nominatorSeat ?? null
    });
  }

  if (!Number.isInteger(currentNomination.nomineeSeat)) {
    return buildStage5VotingRefusal('invalid-current-nomination-nominee-seat', {
      nomineeSeat: currentNomination.nomineeSeat ?? null
    });
  }

  if (currentNomination.nominatorSeat === currentNomination.nomineeSeat) {
    return buildStage5VotingRefusal('current-nomination-seats-match', {
      nominatorSeat: currentNomination.nominatorSeat,
      nomineeSeat: currentNomination.nomineeSeat
    });
  }

  if (room.state.stage5Voting?.started === true) {
    return buildStage5VotingRefusal('voting-already-started', {
      startedAt: room.state.stage5Voting.startedAt ?? null,
      sourceNomination: room.state.stage5Voting.sourceNomination ?? null
    });
  }

  const startedAt = new Date().toISOString();
  const previousStage5Voting = cloneForHistory(room.state.stage5Voting);
  const hadStage5Voting = Object.prototype.hasOwnProperty.call(room.state, 'stage5Voting');
  const sourceNomination = {
    nominatorSeat: currentNomination.nominatorSeat,
    nomineeSeat: currentNomination.nomineeSeat,
    recordedAt: currentNomination.recordedAt ?? null,
    sourceDayInteractionId:
      currentNomination.sourceDayInteractionId
      ?? nomination.sourceDayInteractionId
      ?? null
  };

  try {
    room.state.stage5Voting = {
      started: true,
      startedAt,
      sourceNomination,
      requestedBy: 'storyteller'
    };

    return {
      type: 'stage5_voting_started',
      data: {
        status: 'server-voting-started',
        startedAt,
        sourceNomination,
        requestedBy: 'storyteller',
        mutationScope: 'room.state.stage5Voting.current-voting-fields-only',
        readModel: 'room.state.stage5Voting.recorded-nomination-read-model-only',
        serverMutation: true,
        votingOpened: true,
        voteCollectionOpened: false,
        voteCountingOpened: false,
        voteResolution: false,
        phaseMutation: false,
        roundMutation: false,
        playerStateMutation: false,
        legacyNightQueueMutation: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false,
        aiIntegration: false
      }
    };
  } catch (error) {
    if (hadStage5Voting) {
      room.state.stage5Voting = previousStage5Voting;
    } else {
      delete room.state.stage5Voting;
    }

    return buildStage5VotingRefusal('stage5-voting-store-failed', {
      rollbackApplied: true,
      message: error.message
    });
  }
}

function buildStage5VoteCollectionRefusal(reason, details = {}) {
  return {
    type: 'stage5_vote_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.stage5Voting.current-vote-collection-fields-only',
      readModel: 'room.state.stage5Voting.active-vote-collection-read-model-only',
      serverMutation: false,
      voteRecorded: false,
      voteCollectionOpened: false,
      voteCountingOpened: false,
      voteResolution: false,
      publicPromptAutomation: false,
      privatePromptAutomation: false,
      phaseMutation: false,
      roundMutation: false,
      playerStateMutation: false,
      legacyNightQueueMutation: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      aiIntegration: false,
      ...details
    }
  };
}

function recordStage5Vote({ room, ws, currentSeat, voterSeat, vote }) {
  if (!room) {
    return buildStage5VoteCollectionRefusal('missing-room');
  }

  if (room.state.phase !== 'day') {
    return buildStage5VoteCollectionRefusal('invalid-phase-for-vote-collection', {
      phase: room.state.phase ?? null
    });
  }

  if (room.state.round !== 1) {
    return buildStage5VoteCollectionRefusal('invalid-round-for-vote-collection', {
      round: room.state.round ?? null
    });
  }

  const voting = room.state.stage5Voting;
  if (!voting || voting.started !== true) {
    return buildStage5VoteCollectionRefusal('missing-active-voting-start');
  }

  if (!voting.sourceNomination || typeof voting.sourceNomination !== 'object') {
    return buildStage5VoteCollectionRefusal('missing-voting-source-nomination');
  }

  if (!Number.isInteger(voting.sourceNomination.nominatorSeat)) {
    return buildStage5VoteCollectionRefusal('invalid-voting-source-nominator-seat', {
      nominatorSeat: voting.sourceNomination.nominatorSeat ?? null
    });
  }

  if (!Number.isInteger(voting.sourceNomination.nomineeSeat)) {
    return buildStage5VoteCollectionRefusal('invalid-voting-source-nominee-seat', {
      nomineeSeat: voting.sourceNomination.nomineeSeat ?? null
    });
  }

  if (!Number.isInteger(voterSeat)) {
    return buildStage5VoteCollectionRefusal('invalid-voter-seat', {
      voterSeat: voterSeat ?? null
    });
  }

  if (typeof vote !== 'boolean') {
    return buildStage5VoteCollectionRefusal('invalid-vote-value', {
      vote: vote ?? null
    });
  }

  const requestedBy = room.storyteller === ws ? 'storyteller' : 'player';
  if (requestedBy === 'player' && currentSeat !== voterSeat) {
    return buildStage5VoteCollectionRefusal('player-seat-mismatch', {
      currentSeat: currentSeat ?? null,
      voterSeat
    });
  }

  if (
    requestedBy === 'player'
    && (!Number.isInteger(currentSeat) || room.clients?.get(voterSeat) !== ws)
  ) {
    return buildStage5VoteCollectionRefusal('unauthorized-player-vote', {
      currentSeat: currentSeat ?? null,
      voterSeat
    });
  }

  if (requestedBy !== 'storyteller' && requestedBy !== 'player') {
    return buildStage5VoteCollectionRefusal('unauthorized-vote-recorder');
  }

  if (!Array.isArray(room.state.players)) {
    return buildStage5VoteCollectionRefusal('invalid-player-list');
  }

  const voter = room.state.players.find((player) => player.seat === voterSeat);
  if (!voter) {
    return buildStage5VoteCollectionRefusal('unknown-voter-seat', {
      voterSeat
    });
  }

  const existingVotes = Array.isArray(voting.votes) ? voting.votes : [];
  if (existingVotes.some((entry) => entry?.voterSeat === voterSeat)) {
    return buildStage5VoteCollectionRefusal('vote-already-recorded', {
      voterSeat
    });
  }

  const recordedAt = new Date().toISOString();
  const previousStage5Voting = cloneForHistory(room.state.stage5Voting);
  const voteEntry = {
    voterSeat,
    vote,
    recordedAt,
    recordedBy: requestedBy
  };

  try {
    room.state.stage5Voting = {
      ...voting,
      votes: [
        ...existingVotes,
        voteEntry
      ]
    };

    return {
      type: 'stage5_vote_recorded',
      data: {
        status: 'server-vote-recorded',
        voteEntry,
        voterSeat,
        vote,
        recordedAt,
        recordedBy: requestedBy,
        mutationScope: 'room.state.stage5Voting.current-vote-collection-fields-only',
        readModel: 'room.state.stage5Voting.active-vote-collection-read-model-only',
        serverMutation: true,
        voteRecorded: true,
        voteCollectionOpened: true,
        voteCountingOpened: false,
        voteResolution: false,
        publicPromptAutomation: false,
        privatePromptAutomation: false,
        phaseMutation: false,
        roundMutation: false,
        playerStateMutation: false,
        legacyNightQueueMutation: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false,
        aiIntegration: false
      }
    };
  } catch (error) {
    room.state.stage5Voting = previousStage5Voting;

    return buildStage5VoteCollectionRefusal('stage5-vote-collection-store-failed', {
      rollbackApplied: true,
      message: error.message
    });
  }
}

function buildStage5VoteCountingRefusal(reason, details = {}) {
  return {
    type: 'stage5_vote_counting_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.stage5Voting.current-vote-counting-fields-only',
      readModel: 'room.state.stage5Voting.recorded-votes-read-model-only',
      serverMutation: false,
      voteCounted: false,
      voteCountingOpened: false,
      voteResolution: false,
      publicPromptAutomation: false,
      privatePromptAutomation: false,
      phaseMutation: false,
      roundMutation: false,
      playerStateMutation: false,
      legacyNightQueueMutation: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      aiIntegration: false,
      ...details
    }
  };
}

function countStage5Vote({ room, ws }) {
  if (!room) {
    return buildStage5VoteCountingRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage5VoteCountingRefusal('unauthorized-storyteller');
  }

  if (room.state.phase !== 'day') {
    return buildStage5VoteCountingRefusal('invalid-phase-for-vote-counting', {
      phase: room.state.phase ?? null
    });
  }

  if (room.state.round !== 1) {
    return buildStage5VoteCountingRefusal('invalid-round-for-vote-counting', {
      round: room.state.round ?? null
    });
  }

  const voting = room.state.stage5Voting;
  if (!voting || voting.started !== true) {
    return buildStage5VoteCountingRefusal('missing-active-voting-start');
  }

  if (!voting.sourceNomination || typeof voting.sourceNomination !== 'object') {
    return buildStage5VoteCountingRefusal('missing-voting-source-nomination');
  }

  if (!Number.isInteger(voting.sourceNomination.nominatorSeat)) {
    return buildStage5VoteCountingRefusal('invalid-voting-source-nominator-seat', {
      nominatorSeat: voting.sourceNomination.nominatorSeat ?? null
    });
  }

  if (!Number.isInteger(voting.sourceNomination.nomineeSeat)) {
    return buildStage5VoteCountingRefusal('invalid-voting-source-nominee-seat', {
      nomineeSeat: voting.sourceNomination.nomineeSeat ?? null
    });
  }

  if (!Array.isArray(voting.votes)) {
    return buildStage5VoteCountingRefusal('missing-recorded-votes');
  }

  const seenVoterSeats = new Set();
  for (const voteEntry of voting.votes) {
    if (!Number.isInteger(voteEntry?.voterSeat)) {
      return buildStage5VoteCountingRefusal('invalid-recorded-voter-seat', {
        voterSeat: voteEntry?.voterSeat ?? null
      });
    }

    if (typeof voteEntry.vote !== 'boolean') {
      return buildStage5VoteCountingRefusal('invalid-recorded-vote-value', {
        voterSeat: voteEntry.voterSeat,
        vote: voteEntry.vote ?? null
      });
    }

    if (seenVoterSeats.has(voteEntry.voterSeat)) {
      return buildStage5VoteCountingRefusal('duplicate-recorded-voter-seat', {
        voterSeat: voteEntry.voterSeat
      });
    }

    seenVoterSeats.add(voteEntry.voterSeat);
  }

  const countedAt = new Date().toISOString();
  const previousStage5Voting = cloneForHistory(room.state.stage5Voting);
  const yes = voting.votes.filter((voteEntry) => voteEntry.vote === true).length;
  const no = voting.votes.filter((voteEntry) => voteEntry.vote === false).length;
  const voteCount = {
    yes,
    no,
    total: voting.votes.length,
    countedAt,
    countedBy: 'storyteller',
    sourceVoteCount: voting.votes.length
  };

  try {
    room.state.stage5Voting = {
      ...voting,
      voteCount
    };

    return {
      type: 'stage5_vote_counted',
      data: {
        status: 'server-vote-counted',
        voteCount,
        countedAt,
        countedBy: 'storyteller',
        mutationScope: 'room.state.stage5Voting.current-vote-counting-fields-only',
        readModel: 'room.state.stage5Voting.recorded-votes-read-model-only',
        serverMutation: true,
        voteCounted: true,
        voteCountingOpened: true,
        voteResolution: false,
        publicPromptAutomation: false,
        privatePromptAutomation: false,
        phaseMutation: false,
        roundMutation: false,
        playerStateMutation: false,
        legacyNightQueueMutation: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false,
        aiIntegration: false
      }
    };
  } catch (error) {
    room.state.stage5Voting = previousStage5Voting;

    return buildStage5VoteCountingRefusal('stage5-vote-counting-store-failed', {
      rollbackApplied: true,
      message: error.message
    });
  }
}

function buildStage5VoteResolutionRefusal(reason, details = {}) {
  return {
    type: 'stage5_vote_resolution_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.stage5Voting.current-vote-resolution-fields-only',
      readModel: 'room.state.stage5Voting.counted-vote-read-model-only',
      serverMutation: false,
      voteResolved: false,
      voteResolution: false,
      deathExecution: false,
      publicPromptAutomation: false,
      privatePromptAutomation: false,
      phaseMutation: false,
      roundMutation: false,
      playerStateMutation: false,
      legacyNightQueueMutation: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      aiIntegration: false,
      ...details
    }
  };
}

function resolveStage5Vote({ room, ws }) {
  if (!room) {
    return buildStage5VoteResolutionRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage5VoteResolutionRefusal('unauthorized-storyteller');
  }

  if (room.state.phase !== 'day') {
    return buildStage5VoteResolutionRefusal('invalid-phase-for-vote-resolution', {
      phase: room.state.phase ?? null
    });
  }

  if (room.state.round !== 1) {
    return buildStage5VoteResolutionRefusal('invalid-round-for-vote-resolution', {
      round: room.state.round ?? null
    });
  }

  const voting = room.state.stage5Voting;
  if (!voting || voting.started !== true) {
    return buildStage5VoteResolutionRefusal('missing-active-voting-start');
  }

  if (!voting.sourceNomination || typeof voting.sourceNomination !== 'object') {
    return buildStage5VoteResolutionRefusal('missing-voting-source-nomination');
  }

  if (!Number.isInteger(voting.sourceNomination.nomineeSeat)) {
    return buildStage5VoteResolutionRefusal('invalid-voting-source-nominee-seat', {
      nomineeSeat: voting.sourceNomination.nomineeSeat ?? null
    });
  }

  const voteCount = voting.voteCount;
  if (!voteCount || typeof voteCount !== 'object') {
    return buildStage5VoteResolutionRefusal('missing-vote-count');
  }

  if (!Number.isInteger(voteCount.yes) || voteCount.yes < 0) {
    return buildStage5VoteResolutionRefusal('invalid-vote-count-yes', {
      yes: voteCount.yes ?? null
    });
  }

  if (!Number.isInteger(voteCount.no) || voteCount.no < 0) {
    return buildStage5VoteResolutionRefusal('invalid-vote-count-no', {
      no: voteCount.no ?? null
    });
  }

  if (!Number.isInteger(voteCount.total) || voteCount.total < 0) {
    return buildStage5VoteResolutionRefusal('invalid-vote-count-total', {
      total: voteCount.total ?? null
    });
  }

  if (voteCount.yes + voteCount.no !== voteCount.total) {
    return buildStage5VoteResolutionRefusal('inconsistent-vote-count-total', {
      yes: voteCount.yes,
      no: voteCount.no,
      total: voteCount.total
    });
  }

  const resolvedAt = new Date().toISOString();
  const previousStage5Voting = cloneForHistory(room.state.stage5Voting);
  const voteResolution = {
    resolved: true,
    resolvedAt,
    resolvedBy: 'storyteller',
    nomineeSeat: voting.sourceNomination.nomineeSeat,
    yesVotes: voteCount.yes,
    noVotes: voteCount.no,
    totalVotes: voteCount.total,
    passes: voteCount.yes > voteCount.no
  };

  try {
    room.state.stage5Voting = {
      ...voting,
      voteResolution
    };

    return {
      type: 'stage5_vote_resolved',
      data: {
        status: 'server-vote-resolved',
        voteResolution,
        resolvedAt,
        resolvedBy: 'storyteller',
        mutationScope: 'room.state.stage5Voting.current-vote-resolution-fields-only',
        readModel: 'room.state.stage5Voting.counted-vote-read-model-only',
        serverMutation: true,
        voteResolved: true,
        voteResolution: true,
        deathExecution: false,
        publicPromptAutomation: false,
        privatePromptAutomation: false,
        phaseMutation: false,
        roundMutation: false,
        playerStateMutation: false,
        legacyNightQueueMutation: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false,
        aiIntegration: false
      }
    };
  } catch (error) {
    room.state.stage5Voting = previousStage5Voting;

    return buildStage5VoteResolutionRefusal('stage5-vote-resolution-store-failed', {
      rollbackApplied: true,
      message: error.message
    });
  }
}

function buildStage5DeathExecutionRefusal(reason, details = {}) {
  return {
    type: 'stage5_vote_death_execution_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.players.vote-death-life-state-only',
      readModel: 'room.state.stage5Voting.vote-resolution-death-read-model-only',
      serverMutation: false,
      deathExecuted: false,
      deathExecution: false,
      publicPromptAutomation: false,
      privatePromptAutomation: false,
      phaseMutation: false,
      roundMutation: false,
      playerLifeStateMutation: false,
      playerRoleMutation: false,
      legacyNightQueueMutation: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      aiIntegration: false,
      ...details
    }
  };
}

function executeStage5VoteDeath({ room, ws }) {
  if (!room) {
    return buildStage5DeathExecutionRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage5DeathExecutionRefusal('unauthorized-storyteller');
  }

  if (room.state.phase !== 'day') {
    return buildStage5DeathExecutionRefusal('invalid-phase-for-death-execution', {
      phase: room.state.phase ?? null
    });
  }

  if (room.state.round !== 1) {
    return buildStage5DeathExecutionRefusal('invalid-round-for-death-execution', {
      round: room.state.round ?? null
    });
  }

  const voting = room.state.stage5Voting;
  if (!voting || voting.started !== true) {
    return buildStage5DeathExecutionRefusal('missing-active-voting-start');
  }

  if (!voting.sourceNomination || typeof voting.sourceNomination !== 'object') {
    return buildStage5DeathExecutionRefusal('missing-voting-source-nomination');
  }

  if (!Number.isInteger(voting.sourceNomination.nomineeSeat)) {
    return buildStage5DeathExecutionRefusal('invalid-voting-source-nominee-seat', {
      nomineeSeat: voting.sourceNomination.nomineeSeat ?? null
    });
  }

  const voteResolution = voting.voteResolution;
  if (!voteResolution || typeof voteResolution !== 'object') {
    return buildStage5DeathExecutionRefusal('missing-vote-resolution');
  }

  if (voteResolution.resolved !== true) {
    return buildStage5DeathExecutionRefusal('vote-resolution-not-accepted');
  }

  if (voteResolution.passes !== true) {
    return buildStage5DeathExecutionRefusal('vote-resolution-did-not-pass');
  }

  if (!Number.isInteger(voteResolution.nomineeSeat)) {
    return buildStage5DeathExecutionRefusal('invalid-vote-resolution-nominee-seat', {
      nomineeSeat: voteResolution.nomineeSeat ?? null
    });
  }

  if (voteResolution.nomineeSeat !== voting.sourceNomination.nomineeSeat) {
    return buildStage5DeathExecutionRefusal('vote-resolution-nominee-mismatch', {
      sourceNomineeSeat: voting.sourceNomination.nomineeSeat,
      resolutionNomineeSeat: voteResolution.nomineeSeat
    });
  }

  if (!Array.isArray(room.state.players)) {
    return buildStage5DeathExecutionRefusal('missing-player-list');
  }

  const nomineePlayer = room.state.players.find((player) => player?.seat === voteResolution.nomineeSeat);
  if (!nomineePlayer) {
    return buildStage5DeathExecutionRefusal('missing-nominee-player', {
      nomineeSeat: voteResolution.nomineeSeat
    });
  }

  if (nomineePlayer.alive !== true) {
    return buildStage5DeathExecutionRefusal('nominee-not-alive', {
      nomineeSeat: voteResolution.nomineeSeat,
      alive: nomineePlayer.alive ?? null
    });
  }

  const executedAt = new Date().toISOString();
  const previousPlayers = cloneForHistory(room.state.players);
  const previousStage5Voting = cloneForHistory(room.state.stage5Voting);
  const deathExecution = {
    executed: true,
    executedAt,
    executedBy: 'storyteller',
    nomineeSeat: voteResolution.nomineeSeat,
    sourceVoteResolution: cloneForHistory(voteResolution)
  };

  try {
    nomineePlayer.alive = false;
    room.state.stage5Voting = {
      ...voting,
      deathExecution
    };

    return {
      type: 'stage5_vote_death_executed',
      data: {
        status: 'server-vote-death-executed',
        deathExecution,
        executedAt,
        executedBy: 'storyteller',
        nomineeSeat: voteResolution.nomineeSeat,
        mutationScope: 'room.state.players.vote-death-life-state-only',
        readModel: 'room.state.stage5Voting.vote-resolution-death-read-model-only',
        serverMutation: true,
        deathExecuted: true,
        deathExecution: true,
        publicPromptAutomation: false,
        privatePromptAutomation: false,
        phaseMutation: false,
        roundMutation: false,
        playerLifeStateMutation: true,
        playerRoleMutation: false,
        legacyNightQueueMutation: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false,
        aiIntegration: false
      }
    };
  } catch (error) {
    room.state.players = previousPlayers;
    room.state.stage5Voting = previousStage5Voting;

    return buildStage5DeathExecutionRefusal('stage5-death-execution-store-failed', {
      rollbackApplied: true,
      message: error.message
    });
  }
}

function buildStage5PostDeathDayContinuationRefusal(reason, details = {}) {
  return {
    type: 'stage5_post_death_day_continuation_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.stage5DayContinuation.current-post-death-readiness-fields-only',
      readModel: 'room.state.stage5Voting.post-death-day-continuation-read-model-only',
      serverMutation: false,
      postDeathDayContinuation: false,
      nominationStartOpened: false,
      nominationRecordingOpened: false,
      votingRestartOpened: false,
      voteCountingOpened: false,
      voteResolutionOpened: false,
      deathExecutionOpened: false,
      publicPromptAutomation: false,
      privatePromptAutomation: false,
      phaseMutation: false,
      roundMutation: false,
      playerStateMutation: false,
      legacyNightQueueMutation: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      aiIntegration: false,
      ...details
    }
  };
}

function prepareStage5PostDeathDayContinuation({ room, ws }) {
  if (!room) {
    return buildStage5PostDeathDayContinuationRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage5PostDeathDayContinuationRefusal('unauthorized-storyteller');
  }

  if (room.state.phase !== 'day') {
    return buildStage5PostDeathDayContinuationRefusal('invalid-phase-for-post-death-continuation', {
      phase: room.state.phase ?? null
    });
  }

  if (room.state.round !== 1) {
    return buildStage5PostDeathDayContinuationRefusal('invalid-round-for-post-death-continuation', {
      round: room.state.round ?? null
    });
  }

  const voting = room.state.stage5Voting;
  if (!voting || typeof voting !== 'object') {
    return buildStage5PostDeathDayContinuationRefusal('missing-stage5-voting');
  }

  const deathExecution = voting.deathExecution;
  if (!deathExecution || typeof deathExecution !== 'object') {
    return buildStage5PostDeathDayContinuationRefusal('missing-death-execution');
  }

  if (deathExecution.executed !== true) {
    return buildStage5PostDeathDayContinuationRefusal('death-execution-not-accepted');
  }

  if (!Number.isInteger(deathExecution.nomineeSeat)) {
    return buildStage5PostDeathDayContinuationRefusal('invalid-death-execution-nominee-seat', {
      nomineeSeat: deathExecution.nomineeSeat ?? null
    });
  }

  if (!Array.isArray(room.state.players)) {
    return buildStage5PostDeathDayContinuationRefusal('missing-player-list');
  }

  const readyAt = new Date().toISOString();
  const previousStage5DayContinuation = cloneForHistory(room.state.stage5DayContinuation);
  const hadStage5DayContinuation = Object.prototype.hasOwnProperty.call(room.state, 'stage5DayContinuation');
  const dayContinuation = {
    ready: true,
    readyAt,
    readyBy: 'storyteller',
    sourceDeathExecution: cloneForHistory(deathExecution),
    nextAllowedAction: 'manual-storyteller-day-continuation'
  };

  try {
    room.state.stage5DayContinuation = dayContinuation;

    return {
      type: 'stage5_post_death_day_continuation_ready',
      data: {
        status: 'server-post-death-day-continuation-ready',
        dayContinuation,
        readyAt,
        readyBy: 'storyteller',
        sourceDeathExecution: cloneForHistory(deathExecution),
        nextAllowedAction: 'manual-storyteller-day-continuation',
        mutationScope: 'room.state.stage5DayContinuation.current-post-death-readiness-fields-only',
        readModel: 'room.state.stage5Voting.post-death-day-continuation-read-model-only',
        serverMutation: true,
        postDeathDayContinuation: true,
        nominationStartOpened: false,
        nominationRecordingOpened: false,
        votingRestartOpened: false,
        voteCountingOpened: false,
        voteResolutionOpened: false,
        deathExecutionOpened: false,
        publicPromptAutomation: false,
        privatePromptAutomation: false,
        phaseMutation: false,
        roundMutation: false,
        playerStateMutation: false,
        legacyNightQueueMutation: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false,
        aiIntegration: false
      }
    };
  } catch (error) {
    if (hadStage5DayContinuation) {
      room.state.stage5DayContinuation = previousStage5DayContinuation;
    } else {
      delete room.state.stage5DayContinuation;
    }

    return buildStage5PostDeathDayContinuationRefusal('stage5-post-death-continuation-store-failed', {
      rollbackApplied: true,
      message: error.message
    });
  }
}

function buildStage5PostDeathNextNominationRefusal(reason, details = {}) {
  return {
    type: 'stage5_post_death_next_nomination_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.stage5Nomination.current-post-death-next-readiness-fields-only',
      readModel: 'room.state.stage5DayContinuation.post-death-next-nomination-read-model-only',
      serverMutation: false,
      postDeathNextNomination: false,
      uiControlsOpened: false,
      nominationStartOpened: false,
      nominationRecordingOpened: false,
      votingRestartOpened: false,
      voteCountingOpened: false,
      voteResolutionOpened: false,
      deathExecutionOpened: false,
      publicPromptAutomation: false,
      privatePromptAutomation: false,
      phaseMutation: false,
      roundMutation: false,
      playerStateMutation: false,
      legacyNightQueueMutation: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      aiIntegration: false,
      ...details
    }
  };
}

function prepareStage5PostDeathNextNomination({ room, ws }) {
  if (!room) {
    return buildStage5PostDeathNextNominationRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage5PostDeathNextNominationRefusal('unauthorized-storyteller');
  }

  if (room.state.phase !== 'day') {
    return buildStage5PostDeathNextNominationRefusal('invalid-phase-for-post-death-next-nomination', {
      phase: room.state.phase ?? null
    });
  }

  if (room.state.round !== 1) {
    return buildStage5PostDeathNextNominationRefusal('invalid-round-for-post-death-next-nomination', {
      round: room.state.round ?? null
    });
  }

  const dayContinuation = room.state.stage5DayContinuation;
  if (!dayContinuation || typeof dayContinuation !== 'object') {
    return buildStage5PostDeathNextNominationRefusal('missing-post-death-day-continuation');
  }

  if (dayContinuation.ready !== true) {
    return buildStage5PostDeathNextNominationRefusal('post-death-day-continuation-not-ready');
  }

  if (dayContinuation.nextAllowedAction !== 'manual-storyteller-day-continuation') {
    return buildStage5PostDeathNextNominationRefusal('invalid-post-death-day-continuation-action', {
      nextAllowedAction: dayContinuation.nextAllowedAction ?? null
    });
  }

  const voting = room.state.stage5Voting;
  if (!voting || typeof voting !== 'object') {
    return buildStage5PostDeathNextNominationRefusal('missing-stage5-voting');
  }

  const deathExecution = voting.deathExecution;
  if (!deathExecution || typeof deathExecution !== 'object') {
    return buildStage5PostDeathNextNominationRefusal('missing-death-execution');
  }

  if (deathExecution.executed !== true) {
    return buildStage5PostDeathNextNominationRefusal('death-execution-not-accepted');
  }

  if (!Array.isArray(room.state.players)) {
    return buildStage5PostDeathNextNominationRefusal('missing-player-list');
  }

  const readyAt = new Date().toISOString();
  const previousStage5Nomination = cloneForHistory(room.state.stage5Nomination);
  const hadStage5Nomination = Object.prototype.hasOwnProperty.call(room.state, 'stage5Nomination');
  const baseStage5Nomination = (
    room.state.stage5Nomination
    && typeof room.state.stage5Nomination === 'object'
    && !Array.isArray(room.state.stage5Nomination)
  )
    ? room.state.stage5Nomination
    : {};
  const postDeathNextNominationReadiness = {
    postDeathNextNominationReady: true,
    postDeathNextNominationReadyAt: readyAt,
    postDeathNextNominationReadyBy: 'storyteller',
    sourceDayContinuation: cloneForHistory(dayContinuation),
    sourceDeathExecution: cloneForHistory(deathExecution),
    nextAllowedAction: 'manual-storyteller-post-death-next-nomination'
  };

  try {
    room.state.stage5Nomination = {
      ...baseStage5Nomination,
      ...postDeathNextNominationReadiness
    };

    return {
      type: 'stage5_post_death_next_nomination_ready',
      data: {
        status: 'server-post-death-next-nomination-ready',
        postDeathNextNominationReadiness,
        readyAt,
        readyBy: 'storyteller',
        sourceDayContinuation: cloneForHistory(dayContinuation),
        sourceDeathExecution: cloneForHistory(deathExecution),
        nextAllowedAction: 'manual-storyteller-post-death-next-nomination',
        mutationScope: 'room.state.stage5Nomination.current-post-death-next-readiness-fields-only',
        readModel: 'room.state.stage5DayContinuation.post-death-next-nomination-read-model-only',
        serverMutation: true,
        postDeathNextNomination: true,
        uiControlsOpened: false,
        nominationStartOpened: false,
        nominationRecordingOpened: false,
        votingRestartOpened: false,
        voteCountingOpened: false,
        voteResolutionOpened: false,
        deathExecutionOpened: false,
        publicPromptAutomation: false,
        privatePromptAutomation: false,
        phaseMutation: false,
        roundMutation: false,
        playerStateMutation: false,
        legacyNightQueueMutation: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false,
        aiIntegration: false
      }
    };
  } catch (error) {
    if (hadStage5Nomination) {
      room.state.stage5Nomination = previousStage5Nomination;
    } else {
      delete room.state.stage5Nomination;
    }

    return buildStage5PostDeathNextNominationRefusal('stage5-post-death-next-nomination-store-failed', {
      rollbackApplied: true,
      message: error.message
    });
  }
}

function buildStage5PostDeathNextNominationRecordingRefusal(reason, details = {}) {
  return {
    type: 'stage5_post_death_next_nomination_recording_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.stage5Nomination.current-post-death-next-recording-fields-only',
      readModel: 'room.state.stage5Nomination.post-death-next-recording-eligibility-read-model-only',
      serverMutation: false,
      postDeathNextNominationRecorded: false,
      votingRestartOpened: false,
      voteCountingOpened: false,
      voteResolutionOpened: false,
      deathExecutionOpened: false,
      publicPromptAutomation: false,
      privatePromptAutomation: false,
      phaseMutation: false,
      roundMutation: false,
      playerStateMutation: false,
      legacyNightQueueMutation: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      aiIntegration: false,
      ...details
    }
  };
}

function recordStage5PostDeathNextNomination({ room, ws, nominatorSeat, nomineeSeat }) {
  if (!room) {
    return buildStage5PostDeathNextNominationRecordingRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage5PostDeathNextNominationRecordingRefusal('unauthorized-storyteller');
  }

  if (room.state.phase !== 'day') {
    return buildStage5PostDeathNextNominationRecordingRefusal('invalid-phase-for-post-death-next-nomination-recording', {
      phase: room.state.phase ?? null
    });
  }

  if (room.state.round !== 1) {
    return buildStage5PostDeathNextNominationRecordingRefusal('invalid-round-for-post-death-next-nomination-recording', {
      round: room.state.round ?? null
    });
  }

  const stage5Nomination = room.state.stage5Nomination;
  if (!stage5Nomination || typeof stage5Nomination !== 'object') {
    return buildStage5PostDeathNextNominationRecordingRefusal('missing-post-death-next-nomination-readiness');
  }

  if (stage5Nomination.postDeathNextNominationReady !== true) {
    return buildStage5PostDeathNextNominationRecordingRefusal('post-death-next-nomination-not-ready');
  }

  if (stage5Nomination.nextAllowedAction !== 'manual-storyteller-post-death-next-nomination') {
    return buildStage5PostDeathNextNominationRecordingRefusal('invalid-post-death-next-nomination-action', {
      nextAllowedAction: stage5Nomination.nextAllowedAction ?? null
    });
  }

  if (!stage5Nomination.sourceDayContinuation || typeof stage5Nomination.sourceDayContinuation !== 'object') {
    return buildStage5PostDeathNextNominationRecordingRefusal('missing-source-day-continuation');
  }

  if (!stage5Nomination.sourceDeathExecution || typeof stage5Nomination.sourceDeathExecution !== 'object') {
    return buildStage5PostDeathNextNominationRecordingRefusal('missing-source-death-execution');
  }

  if (!Array.isArray(room.state.players)) {
    return buildStage5PostDeathNextNominationRecordingRefusal('missing-player-list');
  }

  const normalizedNominatorSeat = Number(nominatorSeat);
  const normalizedNomineeSeat = Number(nomineeSeat);

  if (!Number.isInteger(normalizedNominatorSeat)) {
    return buildStage5PostDeathNextNominationRecordingRefusal('invalid-nominator-seat', {
      nominatorSeat: nominatorSeat ?? null
    });
  }

  if (!Number.isInteger(normalizedNomineeSeat)) {
    return buildStage5PostDeathNextNominationRecordingRefusal('invalid-nominee-seat', {
      nomineeSeat: nomineeSeat ?? null
    });
  }

  if (normalizedNominatorSeat === normalizedNomineeSeat) {
    return buildStage5PostDeathNextNominationRecordingRefusal('nominator-and-nominee-match', {
      nominatorSeat: normalizedNominatorSeat,
      nomineeSeat: normalizedNomineeSeat
    });
  }

  const aliveNominator = room.state.players.find(
    (player) => player.seat === normalizedNominatorSeat && player.alive !== false
  );
  if (!aliveNominator) {
    return buildStage5PostDeathNextNominationRecordingRefusal('nominator-seat-not-alive', {
      nominatorSeat: normalizedNominatorSeat
    });
  }

  const aliveNominee = room.state.players.find(
    (player) => player.seat === normalizedNomineeSeat && player.alive !== false
  );
  if (!aliveNominee) {
    return buildStage5PostDeathNextNominationRecordingRefusal('nominee-seat-not-alive', {
      nomineeSeat: normalizedNomineeSeat
    });
  }

  const recordedAt = new Date().toISOString();
  const previousStage5Nomination = cloneForHistory(room.state.stage5Nomination);
  const postDeathNextNomination = {
    nominatorSeat: normalizedNominatorSeat,
    nomineeSeat: normalizedNomineeSeat,
    recordedAt,
    sourceReadinessAt: stage5Nomination.postDeathNextNominationReadyAt ?? null,
    requestedBy: 'storyteller'
  };

  try {
    room.state.stage5Nomination = {
      ...stage5Nomination,
      postDeathNextNominationRecorded: true,
      postDeathNextNominationRecordedAt: recordedAt,
      postDeathNextNominationRecordedBy: 'storyteller',
      postDeathNextNomination,
      nextAllowedAction: 'manual-storyteller-post-death-voting-restart'
    };

    return {
      type: 'stage5_post_death_next_nomination_recorded',
      data: {
        status: 'server-post-death-next-nomination-recorded',
        postDeathNextNomination,
        nominatorSeat: normalizedNominatorSeat,
        nomineeSeat: normalizedNomineeSeat,
        recordedAt,
        recordedBy: 'storyteller',
        nextAllowedAction: 'manual-storyteller-post-death-voting-restart',
        mutationScope: 'room.state.stage5Nomination.current-post-death-next-recording-fields-only',
        readModel: 'room.state.stage5Nomination.post-death-next-recording-eligibility-read-model-only',
        serverMutation: true,
        postDeathNextNominationRecorded: true,
        votingRestartOpened: false,
        voteCountingOpened: false,
        voteResolutionOpened: false,
        deathExecutionOpened: false,
        publicPromptAutomation: false,
        privatePromptAutomation: false,
        phaseMutation: false,
        roundMutation: false,
        playerStateMutation: false,
        legacyNightQueueMutation: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false,
        aiIntegration: false
      }
    };
  } catch (error) {
    room.state.stage5Nomination = previousStage5Nomination;

    return buildStage5PostDeathNextNominationRecordingRefusal('stage5-post-death-next-nomination-recording-store-failed', {
      rollbackApplied: true,
      message: error.message
    });
  }
}

function buildStage5PostDeathVotingRestartRefusal(reason, details = {}) {
  return {
    type: 'stage5_post_death_voting_restart_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.stage5Voting.current-post-death-voting-restart-fields-only',
      readModel: 'room.state.stage5Nomination.post-death-voting-restart-read-model-only',
      serverMutation: false,
      postDeathVotingRestarted: false,
      voteCollectionOpened: false,
      voteCountingOpened: false,
      voteResolutionOpened: false,
      deathExecutionOpened: false,
      publicPromptAutomation: false,
      privatePromptAutomation: false,
      phaseMutation: false,
      roundMutation: false,
      playerStateMutation: false,
      legacyNightQueueMutation: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      aiIntegration: false,
      ...details
    }
  };
}

function restartStage5PostDeathVoting({ room, ws }) {
  if (!room) {
    return buildStage5PostDeathVotingRestartRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage5PostDeathVotingRestartRefusal('unauthorized-storyteller');
  }

  if (room.state.phase !== 'day') {
    return buildStage5PostDeathVotingRestartRefusal('invalid-phase-for-post-death-voting-restart', {
      phase: room.state.phase ?? null
    });
  }

  if (room.state.round !== 1) {
    return buildStage5PostDeathVotingRestartRefusal('invalid-round-for-post-death-voting-restart', {
      round: room.state.round ?? null
    });
  }

  const stage5Nomination = room.state.stage5Nomination;
  if (!stage5Nomination || typeof stage5Nomination !== 'object') {
    return buildStage5PostDeathVotingRestartRefusal('missing-stage5-nomination');
  }

  if (stage5Nomination.postDeathNextNominationRecorded !== true) {
    return buildStage5PostDeathVotingRestartRefusal('missing-post-death-next-nomination-recording');
  }

  if (stage5Nomination.nextAllowedAction !== 'manual-storyteller-post-death-voting-restart') {
    return buildStage5PostDeathVotingRestartRefusal('invalid-post-death-voting-restart-action', {
      nextAllowedAction: stage5Nomination.nextAllowedAction ?? null
    });
  }

  const postDeathNextNomination = stage5Nomination.postDeathNextNomination;
  if (!postDeathNextNomination || typeof postDeathNextNomination !== 'object') {
    return buildStage5PostDeathVotingRestartRefusal('missing-post-death-next-nomination');
  }

  if (!Number.isInteger(postDeathNextNomination.nominatorSeat)) {
    return buildStage5PostDeathVotingRestartRefusal('invalid-post-death-nominator-seat', {
      nominatorSeat: postDeathNextNomination.nominatorSeat ?? null
    });
  }

  if (!Number.isInteger(postDeathNextNomination.nomineeSeat)) {
    return buildStage5PostDeathVotingRestartRefusal('invalid-post-death-nominee-seat', {
      nomineeSeat: postDeathNextNomination.nomineeSeat ?? null
    });
  }

  if (postDeathNextNomination.nominatorSeat === postDeathNextNomination.nomineeSeat) {
    return buildStage5PostDeathVotingRestartRefusal('post-death-next-nomination-seats-match', {
      nominatorSeat: postDeathNextNomination.nominatorSeat,
      nomineeSeat: postDeathNextNomination.nomineeSeat
    });
  }

  if (!stage5Nomination.sourceDeathExecution || typeof stage5Nomination.sourceDeathExecution !== 'object') {
    return buildStage5PostDeathVotingRestartRefusal('missing-source-death-execution');
  }

  const stage5Voting = room.state.stage5Voting;
  if (!stage5Voting || typeof stage5Voting !== 'object') {
    return buildStage5PostDeathVotingRestartRefusal('missing-stage5-voting');
  }

  const previousDeathExecution = stage5Voting.deathExecution;
  if (!previousDeathExecution || typeof previousDeathExecution !== 'object') {
    return buildStage5PostDeathVotingRestartRefusal('missing-previous-death-execution');
  }

  if (previousDeathExecution.executed !== true) {
    return buildStage5PostDeathVotingRestartRefusal('previous-death-execution-not-accepted');
  }

  if (!Array.isArray(room.state.players)) {
    return buildStage5PostDeathVotingRestartRefusal('missing-player-list');
  }

  const aliveNominator = room.state.players.find(
    (player) => player.seat === postDeathNextNomination.nominatorSeat && player.alive !== false
  );
  if (!aliveNominator) {
    return buildStage5PostDeathVotingRestartRefusal('post-death-nominator-seat-not-alive', {
      nominatorSeat: postDeathNextNomination.nominatorSeat
    });
  }

  const aliveNominee = room.state.players.find(
    (player) => player.seat === postDeathNextNomination.nomineeSeat && player.alive !== false
  );
  if (!aliveNominee) {
    return buildStage5PostDeathVotingRestartRefusal('post-death-nominee-seat-not-alive', {
      nomineeSeat: postDeathNextNomination.nomineeSeat
    });
  }

  if (stage5Voting.postDeathVotingRestarted === true) {
    return buildStage5PostDeathVotingRestartRefusal('post-death-voting-already-restarted', {
      postDeathVotingRestartedAt: stage5Voting.postDeathVotingRestartedAt ?? null
    });
  }

  const restartedAt = new Date().toISOString();
  const previousStage5Voting = cloneForHistory(room.state.stage5Voting);
  const sourcePostDeathNextNomination = cloneForHistory(postDeathNextNomination);
  const sourcePreviousDeathExecution = cloneForHistory(previousDeathExecution);
  const postDeathVotingRound = Number.isInteger(stage5Voting.postDeathVotingRound)
    ? stage5Voting.postDeathVotingRound + 1
    : 1;

  try {
    room.state.stage5Voting = {
      ...stage5Voting,
      postDeathVotingRestarted: true,
      postDeathVotingRestartedAt: restartedAt,
      postDeathVotingRestartedBy: 'storyteller',
      postDeathVotingRound,
      sourcePostDeathNextNomination,
      sourcePreviousDeathExecution,
      nextAllowedAction: 'manual-storyteller-post-death-vote-collection',
      voteCollectionOpened: false
    };

    return {
      type: 'stage5_post_death_voting_restarted',
      data: {
        status: 'server-post-death-voting-restarted',
        restartedAt,
        restartedBy: 'storyteller',
        postDeathVotingRound,
        sourcePostDeathNextNomination,
        sourcePreviousDeathExecution,
        nextAllowedAction: 'manual-storyteller-post-death-vote-collection',
        mutationScope: 'room.state.stage5Voting.current-post-death-voting-restart-fields-only',
        readModel: 'room.state.stage5Nomination.post-death-voting-restart-read-model-only',
        serverMutation: true,
        postDeathVotingRestarted: true,
        voteCollectionOpened: false,
        voteCountingOpened: false,
        voteResolutionOpened: false,
        deathExecutionOpened: false,
        publicPromptAutomation: false,
        privatePromptAutomation: false,
        phaseMutation: false,
        roundMutation: false,
        playerStateMutation: false,
        legacyNightQueueMutation: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false,
        aiIntegration: false
      }
    };
  } catch (error) {
    room.state.stage5Voting = previousStage5Voting;

    return buildStage5PostDeathVotingRestartRefusal('stage5-post-death-voting-restart-store-failed', {
      rollbackApplied: true,
      message: error.message
    });
  }
}

function buildStage5PostDeathVoteCollectionRefusal(reason, details = {}) {
  return {
    type: 'stage5_post_death_vote_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.stage5Voting.current-post-death-vote-collection-fields-only',
      readModel: 'room.state.stage5Voting.post-death-active-vote-collection-read-model-only',
      serverMutation: false,
      postDeathVoteRecorded: false,
      postDeathVoteCollectionOpened: false,
      voteCountingOpened: false,
      voteResolutionOpened: false,
      deathExecutionOpened: false,
      publicPromptAutomation: false,
      privatePromptAutomation: false,
      phaseMutation: false,
      roundMutation: false,
      playerStateMutation: false,
      legacyNightQueueMutation: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      aiIntegration: false,
      ...details
    }
  };
}

function recordStage5PostDeathVote({ room, ws, currentSeat, voterSeat, vote }) {
  if (!room) {
    return buildStage5PostDeathVoteCollectionRefusal('missing-room');
  }

  if (room.state.phase !== 'day') {
    return buildStage5PostDeathVoteCollectionRefusal('invalid-phase-for-post-death-vote-collection', {
      phase: room.state.phase ?? null
    });
  }

  if (room.state.round !== 1) {
    return buildStage5PostDeathVoteCollectionRefusal('invalid-round-for-post-death-vote-collection', {
      round: room.state.round ?? null
    });
  }

  const stage5Voting = room.state.stage5Voting;
  if (!stage5Voting || typeof stage5Voting !== 'object') {
    return buildStage5PostDeathVoteCollectionRefusal('missing-stage5-voting');
  }

  if (stage5Voting.postDeathVotingRestarted !== true) {
    return buildStage5PostDeathVoteCollectionRefusal('missing-post-death-voting-restart');
  }

  if (stage5Voting.nextAllowedAction !== 'manual-storyteller-post-death-vote-collection') {
    return buildStage5PostDeathVoteCollectionRefusal('invalid-post-death-vote-collection-action', {
      nextAllowedAction: stage5Voting.nextAllowedAction ?? null
    });
  }

  const sourcePostDeathNextNomination = stage5Voting.sourcePostDeathNextNomination;
  if (!sourcePostDeathNextNomination || typeof sourcePostDeathNextNomination !== 'object') {
    return buildStage5PostDeathVoteCollectionRefusal('missing-source-post-death-next-nomination');
  }

  if (!Number.isInteger(sourcePostDeathNextNomination.nominatorSeat)) {
    return buildStage5PostDeathVoteCollectionRefusal('invalid-source-post-death-nominator-seat', {
      nominatorSeat: sourcePostDeathNextNomination.nominatorSeat ?? null
    });
  }

  if (!Number.isInteger(sourcePostDeathNextNomination.nomineeSeat)) {
    return buildStage5PostDeathVoteCollectionRefusal('invalid-source-post-death-nominee-seat', {
      nomineeSeat: sourcePostDeathNextNomination.nomineeSeat ?? null
    });
  }

  if (sourcePostDeathNextNomination.nominatorSeat === sourcePostDeathNextNomination.nomineeSeat) {
    return buildStage5PostDeathVoteCollectionRefusal('source-post-death-nomination-seats-match', {
      nominatorSeat: sourcePostDeathNextNomination.nominatorSeat,
      nomineeSeat: sourcePostDeathNextNomination.nomineeSeat
    });
  }

  const sourcePreviousDeathExecution = stage5Voting.sourcePreviousDeathExecution;
  if (!sourcePreviousDeathExecution || typeof sourcePreviousDeathExecution !== 'object') {
    return buildStage5PostDeathVoteCollectionRefusal('missing-source-previous-death-execution');
  }

  if (sourcePreviousDeathExecution.executed !== true) {
    return buildStage5PostDeathVoteCollectionRefusal('source-previous-death-execution-not-accepted');
  }

  if (!Number.isInteger(stage5Voting.postDeathVotingRound)) {
    return buildStage5PostDeathVoteCollectionRefusal('invalid-post-death-voting-round', {
      postDeathVotingRound: stage5Voting.postDeathVotingRound ?? null
    });
  }

  if (!Number.isInteger(voterSeat)) {
    return buildStage5PostDeathVoteCollectionRefusal('invalid-post-death-voter-seat', {
      voterSeat: voterSeat ?? null
    });
  }

  if (typeof vote !== 'boolean') {
    return buildStage5PostDeathVoteCollectionRefusal('invalid-post-death-vote-value', {
      vote: vote ?? null
    });
  }

  if (room.storyteller === ws) {
    return buildStage5PostDeathVoteCollectionRefusal('storyteller-cannot-cast-post-death-vote');
  }

  if (currentSeat !== voterSeat) {
    return buildStage5PostDeathVoteCollectionRefusal('post-death-player-seat-mismatch', {
      currentSeat: currentSeat ?? null,
      voterSeat
    });
  }

  if (!Number.isInteger(currentSeat) || room.clients?.get(voterSeat) !== ws) {
    return buildStage5PostDeathVoteCollectionRefusal('unauthorized-post-death-player-vote', {
      currentSeat: currentSeat ?? null,
      voterSeat
    });
  }

  if (!Array.isArray(room.state.players)) {
    return buildStage5PostDeathVoteCollectionRefusal('invalid-player-list');
  }

  const voter = room.state.players.find((player) => player.seat === voterSeat);
  if (!voter) {
    return buildStage5PostDeathVoteCollectionRefusal('unknown-post-death-voter-seat', {
      voterSeat
    });
  }

  const existingPostDeathVotes = Array.isArray(stage5Voting.postDeathVotes)
    ? stage5Voting.postDeathVotes
    : [];
  if (
    existingPostDeathVotes.some((entry) => (
      entry?.voterSeat === voterSeat
      && entry?.sourcePostDeathVotingRound === stage5Voting.postDeathVotingRound
    ))
  ) {
    return buildStage5PostDeathVoteCollectionRefusal('post-death-vote-already-recorded', {
      voterSeat,
      sourcePostDeathVotingRound: stage5Voting.postDeathVotingRound
    });
  }

  const recordedAt = new Date().toISOString();
  const previousStage5Voting = cloneForHistory(room.state.stage5Voting);
  const postDeathVoteEntry = {
    voterSeat,
    vote,
    recordedAt,
    recordedBy: 'player',
    sourcePostDeathVotingRound: stage5Voting.postDeathVotingRound
  };

  try {
    room.state.stage5Voting = {
      ...stage5Voting,
      postDeathVoteCollectionOpened: true,
      postDeathVotes: [
        ...existingPostDeathVotes,
        postDeathVoteEntry
      ],
      postDeathVoteCollectionUpdatedAt: recordedAt,
      nextAllowedAction: 'manual-storyteller-post-death-vote-collection'
    };

    return {
      type: 'stage5_post_death_vote_recorded',
      data: {
        status: 'server-post-death-vote-recorded',
        postDeathVoteEntry,
        voterSeat,
        vote,
        recordedAt,
        recordedBy: 'player',
        sourcePostDeathVotingRound: stage5Voting.postDeathVotingRound,
        mutationScope: 'room.state.stage5Voting.current-post-death-vote-collection-fields-only',
        readModel: 'room.state.stage5Voting.post-death-active-vote-collection-read-model-only',
        serverMutation: true,
        postDeathVoteRecorded: true,
        postDeathVoteCollectionOpened: true,
        voteCountingOpened: false,
        voteResolutionOpened: false,
        deathExecutionOpened: false,
        publicPromptAutomation: false,
        privatePromptAutomation: false,
        phaseMutation: false,
        roundMutation: false,
        playerStateMutation: false,
        legacyNightQueueMutation: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false,
        aiIntegration: false
      }
    };
  } catch (error) {
    room.state.stage5Voting = previousStage5Voting;

    return buildStage5PostDeathVoteCollectionRefusal('stage5-post-death-vote-collection-store-failed', {
      rollbackApplied: true,
      message: error.message
    });
  }
}

function buildStage5PostDeathVoteCountingRefusal(reason, details = {}) {
  return {
    type: 'stage5_post_death_vote_counting_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.stage5Voting.current-post-death-vote-counting-fields-only',
      readModel: 'room.state.stage5Voting.recorded-post-death-votes-read-model-only',
      serverMutation: false,
      postDeathVoteCounted: false,
      voteResolutionOpened: false,
      deathExecutionOpened: false,
      publicPromptAutomation: false,
      privatePromptAutomation: false,
      phaseMutation: false,
      roundMutation: false,
      playerStateMutation: false,
      legacyNightQueueMutation: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      aiIntegration: false,
      ...details
    }
  };
}

function countStage5PostDeathVote({ room, ws }) {
  if (!room) {
    return buildStage5PostDeathVoteCountingRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage5PostDeathVoteCountingRefusal('unauthorized-storyteller');
  }

  if (room.state.phase !== 'day') {
    return buildStage5PostDeathVoteCountingRefusal('invalid-phase-for-post-death-vote-counting', {
      phase: room.state.phase ?? null
    });
  }

  if (room.state.round !== 1) {
    return buildStage5PostDeathVoteCountingRefusal('invalid-round-for-post-death-vote-counting', {
      round: room.state.round ?? null
    });
  }

  const stage5Voting = room.state.stage5Voting;
  if (!stage5Voting || typeof stage5Voting !== 'object') {
    return buildStage5PostDeathVoteCountingRefusal('missing-stage5-voting');
  }

  if (stage5Voting.postDeathVotingRestarted !== true) {
    return buildStage5PostDeathVoteCountingRefusal('missing-post-death-voting-restart');
  }

  if (stage5Voting.nextAllowedAction !== 'manual-storyteller-post-death-vote-collection') {
    return buildStage5PostDeathVoteCountingRefusal('invalid-post-death-vote-counting-action', {
      nextAllowedAction: stage5Voting.nextAllowedAction ?? null
    });
  }

  const sourcePostDeathNextNomination = stage5Voting.sourcePostDeathNextNomination;
  if (!sourcePostDeathNextNomination || typeof sourcePostDeathNextNomination !== 'object') {
    return buildStage5PostDeathVoteCountingRefusal('missing-source-post-death-next-nomination');
  }

  if (!Number.isInteger(sourcePostDeathNextNomination.nominatorSeat)) {
    return buildStage5PostDeathVoteCountingRefusal('invalid-source-post-death-nominator-seat', {
      nominatorSeat: sourcePostDeathNextNomination.nominatorSeat ?? null
    });
  }

  if (!Number.isInteger(sourcePostDeathNextNomination.nomineeSeat)) {
    return buildStage5PostDeathVoteCountingRefusal('invalid-source-post-death-nominee-seat', {
      nomineeSeat: sourcePostDeathNextNomination.nomineeSeat ?? null
    });
  }

  if (!Number.isInteger(stage5Voting.postDeathVotingRound)) {
    return buildStage5PostDeathVoteCountingRefusal('invalid-post-death-voting-round', {
      postDeathVotingRound: stage5Voting.postDeathVotingRound ?? null
    });
  }

  if (!Array.isArray(stage5Voting.postDeathVotes)) {
    return buildStage5PostDeathVoteCountingRefusal('missing-post-death-votes');
  }

  const currentPostDeathVotes = stage5Voting.postDeathVotes.filter((voteEntry) => (
    voteEntry?.sourcePostDeathVotingRound === stage5Voting.postDeathVotingRound
  ));
  const seenPostDeathVoterSeats = new Set();
  for (const voteEntry of currentPostDeathVotes) {
    if (!Number.isInteger(voteEntry?.voterSeat)) {
      return buildStage5PostDeathVoteCountingRefusal('invalid-post-death-recorded-voter-seat', {
        voterSeat: voteEntry?.voterSeat ?? null
      });
    }

    if (typeof voteEntry.vote !== 'boolean') {
      return buildStage5PostDeathVoteCountingRefusal('invalid-post-death-recorded-vote-value', {
        voterSeat: voteEntry.voterSeat,
        vote: voteEntry.vote ?? null
      });
    }

    if (seenPostDeathVoterSeats.has(voteEntry.voterSeat)) {
      return buildStage5PostDeathVoteCountingRefusal('duplicate-post-death-recorded-voter-seat', {
        voterSeat: voteEntry.voterSeat,
        sourcePostDeathVotingRound: stage5Voting.postDeathVotingRound
      });
    }

    seenPostDeathVoterSeats.add(voteEntry.voterSeat);
  }

  const countedAt = new Date().toISOString();
  const previousStage5Voting = cloneForHistory(room.state.stage5Voting);
  const yes = currentPostDeathVotes.filter((voteEntry) => voteEntry.vote === true).length;
  const no = currentPostDeathVotes.filter((voteEntry) => voteEntry.vote === false).length;
  const postDeathVoteCount = {
    yes,
    no,
    total: currentPostDeathVotes.length,
    countedAt,
    countedBy: 'storyteller',
    sourcePostDeathVotingRound: stage5Voting.postDeathVotingRound,
    sourcePostDeathVoteCount: currentPostDeathVotes.length
  };

  try {
    room.state.stage5Voting = {
      ...stage5Voting,
      postDeathVoteCount
    };

    return {
      type: 'stage5_post_death_vote_counted',
      data: {
        status: 'server-post-death-vote-counted',
        postDeathVoteCount,
        countedAt,
        countedBy: 'storyteller',
        sourcePostDeathVotingRound: stage5Voting.postDeathVotingRound,
        mutationScope: 'room.state.stage5Voting.current-post-death-vote-counting-fields-only',
        readModel: 'room.state.stage5Voting.recorded-post-death-votes-read-model-only',
        serverMutation: true,
        postDeathVoteCounted: true,
        voteResolutionOpened: false,
        deathExecutionOpened: false,
        publicPromptAutomation: false,
        privatePromptAutomation: false,
        phaseMutation: false,
        roundMutation: false,
        playerStateMutation: false,
        legacyNightQueueMutation: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false,
        aiIntegration: false
      }
    };
  } catch (error) {
    room.state.stage5Voting = previousStage5Voting;

    return buildStage5PostDeathVoteCountingRefusal('stage5-post-death-vote-counting-store-failed', {
      rollbackApplied: true,
      message: error.message
    });
  }
}

function buildStage5PostDeathVoteResolutionRefusal(reason, details = {}) {
  return {
    type: 'stage5_post_death_vote_resolution_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.stage5Voting.current-post-death-vote-resolution-fields-only',
      readModel: 'room.state.stage5Voting.counted-post-death-vote-read-model-only',
      serverMutation: false,
      postDeathVoteResolved: false,
      postDeathVoteResolution: false,
      deathExecutionOpened: false,
      publicPromptAutomation: false,
      privatePromptAutomation: false,
      phaseMutation: false,
      roundMutation: false,
      playerStateMutation: false,
      legacyNightQueueMutation: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      aiIntegration: false,
      ...details
    }
  };
}

function resolveStage5PostDeathVote({ room, ws }) {
  if (!room) {
    return buildStage5PostDeathVoteResolutionRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage5PostDeathVoteResolutionRefusal('unauthorized-storyteller');
  }

  if (room.state.phase !== 'day') {
    return buildStage5PostDeathVoteResolutionRefusal('invalid-phase-for-post-death-vote-resolution', {
      phase: room.state.phase ?? null
    });
  }

  if (room.state.round !== 1) {
    return buildStage5PostDeathVoteResolutionRefusal('invalid-round-for-post-death-vote-resolution', {
      round: room.state.round ?? null
    });
  }

  const stage5Voting = room.state.stage5Voting;
  if (!stage5Voting || typeof stage5Voting !== 'object') {
    return buildStage5PostDeathVoteResolutionRefusal('missing-stage5-voting');
  }

  if (stage5Voting.postDeathVotingRestarted !== true) {
    return buildStage5PostDeathVoteResolutionRefusal('missing-post-death-voting-restart');
  }

  const sourcePostDeathNextNomination = stage5Voting.sourcePostDeathNextNomination;
  if (!sourcePostDeathNextNomination || typeof sourcePostDeathNextNomination !== 'object') {
    return buildStage5PostDeathVoteResolutionRefusal('missing-source-post-death-next-nomination');
  }

  if (!Number.isInteger(sourcePostDeathNextNomination.nomineeSeat)) {
    return buildStage5PostDeathVoteResolutionRefusal('invalid-source-post-death-nominee-seat', {
      nomineeSeat: sourcePostDeathNextNomination.nomineeSeat ?? null
    });
  }

  if (!Number.isInteger(stage5Voting.postDeathVotingRound)) {
    return buildStage5PostDeathVoteResolutionRefusal('invalid-post-death-voting-round', {
      postDeathVotingRound: stage5Voting.postDeathVotingRound ?? null
    });
  }

  const postDeathVoteCount = stage5Voting.postDeathVoteCount;
  if (!postDeathVoteCount || typeof postDeathVoteCount !== 'object') {
    return buildStage5PostDeathVoteResolutionRefusal('missing-post-death-vote-count');
  }

  if (!Number.isInteger(postDeathVoteCount.yes) || postDeathVoteCount.yes < 0) {
    return buildStage5PostDeathVoteResolutionRefusal('invalid-post-death-vote-count-yes', {
      yes: postDeathVoteCount.yes ?? null
    });
  }

  if (!Number.isInteger(postDeathVoteCount.no) || postDeathVoteCount.no < 0) {
    return buildStage5PostDeathVoteResolutionRefusal('invalid-post-death-vote-count-no', {
      no: postDeathVoteCount.no ?? null
    });
  }

  if (!Number.isInteger(postDeathVoteCount.total) || postDeathVoteCount.total < 0) {
    return buildStage5PostDeathVoteResolutionRefusal('invalid-post-death-vote-count-total', {
      total: postDeathVoteCount.total ?? null
    });
  }

  if (postDeathVoteCount.yes + postDeathVoteCount.no !== postDeathVoteCount.total) {
    return buildStage5PostDeathVoteResolutionRefusal('inconsistent-post-death-vote-count-total', {
      yes: postDeathVoteCount.yes,
      no: postDeathVoteCount.no,
      total: postDeathVoteCount.total
    });
  }

  if (postDeathVoteCount.sourcePostDeathVotingRound !== stage5Voting.postDeathVotingRound) {
    return buildStage5PostDeathVoteResolutionRefusal('stale-post-death-vote-count-round', {
      sourcePostDeathVotingRound: postDeathVoteCount.sourcePostDeathVotingRound ?? null,
      postDeathVotingRound: stage5Voting.postDeathVotingRound
    });
  }

  const resolvedAt = new Date().toISOString();
  const previousStage5Voting = cloneForHistory(room.state.stage5Voting);
  const postDeathVoteResolution = {
    resolved: true,
    resolvedAt,
    resolvedBy: 'storyteller',
    nomineeSeat: sourcePostDeathNextNomination.nomineeSeat,
    yesVotes: postDeathVoteCount.yes,
    noVotes: postDeathVoteCount.no,
    totalVotes: postDeathVoteCount.total,
    passes: postDeathVoteCount.yes > postDeathVoteCount.no,
    sourcePostDeathVotingRound: stage5Voting.postDeathVotingRound
  };

  try {
    room.state.stage5Voting = {
      ...stage5Voting,
      postDeathVoteResolution
    };

    return {
      type: 'stage5_post_death_vote_resolved',
      data: {
        status: 'server-post-death-vote-resolved',
        postDeathVoteResolution,
        resolvedAt,
        resolvedBy: 'storyteller',
        sourcePostDeathVotingRound: stage5Voting.postDeathVotingRound,
        mutationScope: 'room.state.stage5Voting.current-post-death-vote-resolution-fields-only',
        readModel: 'room.state.stage5Voting.counted-post-death-vote-read-model-only',
        serverMutation: true,
        postDeathVoteResolved: true,
        postDeathVoteResolution: true,
        deathExecutionOpened: false,
        publicPromptAutomation: false,
        privatePromptAutomation: false,
        phaseMutation: false,
        roundMutation: false,
        playerStateMutation: false,
        legacyNightQueueMutation: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false,
        aiIntegration: false
      }
    };
  } catch (error) {
    room.state.stage5Voting = previousStage5Voting;

    return buildStage5PostDeathVoteResolutionRefusal('stage5-post-death-vote-resolution-store-failed', {
      rollbackApplied: true,
      message: error.message
    });
  }
}

function buildStage5PostDeathDeathExecutionRefusal(reason, details = {}) {
  return {
    type: 'stage5_post_death_vote_death_execution_refused',
    data: {
      status: 'refused',
      reason,
      mutationScope: 'room.state.players.post-death-vote-death-life-state-only',
      readModel: 'room.state.stage5Voting.post-death-vote-resolution-death-read-model-only',
      serverMutation: false,
      postDeathDeathExecuted: false,
      postDeathDeathExecution: false,
      publicPromptAutomation: false,
      privatePromptAutomation: false,
      phaseMutation: false,
      roundMutation: false,
      playerLifeStateMutation: false,
      playerRoleMutation: false,
      legacyNightQueueMutation: false,
      actionHistoryAppended: false,
      eventLogWritten: false,
      authoritativeHistoryExpanded: false,
      aiIntegration: false,
      ...details
    }
  };
}

function executeStage5PostDeathVoteDeath({ room, ws }) {
  if (!room) {
    return buildStage5PostDeathDeathExecutionRefusal('missing-room');
  }

  if (room.storyteller !== ws) {
    return buildStage5PostDeathDeathExecutionRefusal('unauthorized-storyteller');
  }

  if (room.state.phase !== 'day') {
    return buildStage5PostDeathDeathExecutionRefusal('invalid-phase-for-post-death-death-execution', {
      phase: room.state.phase ?? null
    });
  }

  if (room.state.round !== 1) {
    return buildStage5PostDeathDeathExecutionRefusal('invalid-round-for-post-death-death-execution', {
      round: room.state.round ?? null
    });
  }

  const stage5Voting = room.state.stage5Voting;
  if (!stage5Voting || typeof stage5Voting !== 'object') {
    return buildStage5PostDeathDeathExecutionRefusal('missing-stage5-voting');
  }

  if (stage5Voting.postDeathVotingRestarted !== true) {
    return buildStage5PostDeathDeathExecutionRefusal('missing-post-death-voting-restart');
  }

  const sourcePostDeathNextNomination = stage5Voting.sourcePostDeathNextNomination;
  if (!sourcePostDeathNextNomination || typeof sourcePostDeathNextNomination !== 'object') {
    return buildStage5PostDeathDeathExecutionRefusal('missing-source-post-death-next-nomination');
  }

  if (!Number.isInteger(sourcePostDeathNextNomination.nomineeSeat)) {
    return buildStage5PostDeathDeathExecutionRefusal('invalid-source-post-death-nominee-seat', {
      nomineeSeat: sourcePostDeathNextNomination.nomineeSeat ?? null
    });
  }

  if (!Number.isInteger(stage5Voting.postDeathVotingRound)) {
    return buildStage5PostDeathDeathExecutionRefusal('invalid-post-death-voting-round', {
      postDeathVotingRound: stage5Voting.postDeathVotingRound ?? null
    });
  }

  const postDeathVoteResolution = stage5Voting.postDeathVoteResolution;
  if (!postDeathVoteResolution || typeof postDeathVoteResolution !== 'object') {
    return buildStage5PostDeathDeathExecutionRefusal('missing-post-death-vote-resolution');
  }

  if (postDeathVoteResolution.resolved !== true) {
    return buildStage5PostDeathDeathExecutionRefusal('post-death-vote-resolution-not-accepted');
  }

  if (postDeathVoteResolution.passes !== true) {
    return buildStage5PostDeathDeathExecutionRefusal('post-death-vote-resolution-did-not-pass');
  }

  if (!Number.isInteger(postDeathVoteResolution.nomineeSeat)) {
    return buildStage5PostDeathDeathExecutionRefusal('invalid-post-death-vote-resolution-nominee-seat', {
      nomineeSeat: postDeathVoteResolution.nomineeSeat ?? null
    });
  }

  if (postDeathVoteResolution.nomineeSeat !== sourcePostDeathNextNomination.nomineeSeat) {
    return buildStage5PostDeathDeathExecutionRefusal('post-death-vote-resolution-nominee-mismatch', {
      sourceNomineeSeat: sourcePostDeathNextNomination.nomineeSeat,
      resolutionNomineeSeat: postDeathVoteResolution.nomineeSeat
    });
  }

  if (postDeathVoteResolution.sourcePostDeathVotingRound !== stage5Voting.postDeathVotingRound) {
    return buildStage5PostDeathDeathExecutionRefusal('stale-post-death-vote-resolution-round', {
      sourcePostDeathVotingRound: postDeathVoteResolution.sourcePostDeathVotingRound ?? null,
      postDeathVotingRound: stage5Voting.postDeathVotingRound
    });
  }

  if (!Array.isArray(room.state.players)) {
    return buildStage5PostDeathDeathExecutionRefusal('missing-player-list');
  }

  const nomineePlayer = room.state.players.find((player) => player?.seat === postDeathVoteResolution.nomineeSeat);
  if (!nomineePlayer) {
    return buildStage5PostDeathDeathExecutionRefusal('missing-nominee-player', {
      nomineeSeat: postDeathVoteResolution.nomineeSeat
    });
  }

  if (nomineePlayer.alive !== true) {
    return buildStage5PostDeathDeathExecutionRefusal('nominee-not-alive', {
      nomineeSeat: postDeathVoteResolution.nomineeSeat,
      alive: nomineePlayer.alive ?? null
    });
  }

  const executedAt = new Date().toISOString();
  const previousPlayers = cloneForHistory(room.state.players);
  const previousStage5Voting = cloneForHistory(room.state.stage5Voting);
  const postDeathDeathExecution = {
    executed: true,
    executedAt,
    executedBy: 'storyteller',
    nomineeSeat: postDeathVoteResolution.nomineeSeat,
    sourcePostDeathVoteResolution: cloneForHistory(postDeathVoteResolution)
  };

  try {
    nomineePlayer.alive = false;
    room.state.stage5Voting = {
      ...stage5Voting,
      postDeathDeathExecution
    };

    return {
      type: 'stage5_post_death_vote_death_executed',
      data: {
        status: 'server-post-death-vote-death-executed',
        postDeathDeathExecution,
        executedAt,
        executedBy: 'storyteller',
        nomineeSeat: postDeathVoteResolution.nomineeSeat,
        mutationScope: 'room.state.players.post-death-vote-death-life-state-only',
        readModel: 'room.state.stage5Voting.post-death-vote-resolution-death-read-model-only',
        serverMutation: true,
        postDeathDeathExecuted: true,
        postDeathDeathExecution: true,
        publicPromptAutomation: false,
        privatePromptAutomation: false,
        phaseMutation: false,
        roundMutation: false,
        playerLifeStateMutation: true,
        playerRoleMutation: false,
        legacyNightQueueMutation: false,
        actionHistoryAppended: false,
        eventLogWritten: false,
        authoritativeHistoryExpanded: false,
        aiIntegration: false
      }
    };
  } catch (error) {
    room.state.players = previousPlayers;
    room.state.stage5Voting = previousStage5Voting;

    return buildStage5PostDeathDeathExecutionRefusal('stage5-post-death-death-execution-store-failed', {
      rollbackApplied: true,
      message: error.message
    });
  }
}

function deriveReplayBaselineFromHistory(actionHistory = []) {
  const replayState = {
    phase: 'waiting',
    round: 0,
    currentScript: 'trouble-brewing',
    players: [],
    lastActionId: 0
  };
  const playersBySeat = new Map();

  function ensurePlayer(seat) {
    if (!playersBySeat.has(seat)) {
      playersBySeat.set(seat, {
        seat,
        name: `玩家${seat}`,
        role: null,
        roleName: null,
        roleNameEn: null,
        alignment: null,
        alive: true,
        poisoned: false,
        drunk: false
      });
    }

    return playersBySeat.get(seat);
  }

  for (const entry of actionHistory) {
    if (typeof entry?.id === 'number') {
      replayState.lastActionId = Math.max(replayState.lastActionId, entry.id);
    }

    const payload = entry?.payload || {};
    switch (entry?.type) {
      case 'room_created':
        if (payload.currentScript) {
          replayState.currentScript = payload.currentScript;
        }
        break;
      case 'player_joined': {
        const player = ensurePlayer(payload.seat);
        player.name = payload.playerName || player.name;
        break;
      }
      case 'script_selected':
        if (payload.scriptId) {
          replayState.currentScript = payload.scriptId;
        }
        break;
      case 'roles_auto_distributed':
      case 'roles_locked':
        for (const roleEntry of payload.roles || []) {
          const player = ensurePlayer(roleEntry.seat);
          if (roleEntry.role !== undefined) {
            player.role = roleEntry.role;
          }
          if (roleEntry.roleName !== undefined) {
            player.roleName = roleEntry.roleName;
          }
          if (roleEntry.roleNameEn !== undefined) {
            player.roleNameEn = roleEntry.roleNameEn;
          }
          if (roleEntry.alignment !== undefined) {
            player.alignment = roleEntry.alignment;
          }
        }
        break;
      case 'night_started':
      case 'phase_changed':
        replayState.phase = payload.phase || entry.phase || replayState.phase;
        if (typeof payload.round === 'number') {
          replayState.round = payload.round;
        } else if (typeof entry.round === 'number') {
          replayState.round = entry.round;
        }
        break;
      case 'player_status_updated': {
        const player = ensurePlayer(payload.seat);
        const current = payload.current || {};
        if (current.alive !== undefined) {
          player.alive = current.alive;
        }
        if (current.poisoned !== undefined) {
          player.poisoned = current.poisoned;
        }
        if (current.drunk !== undefined) {
          player.drunk = current.drunk;
        }
        break;
      }
      default:
        break;
    }
  }

  replayState.players = [...playersBySeat.values()].sort((left, right) => left.seat - right.seat);
  return replayState;
}

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function normalizeRequestedRoomId(roomId) {
  if (typeof roomId !== 'string') return '';
  return roomId
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 12);
}

function normalizeRoomPassword(password) {
  return typeof password === 'string' ? password.trim() : '';
}

function createPasswordRecord(password) {
  const normalized = normalizeRoomPassword(password);
  if (!normalized) {
    return null;
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .createHash('sha256')
    .update(`${salt}:${normalized}`)
    .digest('hex');
  return { salt, hash };
}

function verifyPasswordRecord(record, password) {
  if (!record?.salt || !record?.hash) {
    return false;
  }

  const normalized = normalizeRoomPassword(password);
  if (!normalized) {
    return false;
  }

  const candidate = crypto
    .createHash('sha256')
    .update(`${record.salt}:${normalized}`)
    .digest('hex');
  const left = Buffer.from(record.hash, 'hex');
  const right = Buffer.from(candidate, 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function getRequestIdFromMessage(msg) {
  const requestId = msg?.data?.requestId || msg?.requestId;
  return typeof requestId === 'string' && requestId.trim() ? requestId.trim().slice(0, 120) : null;
}

function attachRequestId(payload, requestId) {
  if (!requestId || !payload || typeof payload !== 'object') return payload;
  return {
    ...payload,
    data: {
      ...(payload.data || {}),
      requestId
    }
  };
}

function sendJson(ws, payload, requestId = null) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(attachRequestId(payload, requestId)));
  }
}

function sendError(ws, message, code = 'error', extra = {}) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'error', data: { code, message, ...extra } }));
  }
}

function isValidRoomPassword(room, password) {
  if (!room?.passwordRequired) {
    return true;
  }

  return verifyPasswordRecord(room.password, password);
}

function buildPublicLobby(room) {
  const playerCount = Number.isInteger(room?.state?.playerCount)
    ? room.state.playerCount
    : Math.max(room?.state?.players?.length || 0, 7);
  const occupied = new Map((room?.state?.players || []).map((player) => [player.seat, player]));
  const gameNumber = Number.isInteger(room?.state?.gameNumber)
    ? room.state.gameNumber
    : (Number.isInteger(room?.state?.series?.currentGameNumber) ? room.state.series.currentGameNumber : 1);

  return {
    roomId: room.id,
    scriptId: room.state.currentScript,
    phase: room.state.phase,
    round: room.state.round,
    phaseSnapshot: getAuthoritativePhaseSnapshot(room),
    gameNumber,
    playerCount,
    passwordRequired: room.passwordRequired === true,
    seats: Array.from({ length: playerCount }, (_, index) => {
      const seat = index + 1;
      const player = occupied.get(seat);
      return {
        seat,
        occupied: Boolean(player),
        name: player?.name ?? null,
        alive: player ? player.alive !== false : true,
        connected: player?.connected === true,
        aiTestPlayer: player?.aiTestPlayer === true
      };
    })
  };
}

function roomHasDealtRoles(room) {
  const state = room?.state || {};
  const candidate = state.confirmedSetupCandidate || {};
  return state.phase === 'roles-dealt'
    || Boolean(state.dealRoles?.commandId)
    || candidate.status === 'dealt'
    || candidate.boundary?.roleDeal === true;
}

function buildStorytellerRoomSummary(room) {
  const lobby = buildPublicLobby(room);
  const script = scriptManager.getScript(room?.state?.currentScript || 'trouble-brewing');
  const occupiedCount = lobby.seats.filter((seat) => seat.occupied).length;
  const connectedCount = lobby.seats.filter((seat) => seat.connected).length;
  const aiTestPlayerCount = lobby.seats.filter((seat) => seat.aiTestPlayer).length;

  return {
    roomId: room.id,
    scriptId: room.state.currentScript,
    scriptName: script?.name || room.state.currentScript || '未知剧本',
    phase: room.state.phase,
    round: room.state.round,
    gameNumber: lobby.gameNumber,
    playerCount: lobby.playerCount,
    occupiedCount,
    connectedCount,
    aiTestPlayerCount,
    rolesDealt: roomHasDealtRoles(room),
    hasStoryteller: Boolean(room.storyteller && room.storyteller.readyState === WebSocket.OPEN),
    passwordRequired: room.passwordRequired === true,
    createdAt: room.state.createdAt || null,
    updatedAt: room.state.identityReceiptUpdatedAt || room.state.lastUpdatedAt || room.state.createdAt || null
  };
}

function buildStorytellerRoomDirectory({ limit = STORYTELLER_ROOM_LIST_LIMIT } = {}) {
  const sortedRooms = Array.from(rooms.values())
    .filter((room) => room?.id && room?.state)
    .map(buildStorytellerRoomSummary)
    .sort((left, right) => {
      if (left.hasStoryteller !== right.hasStoryteller) return left.hasStoryteller ? -1 : 1;
      return String(right.updatedAt || right.createdAt || right.roomId).localeCompare(String(left.updatedAt || left.createdAt || left.roomId));
    });
  const safeLimit = Math.max(1, Number(limit) || STORYTELLER_ROOM_LIST_LIMIT);
  return {
    rooms: sortedRooms.slice(0, safeLimit),
    roomCount: sortedRooms.length,
    roomListLimit: safeLimit,
    roomListTruncated: sortedRooms.length > safeLimit
  };
}

function buildStorytellerRoomList(options = {}) {
  return buildStorytellerRoomDirectory(options).rooms;
}

function buildPublicScriptRoleCatalog(scriptId) {
  const script = scriptManager.getScript(scriptId || 'trouble-brewing');
  if (!script) return null;

  const roleGroups = [
    ['townsfolk', 'townsfolk'],
    ['outsiders', 'outsider'],
    ['minions', 'minion'],
    ['demons', 'demon']
  ];
  const roles = roleGroups.flatMap(([groupKey, team]) => (
    (script.characters?.[groupKey] || []).map((role) => ({
      id: role.id,
      name: role.name || role.nameEn || role.id,
      nameEn: role.nameEn || role.id,
      team,
      group: groupKey,
      ability: role.ability || '',
      firstNight: Boolean(role.firstNight),
      otherNights: Boolean(role.otherNights)
    }))
  ));

  return {
    scriptId: script.id,
    scriptName: script.name,
    scriptNameEn: script.nameEn,
    roles
  };
}

function normalizeImportedScriptText(value, fallback = '') {
  return String(value || fallback || '').trim().slice(0, 160);
}

function defaultImportedTargetRules(promptKind) {
  if (promptKind === 'select_2') return { count: 2, allowSelf: true, allowDead: true, mustBeDistinct: true, mustBeDead: false };
  if (promptKind === 'select_3') return { count: 3, allowSelf: true, allowDead: true, mustBeDistinct: true, mustBeDead: false };
  if (promptKind === 'select_1' || promptKind === 'select_player_role') return { count: 1, allowSelf: true, allowDead: true, mustBeDistinct: true, mustBeDead: false };
  return { count: 0, allowSelf: true, allowDead: true, mustBeDistinct: true, mustBeDead: false };
}

function normalizeImportedTargetRules(promptKind, targetRules) {
  const defaults = defaultImportedTargetRules(promptKind);
  if (!targetRules || typeof targetRules !== 'object') return defaults;
  return {
    ...defaults,
    allowSelf: targetRules.allowSelf !== undefined ? targetRules.allowSelf === true || targetRules.allowSelf === 'true' : defaults.allowSelf,
    allowDead: targetRules.allowDead !== undefined ? targetRules.allowDead === true || targetRules.allowDead === 'true' : defaults.allowDead,
    mustBeDistinct: targetRules.mustBeDistinct !== undefined ? targetRules.mustBeDistinct === true || targetRules.mustBeDistinct === 'true' : defaults.mustBeDistinct,
    mustBeDead: targetRules.mustBeDead !== undefined ? targetRules.mustBeDead === true || targetRules.mustBeDead === 'true' : defaults.mustBeDead
  };
}

function normalizeImportedResultType(value, promptKind) {
  const resultType = normalizeImportedScriptText(value || (promptKind === 'auto_info' ? 'information' : 'choice'));
  const allowed = new Set(['information', 'choice', 'poison', 'protect', 'kill', 'status', 'role-change']);
  return allowed.has(resultType) ? resultType : (promptKind === 'auto_info' ? 'information' : 'choice');
}

function importedCandidateTypeForResult(resultType, promptKind) {
  if (resultType === 'information' || promptKind === 'auto_info') return 'custom-info-candidate';
  if (resultType === 'kill') return 'custom-kill-candidate';
  if (resultType === 'poison') return 'custom-poison-candidate';
  if (resultType === 'protect') return 'custom-protect-candidate';
  if (resultType === 'role-change') return 'custom-role-change-candidate';
  if (resultType === 'status') return 'custom-status-candidate';
  return 'custom-choice-candidate';
}

function normalizeImportedLogicProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const promptKind = normalizeImportedScriptText(profile.promptKind || 'auto_info');
  const triggerMode = normalizeImportedScriptText(profile.triggerMode || 'passive');
  const riskLevel = normalizeImportedScriptText(profile.riskLevel || 'medium');
  const allowedPromptKinds = new Set(['auto_info', 'select_1', 'select_2', 'select_3', 'select_role', 'select_player_role']);
  const allowedTriggers = new Set(['passive', 'first-night', 'other-night', 'first-and-other-night']);
  const allowedRisks = new Set(['low', 'medium', 'high']);
  const normalizedPromptKind = allowedPromptKinds.has(promptKind) ? promptKind : 'auto_info';
  const resultType = normalizeImportedResultType(profile.resultType, normalizedPromptKind);
  return {
    schemaVersion: 'botc.imported-role-logic.v1',
    source: normalizeImportedScriptText(profile.source || 'storyteller-reviewed-import'),
    triggerMode: allowedTriggers.has(triggerMode) ? triggerMode : 'passive',
    promptKind: normalizedPromptKind,
    riskLevel: allowedRisks.has(riskLevel) ? riskLevel : 'medium',
    resultType,
    targetRules: normalizeImportedTargetRules(normalizedPromptKind, profile.targetRules),
    storytellerConfirmationRequired: profile.storytellerConfirmationRequired !== false,
    aiTestAction: normalizeImportedScriptText(profile.aiTestAction || 'submit-legal-choice'),
    candidateType: importedCandidateTypeForResult(resultType, normalizedPromptKind),
    playerVisibleBoundary: normalizeImportedScriptText(profile.playerVisibleBoundary || 'confirmed-candidate-only'),
    manualTweaksAllowed: profile.manualTweaksAllowed !== false
  };
}

function normalizeImportedRole(role, groupKey) {
  if (!role || typeof role !== 'object') return null;
  const id = normalizeImportedScriptText(role.id).toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-');
  if (!id) return null;
  const firstNightOrder = Number(role.nightOrder?.first || role.firstNightOrder || 0);
  const otherNightOrder = Number(role.nightOrder?.other || role.otherNightOrder || 0);
  return {
    id,
    name: normalizeImportedScriptText(role.name, id),
    nameEn: normalizeImportedScriptText(role.nameEn || role.en, role.name || id),
    ability: String(role.ability || role.desc || '').trim().slice(0, 1200),
    abilityType: 'manual',
    actionType: 'manual_review',
    firstNight: Boolean(role.firstNight) || firstNightOrder > 0,
    otherNights: Boolean(role.otherNights) || otherNightOrder > 0,
    setup: Boolean(role.setup),
    reminders: Array.isArray(role.reminders) ? role.reminders.map((item) => normalizeImportedScriptText(item)).filter(Boolean).slice(0, 12) : [],
    remindersGlobal: Array.isArray(role.remindersGlobal) ? role.remindersGlobal.map((item) => normalizeImportedScriptText(item)).filter(Boolean).slice(0, 12) : [],
    logicProfile: normalizeImportedLogicProfile(role.logicProfile),
    nightOrder: {
      first: firstNightOrder,
      other: otherNightOrder
    },
    type: groupKey,
    team: groupKey === 'outsiders' ? 'outsider' : groupKey.replace(/s$/, ''),
    alignment: ['townsfolk', 'outsiders'].includes(groupKey) ? 'good' : 'evil',
    source: {
      kind: 'storyteller-reviewed-import'
    }
  };
}

function normalizeImportedScriptPayload(input) {
  if (!input || typeof input !== 'object') return null;
  const rawId = normalizeImportedScriptText(input.id || input.scriptId || input.key || input.nameEn || input.name);
  const id = rawId.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!id) return null;
  const characters = {
    townsfolk: [],
    outsiders: [],
    minions: [],
    demons: [],
    travellers: []
  };
  for (const groupKey of ['townsfolk', 'outsiders', 'minions', 'demons']) {
    const roles = Array.isArray(input.characters?.[groupKey]) ? input.characters[groupKey] : [];
    characters[groupKey] = roles.map((role) => normalizeImportedRole(role, groupKey)).filter(Boolean);
  }
  const allRoles = Object.values(characters).flat();
  if (allRoles.length < 5 || characters.demons.length < 1) return null;
  const ruleLogicRoles = {};
  allRoles.forEach((role) => {
    if (role.logicProfile) ruleLogicRoles[role.id] = role.logicProfile;
  });
  const sortByOrder = (nightKey) => allRoles
    .filter((role) => Number(role.nightOrder?.[nightKey] || 0) > 0)
    .sort((left, right) => Number(left.nightOrder[nightKey]) - Number(right.nightOrder[nightKey]))
    .map((role) => role.id);

  return {
    id,
    name: normalizeImportedScriptText(input.name, input.nameEn || id),
    nameEn: normalizeImportedScriptText(input.nameEn || input.en, input.name || id),
    difficulty: Number(input.difficulty || 3),
    description: normalizeImportedScriptText(input.description, 'Storyteller-reviewed imported board. Complex rulings remain storyteller-confirmed.'),
    source: {
      kind: 'storyteller-reviewed-import',
      importedAt: new Date().toISOString()
    },
    characters,
    nightOrder: {
      first: Array.isArray(input.nightOrder?.first) ? input.nightOrder.first.map((item) => normalizeImportedScriptText(item)).filter(Boolean) : sortByOrder('first'),
      other: Array.isArray(input.nightOrder?.other) ? input.nightOrder.other.map((item) => normalizeImportedScriptText(item)).filter(Boolean) : sortByOrder('other')
    },
    ruleLogic: {
      schemaVersion: 'botc.imported-script-rule-logic.v1',
      roles: ruleLogicRoles
    },
    balanceRules: {},
    runtimeSupport: {
      setupCandidate: true,
      dealRoles: true,
      playerView: true,
      ruleAutomation: 'manual-storyteller-confirmed'
    }
  };
}

function registerImportedScriptPayload(payload) {
  const script = normalizeImportedScriptPayload(payload);
  if (!script) return null;
  if (RESERVED_RUNTIME_SCRIPT_IDS.has(script.id)) {
    const error = new Error('imported-script-id-reserved');
    error.code = 'imported-script-id-reserved';
    throw error;
  }
  return scriptManager.registerScript(script);
}

function createPlayerPrivateMessage(room, senderSeat, payload = {}) {
  const seat = Number(senderSeat);
  const text = normalizePrivateMessageText(payload.text || payload.message, 600);
  const title = normalizePrivateMessageText(payload.title, 80) || '玩家留言';
  const clientMessageId = normalizePrivateMessageText(payload.clientMessageId, 100);
  if (!Number.isInteger(seat) || !room?.state?.players?.some((player) => Number(player.seat) === seat)) {
    const error = new Error('invalid-private-message-sender');
    error.code = 'invalid-private-message-sender';
    throw error;
  }
  if (!text) {
    const error = new Error('private-message-text-required');
    error.code = 'private-message-text-required';
    throw error;
  }

  const dedupe = Array.isArray(room.state.playerPrivateMessageDedupe)
    ? room.state.playerPrivateMessageDedupe
    : [];
  if (clientMessageId) {
    const previousId = dedupe.find((item) => item.clientMessageId === clientMessageId && item.seat === seat)?.messageId;
    const previous = previousId && room.state.privateMessages?.find((item) => item.id === previousId);
    if (previous) return { message: previous, duplicate: true };
  }

  if (!Array.isArray(room.state.privateMessages)) room.state.privateMessages = [];
  const createdAt = new Date().toISOString();
  const message = {
    id: `msg-player-${room.id}-${seat}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    fromSeat: seat,
    type: 'player-direct',
    title,
    text,
    createdAt,
    source: 'player',
    toStoryteller: true,
    readAt: null
  };
  room.state.privateMessages.push(message);
  const retention = pruneRoomPrivateMessages(room);
  if (clientMessageId) {
    dedupe.push({ clientMessageId, seat, messageId: message.id });
    room.state.playerPrivateMessageDedupe = dedupe.slice(-100);
  }
  appendActionHistory(room, 'player_private_message_sent', {
    fromSeat: seat,
    title,
    textLength: text.length,
    messageId: message.id,
    clientMessageId: clientMessageId || null
  }, { actor: 'player', actorSeat: seat });
  return { message, duplicate: false, retention };
}

function markPlayerPrivateMessagesRead(room, seat, messageIds = []) {
  const allowed = new Set((Array.isArray(messageIds) ? messageIds : []).map((id) => String(id)).filter(Boolean));
  const readAt = new Date().toISOString();
  let updated = 0;
  for (const message of Array.isArray(room?.state?.privateMessages) ? room.state.privateMessages : []) {
    if (!messageTargetsSeatForReadReceipt(message, seat)) continue;
    if (allowed.size && !allowed.has(String(message.id))) continue;
    if (!message.readAt) {
      message.readAt = readAt;
      updated += 1;
    }
  }
  return { updated, readAt };
}

function messageTargetsSeatForReadReceipt(message, seat) {
  return Number(message.toSeat) === Number(seat)
    || Number(message.privateToSeat) === Number(seat)
    || Number(message.seat) === Number(seat);
}

function createStorytellerReconnectToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashStorytellerReconnectToken(token) {
  if (typeof token !== 'string' || !token) return null;
  return crypto.createHash('sha256').update(token).digest('hex');
}

function verifyStorytellerReconnectToken(room, token) {
  const expectedHash = room?.storytellerReconnectTokenHash;
  const candidateHash = hashStorytellerReconnectToken(token);
  if (!expectedHash || !candidateHash) return false;
  const left = Buffer.from(String(expectedHash), 'hex');
  const right = Buffer.from(candidateHash, 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function sanitizeImportedScriptFileName(scriptId) {
  return String(scriptId || 'custom-script')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'custom-script';
}

function buildPersistedImportedScript(script) {
  return {
    schemaVersion: 'botc.reviewed-imported-script.v1',
    savedAt: new Date().toISOString(),
    script
  };
}

function persistImportedScript(script) {
  if (!script?.id) return null;
  const fileName = `${sanitizeImportedScriptFileName(script.id)}.json`;
  const filePath = path.join(IMPORTED_SCRIPTS_DIR, fileName);
  writeJsonAtomic(filePath, buildPersistedImportedScript(script));
  return { fileName, filePath };
}

function listPersistedImportedScripts() {
  if (!fs.existsSync(IMPORTED_SCRIPTS_DIR)) return [];
  return fs.readdirSync(IMPORTED_SCRIPTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => {
      const filePath = path.join(IMPORTED_SCRIPTS_DIR, entry.name);
      const stat = fs.statSync(filePath);
      const payload = parseJsonFile(filePath);
      const script = payload?.script || payload;
      return { fileName: entry.name, filePath, stat, script, savedAt: payload?.savedAt || stat.mtime.toISOString() };
    })
    .filter((item) => item.script?.id);
}

function loadPersistedImportedScripts() {
  const loaded = [];
  const failures = [];
  for (const item of listPersistedImportedScripts()) {
    try {
      const script = registerImportedScriptPayload(item.script);
      if (script) loaded.push(script.id);
    } catch (error) {
      failures.push({ fileName: item.fileName, reason: error.message || String(error) });
    }
  }
  if (loaded.length > 0) {
    console.log(`Loaded ${loaded.length} reviewed imported script(s) from ${IMPORTED_SCRIPTS_DIR}`);
  }
  if (failures.length > 0) {
    console.warn(`Skipped ${failures.length} imported script(s): ${failures.map((item) => item.fileName).join(', ')}`);
  }
  return { loaded, failures };
}

function buildImportedScriptSummary(item) {
  const script = item.script;
  const counts = scriptManager.getCharacterCount(script);
  return {
    fileName: item.fileName,
    scriptId: script.id,
    name: script.name,
    nameEn: script.nameEn,
    savedAt: item.savedAt,
    characterCount: counts,
    nightOrder: {
      firstCount: Array.isArray(script.nightOrder?.first) ? script.nightOrder.first.length : 0,
      otherCount: Array.isArray(script.nightOrder?.other) ? script.nightOrder.other.length : 0
    }
  };
}

function buildPublicRuntimeScriptPayload(script) {
  const characters = {};
  for (const group of ['townsfolk', 'outsiders', 'minions', 'demons', 'travellers']) {
    characters[group] = (script.characters?.[group] || []).map((role) => ({
      id: role.id,
      name: role.name || role.nameEn || role.id,
      nameEn: role.nameEn || role.id,
      team: role.team || role.type || group,
      ability: role.ability || '',
      firstNight: role.firstNight === true,
      otherNights: role.otherNights === true,
      logicProfile: role.logicProfile ? JSON.parse(JSON.stringify(role.logicProfile)) : null
    }));
  }
  return {
    id: script.id,
    name: script.name,
    nameEn: script.nameEn || script.name,
    difficulty: script.difficulty ?? null,
    description: script.description || '',
    characters,
    nightOrder: {
      first: Array.isArray(script.nightOrder?.first) ? [...script.nightOrder.first] : [],
      other: Array.isArray(script.nightOrder?.other) ? [...script.nightOrder.other] : []
    },
    ruleLogic: script.ruleLogic ? JSON.parse(JSON.stringify(script.ruleLogic)) : null,
    runtimeSupport: script.runtimeSupport ? JSON.parse(JSON.stringify(script.runtimeSupport)) : null
  };
}

loadPersistedImportedScripts();

function broadcast(roomId, type, data) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  room.clients.forEach((clientWs) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type, data }));
    }
  });
}

function buildRoomProjectionInput(room) {
  return {
    state: {
      ...room.state,
      roomId: room.id
    }
  };
}

function buildLegacyPlayerStateForPlayerView(playerView) {
  return {
    phase: playerView.publicView.phase,
    round: playerView.publicView.round,
    currentScript: playerView.publicView.scriptId,
    players: playerView.publicView.seats.map((seat) => ({
      seat: seat.seat,
      name: seat.name,
      alive: seat.alive,
      deadVoteAvailable: seat.deadVoteAvailable
    }))
  };
}

function sanitizeStorytellerPlayer(player) {
  if (!player) return player;
  const { playerToken, playerTokenHash, ...safePlayer } = player;
  return safePlayer;
}

function buildStorytellerPlayers(room) {
  return (room?.state?.players || []).map(sanitizeStorytellerPlayer);
}

function getIdentityReceiptRoleDealId(room) {
  return room?.state?.identityReceiptRoleDealId
    || room?.state?.confirmedSetupCandidate?.candidateId
    || room?.state?.confirmedSetupCandidate?.id
    || null;
}

function resetIdentityReceiptsForDeal(room, roleDealId) {
  if (!room?.state) return;
  room.state.identityReceiptRoleDealId = roleDealId || getIdentityReceiptRoleDealId(room);
  room.state.identityReceipts = [];
  room.state.identityReceiptUpdatedAt = null;
}

function isAiTestPlayer(player) {
  return Boolean(player?.aiTestPlayer === true || player?.localTestOnly === true);
}

function isRealRoomPlayer(player) {
  return Boolean(player) && !isAiTestPlayer(player);
}

function autoConfirmAiIdentityReceipts(room, roleDealId) {
  if (!room?.state) return { count: 0, seats: [] };
  const dealId = roleDealId || getIdentityReceiptRoleDealId(room);
  if (!dealId) return { count: 0, seats: [] };

  const existing = new Set(
    (room.state.identityReceipts || [])
      .filter((receipt) => receipt && receipt.roleDealId === dealId)
      .map((receipt) => Number(receipt.seat))
  );
  const now = new Date().toISOString();
  const seats = [];
  (room.state.players || []).forEach((player) => {
    const seat = Number(player?.seat);
    if (!Number.isInteger(seat) || !isAiTestPlayer(player) || existing.has(seat)) return;
    room.state.identityReceipts.push({
      seat,
      name: player.name || `AI测试玩家${seat}`,
      roleDealId: dealId,
      confirmedAt: now,
      confirmedBy: 'ai-test'
    });
    seats.push(seat);
  });

  if (seats.length > 0) {
    room.state.identityReceiptUpdatedAt = now;
    appendActionHistory(room, 'ai_identity_receipts_auto_confirmed', {
      seats,
      roleDealId: dealId
    }, { actor: 'system' });
  }
  return { count: seats.length, seats };
}

function buildIdentityReceiptSummary(room) {
  const players = (room?.state?.players || [])
    .filter((player) => Number.isInteger(Number(player.seat)))
    .map((player) => ({
      seat: Number(player.seat),
      name: player.name || null,
      aiTestPlayer: isAiTestPlayer(player)
    }))
    .sort((a, b) => a.seat - b.seat);
  const roleDealId = getIdentityReceiptRoleDealId(room);
  const receipts = new Map(
    (room?.state?.identityReceipts || [])
      .filter((receipt) => receipt && receipt.roleDealId === roleDealId)
      .map((receipt) => [Number(receipt.seat), receipt])
  );
  const confirmedSeats = players
    .filter((player) => receipts.has(player.seat))
    .map((player) => player.seat);
  const pendingSeats = players
    .filter((player) => !receipts.has(player.seat))
    .map((player) => player.seat);
  const realPlayers = players.filter((player) => !player.aiTestPlayer);
  const aiPlayers = players.filter((player) => player.aiTestPlayer);

  return {
    roleDealId,
    total: players.length,
    realTotal: realPlayers.length,
    aiTotal: aiPlayers.length,
    confirmedCount: confirmedSeats.length,
    realConfirmedCount: realPlayers.filter((player) => receipts.has(player.seat)).length,
    aiConfirmedCount: aiPlayers.filter((player) => receipts.has(player.seat)).length,
    confirmedSeats,
    realConfirmedSeats: realPlayers.filter((player) => receipts.has(player.seat)).map((player) => player.seat),
    aiConfirmedSeats: aiPlayers.filter((player) => receipts.has(player.seat)).map((player) => player.seat),
    pendingSeats,
    realPendingSeats: realPlayers.filter((player) => !receipts.has(player.seat)).map((player) => player.seat),
    aiPendingSeats: aiPlayers.filter((player) => !receipts.has(player.seat)).map((player) => player.seat),
    updatedAt: room?.state?.identityReceiptUpdatedAt || null
  };
}

function buildPlayerIdentityReceiptView(room, seat) {
  const roleDealId = getIdentityReceiptRoleDealId(room);
  const receipt = (room?.state?.identityReceipts || []).find((item) => (
    Number(item.seat) === Number(seat) && item.roleDealId === roleDealId
  ));
  return {
    roleDealId,
    confirmed: Boolean(receipt),
    confirmedAt: receipt?.confirmedAt || null,
    canConfirm: Boolean(roleDealId)
  };
}

function buildStorytellerState(room) {
  return {
    ...room.state,
    players: buildStorytellerPlayers(room),
    identityReceiptSummary: buildIdentityReceiptSummary(room),
    aiControl: getAiControlSnapshot(room.state)
  };
}

function buildMvpPlayerViewForSeat(room, seat) {
  pruneRoomPrivateMessages(room);
  const view = buildPlayerView(buildRoomProjectionInput(room), seat);
  const player = room?.state?.players?.find((item) => Number(item.seat) === Number(seat));
  const dayVote = buildPlayerDayVoteView(room, { playerToken: player?.playerToken || player?.playerTokenHash });
  view.publicView.dayVote = dayVote.publicView;
  view.privateView.dayVote = dayVote.privateView;
  view.privateView.identityReceipt = buildPlayerIdentityReceiptView(room, seat);
  return view;
}

function sendPlayerView(room, clientWs, seat, type = 'player_view_synced') {
  if (!room || !clientWs || clientWs.readyState !== WebSocket.OPEN) {
    return null;
  }

  const view = buildMvpPlayerViewForSeat(room, seat);
  clientWs.send(JSON.stringify({ type, data: { seat, view } }));
  return view;
}

function sendPlayerViewsForRoom(room, type = 'player_view_synced') {
  if (!room) return;
  room.clients.forEach((clientWs, seat) => {
    sendPlayerView(room, clientWs, seat, type);
  });
}

function sendMvpNightSummaryToStoryteller(room, batchId, type = 'night_submission_summary') {
  if (!room?.storyteller || room.storyteller.readyState !== WebSocket.OPEN || !batchId) return;
  try {
    room.storyteller.send(JSON.stringify({
      type,
      data: {
        batchId,
        summary: getMvpNightSubmissionSummary(room.state, batchId),
        candidateResolutions: room.state.candidateResolutions || [],
        nightWorkflow: buildStorytellerNightWorkflowSnapshot(room)
      }
    }));
  } catch (error) {
    room.storyteller.send(JSON.stringify({
      type: 'error',
      data: { code: 'night-summary-failed', message: error.message || 'night-summary-failed' }
    }));
  }
}

function normalizeMvpDealRoleId(roleId, scriptId = 'trouble-brewing') {
  if (!roleId) return roleId;
  if (scriptId !== 'trouble-brewing') return roleId;
  return MVP_DEAL_ROLE_ID_ALIASES.get(roleId) || roleId;
}

function makePlayerToken(roomId, seat) {
  return crypto.createHash('sha256')
    .update(`${roomId}:${seat}:${Date.now()}:${Math.random()}`)
    .digest('hex')
    .slice(0, 32);
}

function ensureRoomStorytellerSession(room) {
  if (!room.state.storytellerSessionId) {
    room.state.storytellerSessionId = `storyteller:${room.id}`;
  }
  return room.state.storytellerSessionId;
}

function ensureMvpPlayerTokens(room) {
  (room.state.players || []).forEach((player) => {
    if (!player.playerToken && !player.playerTokenHash) {
      player.playerToken = makePlayerToken(room.id, player.seat);
    }
  });
}

function getOccupiedRoomSeats(room) {
  return (room.state.players || [])
    .filter((player) => Number.isInteger(player.seat))
    .map((player) => player.seat)
    .sort((a, b) => a - b);
}

function getRoomSeatReadiness(room, candidate = null) {
  const playerCount = Number.isInteger(room?.state?.playerCount) ? room.state.playerCount : 0;
  const occupiedSeats = getOccupiedRoomSeats(room);
  const uniqueSeats = [...new Set(occupiedSeats)].sort((a, b) => a - b);
  const expectedSeats = Array.from({ length: Math.max(playerCount, 0) }, (_, index) => index + 1);
  const missingSeats = expectedSeats.filter((seat) => !uniqueSeats.includes(seat));
  const extraSeats = uniqueSeats.filter((seat) => seat < 1 || seat > playerCount);
  const duplicatedSeats = occupiedSeats.filter((seat, index, list) => list.indexOf(seat) !== index);
  const candidateSeats = candidate && Array.isArray(candidate.seatCandidates)
    ? [...new Set(candidate.seatCandidates.map((item) => Number(item.seat)).filter(Number.isInteger))].sort((a, b) => a - b)
    : null;
  const candidateMismatchSeats = candidateSeats
    ? [
      ...candidateSeats.filter((seat) => !uniqueSeats.includes(seat)),
      ...uniqueSeats.filter((seat) => !candidateSeats.includes(seat))
    ].sort((a, b) => a - b)
    : [];

  return {
    ok: playerCount > 0
      && occupiedSeats.length === playerCount
      && uniqueSeats.length === playerCount
      && missingSeats.length === 0
      && extraSeats.length === 0
      && duplicatedSeats.length === 0
      && (!candidateSeats || (candidateSeats.length === playerCount && candidateMismatchSeats.length === 0)),
    playerCount,
    occupiedSeats,
    uniqueSeats,
    missingSeats,
    extraSeats,
    duplicatedSeats,
    candidateSeats,
    candidateMismatchSeats
  };
}

function getSeatReadinessErrorCode(readiness) {
  if (!readiness || !Number.isInteger(readiness.playerCount) || readiness.playerCount <= 0) return 'room-player-count-invalid';
  if (readiness.missingSeats?.length) return 'room-not-full';
  if (readiness.duplicatedSeats?.length) return 'room-seat-duplicated';
  if (readiness.extraSeats?.length) return 'room-seat-out-of-range';
  if (readiness.candidateMismatchSeats?.length) return 'setup-candidate-seat-mismatch';
  return 'room-not-ready';
}

function fillAiTestPlayers(room) {
  const playerCount = Number.isInteger(room?.state?.playerCount) ? room.state.playerCount : 7;
  const occupied = new Map((room?.state?.players || []).map((player) => [Number(player.seat), player]));
  const addedSeats = [];

  for (let seat = 1; seat <= playerCount; seat += 1) {
    if (occupied.has(seat)) continue;
    const player = {
      seat,
      name: `AI测试玩家${seat}`,
      role: null,
      alive: true,
      playerToken: makePlayerToken(room.id, seat),
      deadVoteAvailable: true,
      connected: false,
      aiTestPlayer: true,
      localTestOnly: true
    };
    room.state.players.push(player);
    addedSeats.push(seat);
  }

  room.state.players.sort((a, b) => a.seat - b.seat);
  if (addedSeats.length > 0) {
    appendActionHistory(room, 'ai_test_players_filled', {
      addedSeats,
      playerCount
    }, { actor: 'storyteller' });
  }
  return { addedSeats, playerCount };
}

function getRoomGameNumber(room) {
  return Number.isInteger(room?.state?.gameNumber)
    ? room.state.gameNumber
    : (Number.isInteger(room?.state?.series?.currentGameNumber) ? room.state.series.currentGameNumber : 1);
}

function buildPreviousGameSummaryForNextGame(room, now) {
  const state = room?.state || {};
  const publicGameOver = state.publicGameOver || null;
  return {
    gameNumber: getRoomGameNumber(room),
    roomId: room?.id || null,
    scriptId: state.currentScript || 'trouble-brewing',
    playerCount: Number.isInteger(state.playerCount) ? state.playerCount : (state.players || []).length,
    endedAt: publicGameOver?.confirmedAt || now,
    result: publicGameOver ? {
      status: publicGameOver.status || 'confirmed',
      winningTeam: publicGameOver.winningTeam || null,
      reasonCode: publicGameOver.reasonCode || null,
      summary: publicGameOver.summary || null
    } : null,
    record: state.lastGameRecord || null
  };
}

function resetPlayerForNextGame(room, player) {
  const seat = Number(player?.seat);
  return {
    seat,
    name: player?.name || `Player ${seat}`,
    role: null,
    alive: true,
    playerToken: player?.playerToken || null,
    playerTokenHash: player?.playerTokenHash || null,
    deadVoteAvailable: true,
    connected: room?.clients?.has(seat) === true,
    aiTestPlayer: player?.aiTestPlayer === true,
    localTestOnly: player?.localTestOnly === true
  };
}

function startNextGameInSameRoom(room, now = new Date().toISOString()) {
  if (!room?.state) {
    throw new Error('room-not-found');
  }
  if (room.state.publicGameOver?.status !== 'confirmed') {
    const error = new Error('game-end-not-confirmed');
    error.code = 'game-end-not-confirmed';
    throw error;
  }

  const previousState = room.state;
  const previousGame = buildPreviousGameSummaryForNextGame(room, now);
  const nextGameNumber = previousGame.gameNumber + 1;
  const previousGames = [
    ...(Array.isArray(previousState.series?.previousGames) ? previousState.series.previousGames : []),
    previousGame
  ].slice(-20);
  const playerCount = Number.isInteger(previousState.playerCount)
    ? previousState.playerCount
    : Math.max(previousState.players?.length || 0, 7);
  const scriptId = previousState.currentScript || 'trouble-brewing';
  const storytellerSessionId = previousState.storytellerSessionId || `storyteller:${room.id}`;
  const previousAiControl = getAiControlSnapshot(previousState);

  room.state = {
    phase: 'waiting',
    round: 0,
    gameNumber: nextGameNumber,
    series: {
      currentGameNumber: nextGameNumber,
      previousGames,
      lastCompletedGame: previousGame,
      lastResetAt: now
    },
    playerCount,
    players: (previousState.players || [])
      .filter((player) => Number.isInteger(Number(player?.seat)))
      .map((player) => resetPlayerForNextGame(room, player))
      .sort((left, right) => Number(left.seat) - Number(right.seat)),
    nightActions: [],
    currentScript: scriptId,
    nightQueue: [],
    history: [],
    actionHistory: [],
    storytellerSessionId,
    setupCandidates: [],
    confirmedSetupCandidate: null,
    nightBatches: [],
    nightSubmissions: [],
    candidateResolutions: [],
    aiAuditRecords: [],
    aiControl: {
      ...previousAiControl,
      lastTickAt: null,
      lastIntent: null,
      lastResult: 'next-game-started',
      auditLog: []
    },
    diaryEntries: [],
    privateMessages: [],
    publicEvents: [],
    identityReceipts: [],
    identityReceiptRoleDealId: null,
    identityReceiptUpdatedAt: null,
    nextActionId: 1,
    lastGameRecord: null
  };

  appendActionHistory(room, 'next_game_started', {
    roomId: room.id,
    previousGameNumber: previousGame.gameNumber,
    nextGameNumber,
    previousResult: previousGame.result,
    previousRecord: previousGame.record,
    preservedSeats: room.state.players.map((player) => Number(player.seat)),
    scriptId
  }, { actor: 'storyteller' });

  return {
    previousGame,
    nextGameNumber,
    state: buildStorytellerState(room),
    lobby: buildPublicLobby(room)
  };
}

const AI_TEST_NON_DEATH_RESOLUTIONS = new Set([
  'protect-target',
  'innkeeper-protect-and-drunk',
  'devils-advocate-execution-protection',
  'poison-target',
  'widow-poison-and-warning'
]);

function normalizeAiTestRoleId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-');
}

function getAiTestPlayerRoleId(player) {
  return normalizeAiTestRoleId(player?.trueRoleId || player?.realRoleId || player?.roleId || player?.role || player?.shownRoleId);
}

function isAiTestDeathTargetPrompt(prompt) {
  const policy = getRoleAutomationPolicy(prompt?.roleIdAtPrompt || prompt?.roleId);
  const resolution = normalizeAiTestRoleId(policy?.rule?.resolution);
  if (!resolution || AI_TEST_NON_DEATH_RESOLUTIONS.has(resolution)) return false;
  return /(^|-)kill($|-)|(^|-)death($|-)|(^|-)die($|-)|(^|-)dies($|-)/.test(resolution);
}

function scoreAiTestTarget(player, prompt, deathTargetPrompt) {
  if (!deathTargetPrompt) return 0;

  const seat = Number(player?.seat);
  let score = 0;
  if (player?.alive !== false) score += 100000;
  if (seat !== Number(prompt?.seat)) score += 10000;
  if (getAiTestPlayerRoleId(player) !== 'soldier') score += 1000;
  if (player?.protected !== true && player?.protectedTonight !== true) score += 100;
  return score;
}

function chooseAiTestTargets(roomState, prompt) {
  const rules = prompt?.targetRules || {};
  const expectedCount = Number(rules.count || (
    prompt?.promptKind === 'select_3' ? 3 : prompt?.promptKind === 'select_2' ? 2 : 1
  ));
  if (!Number.isInteger(expectedCount) || expectedCount <= 0) return [];

  const players = Array.isArray(roomState?.players) ? roomState.players : [];
  const deathTargetPrompt = isAiTestDeathTargetPrompt(prompt);
  const eligible = players
    .slice()
    .filter((player) => {
      const seat = Number(player.seat);
      if (!Number.isInteger(seat)) return false;
      if (rules.allowSelf === false && seat === Number(prompt.seat)) return false;
      if (rules.mustBeDead === true && player.alive !== false) return false;
      if (rules.allowDead === false && player.alive === false) return false;
      return true;
    })
    ;

  if (eligible.length < expectedCount) {
    throw new Error(`ai-test-targets-unavailable:${prompt.promptId}`);
  }
  return chooseDiversified(
    eligible,
    expectedCount,
    buildAiSelectionSeed(roomState, prompt, 'target'),
    { score: (player) => scoreAiTestTarget(player, prompt, deathTargetPrompt) }
  ).map((player) => Number(player.seat));
}

function chooseAiTestRoleId(roomState, prompt) {
  const [selected] = chooseDiversified(
    prompt?.roleOptions || [],
    1,
    buildAiSelectionSeed(roomState, prompt, 'role')
  );
  return selected?.roleId || selected?.id || null;
}

function buildAiTestNightPayload(roomState, prompt) {
  if (!prompt) return null;
  if (prompt.promptKind === 'auto_info') {
    return { kind: 'auto_info' };
  }
  if (prompt.promptKind === 'waiting' || prompt.canModify === false) return null;
  if (prompt.promptKind === 'select_role') {
    const roleId = chooseAiTestRoleId(roomState, prompt);
    return roleId ? { roleId } : null;
  }
  if (prompt.promptKind === 'select_1') {
    const targets = chooseAiTestTargets(roomState, prompt);
    return { target: targets[0] };
  }
  if (prompt.promptKind === 'select_2' || prompt.promptKind === 'select_3' || prompt.promptKind === 'select_4') {
    return { targets: chooseAiTestTargets(roomState, prompt) };
  }
  if (prompt.promptKind === 'select_player_role') {
    const targets = chooseAiTestTargets(roomState, prompt);
    const roleId = chooseAiTestRoleId(roomState, prompt);
    return roleId ? { target: targets[0], roleId, guessedRoleId: roleId } : null;
  }
  return null;
}

function submitAiTestNightActions(room, batchId) {
  const batch = (room?.state?.nightBatches || []).find((item) => item.batchId === batchId);
  if (!batch || batch.status !== 'collecting') {
    return { submittedCount: 0, seats: [], skipped: [] };
  }

  const submittedSeats = [];
  const policySummary = [];
  const skipped = [];
  for (const prompt of batch.prompts || []) {
    const player = (room.state.players || []).find((item) => Number(item.seat) === Number(prompt.seat));
    if (!isAiTestPlayer(player) || prompt.promptKind === 'waiting') continue;
    const policy = getRoleAutomationPolicy(prompt.roleIdAtPrompt || player?.shownRoleId || player?.trueRoleId || player?.role);
    try {
      const payload = buildAiTestNightPayload(room.state, prompt);
      if (!payload) {
        skipped.push({
          seat: Number(prompt.seat),
          promptId: prompt.promptId,
          roleId: policy.roleId,
          riskLevel: policy.riskLevel,
          reason: 'no-ai-test-payload'
        });
        continue;
      }
      const result = submitMvpNightAction(room.state, {
        batchId,
        promptId: prompt.promptId,
        playerToken: player.playerToken || player.playerTokenHash,
        payload
      }, {
        now: new Date().toISOString()
      });
      room.state = result.roomState;
      submittedSeats.push(Number(prompt.seat));
      policySummary.push({
        seat: Number(prompt.seat),
        promptId: prompt.promptId,
        roleId: policy.roleId,
        riskLevel: policy.riskLevel,
        aiAutoSubmitScope: policy.aiAutoSubmitScope,
        targetPolicy: 'deterministic-diversified-v1',
        selectedTargetSeats: [payload.target, ...(Array.isArray(payload.targets) ? payload.targets : [])]
          .filter((seat) => Number.isInteger(Number(seat)))
          .map(Number),
        selectedRoleId: payload.roleId || payload.guessedRoleId || null,
        directStateMutation: policy.aiMayMutateStateDirectly,
        storytellerConfirmationRequired: policy.storytellerConfirmationRequired
      });
    } catch (error) {
      skipped.push({
        seat: Number(prompt.seat),
        promptId: prompt.promptId,
        roleId: policy.roleId,
        riskLevel: policy.riskLevel,
        reason: error.message || 'ai-test-submit-failed'
      });
    }
  }

  if (submittedSeats.length > 0) {
    appendActionHistory(room, 'ai_test_night_actions_submitted', {
      batchId,
      seats: submittedSeats,
      policySummary
    }, { actor: 'system' });
  }

  return {
    submittedCount: submittedSeats.length,
    seats: submittedSeats,
    policySummary,
    directStateMutation: policySummary.some((policy) => policy.directStateMutation === true),
    storytellerConfirmationRequired: policySummary.some((policy) => policy.storytellerConfirmationRequired === true),
    skipped
  };
}

function formatNightOrderForStoryteller(batch) {
  return (batch?.actions || [])
    .slice()
    .sort((left, right) => {
      const leftOrder = Number.isFinite(Number(left.order)) ? Number(left.order) : Number.MAX_SAFE_INTEGER;
      const rightOrder = Number.isFinite(Number(right.order)) ? Number(right.order) : Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return Number(left.seat || 0) - Number(right.seat || 0);
    })
    .map((action) => ({
      order: Number.isFinite(Number(action.order)) ? Number(action.order) : null,
      seat: Number(action.seat),
      roleId: action.roleIdAtPrompt || action.roleId || null,
      roleName: action.roleNameAtPrompt || action.roleName || action.roleIdAtPrompt || action.roleId || null,
      promptKind: action.promptKind || null,
      autoSubmit: action.autoSubmit === true,
      required: action.required === true,
      status: action.status || 'collecting'
    }));
}

function buildStorytellerNightWorkflowSnapshot(room) {
  const activeStatuses = new Set(['collecting', 'closed', 'candidates_ready']);
  if (room?.state?.phase === 'night') activeStatuses.add('confirmed');
  const batch = (room?.state?.nightBatches || [])
    .filter((item) => activeStatuses.has(String(item?.status || '')))
    .slice()
    .sort((left, right) => {
      const numberDelta = Number(right?.nightNumber || 0) - Number(left?.nightNumber || 0);
      if (numberDelta !== 0) return numberDelta;
      return String(right?.openedAt || '').localeCompare(String(left?.openedAt || ''));
    })[0] || null;
  if (!batch) {
    return {
      batchId: null,
      batchStatus: null,
      nightNumber: Number(room?.state?.round || 1),
      nightOrder: [],
      summary: [],
      candidates: [],
      pendingRequiredSeats: [],
      canPrepare: false,
      canFinishEmpty: false,
      awaitingDayTransition: false
    };
  }

  const summary = getMvpNightSubmissionSummary(room.state, batch.batchId);
  const candidateIds = new Set(batch.candidateResolutionIds || []);
  const candidates = (room.state.candidateResolutions || []).filter((candidate) => (
    candidate?.batchId === batch.batchId || candidateIds.has(candidate?.candidateId)
  ));
  const doneStatuses = new Set(['submitted', 'locked', 'confirmed', 'auto', 'auto-submitted']);
  const pendingRequiredRows = summary.filter((item) => (
    item?.required === true && !doneStatuses.has(String(item?.submissionStatus || '').toLowerCase())
  ));
  const actions = Array.isArray(batch.actions) ? batch.actions : [];
  const hasAutoInfoActions = actions.some((action) => action?.autoSubmit === true || action?.promptKind === 'auto_info');
  const hasSubmittedActions = summary.some((item) => doneStatuses.has(String(item?.submissionStatus || '').toLowerCase()));
  const closeoutGate = getNightCloseoutGate(room, { batchId: batch.batchId });
  const preparedEmpty = batch.status === 'candidates_ready' && candidates.length === 0;
  const passiveEmpty = actions.length === 0 || (
    actions.every((action) => action?.required !== true)
    && !hasAutoInfoActions
  );

  return {
    batchId: batch.batchId,
    batchStatus: batch.status,
    nightNumber: Number(batch.nightNumber || room.state.round || 1),
    nightOrder: formatNightOrderForStoryteller(batch),
    summary,
    candidates,
    pendingRequiredSeats: pendingRequiredRows
      .map((item) => Number(item.seat))
      .filter((seat) => Number.isInteger(seat)),
    autoInfoCount: actions.filter((action) => action?.autoSubmit === true || action?.promptKind === 'auto_info').length,
    canPrepare: candidates.length === 0
      && ['collecting', 'closed'].includes(batch.status)
      && pendingRequiredRows.length === 0
      && (hasSubmittedActions || hasAutoInfoActions),
    canFinishEmpty: batch.status !== 'confirmed'
      && candidates.length === 0
      && closeoutGate.ok === true
      && closeoutGate.emptyNight === true
      && (preparedEmpty || passiveEmpty),
    awaitingDayTransition: batch.status === 'confirmed' && closeoutGate.ok === true
  };
}

function ensureStorytellerCanMutate(room, ws) {
  return Boolean(room && room.storyteller === ws);
}

function formatSetupCandidateForStoryteller(candidate) {
  if (!candidate) return null;
  const teamCounts = countSeatCandidateTeams(candidate.seatCandidates || []);
  return {
    candidateId: candidate.candidateId || candidate.id,
    id: candidate.id || candidate.candidateId,
    status: candidate.status || 'pending',
    confirmed: candidate.confirmed === true,
    roomId: candidate.roomId,
    scriptId: candidate.scriptId,
    scriptEdition: candidate.scriptEdition,
    playerCount: candidate.playerCount,
    baseCounts: candidate.baseCounts,
    effectiveCounts: candidate.effectiveCounts,
    teamCounts,
    seatCandidates: (candidate.seatCandidates || []).map((seatCandidate) => ({
      seat: seatCandidate.seat,
      roleId: seatCandidate.roleId,
      trueRoleId: seatCandidate.trueRoleId,
      shownRoleId: seatCandidate.shownRoleId,
      team: seatCandidate.team,
      shownTeam: seatCandidate.shownTeam,
      role: seatCandidate.role,
      shownRole: seatCandidate.shownRole
    })),
    demonBluffs: candidate.demonBluffs || [],
    setupEffects: candidate.setupEffects || [],
    source: candidate.source || null,
    controlledFixture: candidate.controlledFixture || null,
    aiMockCandidate: candidate.aiMockCandidate || {
      status: 'suggestion-only',
      source: 'mock',
      requiresStorytellerConfirmation: true,
      directStateMutation: false,
      eventLogWrite: false
    },
    boundary: {
      previewOnly: candidate.status !== 'confirmed',
      storytellerConfirmationRequired: true,
      roleDeal: candidate.status === 'dealt',
      playerViewEmission: candidate.status === 'dealt',
      nightStart: false,
      aiCanLock: false
    }
  };
}

function buildConfirmedSetupCandidate(candidate) {
  const candidateId = candidate.candidateId || candidate.id;
  const scriptId = candidate.scriptId || 'trouble-brewing';
  return {
    ...candidate,
    id: candidateId,
    candidateId,
    status: 'confirmed',
    confirmed: true,
    assignments: (candidate.seatCandidates || []).map((seatCandidate) => ({
      seat: seatCandidate.seat,
      trueRoleId: normalizeMvpDealRoleId(seatCandidate.trueRoleId || seatCandidate.roleId, scriptId),
      shownRoleId: normalizeMvpDealRoleId(seatCandidate.shownRoleId || seatCandidate.roleId, scriptId)
    })),
    demonBluffs: (candidate.demonBluffs || []).map((roleId) => normalizeMvpDealRoleId(roleId, scriptId)),
    boundary: {
      ...(candidate.boundary || {}),
      previewOnly: false,
      storytellerConfirmationRequired: false,
      roleLock: true,
      roleDeal: false,
      playerViewEmission: false,
      eventLogWrite: false,
      nightStart: false,
      aiCanLock: false
    }
  };
}

const SETUP_DRAFT_ROLE_ID_ALIASES = new Map([
  ['fortune_teller', 'fortune-teller'],
  ['fortuneteller', 'fortune-teller'],
  ['scarlet_woman', 'scarlet-woman'],
  ['scarletwoman', 'scarlet-woman'],
  ['snake_charmer', 'snakecharmer'],
  ['snake-charmer', 'snakecharmer'],
  ['pit_hag', 'pithag'],
  ['pit-hag', 'pithag'],
  ['fang_gu', 'fanggu'],
  ['fang-gu', 'fanggu'],
  ['evil_twin', 'eviltwin'],
  ['evil-twin', 'eviltwin'],
  ['devils_advocate', 'devilsadvocate'],
  ['devils-advocate', 'devilsadvocate'],
  ['no_dashii', 'nodashii'],
  ['no-dashii', 'nodashii'],
  ['tea_lady', 'tealady'],
  ['tea-lady', 'tealady'],
  ['town_crier', 'towncrier'],
  ['town-crier', 'towncrier']
]);

function compactSetupRoleId(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function setupRoleTeam(role) {
  if (!role) return 'townsfolk';
  if (role.team) return role.team;
  if (role.group === 'outsiders') return 'outsider';
  if (role.group === 'minions') return 'minion';
  if (role.group === 'demons') return 'demon';
  if (role.group === 'travellers' || role.group === 'travelers') return 'traveler';
  return role.group || 'townsfolk';
}

function isGoodSetupRole(role) {
  return role?.alignment === 'good'
    || role?.group === 'townsfolk'
    || role?.group === 'outsiders'
    || role?.team === 'townsfolk'
    || role?.team === 'outsider';
}

function isTownsfolkSetupRole(role) {
  return role?.group === 'townsfolk' || role?.team === 'townsfolk';
}

function resolveSetupDraftRole(roleId, catalog) {
  const raw = String(roleId || '').trim();
  if (!raw) return null;
  if (catalog.has(raw)) return catalog.get(raw);

  const lower = raw.toLowerCase();
  const alias = SETUP_DRAFT_ROLE_ID_ALIASES.get(lower)
    || SETUP_DRAFT_ROLE_ID_ALIASES.get(compactSetupRoleId(raw));
  if (alias && catalog.has(alias)) return catalog.get(alias);

  const compact = compactSetupRoleId(raw);
  for (const [id, role] of catalog.entries()) {
    if (compactSetupRoleId(id) === compact) return role;
  }
  return null;
}

function setupRoleMetadata(role) {
  return {
    id: role.id,
    name: role.name || role.nameEn || role.id,
    nameEn: role.nameEn || role.id,
    ability: role.ability || '',
    setup: Boolean(role.setup),
    team: setupRoleTeam(role)
  };
}

function normalizeSetupDraftBluffs({ candidateDraft, fallbackCandidate, catalog, inPlayRoleIds }) {
  const rawBluffs = Array.isArray(candidateDraft?.demonBluffs)
    ? candidateDraft.demonBluffs
    : (fallbackCandidate?.demonBluffs || []);
  const normalized = [];
  const seen = new Set();

  for (const bluff of rawBluffs) {
    const rawId = typeof bluff === 'string'
      ? bluff
      : (bluff?.roleId || bluff?.id || bluff?.trueRoleId || bluff?.shownRoleId);
    const role = resolveSetupDraftRole(rawId, catalog);
    if (!role || !isGoodSetupRole(role) || inPlayRoleIds.has(role.id) || seen.has(role.id)) continue;
    normalized.push(role.id);
    seen.add(role.id);
  }

  for (const role of catalog.values()) {
    if (normalized.length >= 3) break;
    if (!isGoodSetupRole(role) || inPlayRoleIds.has(role.id) || seen.has(role.id)) continue;
    normalized.push(role.id);
    seen.add(role.id);
  }

  if (normalized.length < 3) {
    throw new Error('not-enough-valid-demon-bluffs-after-setup-edit');
  }
  return normalized.slice(0, 3);
}

function normalizeSetupCandidateDraft(room, candidateDraft, fallbackCandidate) {
  if (!candidateDraft || typeof candidateDraft !== 'object') return fallbackCandidate;

  const scriptId = fallbackCandidate.scriptId || room.state.currentScript || 'trouble-brewing';
  const catalog = buildRoleCatalog(scriptId);
  if (!catalog.size) throw new Error('unsupported-script');

  const playerCount = Number.isInteger(room.state.playerCount) ? room.state.playerCount : 7;
  const occupiedSeats = getOccupiedRoomSeats(room);
  if (occupiedSeats.length !== playerCount) {
    throw new Error('room-not-full');
  }

  const sourceSeats = Array.isArray(candidateDraft.seatCandidates)
    ? candidateDraft.seatCandidates
    : [];
  const bySeat = new Map(sourceSeats.map((item) => [Number(item?.seat), item]));
  const firstPass = occupiedSeats.map((seat) => {
    const source = bySeat.get(Number(seat));
    if (!source) throw new Error(`missing-seat-candidate:${seat}`);
    const trueRole = resolveSetupDraftRole(source.trueRoleId || source.roleId || source.role?.id, catalog);
    if (!trueRole) throw new Error(`unknown-role-for-seat:${seat}`);
    return {
      seat: Number(seat),
      source,
      trueRole
    };
  });

  const inPlayRoleIds = new Set(firstPass.map((item) => item.trueRole.id));
  const seatCandidates = firstPass.map(({ seat, source, trueRole }) => {
    let shownRole = resolveSetupDraftRole(source.shownRoleId || source.shownRole?.id || source.roleId || source.trueRoleId, catalog) || trueRole;
    if (trueRole.id === 'drunk' && (!isTownsfolkSetupRole(shownRole) || shownRole.id === trueRole.id || inPlayRoleIds.has(shownRole.id))) {
      shownRole = Array.from(catalog.values()).find((role) => (
        isTownsfolkSetupRole(role)
        && role.id !== trueRole.id
        && !inPlayRoleIds.has(role.id)
      ));
      if (!shownRole) throw new Error('drunk-shown-role-not-available');
    }

    const trueTeam = setupRoleTeam(trueRole);
    const shownTeam = setupRoleTeam(shownRole);
    return {
      seat,
      roleId: trueRole.id,
      trueRoleId: trueRole.id,
      shownRoleId: shownRole.id,
      team: trueTeam,
      shownTeam,
      role: setupRoleMetadata(trueRole),
      shownRole: setupRoleMetadata(shownRole)
    };
  });

  const demonBluffs = normalizeSetupDraftBluffs({
    candidateDraft,
    fallbackCandidate,
    catalog,
    inPlayRoleIds: new Set(seatCandidates.map((candidate) => candidate.trueRoleId))
  });
  const teamCounts = countSeatCandidateTeams(seatCandidates);

  return {
    ...fallbackCandidate,
    ...candidateDraft,
    id: fallbackCandidate.id || fallbackCandidate.candidateId,
    candidateId: fallbackCandidate.candidateId || fallbackCandidate.id,
    roomId: room.id,
    scriptId,
    playerCount,
    seatCount: seatCandidates.length,
    occupiedSeats,
    seatCandidates,
    demonBluffs,
    effectiveCounts: teamCounts,
    teamCounts,
    status: 'pending',
    confirmed: false,
    source: candidateDraft.source || `${fallbackCandidate.source || 'rules'}-storyteller-edited`,
    storytellerEdited: true,
    boundary: {
      ...(fallbackCandidate.boundary || {}),
      previewOnly: true,
      roleLock: false,
      roleDeal: false,
      playerViewEmission: false,
      storytellerConfirmationRequired: true
    }
  };
}

function buildStage8FixedFixtureSetupCandidate(room) {
  const fixture = buildStage8TwelvePlayerFixture({ localRoleIds: true });
  const candidateId = `stage8-12p-fixed-fixture:${room.id}`;
  return buildConfirmedSetupCandidate({
    id: candidateId,
    candidateId,
    roomId: room.id,
    scriptId: 'trouble-brewing',
    scriptEdition: 'trouble-brewing',
    playerCount: fixture.playerCount,
    baseCounts: fixture.baseCounts,
    effectiveCounts: fixture.effectiveCounts,
    seatCandidates: fixture.seatCandidates,
    demonBluffs: fixture.demonBluffs,
    setupEffects: [],
    source: 'stage8-fixed-fixture',
    controlledFixture: {
      fixtureId: 'stage8-12p-trouble-brewing-fixed-v1',
      storytellerConfirmed: true,
      previewOnlyBeforeConfirm: true
    },
    aiMockCandidate: {
      status: 'disabled-fixed-fixture',
      source: 'stage8-fixed-fixture',
      summary: 'Stage 8 fixed 12p fixture confirmed by storyteller command; no AI state mutation.',
      requiresStorytellerConfirmation: true,
      directStateMutation: false,
      eventLogWrite: false
    },
    boundary: {
      ...fixture.boundary,
      previewOnly: false,
      storytellerConfirmationRequired: false,
      roleLock: true
    }
  });
}

function buildMvpDealRoom(room, confirmedCandidate) {
  ensureMvpPlayerTokens(room);
  const storytellerSessionId = ensureRoomStorytellerSession(room);
  return {
    id: room.id,
    scriptId: room.state.currentScript || 'trouble-brewing',
    scriptName: 'Trouble Brewing',
    phase: room.state.phase,
    round: Number.isInteger(room.state.round) ? room.state.round : 0,
    playerCount: room.state.playerCount,
    storytellerSessionId,
    players: (room.state.players || []).map((player) => ({
      ...player,
      seat: player.seat,
      name: player.name,
      playerToken: player.playerToken,
      playerTokenHash: player.playerTokenHash,
      connected: player.connected === true,
      alive: player.alive !== false,
      deadVoteAvailable: player.deadVoteAvailable !== false
    })),
    setupCandidates: [confirmedCandidate],
    confirmedSetupCandidate: confirmedCandidate,
    privateMessages: Array.isArray(room.state.privateMessages) ? room.state.privateMessages : [],
    actionHistory: Array.isArray(room.state.actionHistory) ? room.state.actionHistory : []
  };
}

function mergeMvpDealResultIntoRoom(room, resultRoom) {
  room.state.phase = resultRoom.phase;
  room.state.round = resultRoom.round;
  room.state.players = resultRoom.players;
  room.state.privateMessages = resultRoom.privateMessages || [];
  room.state.demonBluffs = resultRoom.demonBluffs || [];
  room.state.setupCandidates = resultRoom.setupCandidates || room.state.setupCandidates || [];
  room.state.confirmedSetupCandidate = resultRoom.confirmedSetupCandidate || room.state.confirmedSetupCandidate;
  room.state.dealRoles = resultRoom.dealRoles || room.state.dealRoles || null;
  room.state.actionHistory = resultRoom.actionHistory || room.state.actionHistory || [];
}

function broadcastPublicPlayerStatus(room, seat, fields = {}) {
  const publicFields = { seat };
  if (Object.prototype.hasOwnProperty.call(fields, 'alive')) {
    publicFields.alive = fields.alive;
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'deadVoteAvailable')) {
    publicFields.deadVoteAvailable = fields.deadVoteAvailable;
  }
  if (Object.keys(publicFields).length <= 1) {
    return;
  }

  broadcast(room.id, 'player_status_changed', publicFields);
}

function mergeMvpDayVoteResult(room, result) {
  if (result?.room?.state) {
    room.state = result.room.state;
  }
}

function buildDayVoteStorytellerPayload(room, extra = {}) {
  return {
    ...extra,
    dayVote: room?.state?.stage7DayVoteExecution || null,
    publicDayVoteView: buildPublicDayVoteView(room),
    lobby: buildPublicLobby(room)
  };
}

function sendDayVoteStorytellerUpdate(room, type = 'day_vote_updated', extra = {}) {
  if (!room?.storyteller || room.storyteller.readyState !== WebSocket.OPEN) return;
  room.storyteller.send(JSON.stringify({
    type,
    data: buildDayVoteStorytellerPayload(room, extra)
  }));
}

function markNightBatchConfirmedIfComplete(room, batchId) {
  if (!room?.state || !batchId) return null;
  const batch = (room.state.nightBatches || []).find((item) => item.batchId === batchId);
  if (!batch) return null;
  const candidateIds = new Set(batch.candidateResolutionIds || []);
  const candidates = (room.state.candidateResolutions || []).filter((candidate) => {
    return candidate.batchId === batchId || candidateIds.has(candidate.candidateId);
  });
  if (candidates.length === 0) return batch.status;
  const allTerminal = candidates.every((candidate) => ['confirmed', 'rejected', 'superseded'].includes(candidate.status));
  if (!allTerminal) return batch.status;
  room.state.nightBatches = (room.state.nightBatches || []).map((item) => {
    if (item.batchId !== batchId) return item;
    return {
      ...item,
      status: 'confirmed',
      confirmedAt: new Date().toISOString()
    };
  });
  return 'confirmed';
}

function buildGameEndStorytellerPayload(room, extra = {}) {
  return {
    ...extra,
    gameEnd: buildStorytellerGameEndView(room),
    lastGameRecord: room?.state?.lastGameRecord || null,
    lobby: buildPublicLobby(room)
  };
}

function buildPhaseTransitionRefusal(room, reason, extra = {}) {
  return {
    type: 'phase_transition_refused',
    data: {
      reason,
      ...extra,
      phaseSnapshot: getAuthoritativePhaseSnapshot(room),
      lobby: buildPublicLobby(room)
    }
  };
}

function startAuthoritativeDay(room, { round, durationSeconds = 300, now } = {}) {
  const gate = getStartDayGate(room, { round });
  if (!gate.ok) return { ok: false, response: buildPhaseTransitionRefusal(room, gate.reason) };
  const timestamp = now || new Date().toISOString();
  const nextRoom = {
    ...room,
    state: {
      ...room.state,
      phase: 'day',
      round: gate.expectedRound
    }
  };
  const result = startMvpDayTimer(nextRoom, {
    requester: 'storyteller',
    round: gate.expectedRound,
    durationSeconds: Number.isInteger(durationSeconds) && durationSeconds > 0 ? durationSeconds : 300,
    now: timestamp
  });
  if (result.response.type !== 'day_timer_started') {
    return {
      ok: false,
      response: buildPhaseTransitionRefusal(room, result.response.data?.reason || 'day-start-refused')
    };
  }
  room.state = result.room.state;
  appendActionHistory(room, 'day_timer_started', {
    round: gate.expectedRound,
    durationSeconds: result.response.data.durationSeconds
  }, { actor: 'storyteller' });
  appendPublicEvent(room, {
    id: `day-started:${room.state.gameNumber || 1}:${gate.expectedRound}`,
    type: 'day_started',
    title: '进入白天',
    summary: `第 ${gate.expectedRound} 天白天开始。当前存活：${countAlivePlayers(room)} 人。`,
    phase: 'day',
    round: gate.expectedRound,
    day: gate.expectedRound
  });
  return { ok: true, result, round: gate.expectedRound };
}

function startAuthoritativeNight(room, { nightNumber, isFirstNight, batchId, now } = {}) {
  const gate = getStartNightGate(room, { nightNumber });
  if (!gate.ok) return { ok: false, response: buildPhaseTransitionRefusal(room, gate.reason, { expectedNight: gate.expectedNight }) };
  const timestamp = now || new Date().toISOString();
  const nextState = {
    ...room.state,
    phase: 'night',
    round: gate.nightNumber
  };
  let result;
  try {
    result = startMvpNightCollection(nextState, {
      nightNumber: gate.nightNumber,
      isFirstNight: isFirstNight === undefined ? gate.isFirstNight : isFirstNight === true,
      batchId,
      now: timestamp
    });
  } catch (error) {
    return {
      ok: false,
      response: buildPhaseTransitionRefusal(room, error.message || 'night-collection-start-failed')
    };
  }
  room.state = {
    ...result.roomState,
    phase: 'night',
    round: gate.nightNumber
  };
  markNightBatchPublicStart(room, result.batch.batchId);
  appendActionHistory(room, 'night_started', {
    round: gate.nightNumber,
    nightNumber: gate.nightNumber,
    isFirstNight: gate.isFirstNight,
    batchId: result.batch.batchId
  }, { actor: 'storyteller' });
  return { ok: true, result, nightNumber: gate.nightNumber, isFirstNight: gate.isFirstNight };
}

function notifyNightCollectionParticipants(room, result, { storytellerWs = null, sendStartReceipt = false } = {}) {
  if (sendStartReceipt && storytellerWs?.readyState === WebSocket.OPEN) {
    storytellerWs.send(JSON.stringify({
      type: result.storytellerReceipt.type,
      data: {
        ...result.storytellerReceipt.data,
        nightOrder: formatNightOrderForStoryteller(result.batch),
        summary: getMvpNightSubmissionSummary(room.state, result.batch.batchId),
        nightWorkflow: buildStorytellerNightWorkflowSnapshot(room),
        lobby: buildPublicLobby(room)
      }
    }));
  }

  result.playerPrompts.forEach((prompt) => {
    const playerWs = room.clients.get(Number(prompt.seat));
    if (!playerWs || playerWs.readyState !== WebSocket.OPEN) return;
    playerWs.send(JSON.stringify({
      type: 'player_night_prompt',
      data: { batchId: result.batch.batchId, prompt }
    }));
    sendPlayerView(room, playerWs, Number(prompt.seat));
  });

  const aiTestResult = submitAiTestNightActions(room, result.batch.batchId);
  if (storytellerWs?.readyState === WebSocket.OPEN && (aiTestResult.submittedCount > 0 || aiTestResult.skipped.length > 0)) {
    storytellerWs.send(JSON.stringify({
      type: 'ai_test_night_actions_submitted',
      data: {
        batchId: result.batch.batchId,
        submittedCount: aiTestResult.submittedCount,
        seats: aiTestResult.seats,
        skipped: aiTestResult.skipped,
        policySummary: aiTestResult.policySummary,
        directStateMutation: aiTestResult.directStateMutation,
        storytellerConfirmationRequired: aiTestResult.storytellerConfirmationRequired,
        summary: getMvpNightSubmissionSummary(room.state, result.batch.batchId)
      }
    }));
    sendMvpNightSummaryToStoryteller(room, result.batch.batchId);
  }
  return aiTestResult;
}

function prepareAuthoritativeGameEnd(room, { now } = {}) {
  const timestamp = now || new Date().toISOString();
  const result = prepareMvpGameEndCandidate(room, { now: timestamp });
  if (result.response.type !== 'game_end_candidate_prepared' || !result.candidate) {
    return { ok: false, result };
  }
  if (result.room?.state) room.state = result.room.state;
  room.state.phase = 'game-end';
  if (result.response.data?.serverMutation !== false) {
    appendActionHistory(room, 'game_end_candidate_prepared', {
      candidateId: result.candidate.candidateId,
      winningTeam: result.candidate.winningTeam,
      reasonCode: result.candidate.reasonCode,
      publicResultPublished: false
    }, { actor: 'storyteller' });
  }
  return { ok: true, result };
}

function coordinateAfterNightCloseout(room, { durationSeconds = 300, now, requestId = null } = {}) {
  const gate = getNightCloseoutGate(room);
  if (!gate.ok) return buildPhaseTransitionRefusal(room, gate.reason, { requestId });
  const gameEnd = prepareAuthoritativeGameEnd(room, { now });
  if (gameEnd.ok) {
    sendPlayerViewsForRoom(room);
    return {
      type: 'game_end_candidate_prepared',
      data: buildGameEndStorytellerPayload(room, {
        ...gameEnd.result.response.data,
        sourceTransition: 'night-closeout',
        requestId,
        phaseSnapshot: getAuthoritativePhaseSnapshot(room)
      })
    };
  }
  const day = startAuthoritativeDay(room, {
    round: Number(gate.batch?.nightNumber || room.state.round || 1),
    durationSeconds,
    now
  });
  if (!day.ok) return attachRequestId(day.response, requestId);
  sendPlayerViewsForRoom(room);
  return {
    type: 'night_closed_and_day_started',
    data: buildDayVoteStorytellerPayload(room, {
      batchId: gate.batch?.batchId || null,
      nightNumber: Number(gate.batch?.nightNumber || day.round),
      round: day.round,
      requestId,
      phaseSnapshot: getAuthoritativePhaseSnapshot(room)
    })
  };
}

function coordinateAfterDayCloseout(room, { storytellerWs = null, now, requestId = null } = {}) {
  const dayVote = room.state.stage7DayVoteExecution || {};
  const gameEnd = prepareAuthoritativeGameEnd(room, { now });
  if (gameEnd.ok) {
    sendPlayerViewsForRoom(room);
    return {
      type: 'game_end_candidate_prepared',
      data: buildGameEndStorytellerPayload(room, {
        ...gameEnd.result.response.data,
        sourceTransition: 'day-closeout',
        dayVote,
        requestId,
        phaseSnapshot: getAuthoritativePhaseSnapshot(room)
      })
    };
  }
  const nextNightNumber = Number(dayVote.round || room.state.round || 1) + 1;
  const night = startAuthoritativeNight(room, { nightNumber: nextNightNumber, isFirstNight: false, now });
  if (!night.ok) return attachRequestId(night.response, requestId);
  notifyNightCollectionParticipants(room, night.result, { storytellerWs, sendStartReceipt: false });
  sendPlayerViewsForRoom(room);
  return {
    type: 'day_closed_and_night_started',
    data: {
      dayVote,
      dayNumber: Number(dayVote.round || nextNightNumber - 1),
      outcome: dayVote.dayClosed?.outcome || 'no-execution',
      executedSeat: dayVote.dayClosed?.executedSeat || null,
      batchId: night.result.batch.batchId,
      nightNumber: nextNightNumber,
      requestId,
      isFirstNight: false,
      nightOrder: formatNightOrderForStoryteller(night.result.batch),
      summary: getMvpNightSubmissionSummary(room.state, night.result.batch.batchId),
      nightWorkflow: buildStorytellerNightWorkflowSnapshot(room),
      phaseSnapshot: getAuthoritativePhaseSnapshot(room),
      lobby: buildPublicLobby(room)
    }
  };
}

function recordExecutionConfirmationEffects(room, result) {
  if (result.response.type === 'execution_confirmed') {
    appendActionHistory(room, 'execution_confirmed', {
      executionId: result.response.data.executionId,
      voteId: result.response.data.voteId,
      nomineeSeat: result.response.data.nomineeSeat,
      effective: result.response.data.effective === true,
      deathPrevented: result.response.data.deathPrevented === true,
      ruleEffects: result.response.data.ruleEffects || []
    }, { actor: 'storyteller' });
    if (result.response.data.effective === true) {
      broadcastPublicPlayerStatus(room, result.response.data.nomineeSeat, { alive: false });
    }
    appendPublicEvent(room, {
      id: `execution:${result.response.data.executionId}`,
      type: 'execution_confirmed',
      title: '处决结果',
      summary: result.response.data.effective === true
        ? `${result.response.data.nomineeSeat} 号已被处决。当前存活：${countAlivePlayers(room)} 人。`
        : `${result.response.data.nomineeSeat} 号没有死亡。当前存活：${countAlivePlayers(room)} 人。`,
      phase: 'day',
      round: room.state.round,
      day: room.state.round,
      executedSeat: result.response.data.nomineeSeat,
      deadSeats: result.response.data.effective === true ? [result.response.data.nomineeSeat] : []
    });
    return;
  }
  if (result.response.type === 'execution_rejected') {
    appendActionHistory(room, 'no_execution_confirmed', {
      voteId: result.response.data.voteId,
      nomineeSeat: result.response.data.nomineeSeat,
      executionStatus: 'no-execution-confirmed'
    }, { actor: 'storyteller' });
  }
}

wss.on('connection', (ws, req) => {
  const originGate = getWebSocketOriginGate(req);
  if (!originGate.ok) {
    sendError(ws, originGate.reason, originGate.reason);
    ws.close(1008, originGate.reason);
    return;
  }
  const checkRateLimit = createWebSocketRateLimiter();
  let currentRoom = null;
  let currentSeat = null;

  ws.on('error', (error) => {
    console.warn('WebSocket connection error:', error.message || error);
  });

  ws.on('message', async (message) => {
    try {
      const messageSize = getWebSocketMessageByteLength(message);
      if (messageSize > WEBSOCKET_MAX_PAYLOAD_BYTES) {
        sendError(ws, 'websocket-payload-too-large', 'websocket-payload-too-large', {
          maxPayloadBytes: WEBSOCKET_MAX_PAYLOAD_BYTES,
          receivedBytes: messageSize
        });
        ws.close(1009, 'websocket-payload-too-large');
        return;
      }
      const rateGate = checkRateLimit();
      if (!rateGate.ok) {
        sendError(ws, 'websocket-rate-limit-exceeded', 'websocket-rate-limit-exceeded', rateGate);
        ws.close(1008, 'websocket-rate-limit-exceeded');
        return;
      }
      const msg = JSON.parse(message);
      if (shouldRefuseLegacyWebSocketCommand(msg.type)) {
        sendLegacyWebSocketCommandRefused(ws, msg.type);
        return;
      }

      switch (msg.type) {
        case 'get_script_list': {
          const scripts = scriptManager.getScriptList();
          ws.send(JSON.stringify({
            type: 'script_list',
            data: { scripts }
          }));
          console.log('发送剧本列表');
          break;
        }

        case 'get_public_script_roles': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const requestedScriptId = msg.data?.scriptId;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const scriptId = room?.state?.currentScript || requestedScriptId || 'trouble-brewing';
          const catalog = buildPublicScriptRoleCatalog(scriptId);

          if (!catalog) {
            sendError(ws, 'unsupported-script', 'unsupported-script');
            return;
          }

          ws.send(JSON.stringify({
            type: 'public_script_roles',
            data: catalog
          }));
          break;
        }

        case 'register_imported_script': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller');
            return;
          }
          try {
            const script = registerImportedScriptPayload(msg.data?.script || msg.data);
            if (!script) {
              sendError(ws, 'invalid-imported-script', 'invalid-imported-script');
              return;
            }
            const persisted = persistImportedScript(script);

            ws.send(JSON.stringify({
              type: 'imported_script_registered',
              data: {
                scriptId: script.id,
                scriptName: script.name,
                scriptNameEn: script.nameEn,
                catalog: buildPublicScriptRoleCatalog(script.id),
                persisted: persisted
                  ? { fileName: persisted.fileName, relativePath: path.relative(__dirname, persisted.filePath) }
                  : null
              }
            }));
          } catch (error) {
            sendError(ws, error.code || 'invalid-imported-script', error.code || 'invalid-imported-script');
          }
          break;
        }

        case 'select_script': {
          const { scriptId, roomId } = msg.data || {};
          const selectedRoomId = roomId || currentRoom;
          const room = selectedRoomId ? rooms.get(selectedRoomId) : null;
          
          if (!room || room.storyteller !== ws) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller');
            return;
          }
          
          let script = scriptManager.getScript(scriptId);
          if (!script && msg.data?.script) {
            script = registerImportedScriptPayload(msg.data.script);
            if (script) persistImportedScript(script);
          }
          if (!script) {
            sendError(ws, 'unsupported-script', 'unsupported-script');
            return;
          }

          if (room.state.phase === 'roles-dealt' || room.state.dealRoles?.commandId) {
            sendError(ws, 'script-change-after-role-deal-refused', 'script-change-after-role-deal-refused');
            return;
          }
          
          currentRoom = selectedRoomId;
          room.state.currentScript = script.id;
          room.state.script = script;
          room.state.nightOrder = script.nightOrder || null;
          room.state.ruleLogic = script.ruleLogic || null;
          room.state.setupCandidates = [];
          room.state.confirmedSetupCandidate = null;
          room.state.pendingSetupCandidateId = null;
          room.state.demonBluffs = [];
          if (room.state.phase === 'setup-confirmed') {
            room.state.phase = 'waiting';
          }
          appendActionHistory(room, 'script_selected', {
            scriptId,
            scriptName: script.name,
            scriptNameEn: script.nameEn
          }, { actor: 'storyteller' });
          ws.send(JSON.stringify({ 
            type: 'script_selected', 
            data: { 
              scriptId,
              scriptName: script.name,
              scriptNameEn: script.nameEn,
              lobby: buildPublicLobby(room)
            } 
          }));
          console.log(`房间 ${selectedRoomId} 选择剧本: ${script.name}`);
          sendPlayerViewsForRoom(room);
          break;
        }

        case 'auto_distribute_roles': {
          const room = rooms.get(currentRoom);
          if (!room || room.storyteller !== ws) {
            ws.send(JSON.stringify({ type: 'error', data: { message: '无权限' } }));
            return;
          }
          
          const playerCount = room.state.players.length;
          if (playerCount < 5) {
            ws.send(JSON.stringify({ type: 'error', data: { message: '玩家数量不足（至少5人）' } }));
            return;
          }
          
          try {
            const result = roleDistributor.distributeRoles(playerCount, room.state.currentScript);
            
            // 分配给玩家
            room.state.players.forEach((player, index) => {
              const role = result.roles[index];
              player.role = role.id;
              player.roleName = role.name;
              player.roleNameEn = role.nameEn;
              player.alignment = ['minions', 'demons'].includes(role.type) ? 'evil' : 'good';
            });
            appendActionHistory(room, 'roles_auto_distributed', {
              playerCount,
              scriptId: room.state.currentScript,
              balanceScore: result.balanceScore,
              attempts: result.attempts,
              roles: room.state.players.map((player) => ({
                seat: player.seat,
                role: player.role,
                roleName: player.roleName,
                alignment: player.alignment
              }))
            }, { actor: 'storyteller' });
            
            ws.send(JSON.stringify({ 
              type: 'roles_distributed', 
              data: { 
                config: result.config,
                balanceScore: result.balanceScore,
                attempts: result.attempts,
                players: room.state.players
              } 
            }));
            
            console.log(`房间 ${currentRoom} 自动分配身份完成，平衡性: ${result.balanceScore.toFixed(2)}`);
          } catch (error) {
            ws.send(JSON.stringify({ type: 'error', data: { message: error.message } }));
          }
          break;
        }

        case 'stage4_validate_setup_lock': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = validateStage4SetupLockContract({
            room,
            ws,
            setupLock: msg.data?.setupLock
          });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage4_commit_setup_lock': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = commitStage4SetupLock({
            room,
            ws,
            setupLock: msg.data?.setupLock
          });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage4_generate_role_assignment_candidate': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = buildStage4RoleAssignmentCandidate({ room, ws });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage4_commit_role_assignment': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = commitStage4RoleAssignment({
            room,
            ws,
            setupLockId: msg.data?.setupLockId,
            assignmentCandidateId: msg.data?.assignmentCandidateId,
            assignments: msg.data?.assignments
          });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage4_deal_private_roles': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = dealStage4PrivateRoles({ room, ws });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage4_create_night_queue': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = createStage4NightQueue({ room, ws });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage4_send_next_player_night_prompt': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = sendStage4PlayerNightPrompt({ room, ws });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage4_submit_player_night_response': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = submitStage4PlayerNightResponse({
            room,
            ws,
            seat: currentSeat,
            responsePayload: msg.data?.responsePayload
          });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage4_resolve_player_night_response': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = resolveStage4PlayerNightResponse({ room, ws });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage4_execute_player_night_ability': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = await executeStage4PlayerNightAbility({ room, ws });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage4_complete_player_night_action': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = completeStage4PlayerNightAction({ room, ws });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage5_prepare_night_closeout': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = prepareStage5NightCloseout({ room, ws });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage5_start_day_transition': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = startStage5DayTransition({ room, ws });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage5_prepare_day_interaction': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = prepareStage5DayInteraction({ room, ws });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage5_prepare_nomination': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = prepareStage5Nomination({ room, ws });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage5_record_nomination': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = recordStage5Nomination({
            room,
            ws,
            nominatorSeat: msg.data?.nominatorSeat,
            nomineeSeat: msg.data?.nomineeSeat
          });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage5_start_voting': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = startStage5Voting({ room, ws });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage5_record_vote': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = recordStage5Vote({
            room,
            ws,
            currentSeat,
            voterSeat: msg.data?.voterSeat,
            vote: msg.data?.vote
          });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage5_count_vote': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = countStage5Vote({
            room,
            ws
          });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage5_resolve_vote': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = resolveStage5Vote({
            room,
            ws
          });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage5_execute_vote_death': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = executeStage5VoteDeath({
            room,
            ws
          });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage5_prepare_post_death_day_continuation': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = prepareStage5PostDeathDayContinuation({
            room,
            ws
          });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage5_prepare_post_death_next_nomination': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = prepareStage5PostDeathNextNomination({
            room,
            ws
          });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage5_record_post_death_next_nomination': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = recordStage5PostDeathNextNomination({
            room,
            ws,
            nominatorSeat: msg.data?.nominatorSeat,
            nomineeSeat: msg.data?.nomineeSeat
          });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage5_restart_post_death_voting': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = restartStage5PostDeathVoting({
            room,
            ws
          });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage5_record_post_death_vote': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = recordStage5PostDeathVote({
            room,
            ws,
            currentSeat,
            voterSeat: msg.data?.voterSeat,
            vote: msg.data?.vote
          });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage5_count_post_death_vote': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = countStage5PostDeathVote({
            room,
            ws
          });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage5_resolve_post_death_vote': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = resolveStage5PostDeathVote({
            room,
            ws
          });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'stage5_execute_post_death_vote_death': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const response = executeStage5PostDeathVoteDeath({
            room,
            ws
          });

          ws.send(JSON.stringify(response));
          break;
        }

        case 'create_room': {
          const requestedPassword = normalizeRoomPassword(msg.data?.password);
          const passwordRequired = Boolean(requestedPassword);

          const playerCount = Number.isInteger(msg.data?.playerCount) ? msg.data.playerCount : 7;
          if (playerCount < 7 || playerCount > 15) {
            sendError(ws, 'invalid-player-count', 'invalid-player-count');
            return;
          }

          const scriptId = msg.data?.scriptId || 'trouble-brewing';
          let script = scriptManager.getScript(scriptId);
          if (!script && msg.data?.script) {
            script = registerImportedScriptPayload(msg.data.script);
            if (script) persistImportedScript(script);
          }
          if (!script) {
            sendError(ws, 'unsupported-script', 'unsupported-script');
            return;
          }

          const requestedRoomId = normalizeRequestedRoomId(msg.data?.roomId);
          if (msg.data?.roomId && !requestedRoomId) {
            sendError(ws, 'invalid-room-id', 'invalid-room-id');
            return;
          }
          if (requestedRoomId && rooms.has(requestedRoomId)) {
            sendError(ws, 'room-id-already-exists', 'room-id-already-exists');
            return;
          }
          let roomId = requestedRoomId || generateRoomId();
          while (!requestedRoomId && rooms.has(roomId)) {
            roomId = generateRoomId();
          }
          const storytellerReconnectToken = createStorytellerReconnectToken();
          const room = {
            id: roomId,
            storyteller: ws,
            storytellerReconnectTokenHash: hashStorytellerReconnectToken(storytellerReconnectToken),
            passwordRequired,
            password: createPasswordRecord(requestedPassword),
            clients: new Map(),
            state: {
              createdAt: new Date().toISOString(),
              phase: 'waiting',
              round: 0,
              gameNumber: 1,
              series: {
                currentGameNumber: 1,
                previousGames: []
              },
              playerCount,
              players: [],
              nightActions: [],
              currentScript: scriptId,
              nightQueue: [],
              history: [],
              actionHistory: [],
              storytellerSessionId: `storyteller:${roomId}`,
              setupCandidates: [],
              confirmedSetupCandidate: null,
              nightBatches: [],
              nightSubmissions: [],
              candidateResolutions: [],
              aiAuditRecords: [],
              aiControl: getAiControlSnapshot({}),
              diaryEntries: [],
              privateMessages: [],
              publicEvents: [],
              identityReceipts: [],
              identityReceiptRoleDealId: null,
              identityReceiptUpdatedAt: null,
              nextActionId: 1
            }
          };
          rooms.set(roomId, room);
          currentRoom = roomId;
          appendActionHistory(room, 'room_created', {
            roomId,
            currentScript: room.state.currentScript,
            playerCount,
            passwordRequired
          }, { actor: 'storyteller' });
          const roomDirectory = buildStorytellerRoomDirectory();
          ws.send(JSON.stringify({
            type: 'room_created',
            data: {
              roomId,
              storytellerReconnectToken,
              playerCount,
              scriptId: room.state.currentScript,
              passwordRequired,
              aiControl: getAiControlSnapshot(room.state),
              lobby: buildPublicLobby(room),
              rooms: roomDirectory.rooms,
              roomCount: roomDirectory.roomCount,
              roomListLimit: roomDirectory.roomListLimit,
              roomListTruncated: roomDirectory.roomListTruncated
            }
          }));
          console.log(`Room created: ${roomId}`);
          break;
        }

        case 'storyteller_list_rooms': {
          const roomDirectory = buildStorytellerRoomDirectory();
          ws.send(JSON.stringify({
            type: 'storyteller_rooms_listed',
            data: {
              rooms: roomDirectory.rooms,
              roomCount: roomDirectory.roomCount,
              roomListLimit: roomDirectory.roomListLimit,
              roomListTruncated: roomDirectory.roomListTruncated
            }
          }));
          break;
        }

        case 'get_room_lobby': {
          const { roomId, password } = msg.data || {};
          const room = rooms.get(roomId);

          if (!room) {
            sendError(ws, 'room-not-found', 'room-not-found');
            return;
          }

          if (!isValidRoomPassword(room, password)) {
            sendError(ws, 'invalid-room-password', 'invalid-room-password');
            return;
          }

          ws.send(JSON.stringify({
            type: 'room_lobby',
            data: buildPublicLobby(room)
          }));
          break;
        }

        case 'join_room': {
          const { roomId, seat, playerName, password } = msg.data || {};
          const room = rooms.get(roomId);

          if (!room) {
            sendError(ws, 'room-not-found', 'room-not-found');
            return;
          }

          if (!isValidRoomPassword(room, password)) {
            sendError(ws, 'invalid-room-password', 'invalid-room-password');
            return;
          }

          if (room.state.phase !== 'waiting') {
            sendError(ws, 'game-already-started', 'game-already-started');
            return;
          }

          const claimedSeat = Number(seat);
          const maxSeat = Number.isInteger(room.state.playerCount) ? room.state.playerCount : 15;
          if (!Number.isInteger(claimedSeat) || claimedSeat < 1 || claimedSeat > maxSeat) {
            sendError(ws, 'invalid-seat', 'invalid-seat');
            return;
          }

          let existingPlayer = room.state.players.find((player) => player.seat === claimedSeat);
          if (existingPlayer && room.clients.has(claimedSeat)) {
            sendError(ws, 'seat-already-claimed', 'seat-already-claimed');
            return;
          }

          const displayName = typeof playerName === 'string' && playerName.trim()
            ? playerName.trim().slice(0, 24)
            : `??${claimedSeat}`;

          if (existingPlayer) {
            existingPlayer.name = displayName;
            existingPlayer.connected = true;
            existingPlayer.aiTestPlayer = false;
            existingPlayer.localTestOnly = false;
            if (!existingPlayer.playerToken) {
              existingPlayer.playerToken = makePlayerToken(roomId, claimedSeat);
            }
          } else {
            existingPlayer = {
              seat: claimedSeat,
              name: displayName,
              role: null,
              alive: true,
              playerToken: makePlayerToken(roomId, claimedSeat),
              deadVoteAvailable: true,
              connected: true
            };
            room.state.players.push(existingPlayer);
          }

          room.state.players.sort((a, b) => a.seat - b.seat);
          room.clients.set(claimedSeat, ws);
          currentRoom = roomId;
          currentSeat = claimedSeat;
          appendActionHistory(room, 'player_joined', {
            seat: claimedSeat,
            playerName: displayName,
            playerCount: room.state.players.length
          }, { actor: 'player', actorSeat: claimedSeat });
          const playerView = buildMvpPlayerViewForSeat(room, claimedSeat);

          ws.send(JSON.stringify({
            type: 'joined',
            data: {
              seat: claimedSeat,
              reconnectToken: existingPlayer.playerToken,
              state: buildLegacyPlayerStateForPlayerView(playerView),
              view: playerView
            }
          }));

          broadcast(roomId, 'player_joined', {
            lobby: buildPublicLobby(room),
            players: room.state.players.map((player) => ({
              seat: player.seat,
              name: player.name,
              alive: player.alive,
              connected: player.connected === true
            }))
          });

          if (room.storyteller && room.storyteller.readyState === WebSocket.OPEN) {
            room.storyteller.send(JSON.stringify({
              type: 'update_players',
              data: { players: buildStorytellerPlayers(room), lobby: buildPublicLobby(room) }
            }));
          }
          console.log(`Player joined: ${roomId} - seat ${claimedSeat}`);
          break;
        }

        case 'leave_room': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const requestedSeat = Number(msg.data?.seat || currentSeat);
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!room || !Number.isInteger(requestedSeat) || room.clients.get(requestedSeat) !== ws) {
            sendError(ws, 'unauthorized-player-leave', 'unauthorized-player-leave');
            return;
          }

          const leavingPlayer = room.state.players.find((player) => Number(player.seat) === requestedSeat);
          room.clients.delete(requestedSeat);
          const seatReleased = room.state.phase === 'waiting';
          if (seatReleased) {
            room.state.players = (room.state.players || []).filter((player) => Number(player.seat) !== requestedSeat);
            appendActionHistory(room, 'player_left_room', {
              seat: requestedSeat,
              playerName: leavingPlayer?.name || null,
              playerCount: room.state.players.length,
              seatReleased: true
            }, { actor: 'player', actorSeat: requestedSeat });
          } else if (leavingPlayer) {
            leavingPlayer.connected = false;
            appendActionHistory(room, 'player_exited_room', {
              seat: requestedSeat,
              playerName: leavingPlayer.name || null,
              playerCount: room.state.players.length,
              seatReleased: false,
              phase: room.state.phase
            }, { actor: 'player', actorSeat: requestedSeat });
          }

          currentRoom = null;
          currentSeat = null;

          const lobby = buildPublicLobby(room);
          ws.send(JSON.stringify({
            type: 'left_room',
            data: {
              roomId: room.id,
              seat: requestedSeat,
              seatReleased,
              lobby
            }
          }));

          broadcast(room.id, seatReleased ? 'player_left_room' : 'player_disconnected', {
            lobby,
            seat: requestedSeat
          });

          if (room.storyteller && room.storyteller.readyState === WebSocket.OPEN) {
            room.storyteller.send(JSON.stringify({
              type: 'update_players',
              data: { players: buildStorytellerPlayers(room), lobby }
            }));
          }
          break;
        }

        case 'player_send_private_message': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          if (!room || !Number.isInteger(currentSeat) || room.clients.get(currentSeat) !== ws) {
            sendError(ws, 'unauthorized-player', 'unauthorized-player');
            return;
          }
          try {
            const result = createPlayerPrivateMessage(room, currentSeat, msg.data || {});
            ws.send(JSON.stringify({
              type: 'player_private_message_sent',
              data: {
                message: {
                  id: result.message.id,
                  fromSeat: result.message.fromSeat,
                  title: result.message.title,
                  text: result.message.text,
                  createdAt: result.message.createdAt
                },
                duplicate: result.duplicate === true,
                retention: result.retention || null
              }
            }));
            if (room.storyteller?.readyState === WebSocket.OPEN) {
              room.storyteller.send(JSON.stringify({
                type: 'player_private_message_received',
                data: {
                  message: {
                    id: result.message.id,
                    fromSeat: result.message.fromSeat,
                    title: result.message.title,
                    text: result.message.text,
                    createdAt: result.message.createdAt
                  },
                  duplicate: result.duplicate === true
                }
              }));
            }
          } catch (error) {
            sendError(ws, error.code || 'private-message-send-failed', error.message || 'private-message-send-failed');
          }
          break;
        }

        case 'player_mark_private_messages_read': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          if (!room || !Number.isInteger(currentSeat) || room.clients.get(currentSeat) !== ws) {
            sendError(ws, 'unauthorized-player', 'unauthorized-player');
            return;
          }
          const result = markPlayerPrivateMessagesRead(room, currentSeat, msg.data?.messageIds);
          ws.send(JSON.stringify({
            type: 'player_private_messages_read',
            data: { updated: result.updated, readAt: result.readAt }
          }));
          sendPlayerView(room, ws, currentSeat);
          break;
        }

        case 'player_sync_view': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const requestedSeat = Number.isInteger(msg.data?.seat) ? msg.data.seat : currentSeat;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!room || !Number.isInteger(requestedSeat) || room.clients.get(requestedSeat) !== ws) {
            ws.send(JSON.stringify({ type: 'error', data: { message: 'unauthorized-player-view' } }));
            return;
          }

          currentRoom = requestedRoomId;
          currentSeat = requestedSeat;
          sendPlayerView(room, ws, requestedSeat);
          break;
        }

        case 'player_confirm_identity_receipt': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const requestedSeat = Number.isInteger(msg.data?.seat) ? msg.data.seat : currentSeat;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!room || !Number.isInteger(requestedSeat) || room.clients.get(requestedSeat) !== ws) {
            ws.send(JSON.stringify({ type: 'error', data: { message: 'unauthorized-identity-receipt' } }));
            return;
          }

          const player = room.state.players.find((item) => Number(item.seat) === Number(requestedSeat));
          const playerView = buildMvpPlayerViewForSeat(room, requestedSeat);
          const hasRole = Boolean(playerView?.privateView?.role?.roleId);
          const roleDealId = getIdentityReceiptRoleDealId(room);

          if (!player || !hasRole || !roleDealId) {
            ws.send(JSON.stringify({ type: 'error', data: { message: 'identity-not-dealt' } }));
            return;
          }

          const confirmedAt = new Date().toISOString();
          const nextReceipt = {
            seat: requestedSeat,
            name: player.name || null,
            roleDealId,
            confirmedAt,
            confirmedBy: 'player'
          };
          const previousReceipts = Array.isArray(room.state.identityReceipts) ? room.state.identityReceipts : [];
          room.state.identityReceipts = [
            ...previousReceipts.filter((receipt) => !(
              Number(receipt.seat) === Number(requestedSeat) && receipt.roleDealId === roleDealId
            )),
            nextReceipt
          ].sort((a, b) => Number(a.seat) - Number(b.seat));
          room.state.identityReceiptUpdatedAt = confirmedAt;

          ws.send(JSON.stringify({
            type: 'identity_receipt_confirmed',
            data: {
              seat: requestedSeat,
              receipt: buildPlayerIdentityReceiptView(room, requestedSeat),
              view: buildMvpPlayerViewForSeat(room, requestedSeat)
            }
          }));

          if (room.storyteller && room.storyteller.readyState === WebSocket.OPEN) {
            room.storyteller.send(JSON.stringify({
              type: 'identity_receipts_updated',
              data: {
                identityReceiptSummary: buildIdentityReceiptSummary(room),
                lobby: buildPublicLobby(room)
              }
            }));
          }
          break;
        }

        case 'player_reconnect_session': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const requestedSeat = Number(msg.data?.seat);
          const reconnectToken = typeof msg.data?.reconnectToken === 'string' ? msg.data.reconnectToken : '';
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const player = room?.state?.players?.find((item) => item.seat === requestedSeat);

          const tokenMatches = Boolean(
            player?.playerToken === reconnectToken || verifyPlayerTokenHash(player, reconnectToken)
          );
          if (!room || !player || !reconnectToken || !tokenMatches) {
            ws.send(JSON.stringify({ type: 'error', data: { message: 'unauthorized-player-reconnect' } }));
            return;
          }

          const previousSocket = room.clients.get(requestedSeat);
          if (previousSocket && previousSocket !== ws && previousSocket.readyState === WebSocket.OPEN) {
            previousSocket.close(4002, 'Player session reconnected');
          }
          attachVerifiedPlayerToken(player, reconnectToken);
          player.connected = true;
          room.clients.set(requestedSeat, ws);
          currentRoom = requestedRoomId;
          currentSeat = requestedSeat;
          ws.send(JSON.stringify({
            type: 'player_session_reconnected',
            data: {
              seat: requestedSeat,
              view: buildMvpPlayerViewForSeat(room, requestedSeat)
            }
          }));
          if (room.storyteller && room.storyteller.readyState === WebSocket.OPEN) {
            room.storyteller.send(JSON.stringify({
              type: 'update_players',
              data: { players: buildStorytellerPlayers(room), lobby: buildPublicLobby(room) }
            }));
          }
          break;
        }

        case 'storyteller_join': {
          const { roomId } = msg.data || {};
          const requestedRoomId = normalizeRequestedRoomId(roomId);
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!room) {
            sendError(ws, 'room-not-found', 'room-not-found');
            return;
          }

          const reconnectToken = typeof msg.data?.reconnectToken === 'string'
            ? msg.data.reconnectToken
            : '';
          if (!verifyStorytellerReconnectToken(room, reconnectToken)) {
            sendError(ws, 'invalid-storyteller-reconnect-token', 'invalid-storyteller-reconnect-token');
            return;
          }

          const replacedExistingStoryteller = Boolean(
            room.storyteller && room.storyteller !== ws && room.storyteller.readyState === WebSocket.OPEN
          );
          
          if (room.storyteller && room.storyteller !== ws && room.storyteller.readyState === WebSocket.OPEN) {
            try {
              room.storyteller.close(4001, 'Storyteller session replaced');
            } catch (error) {
              console.warn(`Failed to close previous storyteller socket for room ${room.id}:`, error);
            }
          }
          
          room.storyteller = ws;
          ensureRoomStorytellerSession(room);
          currentRoom = room.id;
          appendActionHistory(room, 'storyteller_joined', {
            roomId: room.id,
            replacedExistingStoryteller
          }, { actor: 'storyteller' });
          const replayBaseline = deriveReplayBaselineFromHistory(room.state.actionHistory);
          
          const roomDirectory = buildStorytellerRoomDirectory();
          ws.send(JSON.stringify({ 
            type: 'storyteller_joined', 
            data: {
              state: buildStorytellerState(room),
              roomId: room.id,
              storytellerReconnectToken: reconnectToken,
              nightWorkflow: buildStorytellerNightWorkflowSnapshot(room),
              replayBaseline,
              lobby: buildPublicLobby(room),
              rooms: roomDirectory.rooms,
              roomCount: roomDirectory.roomCount,
              roomListLimit: roomDirectory.roomListLimit,
              roomListTruncated: roomDirectory.roomListTruncated
            }
          }));
          console.log(`说书人加入: ${room.id}`);
          break;
        }

        case 'storyteller_dissolve_room': {
          const requestedRoomId = normalizeRequestedRoomId(msg.data?.roomId);
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          if (!room) {
            sendError(ws, 'room-not-found', 'room-not-found');
            return;
          }
          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller');
            return;
          }
          if (msg.data?.confirm !== true) {
            sendError(ws, 'room-dissolve-confirm-required', 'room-dissolve-confirm-required');
            return;
          }

          const payload = JSON.stringify({
            type: 'room_dissolved',
            data: {
              roomId: room.id,
              reason: 'storyteller-dissolved'
            }
          });
          for (const clientWs of room.clients.values()) {
            if (clientWs?.readyState === WebSocket.OPEN) {
              clientWs.send(payload);
              clientWs.close(4002, 'Room dissolved');
            }
          }
          if (room.storyteller && room.storyteller !== ws && room.storyteller.readyState === WebSocket.OPEN) {
            room.storyteller.send(payload);
            room.storyteller.close(4002, 'Room dissolved');
          }

          rooms.delete(room.id);
          if (currentRoom === room.id) currentRoom = null;
          persistRoomSnapshots();
          const roomDirectory = buildStorytellerRoomDirectory();
          ws.send(JSON.stringify({
            type: 'storyteller_room_dissolved',
            data: {
              roomId: room.id,
              rooms: roomDirectory.rooms,
              roomCount: roomDirectory.roomCount,
              roomListLimit: roomDirectory.roomListLimit,
              roomListTruncated: roomDirectory.roomListTruncated
            }
          }));
          console.log(`Room dissolved: ${room.id}`);
          break;
        }

        case 'storyteller_set_ai_control_mode': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller');
            return;
          }

          try {
            const snapshot = setAiControlMode(room.state, {
              mode: msg.data?.mode,
              actor: 'storyteller'
            }, new Date().toISOString());
            ws.send(JSON.stringify({
              type: 'ai_control_mode_updated',
              data: {
                aiControl: snapshot,
                lobby: buildPublicLobby(room)
              }
            }));
          } catch (error) {
            sendError(ws, 'ai-control-mode-failed', error.message || 'ai-control-mode-failed');
          }
          break;
        }

        case 'storyteller_run_ai_control_tick': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller');
            return;
          }

          try {
            const before = {
              phase: room.state.phase,
              round: room.state.round,
              actionHistoryLength: Array.isArray(room.state.actionHistory) ? room.state.actionHistory.length : 0,
              publicEventsLength: Array.isArray(room.state.publicEvents) ? room.state.publicEvents.length : 0,
              privateMessagesLength: Array.isArray(room.state.privateMessages) ? room.state.privateMessages.length : 0
            };
            const result = runAiControlTick(room.state, {
              intent: msg.data?.intent
            }, new Date().toISOString());
            const after = {
              phase: room.state.phase,
              round: room.state.round,
              actionHistoryLength: Array.isArray(room.state.actionHistory) ? room.state.actionHistory.length : 0,
              publicEventsLength: Array.isArray(room.state.publicEvents) ? room.state.publicEvents.length : 0,
              privateMessagesLength: Array.isArray(room.state.privateMessages) ? room.state.privateMessages.length : 0
            };
            ws.send(JSON.stringify({
              type: result.accepted ? 'ai_control_tick_completed' : 'ai_control_tick_noop',
              data: {
                accepted: result.accepted,
                reason: result.reason,
                aiControl: result.snapshot,
                mutationBoundary: {
                  phaseChanged: before.phase !== after.phase,
                  roundChanged: before.round !== after.round,
                  actionHistoryWritten: before.actionHistoryLength !== after.actionHistoryLength,
                  publicEventsWritten: before.publicEventsLength !== after.publicEventsLength,
                  privateMessagesWritten: before.privateMessagesLength !== after.privateMessagesLength
                }
              }
            }));
          } catch (error) {
            sendError(ws, 'ai-control-tick-failed', error.message || 'ai-control-tick-failed');
          }
          break;
        }

        case 'generate_setup_candidate': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller');
            return;
          }

          const playerCount = Number.isInteger(room.state.playerCount) ? room.state.playerCount : 7;
          const readiness = getRoomSeatReadiness(room);
          if (!readiness.ok) {
            const code = getSeatReadinessErrorCode(readiness);
            sendError(ws, code, code);
            return;
          }
          const occupiedSeats = readiness.occupiedSeats;

          const scriptId = room.state.currentScript || 'trouble-brewing';
          if (!scriptManager.getScript(scriptId)) {
            sendError(ws, 'unsupported-script', 'unsupported-script');
            return;
          }

          try {
            const candidate = createSetupCandidate({
              roomId: room.id,
              scriptId,
              playerCount,
              occupiedSeats,
              seed: msg.data?.seed || `${room.id}:${Date.now()}`,
              source: 'rules'
            });
            const storedCandidate = {
              ...candidate,
              id: candidate.candidateId,
              status: 'pending',
              confirmed: false,
              aiMockCandidate: {
                status: 'suggestion-only',
                source: 'mock',
                summary: '候选仅供说书人确认；不会直接写日志、改状态或发身份。',
                requiresStorytellerConfirmation: true,
                directStateMutation: false,
                eventLogWrite: false
              }
            };
            room.state.setupCandidates = [
              ...(room.state.setupCandidates || []).filter((item) => (item.candidateId || item.id) !== storedCandidate.candidateId),
              storedCandidate
            ];
            room.state.pendingSetupCandidateId = storedCandidate.candidateId;

            ws.send(JSON.stringify({
              type: 'setup_candidate_generated',
              data: {
                candidate: formatSetupCandidateForStoryteller(storedCandidate),
                lobby: buildPublicLobby(room)
              }
            }));
          } catch (error) {
            sendError(ws, 'setup-candidate-failed', error.message || 'setup-candidate-failed');
          }
          break;
        }

        case 'storyteller_fill_ai_test_players': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller');
            return;
          }

          if (room.state.phase !== 'waiting') {
            sendError(ws, 'ai-fill-after-start-refused', 'ai-fill-after-start-refused');
            return;
          }

          const result = fillAiTestPlayers(room);
          const lobby = buildPublicLobby(room);
          const players = buildStorytellerPlayers(room);
          ws.send(JSON.stringify({
            type: 'ai_test_players_filled',
            data: {
              addedSeats: result.addedSeats,
              playerCount: result.playerCount,
              lobby,
              players
            }
          }));

          broadcast(room.id, 'player_joined', {
            lobby,
            players
          });
          break;
        }

        case 'storyteller_update_player_status': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const storytellerAuthorized = ensureStorytellerCanMutate(room, ws);
          const result = updateStorytellerPlayerStatus(room, msg.data || {}, {
            storytellerAuthorized,
            now: new Date().toISOString()
          });

          if (room && result.ledgerUpdated && result.room?.state) {
            room.state = result.room.state;
          }
          if (room && result.historyRequired) {
            appendActionHistory(room, 'storyteller_player_status_corrected', {
              requestId: result.response.data.requestId,
              seat: result.response.data.seat,
              previous: result.previous,
              changed: result.changed,
              current: result.current,
              correctionOnly: true,
              phaseCoordinatorInvoked: false,
              gameEndCheckInvoked: false
            }, { actor: 'storyteller' });
          }

          ws.send(JSON.stringify({
            type: result.response.type,
            data: {
              ...result.response.data,
              lobby: storytellerAuthorized && room ? buildPublicLobby(room) : null,
              phaseSnapshot: storytellerAuthorized && room
                ? getAuthoritativePhaseSnapshot(room)
                : null
            }
          }));

          if (room && result.applied) {
            broadcastPublicPlayerStatus(room, result.response.data.seat, {
              ...(Object.prototype.hasOwnProperty.call(result.changed, 'alive')
                ? { alive: result.changed.alive }
                : {}),
              ...(Object.prototype.hasOwnProperty.call(result.changed, 'deadVoteAvailable')
                ? { deadVoteAvailable: result.changed.deadVoteAvailable }
                : {})
            });
            const targetSeat = Number(result.response.data.seat);
            const targetWs = room.clients.get(targetSeat);
            if (targetWs?.readyState === WebSocket.OPEN) {
              sendPlayerView(room, targetWs, targetSeat);
            }
          }
          break;
        }

        case 'storyteller_send_private_message': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller');
            return;
          }

          try {
            const result = createStorytellerPrivateMessage(room, {
              seat: msg.data?.seat,
              title: msg.data?.title,
              text: msg.data?.text
            });
            ws.send(JSON.stringify({
              type: 'storyteller_private_message_sent',
              data: {
                message: {
                  id: result.message.id,
                  toSeat: result.message.toSeat,
                  title: result.message.title,
                  text: result.message.text,
                  createdAt: result.message.createdAt
                },
                recipient: result.recipient,
                retention: result.retention || null,
                privateMessageCount: room.state.privateMessages.length
              }
            }));

            const targetWs = room.clients.get(Number(result.message.toSeat));
            if (targetWs?.readyState === WebSocket.OPEN) {
              sendPlayerView(room, targetWs, Number(result.message.toSeat));
            }
          } catch (error) {
            sendError(ws, error.code || 'private-message-send-failed', error.message || 'private-message-send-failed');
          }
          break;
        }

        case 'confirm_setup_candidate': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller');
            return;
          }

          const candidateId = msg.data?.candidateId || room.state.pendingSetupCandidateId;
          const candidate = (room.state.setupCandidates || []).find((item) => (item.candidateId || item.id) === candidateId);
          if (!candidate) {
            sendError(ws, 'setup-candidate-not-found', 'setup-candidate-not-found');
            return;
          }

          let candidateToConfirm = candidate;
          try {
            candidateToConfirm = normalizeSetupCandidateDraft(room, msg.data?.candidateDraft, candidate);
          } catch (error) {
            sendError(ws, 'setup-candidate-draft-invalid', error.message || 'setup-candidate-draft-invalid');
            return;
          }

          const confirmedCandidate = buildConfirmedSetupCandidate(candidateToConfirm);
          room.state.setupCandidates = [
            ...(room.state.setupCandidates || []).filter((item) => (item.candidateId || item.id) !== confirmedCandidate.candidateId),
            confirmedCandidate
          ];
          room.state.confirmedSetupCandidate = confirmedCandidate;
          room.state.phase = 'setup-confirmed';
          room.state.pendingSetupCandidateId = null;

          ws.send(JSON.stringify({
            type: 'setup_candidate_confirmed',
            data: {
              candidate: formatSetupCandidateForStoryteller(confirmedCandidate),
              lobby: buildPublicLobby(room)
            }
          }));
          break;
        }

        case 'reset_setup_candidate': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller');
            return;
          }

          if (room.state.phase === 'roles-dealt' || room.state.dealRoles?.commandId) {
            sendError(ws, 'setup-reset-after-role-deal-refused', 'setup-reset-after-role-deal-refused');
            return;
          }

          room.state.setupCandidates = [];
          room.state.confirmedSetupCandidate = null;
          room.state.pendingSetupCandidateId = null;
          room.state.demonBluffs = [];
          if (room.state.phase === 'setup-confirmed') {
            room.state.phase = 'waiting';
          }
          appendActionHistory(room, 'setup_candidate_reset', {}, { actor: 'storyteller' });

          ws.send(JSON.stringify({
            type: 'setup_candidate_reset',
            data: {
              lobby: buildPublicLobby(room)
            }
          }));
          break;
        }

        case 'storyteller_confirm_stage8_fixed_fixture': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller');
            return;
          }

          if (msg.data?.fixtureId !== 'stage8-12p-trouble-brewing-fixed-v1' || msg.data?.confirm !== true) {
            sendError(ws, 'stage8-fixed-fixture-confirmation-required', 'stage8-fixed-fixture-confirmation-required');
            return;
          }

          if (room.state.currentScript !== 'trouble-brewing') {
            sendError(ws, 'unsupported-script', 'unsupported-script');
            return;
          }

          const playerCount = Number.isInteger(room.state.playerCount) ? room.state.playerCount : 0;
          const occupiedSeats = getOccupiedRoomSeats(room);
          if (playerCount !== 12 || occupiedSeats.join(',') !== '1,2,3,4,5,6,7,8,9,10,11,12') {
            sendError(ws, 'stage8-fixed-fixture-requires-12-occupied-seats', 'stage8-fixed-fixture-requires-12-occupied-seats');
            return;
          }

          const confirmedCandidate = buildStage8FixedFixtureSetupCandidate(room);
          room.state.setupCandidates = [
            ...(room.state.setupCandidates || []).filter((item) => (item.candidateId || item.id) !== confirmedCandidate.candidateId),
            confirmedCandidate
          ];
          room.state.confirmedSetupCandidate = confirmedCandidate;
          room.state.phase = 'setup-confirmed';
          room.state.pendingSetupCandidateId = null;

          ws.send(JSON.stringify({
            type: 'setup_candidate_confirmed',
            data: {
              candidate: formatSetupCandidateForStoryteller(confirmedCandidate),
              controlledFixture: confirmedCandidate.controlledFixture,
              lobby: buildPublicLobby(room)
            }
          }));
          break;
        }

        case 'deal_roles': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller');
            return;
          }

          const candidateId = msg.data?.candidateId || room.state.confirmedSetupCandidate?.candidateId || room.state.confirmedSetupCandidate?.id;
          let confirmedCandidate = (room.state.setupCandidates || []).find((item) => (
            (item.candidateId || item.id) === candidateId && (item.confirmed === true || item.status === 'confirmed')
          )) || room.state.confirmedSetupCandidate;

          if (!confirmedCandidate || !(confirmedCandidate.confirmed === true || confirmedCandidate.status === 'confirmed')) {
            sendError(ws, 'setup-not-confirmed', 'setup-not-confirmed');
            return;
          }

          try {
            if (msg.data?.candidateDraft && typeof msg.data.candidateDraft === 'object') {
              const editedCandidate = normalizeSetupCandidateDraft(room, msg.data.candidateDraft, confirmedCandidate);
              confirmedCandidate = buildConfirmedSetupCandidate(editedCandidate);
              room.state.setupCandidates = [
                ...(room.state.setupCandidates || []).filter((item) => (item.candidateId || item.id) !== confirmedCandidate.candidateId),
                confirmedCandidate
              ];
              room.state.confirmedSetupCandidate = confirmedCandidate;
            }
            const readiness = getRoomSeatReadiness(room, confirmedCandidate);
            if (!readiness.ok) {
              const code = getSeatReadinessErrorCode(readiness);
              sendError(ws, code, code);
              return;
            }
            const storytellerSessionId = ensureRoomStorytellerSession(room);
            const result = dealMvpRoles({
              room: buildMvpDealRoom(room, confirmedCandidate),
              command: {
                command: 'storyteller_deal_roles',
                roomId: room.id,
                storytellerSessionId,
                candidateId: confirmedCandidate.candidateId || confirmedCandidate.id,
                commandId: msg.data?.commandId || `deal:${room.id}:${Date.now()}`
              },
              now: new Date().toISOString()
            });

            mergeMvpDealResultIntoRoom(room, result.room);
            room.state.confirmedSetupCandidate = {
              ...(room.state.confirmedSetupCandidate || confirmedCandidate),
              status: 'dealt',
              boundary: {
                ...(room.state.confirmedSetupCandidate?.boundary || {}),
                roleDeal: true,
                playerViewEmission: true,
                nightStart: false
              }
            };
            resetIdentityReceiptsForDeal(
              room,
              room.state.confirmedSetupCandidate.candidateId || room.state.confirmedSetupCandidate.id
            );
            autoConfirmAiIdentityReceipts(
              room,
              room.state.confirmedSetupCandidate.candidateId || room.state.confirmedSetupCandidate.id
            );

            ws.send(JSON.stringify({
              type: 'roles_dealt',
              data: {
                storytellerView: result.storytellerView,
                candidate: formatSetupCandidateForStoryteller(room.state.confirmedSetupCandidate),
                identityReceiptSummary: buildIdentityReceiptSummary(room),
                lobby: buildPublicLobby(room)
              }
            }));

            room.clients.forEach((clientWs, seat) => {
              sendPlayerView(room, clientWs, seat, 'role_assigned');
            });
          } catch (error) {
            const code = error instanceof DealRolesError ? error.code : 'deal-roles-failed';
            sendError(ws, code, error.message || code);
          }
          break;
        }

        case 'storyteller_start_night_collection': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller');
            return;
          }

          const requestedNightNumber = Number(msg.data?.nightNumber || room.state.round || 1);
          const night = startAuthoritativeNight(room, {
            nightNumber: requestedNightNumber,
            isFirstNight: msg.data?.isFirstNight,
            batchId: msg.data?.batchId,
            now: new Date().toISOString()
          });
          if (!night.ok) {
            ws.send(JSON.stringify(night.response));
            break;
          }
          notifyNightCollectionParticipants(room, night.result, { storytellerWs: ws, sendStartReceipt: true });
          sendPlayerViewsForRoom(room);
          break;
        }

        case 'player_submit_night_action': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const player = room?.state?.players?.find((item) => Number(item.seat) === Number(currentSeat));

          if (!room || !player || room.clients.get(Number(currentSeat)) !== ws) {
            sendError(ws, 'unauthorized-player-night-action', 'unauthorized-player-night-action');
            return;
          }

          try {
            const result = submitMvpNightAction(room.state, {
              batchId: msg.data?.batchId,
              promptId: msg.data?.promptId,
              playerToken: player.playerToken || player.playerTokenHash,
              payload: msg.data?.payload
            }, {
              now: new Date().toISOString()
            });
            room.state = result.roomState;

            ws.send(JSON.stringify(result.playerReceipt));
            sendPlayerView(room, ws, Number(currentSeat));
            if (room.storyteller?.readyState === WebSocket.OPEN) {
              room.storyteller.send(JSON.stringify(result.storytellerReceipt));
              sendMvpNightSummaryToStoryteller(room, msg.data?.batchId);
            }
          } catch (error) {
            sendError(ws, 'night-action-submit-failed', error.message || 'night-action-submit-failed');
          }
          break;
        }

        case 'player_withdraw_night_action': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const player = room?.state?.players?.find((item) => Number(item.seat) === Number(currentSeat));

          if (!room || !player || room.clients.get(Number(currentSeat)) !== ws) {
            sendError(ws, 'unauthorized-player-night-action', 'unauthorized-player-night-action');
            return;
          }

          try {
            const result = withdrawMvpNightAction(room.state, {
              batchId: msg.data?.batchId,
              promptId: msg.data?.promptId,
              playerToken: player.playerToken || player.playerTokenHash
            }, {
              now: new Date().toISOString()
            });
            room.state = result.roomState;

            ws.send(JSON.stringify(result.playerReceipt));
            sendPlayerView(room, ws, Number(currentSeat));
            if (room.storyteller?.readyState === WebSocket.OPEN) {
              room.storyteller.send(JSON.stringify(result.storytellerReceipt));
              sendMvpNightSummaryToStoryteller(room, msg.data?.batchId);
            }
          } catch (error) {
            sendError(ws, 'night-action-withdraw-failed', error.message || 'night-action-withdraw-failed');
          }
          break;
        }

        case 'storyteller_close_night_collection': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller');
            return;
          }

          try {
            const result = closeMvpNightCollection(room.state, {
              batchId: msg.data?.batchId,
              forceClose: msg.data?.forceClose === true
            }, {
              now: new Date().toISOString()
            });
            room.state = result.roomState;
            ws.send(JSON.stringify({
              type: result.storytellerReceipt.type,
              data: {
                ...result.storytellerReceipt.data,
                summary: getMvpNightSubmissionSummary(room.state, msg.data?.batchId),
                nightWorkflow: buildStorytellerNightWorkflowSnapshot(room)
              }
            }));
            sendPlayerViewsForRoom(room);
          } catch (error) {
            sendError(ws, 'night-collection-close-failed', error.message || 'night-collection-close-failed');
          }
          break;
        }

        case 'storyteller_prepare_candidate_resolutions': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller');
            return;
          }

          try {
            const requestedAiMode = msg.data?.aiMode || 'disabled';
            const providerModes = new Set(['provider', 'live', 'openai-compatible', 'openai']);
            const prepareOptions = {
              batchId: msg.data?.batchId,
              aiMode: requestedAiMode,
              now: new Date().toISOString(),
              mockAiOutput: msg.data?.mockAiOutput
            };
            const roomInput = {
              state: {
                ...room.state,
                roomId: room.id
              }
            };
            const prepared = providerModes.has(String(requestedAiMode).toLowerCase())
              ? await prepareMvpCandidateResolutionsWithAiProvider(roomInput, {
                  ...prepareOptions,
                  aiProvider: createAiProviderFromEnv(getAiSettingsEnv())
                })
              : prepareMvpCandidateResolutions(roomInput, prepareOptions);
            const batchId = msg.data?.batchId || prepared.candidates[0]?.batchId;
            room.state.candidateResolutions = [
              ...(room.state.candidateResolutions || []).filter((candidate) => candidate.batchId !== batchId),
              ...prepared.candidates
            ];
            room.state.aiAuditRecords = [
              ...(room.state.aiAuditRecords || []).filter((record) => {
                return !prepared.aiAuditRecords.some((nextRecord) => nextRecord.auditId === record.auditId);
              }),
              ...prepared.aiAuditRecords
            ];
            room.state.nightBatches = (room.state.nightBatches || []).map((batch) => {
              if (batch.batchId !== batchId) return batch;
              return {
                ...batch,
                status: 'candidates_ready',
                candidateResolutionIds: prepared.candidates.map((candidate) => candidate.candidateId)
              };
            });
            const nightWorkflow = buildStorytellerNightWorkflowSnapshot(room);

            ws.send(JSON.stringify({
              type: 'candidate_resolutions_prepared',
              data: {
                batchId,
                candidateCount: prepared.candidates.length,
                candidates: prepared.candidates,
                aiAuditRecords: prepared.aiAuditRecords,
                summary: prepared.summary,
                checks: prepared.checks,
                nightWorkflow
              }
            }));
            sendPlayerViewsForRoom(room);
          } catch (error) {
            sendError(ws, 'candidate-resolution-prepare-failed', error.code || error.message || 'candidate-resolution-prepare-failed');
          }
          break;
        }

        case 'storyteller_confirm_resolution': {
          const requestId = getRequestIdFromMessage(msg);
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller', { requestId });
            return;
          }

          try {
            const result = confirmMvpCandidateResolution(room.state.candidateResolutions || [], msg.data?.candidateId, {
              finalVisibleResult: msg.data?.finalVisibleResult,
              finalStateChange: msg.data?.finalStateChange,
              resolutionMode: msg.data?.resolutionMode,
              recordOnlyReason: msg.data?.recordOnlyReason,
              roomState: room.state,
              reviewedBy: 'storyteller',
              now: new Date().toISOString()
            });
            const nextCandidates = (room.state.candidateResolutions || []).map((candidate) => {
              return candidate.candidateId === result.candidate.candidateId ? result.candidate : candidate;
            });
            const nextState = applyMvpCandidateConfirmationCommand(room.state, result.command);
            nextState.candidateResolutions = nextCandidates;
            room.state = nextState;
            const batchStatus = markNightBatchConfirmedIfComplete(room, result.candidate.batchId);
            if (batchStatus === 'confirmed') {
              appendNightCloseoutPublicEvent(room, result.candidate.batchId);
            }

            sendJson(ws, {
              type: 'candidate_resolution_confirmed',
              data: {
                candidate: result.candidate,
                command: result.command,
                batchId: result.candidate.batchId,
                batchStatus,
                lobby: buildPublicLobby(room),
                privateMessagesSent: result.command.effects.privateMessages.length > 0,
                stateChanged: result.command.effects.statePatches.length > 0
              }
            }, requestId);
            sendPlayerViewsForRoom(room);
            if (batchStatus === 'confirmed') {
              sendJson(ws, coordinateAfterNightCloseout(room, {
                durationSeconds: Number.isInteger(msg.data?.dayDurationSeconds) ? msg.data.dayDurationSeconds : 300,
                now: new Date().toISOString(),
                requestId
              }), requestId);
            }
          } catch (error) {
            sendError(ws, 'candidate-resolution-confirm-failed', error.code || error.message || 'candidate-resolution-confirm-failed', { requestId });
          }
          break;
        }

        case 'storyteller_reject_resolution': {
          const requestId = getRequestIdFromMessage(msg);
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller', { requestId });
            return;
          }

          try {
            const result = rejectMvpCandidateResolution(room.state.candidateResolutions || [], msg.data?.candidateId, {
              reason: msg.data?.reason,
              reviewedBy: 'storyteller',
              now: new Date().toISOString()
            });
            room.state.candidateResolutions = (room.state.candidateResolutions || []).map((candidate) => {
              return candidate.candidateId === result.candidate.candidateId ? result.candidate : candidate;
            });
            const batchStatus = markNightBatchConfirmedIfComplete(room, result.candidate.batchId);
            if (batchStatus === 'confirmed') {
              appendNightCloseoutPublicEvent(room, result.candidate.batchId);
            }
            sendJson(ws, {
              type: 'candidate_resolution_rejected',
              data: { candidate: result.candidate, batchId: result.candidate.batchId, batchStatus, lobby: buildPublicLobby(room) }
            }, requestId);
            sendPlayerViewsForRoom(room);
            if (batchStatus === 'confirmed') {
              sendJson(ws, coordinateAfterNightCloseout(room, {
                durationSeconds: Number.isInteger(msg.data?.dayDurationSeconds) ? msg.data.dayDurationSeconds : 300,
                now: new Date().toISOString(),
                requestId
              }), requestId);
            }
          } catch (error) {
            sendError(ws, 'candidate-resolution-reject-failed', error.code || error.message || 'candidate-resolution-reject-failed', { requestId });
          }
          break;
        }

        case 'storyteller_finish_night': {
          const requestId = getRequestIdFromMessage(msg);
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller', { requestId });
            return;
          }

          const latestBatch = getLatestNightBatch(room);
          if (room.state.phase === 'day' && latestBatch?.status === 'confirmed') {
            sendJson(ws, {
              type: 'night_closed_and_day_started',
              data: buildDayVoteStorytellerPayload(room, {
                batchId: latestBatch.batchId,
                nightNumber: latestBatch.nightNumber,
                duplicate: true,
                requestId,
                phaseSnapshot: getAuthoritativePhaseSnapshot(room)
              })
            }, requestId);
            break;
          }

          const closeout = confirmEmptyNightCloseout(room, {
            batchId: msg.data?.batchId,
            now: new Date().toISOString()
          });
          if (!closeout.ok) {
            sendJson(ws, buildPhaseTransitionRefusal(room, closeout.reason, { requestId }), requestId);
            break;
          }
          room.state = closeout.room.state;
          if (!closeout.duplicate) {
            appendNightCloseoutPublicEvent(room, closeout.batch?.batchId);
            appendActionHistory(room, 'empty_night_closeout_confirmed', {
              batchId: closeout.batch?.batchId,
              nightNumber: closeout.batch?.nightNumber
            }, { actor: 'storyteller' });
          }
          sendJson(ws, coordinateAfterNightCloseout(room, {
            durationSeconds: Number.isInteger(msg.data?.dayDurationSeconds) ? msg.data.dayDurationSeconds : 300,
            now: new Date().toISOString(),
            requestId
          }), requestId);
          break;
        }

        case 'storyteller_start_day_timer': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller');
            return;
          }

          const day = startAuthoritativeDay(room, {
            round: Number.isInteger(msg.data?.round) ? msg.data.round : room.state.round,
            durationSeconds: Number.isInteger(msg.data?.durationSeconds) ? msg.data.durationSeconds : 300,
            now: new Date().toISOString()
          });
          if (!day.ok) {
            ws.send(JSON.stringify(day.response));
            break;
          }
          sendPlayerViewsForRoom(room);
          ws.send(JSON.stringify({
            type: day.result.response.type,
            data: buildDayVoteStorytellerPayload(room, {
              ...day.result.response.data,
              phaseSnapshot: getAuthoritativePhaseSnapshot(room)
            })
          }));
          break;
        }

        case 'storyteller_send_day_timer_reminder': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller');
            return;
          }

          const round = Number.isInteger(msg.data?.round) ? msg.data.round : (room.state.round || 1);
          const remainingText = String(msg.data?.remainingText || '').slice(0, 20) || '--:--';
          appendActionHistory(room, 'day_timer_reminder_sent', {
            round,
            remainingText
          }, { actor: 'storyteller' });
          appendPublicEvent(room, {
            id: `day-timer-reminder:${round}:${Date.now()}`,
            type: 'day_timer_reminder',
            title: '公聊倒计时提醒',
            summary: `公聊倒计时提醒：剩余 ${remainingText}。请准备发言、提名或投票。`,
            phase: 'day',
            round,
            day: round,
            popup: true
          });
          sendPlayerViewsForRoom(room);
          ws.send(JSON.stringify({
            type: 'day_timer_reminder_sent',
            data: buildDayVoteStorytellerPayload(room, { round, remainingText })
          }));
          break;
        }

        case 'storyteller_record_nomination': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller');
            return;
          }

          const result = recordMvpDayNomination(room, {
            requester: 'storyteller',
            round: Number.isInteger(msg.data?.round) ? msg.data.round : room.state.round,
            nominatorSeat: Number(msg.data?.nominatorSeat),
            nomineeSeat: Number(msg.data?.nomineeSeat),
            now: new Date().toISOString()
          });
          mergeMvpDayVoteResult(room, result);
          if (result.response.type === 'nomination_recorded') {
            appendActionHistory(room, 'nomination_recorded', {
              nominationId: result.response.data.nominationId,
              nominatorSeat: result.response.data.nominatorSeat,
              nomineeSeat: result.response.data.nomineeSeat
            }, { actor: 'storyteller' });
            appendPublicEvent(room, {
              id: `nomination:${result.response.data.nominationId}`,
              type: 'public_nomination',
              title: '公开提名',
              summary: `${result.response.data.nominatorSeat} 号提名 ${result.response.data.nomineeSeat} 号。`,
              phase: 'day',
              round: room.state.round,
              day: room.state.round,
              nominatorSeat: result.response.data.nominatorSeat,
              nomineeSeat: result.response.data.nomineeSeat
            });
            sendPlayerViewsForRoom(room);
          }
          ws.send(JSON.stringify({
            type: result.response.type,
            data: buildDayVoteStorytellerPayload(room, result.response.data)
          }));
          break;
        }

        case 'storyteller_open_vote': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller');
            return;
          }

          const result = openMvpDayVote(room, {
            requester: 'storyteller',
            nominationId: msg.data?.nominationId,
            now: new Date().toISOString()
          });
          mergeMvpDayVoteResult(room, result);
          if (result.response.type === 'vote_opened') {
            appendActionHistory(room, 'vote_opened', {
              voteId: result.response.data.voteId,
              nominationId: result.response.data.sourceNominationId,
              nomineeSeat: result.response.data.nomineeSeat
            }, { actor: 'storyteller' });
            sendPlayerViewsForRoom(room);
          }
          ws.send(JSON.stringify({
            type: result.response.type,
            data: buildDayVoteStorytellerPayload(room, result.response.data)
          }));
          break;
        }

        case 'player_submit_vote': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          const player = room?.state?.players?.find((item) => Number(item.seat) === Number(currentSeat));

          if (!room || !player || room.clients.get(Number(currentSeat)) !== ws) {
            sendError(ws, 'unauthorized-player-vote', 'unauthorized-player-vote');
            return;
          }

          const result = submitMvpPlayerVote(room, {
            playerToken: player.playerToken || player.playerTokenHash,
            seat: Number(msg.data?.seat),
            voteId: msg.data?.voteId,
            vote: msg.data?.vote,
            now: new Date().toISOString()
          });
          mergeMvpDayVoteResult(room, result);
          if (result.response.type === 'vote_recorded') {
            appendActionHistory(room, 'player_vote_recorded', {
              voteId: result.response.data.voteId,
              voterSeat: result.response.data.voterSeat,
              recordedBy: 'player'
            }, { actor: 'player', actorSeat: result.response.data.voterSeat });
            sendPlayerViewsForRoom(room);
            sendDayVoteStorytellerUpdate(room, 'day_vote_updated', {
              lastReceipt: result.response
            });
          }
          ws.send(JSON.stringify(result.response));
          break;
        }

        case 'storyteller_proxy_vote': {
          const requestId = getRequestIdFromMessage(msg);
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller', { requestId });
            return;
          }

          const result = proxyMvpDayVote(room, {
            requester: 'storyteller',
            voteId: msg.data?.voteId,
            voterSeat: Number(msg.data?.voterSeat),
            vote: msg.data?.vote,
            now: new Date().toISOString()
          });
          mergeMvpDayVoteResult(room, result);
          if (result.response.type === 'proxy_vote_recorded') {
            appendActionHistory(room, 'storyteller_proxy_vote_recorded', {
              voteId: result.response.data.voteId,
              voterSeat: result.response.data.voterSeat,
              recordedBy: 'storyteller'
            }, { actor: 'storyteller' });
            sendPlayerViewsForRoom(room);
          }
          sendJson(ws, {
            type: result.response.type,
            data: buildDayVoteStorytellerPayload(room, {
              ...result.response.data,
              requestId
            })
          }, requestId);
          break;
        }

        case 'storyteller_count_vote': {
          const requestId = getRequestIdFromMessage(msg);
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller', { requestId });
            return;
          }

          const beforeNomineeSeat = room.state.stage7DayVoteExecution?.nomination?.nomineeSeat;
          const beforeNomineeAlive = room.state.players?.find((player) => player.seat === beforeNomineeSeat)?.alive !== false;
          const result = countMvpDayVote(room, {
            requester: 'storyteller',
            voteId: msg.data?.voteId,
            now: new Date().toISOString()
          });
          mergeMvpDayVoteResult(room, result);
          const afterNomineeAlive = room.state.players?.find((player) => player.seat === beforeNomineeSeat)?.alive !== false;
          if (result.response.type === 'vote_counted') {
            appendActionHistory(room, 'vote_counted_candidate', {
              voteId: result.response.data.voteId,
              yes: result.response.data.yes,
              no: result.response.data.no,
              nomineeAliveUnchanged: beforeNomineeAlive === afterNomineeAlive
            }, { actor: 'storyteller' });
            const candidateExecution = result.response.data.candidateExecution || {};
            const nomineeSeat = candidateExecution.nomineeSeat || room.state.stage7DayVoteExecution?.nomination?.nomineeSeat || null;
            appendPublicEvent(room, {
              id: `vote-counted:${result.response.data.voteId}`,
              type: 'vote_counted',
              title: '投票结果',
              summary: `计票：${result.response.data.yes || 0} 赞成 / ${result.response.data.no || 0} 不举手 / ${result.response.data.total || 0} 票。${candidateExecution.passes ? `${nomineeSeat} 号进入处决确认。` : '未达到处决票数。'}`,
              phase: 'day',
              round: room.state.round,
              day: room.state.round,
              nomineeSeat
            });
            sendPlayerViewsForRoom(room);
          }
          sendJson(ws, {
            type: result.response.type,
            data: buildDayVoteStorytellerPayload(room, {
              ...result.response.data,
              requestId,
              nomineeAliveBeforeCount: beforeNomineeAlive,
              nomineeAliveAfterCount: afterNomineeAlive
            })
          }, requestId);
          break;
        }

        case 'storyteller_close_vote_round': {
          const requestId = getRequestIdFromMessage(msg);
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller', { requestId });
            return;
          }
          const result = closeMvpDayVoteRound(room, {
            requester: 'storyteller',
            voteId: msg.data?.voteId,
            nomineeSeat: Number(msg.data?.nomineeSeat),
            now: new Date().toISOString()
          });
          mergeMvpDayVoteResult(room, result);
          if (result.response.type === 'vote_round_closed') {
            const standing = result.response.data.standingExecution || {};
            appendActionHistory(room, 'vote_round_closed', {
              voteId: result.response.data.voteId,
              nomineeSeat: result.response.data.nomineeSeat,
              passes: result.response.data.passes === true,
              standingExecution: standing,
              completedRound: result.response.data.completedRound
            }, { actor: 'storyteller' });
            const currentRoundLed = standing.status === 'on-the-block'
              && standing.sourceVoteId === result.response.data.voteId;
            const summary = standing.status === 'tied'
              ? `最高 ${standing.yesVotes || 0} 票出现平票，当前无人暂列处决。`
              : currentRoundLed
                ? `${standing.nomineeSeat} 号以 ${standing.yesVotes || 0} 票暂列处决；结束今天前不会执行。`
                : standing.status === 'on-the-block'
                  ? `本轮未改变暂列处决；仍为 ${standing.nomineeSeat} 号（${standing.yesVotes || 0} 票）。`
                  : '本轮未产生暂列处决；可以继续提名或结束今天。';
            appendPublicEvent(room, {
              id: `vote-round:${result.response.data.completedRound?.roundId || requestId}`,
              type: 'vote_round_closed',
              title: '本轮投票已确认',
              summary,
              phase: 'day',
              round: room.state.round,
              day: room.state.round
            });
            sendPlayerViewsForRoom(room);
          }
          sendJson(ws, {
            type: result.response.type,
            data: buildDayVoteStorytellerPayload(room, {
              ...result.response.data,
              requestId
            })
          }, requestId);
          break;
        }

        case 'storyteller_confirm_execution': {
          const requestId = getRequestIdFromMessage(msg);
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller', { requestId });
            return;
          }

          const result = confirmMvpDayExecution(room, {
            requester: 'storyteller',
            voteId: msg.data?.voteId,
            nomineeSeat: Number(msg.data?.nomineeSeat),
            confirm: msg.data?.confirm,
            now: new Date().toISOString()
          });
          mergeMvpDayVoteResult(room, result);
          if (result.response.type === 'execution_confirmed') {
            appendActionHistory(room, 'execution_confirmed', {
              executionId: result.response.data.executionId,
              voteId: result.response.data.voteId,
              nomineeSeat: result.response.data.nomineeSeat,
              effective: result.response.data.effective === true,
              deathPrevented: result.response.data.deathPrevented === true,
              ruleEffects: result.response.data.ruleEffects || []
            }, { actor: 'storyteller' });
            if (result.response.data.effective === true) {
              broadcastPublicPlayerStatus(room, result.response.data.nomineeSeat, { alive: false });
            }
            appendPublicEvent(room, {
              id: `execution:${result.response.data.executionId}`,
              type: 'execution_confirmed',
              title: '处决结果',
              summary: result.response.data.effective === true
                ? `${result.response.data.nomineeSeat} 号已被处决。当前存活：${countAlivePlayers(room)} 人。`
                : `${result.response.data.nomineeSeat} 号没有死亡。当前存活：${countAlivePlayers(room)} 人。`,
              phase: 'day',
              round: room.state.round,
              day: room.state.round,
              executedSeat: result.response.data.nomineeSeat,
              deadSeats: result.response.data.effective === true ? [result.response.data.nomineeSeat] : []
            });
          }
          if (['execution_confirmed', 'execution_rejected'].includes(result.response.type)) {
            sendPlayerViewsForRoom(room);
          }
          sendJson(ws, {
            type: result.response.type,
            data: buildDayVoteStorytellerPayload(room, {
              ...result.response.data,
              requestId
            })
          }, requestId);
          break;
        }

        case 'storyteller_manual_execution': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller');
            return;
          }

          const result = manualMvpDayExecution(room, {
            requester: 'storyteller',
            nomineeSeat: Number(msg.data?.nomineeSeat),
            reason: msg.data?.reason || 'storyteller-ruling',
            now: new Date().toISOString()
          });
          mergeMvpDayVoteResult(room, result);
          if (result.response.type === 'execution_confirmed') {
            appendActionHistory(room, 'execution_confirmed', {
              executionId: result.response.data.executionId,
              voteId: result.response.data.voteId || null,
              nomineeSeat: result.response.data.nomineeSeat,
              effective: result.response.data.effective === true,
              deathPrevented: result.response.data.deathPrevented === true,
              source: result.response.data.source || 'storyteller-manual',
              reason: result.response.data.reason || null,
              ruleEffects: result.response.data.ruleEffects || []
            }, { actor: 'storyteller' });
            if (result.response.data.effective === true) {
              broadcastPublicPlayerStatus(room, result.response.data.nomineeSeat, { alive: false });
            }
            appendPublicEvent(room, {
              id: `execution:${result.response.data.executionId}`,
              type: 'execution_confirmed',
              title: '处决结果',
              summary: result.response.data.effective === true
                ? `${result.response.data.nomineeSeat} 号已被自由处决。当前存活：${countAlivePlayers(room)} 人。`
                : `${result.response.data.nomineeSeat} 号处决未生效。当前存活：${countAlivePlayers(room)} 人。`,
              phase: 'day',
              round: room.state.round,
              day: room.state.round,
              executedSeat: result.response.data.nomineeSeat,
              deadSeats: result.response.data.effective === true ? [result.response.data.nomineeSeat] : []
            });
            sendPlayerViewsForRoom(room);
          }
          ws.send(JSON.stringify({
            type: result.response.type,
            data: buildDayVoteStorytellerPayload(room, result.response.data)
          }));
          break;
        }

        case 'storyteller_finish_day': {
          const requestId = getRequestIdFromMessage(msg);
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;
          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller', { requestId });
            return;
          }

          let closeoutGate = getDayCloseoutGate(room);
          if (!closeoutGate.ok) {
            sendJson(ws, buildPhaseTransitionRefusal(room, closeoutGate.reason, { requestId }), requestId);
            break;
          }

          if (closeoutGate.duplicate) {
            const pendingEnd = getPendingGameEndCandidate(room);
            if (pendingEnd) {
              sendJson(ws, {
                type: 'game_end_candidate_prepared',
                data: buildGameEndStorytellerPayload(room, {
                  candidate: pendingEnd,
                  duplicate: true,
                  requestId,
                  phaseSnapshot: getAuthoritativePhaseSnapshot(room)
                })
              }, requestId);
              break;
            }
            const latestBatch = getLatestNightBatch(room);
            sendJson(ws, {
              type: 'day_closed_and_night_started',
              data: {
                dayVote: room.state.stage7DayVoteExecution || null,
                dayNumber: Number(room.state.stage7DayVoteExecution?.round || 1),
                outcome: room.state.stage7DayVoteExecution?.dayClosed?.outcome || 'no-execution',
                executedSeat: room.state.stage7DayVoteExecution?.dayClosed?.executedSeat || null,
                batchId: latestBatch?.batchId || null,
                nightNumber: latestBatch?.nightNumber || Number(room.state.round || 1),
                nightOrder: latestBatch ? formatNightOrderForStoryteller(latestBatch) : [],
                summary: latestBatch ? getMvpNightSubmissionSummary(room.state, latestBatch.batchId) : [],
                duplicate: true,
                requestId,
                phaseSnapshot: getAuthoritativePhaseSnapshot(room),
                lobby: buildPublicLobby(room)
              }
            }, requestId);
            break;
          }

          if (closeoutGate.standingExecution?.status === 'on-the-block'
            && closeoutGate.dayVote?.execution?.status !== 'confirmed') {
            const executionResult = finalizeMvpStandingExecution(room, {
              requester: 'storyteller',
              now: new Date().toISOString()
            });
            if (executionResult.response.type !== 'execution_confirmed') {
              sendJson(ws, buildPhaseTransitionRefusal(
                room,
                executionResult.response.data?.reason || 'execution-confirmation-refused',
                { requestId }
              ), requestId);
              break;
            }
            room.state = executionResult.room.state;
            recordExecutionConfirmationEffects(room, executionResult);
            closeoutGate = getDayCloseoutGate(room);
            if (!closeoutGate.ok) {
              sendJson(ws, buildPhaseTransitionRefusal(room, closeoutGate.reason, { requestId }), requestId);
              break;
            }
          }

          const closeout = markDayClosed(room, { now: new Date().toISOString() });
          if (!closeout.ok) {
            sendJson(ws, buildPhaseTransitionRefusal(room, closeout.reason, { requestId }), requestId);
            break;
          }
          room.state = closeout.room.state;
          const dayClosed = room.state.stage7DayVoteExecution?.dayClosed || {};
          appendActionHistory(room, 'day_closed', {
            round: dayClosed.round,
            outcome: dayClosed.outcome,
            executedSeat: dayClosed.executedSeat
          }, { actor: 'storyteller' });
          appendPublicEvent(room, {
            id: `day-closeout:${room.state.gameNumber || 1}:${dayClosed.round}`,
            type: 'day_closeout',
            title: `第 ${dayClosed.round || 1} 天白天结束`,
            summary: dayClosed.outcome === 'execution'
              ? `${dayClosed.executedSeat} 号处决；正在检查结局。`
              : '今日无处决；正在检查结局。',
            phase: 'day',
            round: dayClosed.round,
            day: dayClosed.round,
            executedSeat: dayClosed.executedSeat || undefined,
            deadSeats: dayClosed.executedSeat ? [dayClosed.executedSeat] : []
          });
          sendJson(ws, coordinateAfterDayCloseout(room, {
            storytellerWs: ws,
            now: new Date().toISOString(),
            requestId
          }), requestId);
          break;
        }

        case 'storyteller_prepare_game_end_candidate': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller');
            return;
          }

          const prepared = prepareAuthoritativeGameEnd(room, { now: new Date().toISOString() });
          const result = prepared.result;
          ws.send(JSON.stringify({
            type: result.response.type,
            data: buildGameEndStorytellerPayload(room, {
              ...result.response.data,
              phaseSnapshot: getAuthoritativePhaseSnapshot(room)
            })
          }));
          sendPlayerViewsForRoom(room);
          break;
        }

        case 'storyteller_confirm_game_end': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller');
            return;
          }

          const result = confirmMvpGameEndCandidate(room, {
            candidateId: msg.data?.candidateId,
            confirm: msg.data?.confirm === true,
            now: new Date().toISOString()
          });
          if (result.room?.state) {
            room.state = result.room.state;
          }
          if (result.response.type === 'game_end_confirmed') {
            appendActionHistory(room, 'game_end_confirmed', {
              candidateId: result.response.data.candidate.candidateId,
              winningTeam: result.response.data.publicGameOver.winningTeam,
              reasonCode: result.response.data.publicGameOver.reasonCode
            }, { actor: 'storyteller' });
            try {
              const recordReceipt = writeRoomGameRecord(room);
              room.state.lastGameRecord = {
                fileName: recordReceipt.fileName,
                recordPath: path.relative(__dirname, recordReceipt.filePath).replace(/\//g, '\\'),
                schemaVersion: recordReceipt.record.schemaVersion,
                writtenAt: new Date().toISOString()
              };
              appendActionHistory(room, 'game_record_written', {
                recordPath: room.state.lastGameRecord.recordPath,
                schemaVersion: recordReceipt.record.schemaVersion
              }, { actor: 'system' });
            } catch (error) {
              console.warn('Game record write failed:', error.message || error);
            }
          }
          ws.send(JSON.stringify({
            type: result.response.type,
            data: buildGameEndStorytellerPayload(room, result.response.data)
          }));
          sendPlayerViewsForRoom(room);
          break;
        }

        case 'storyteller_start_next_game': {
          const requestedRoomId = msg.data?.roomId || currentRoom;
          const room = requestedRoomId ? rooms.get(requestedRoomId) : null;

          if (!ensureStorytellerCanMutate(room, ws)) {
            sendError(ws, 'unauthorized-storyteller', 'unauthorized-storyteller');
            return;
          }

          try {
            const result = startNextGameInSameRoom(room, new Date().toISOString());
            ws.send(JSON.stringify({
              type: 'next_game_started',
              data: result
            }));
            sendPlayerViewsForRoom(room, 'player_view_synced');
          } catch (error) {
            sendError(ws, error.code || 'next-game-start-failed', error.message || 'next-game-start-failed');
          }
          break;
        }

        case 'distribute_roles': {
          const room = rooms.get(currentRoom);
          if (!room || room.storyteller !== ws) return;
          
          const { roles } = msg.data;
          
          room.state.players.forEach((p, i) => {
            if (roles[i]) {
              p.role = roles[i];
              p.alive = true;
            }
          });
          
          room.state.phase = 'night';
          room.state.round = 1;
          appendActionHistory(room, 'roles_locked', {
            roles: room.state.players.map((player) => ({
              seat: player.seat,
              role: player.role,
              roleName: player.roleName || null
            }))
          }, { actor: 'storyteller' });
          
          room.clients.forEach((clientWs, seat) => {
            const player = room.state.players.find(p => p.seat === seat);
            if (player && clientWs.readyState === WebSocket.OPEN) {
              const playerView = buildPlayerView(buildRoomProjectionInput(room), seat);
              clientWs.send(JSON.stringify({ 
                type: 'role_assigned', 
                data: {
                  role: playerView.privateView.role.roleName || playerView.privateView.role.roleId,
                  round: 1,
                  phase: 'night',
                  view: playerView
                } 
              }));
            }
          });
          
          if (room.storyteller && room.storyteller.readyState === WebSocket.OPEN) {
            room.storyteller.send(JSON.stringify({ type: 'game_started', data: room.state }));
          }
          console.log(`发身份: ${currentRoom}`);
          break;
        }

        case 'start_night': {
          const room = rooms.get(currentRoom);
          if (!room || room.storyteller !== ws) return;
          
          const isFirstNight = room.state.round === 0;
          const round = isFirstNight ? 1 : room.state.round;
          
          try {
            // 生成夜间行动队列
            const nightQueue = nightOrderManager.generateNightQueue(
              room.state.players,
              room.state.currentScript,
              isFirstNight
            );
            
            room.state.phase = 'night';
            room.state.round = round;
            room.state.nightQueue = nightQueue;
            appendActionHistory(room, 'night_started', {
              round,
              isFirstNight,
              queueLength: nightQueue.length,
              orderedSeats: nightQueue.map((action) => action.seat ?? null)
            }, { actor: 'storyteller' });
            
            // 通知所有玩家进入夜间
            room.clients.forEach((clientWs) => {
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ 
                  type: 'phase_changed', 
                  data: { phase: 'night', round } 
                }));
              }
            });
            
            // 发送夜间队列给说书人
            ws.send(JSON.stringify({ 
              type: 'night_started', 
              data: { 
                round,
                isFirstNight,
                queue: nightQueue,
                progress: nightOrderManager.getProgress(nightQueue)
              } 
            }));
            
            console.log(`夜间开始: ${currentRoom} - 第 ${round} 天夜晚${isFirstNight ? '（首个夜晚规则）' : ''}`);
          } catch (error) {
            ws.send(JSON.stringify({ type: 'error', data: { message: error.message } }));
          }
          break;
        }

        case 'next_phase': {
          const room = rooms.get(currentRoom);
          if (!room || room.storyteller !== ws) return;
          
          const { phase, round } = msg.data;
          room.state.phase = phase;
          room.state.round = round;
          appendActionHistory(room, 'phase_changed', {
            phase,
            round
          }, { actor: 'storyteller' });
          
          room.clients.forEach((clientWs) => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ 
                type: 'phase_changed', 
                data: { phase, round } 
              }));
            }
          });
          
          if (room.storyteller && room.storyteller.readyState === WebSocket.OPEN) {
            room.storyteller.send(JSON.stringify({ type: 'state_updated', data: room.state }));
          }
          console.log(`阶段切换: ${currentRoom} - ${phase} 第${round}轮`);
          break;
        }

        case 'get_current_action': {
          const room = rooms.get(currentRoom);
          if (!room || room.storyteller !== ws) return;
          
          const currentAction = nightOrderManager.getCurrentAction(room.state.nightQueue);
          ws.send(JSON.stringify({ 
            type: 'current_action', 
            data: { action: currentAction } 
          }));
          break;
        }

        case 'mark_action_waiting': {
          const room = rooms.get(currentRoom);
          if (!room || room.storyteller !== ws) return;
          
          const { seat } = msg.data;
          room.state.nightQueue = nightOrderManager.updateActionStatus(
            room.state.nightQueue, 
            seat, 
            'waiting'
          );
          appendActionHistory(room, 'night_action_waiting', {
            seat
          }, { actor: 'storyteller' });
          
          ws.send(JSON.stringify({ 
            type: 'action_status_updated', 
            data: { 
              queue: room.state.nightQueue,
              progress: nightOrderManager.getProgress(room.state.nightQueue)
            } 
          }));
          break;
        }

        case 'mark_action_completed': {
          const room = rooms.get(currentRoom);
          if (!room || room.storyteller !== ws) return;
          
          const { seat, result } = msg.data;
          const action = room.state.nightQueue.find(a => a.seat === seat && a.status !== 'completed');
          if (action) {
            action.status = 'completed';
            action.result = result;
            appendActionHistory(room, 'night_action_completed', {
              seat,
              result
            }, { actor: 'storyteller' });
          }
          
          const isAllCompleted = nightOrderManager.isAllCompleted(room.state.nightQueue);
          
          ws.send(JSON.stringify({ 
            type: 'action_completed', 
            data: { 
              queue: room.state.nightQueue,
              progress: nightOrderManager.getProgress(room.state.nightQueue),
              allCompleted: isAllCompleted
            } 
          }));
          break;
        }

        case 'player_action': {
          const room = rooms.get(currentRoom);
          if (!room || room.storyteller !== ws) return;
          
          const { seat, action, data } = msg.data;
          
          room.clients.forEach((clientWs, clientSeat) => {
            if (clientSeat === seat && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ 
                type: 'your_turn', 
                data: { action, ...data } 
              }));
            }
          });
          console.log(`行动提示: ${currentRoom} - ${seat}号执行${action}`);
          break;
        }

        case 'player_action_result': {
          const room = rooms.get(currentRoom);
          const requestedSeat = Number(msg.data?.seat);
          const playerOwnsSocket = Boolean(
            room
            && Number.isInteger(currentSeat)
            && requestedSeat === currentSeat
            && room.clients.get(currentSeat) === ws
          );
          if (!playerOwnsSocket) {
            sendError(ws, 'unauthorized-player', 'unauthorized-player');
            return;
          }
          sendError(ws, 'legacy-player-action-result-disabled', 'legacy-player-action-result-disabled');
          break;
        }

        case 'update_player_status': {
          const room = rooms.get(currentRoom);
          if (!room || room.storyteller !== ws) return;
          
          const { seat, alive, poisoned, drunk } = msg.data;
          const player = room.state.players.find(p => p.seat === seat);
          
          if (player) {
            const previous = {
              alive: player.alive,
              poisoned: player.poisoned,
              drunk: player.drunk
            };
            if (alive !== undefined) player.alive = alive;
            if (poisoned !== undefined) player.poisoned = poisoned;
            if (drunk !== undefined) player.drunk = drunk;
            appendActionHistory(room, 'player_status_updated', {
              seat,
              previous,
              current: {
                alive: player.alive,
                poisoned: player.poisoned,
                drunk: player.drunk
              }
            }, { actor: 'storyteller' });
            
            broadcastPublicPlayerStatus(room, seat, { alive });
            const targetWs = room.clients.get(seat);
            sendPlayerView(room, targetWs, seat);
          }
          break;
        }

        case 'night_action_complete': {
          const room = rooms.get(currentRoom);
          if (!room || room.storyteller !== ws) return;
          
          room.state.nightActions.push(msg.data);
          appendActionHistory(room, 'night_action_logged', msg.data, { actor: 'storyteller' });
          
          if (room.storyteller && room.storyteller.readyState === WebSocket.OPEN) {
            room.storyteller.send(JSON.stringify({ type: 'action_recorded', data: msg.data }));
          }
          break;
        }

        case 'send_message': {
          const room = rooms.get(currentRoom);
          if (!room || room.storyteller !== ws) return;
          
          const { seat, message } = msg.data;
          
          const targetWs = room.clients.get(seat);
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify({ type: 'message', data: { message } }));
          }
          break;
        }

        case 'broadcast_message': {
          const room = rooms.get(currentRoom);
          if (!room || room.storyteller !== ws) return;
          
          broadcast(room.id, 'message', { message: msg.data.message });
          break;
        }
      }
    } catch (e) {
      console.error('消息处理错误:', e);
    } finally {
      persistRoomSnapshots();
    }
  });

  ws.on('close', () => {
    if (currentRoom && currentSeat) {
      const room = rooms.get(currentRoom);
      if (room) {
        if (room.clients.get(currentSeat) === ws) {
          room.clients.delete(currentSeat);
          const player = room.state.players.find((item) => item.seat === currentSeat);
          if (player) {
            player.connected = false;
          }
          broadcast(room.id, 'player_disconnected', {
            lobby: buildPublicLobby(room),
            seat: currentSeat
          });
        }
      }
    }
    if (currentRoom && rooms.get(currentRoom)?.storyteller === ws) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.storyteller = null;
        broadcast(room.id, 'storyteller_left', {});
      }
    }
    persistRoomSnapshots();
  });
});

const PORT = process.env.PORT || 3000;

// 获取本机IP地址
function getLocalIP() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('\n========================================');
  console.log('  血染钟楼服务器已启动！');
  console.log('========================================');
  console.log(`\n本地访问:`);
  console.log(`  说书人: http://localhost:${PORT}/storyteller-v2.html`);
  console.log(`  玩家:   http://localhost:${PORT}/player-v2.html`);
  console.log(`\n局域网访问:`);
  console.log(`  说书人: http://${localIP}:${PORT}/storyteller-v2.html`);
  console.log(`  玩家:   http://${localIP}:${PORT}/player-v2.html`);
  console.log('\n========================================\n');
});
