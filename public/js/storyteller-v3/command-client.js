const SCRIPT_ID_BY_NAME = {
  'Trouble Brewing': 'trouble-brewing',
  'Bad Moon Rising': 'bad-moon-rising',
  'Sects & Violets': 'sects-and-violets'
};

const SCRIPT_NAME_BY_ID = Object.fromEntries(Object.entries(SCRIPT_ID_BY_NAME).map(([name, id]) => [id, name]));

const OFFLINE_ROLES = [
  ['washerwoman', 'Washerwoman', 'townsfolk'],
  ['librarian', 'Librarian', 'townsfolk'],
  ['investigator', 'Investigator', 'townsfolk'],
  ['chef', 'Chef', 'townsfolk'],
  ['empath', 'Empath', 'townsfolk'],
  ['fortuneteller', 'Fortune Teller', 'townsfolk'],
  ['undertaker', 'Undertaker', 'townsfolk'],
  ['monk', 'Monk', 'townsfolk'],
  ['ravenkeeper', 'Ravenkeeper', 'townsfolk'],
  ['virgin', 'Virgin', 'townsfolk'],
  ['slayer', 'Slayer', 'townsfolk'],
  ['soldier', 'Soldier', 'townsfolk'],
  ['butler', 'Butler', 'outsider'],
  ['recluse', 'Recluse', 'outsider'],
  ['poisoner', 'Poisoner', 'minion'],
  ['spy', 'Spy', 'minion'],
  ['imp', 'Imp', 'demon']
];

const COMMAND_BOUNDARIES = {
  createRoom: { requestType: 'create_room', successTypes: ['room_created'] },
  fillAiTestPlayers: { requestType: 'storyteller_fill_ai_test_players', successTypes: ['ai_test_players_filled'] },
  selectScript: { requestType: 'select_script', successTypes: ['script_selected'] },
  generateSetupCandidate: { requestType: 'generate_setup_candidate', successTypes: ['setup_candidate_generated'] },
  confirmSetup: { requestType: 'confirm_setup_candidate', successTypes: ['setup_candidate_confirmed'] },
  dealRoles: { requestType: 'deal_roles', successTypes: ['roles_dealt'] },
  loadIdentityReceipts: { requestType: 'identityReceiptSummary', successTypes: ['identity_receipts_updated', 'roles_dealt'] },
  startFirstNight: { requestType: 'storyteller_start_night_collection', successTypes: ['night_collection_started', 'ai_test_night_actions_submitted'] }
};

const REASON_MESSAGES = {
  'missing-room': 'Missing room. Create or reconnect a room first.',
  'missing-script': 'Select a script first.',
  'invalid-player-count': 'Need 7 to 15 players.',
  'setup-not-confirmed': 'Confirm setup first.',
  'identity-not-sent': 'Deal roles first.',
  'no-candidate': 'No setup candidate is available.',
  blocked: 'Current state blocks this action.',
  'request-failed': 'Request failed. Try again.',
  unauthorized: 'This connection is not authorized.',
  timeout: 'Timed out waiting for server response.'
};

class StorytellerV3Transport {
  constructor() {
    this.ws = null;
    this.pending = [];
    this.listeners = new Set();
    this.lastMessages = [];
  }

  isAvailable() {
    return typeof window !== 'undefined' && typeof window.WebSocket === 'function' && window.location?.host;
  }

  async request(type, data = {}, successTypes = [], timeoutMs = 15000) {
    if (!this.isAvailable()) {
      throw Object.assign(new Error('WebSocket is not available.'), { reason: 'transport-unavailable' });
    }
    const ws = await this.ensureSocket();
    const expected = new Set(successTypes || []);
    const promise = new Promise((resolve, reject) => {
      const pending = {
        type,
        expected,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.pending = this.pending.filter((item) => item !== pending);
          reject(Object.assign(new Error(`Timed out waiting for ${type}.`), { reason: 'timeout', commandType: type }));
        }, timeoutMs)
      };
      this.pending.push(pending);
    });
    ws.send(JSON.stringify({ type, data }));
    return promise;
  }

  async ensureSocket() {
    if (this.ws?.readyState === WebSocket.OPEN) return this.ws;
    if (this.ws?.readyState === WebSocket.CONNECTING) {
      await new Promise((resolve, reject) => {
        this.ws.addEventListener('open', resolve, { once: true });
        this.ws.addEventListener('error', reject, { once: true });
      });
      return this.ws;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${window.location.host}`);
    this.ws.addEventListener('message', (event) => this.handleMessage(event));
    this.ws.addEventListener('close', () => {
      for (const pending of this.pending.splice(0)) {
        clearTimeout(pending.timer);
        pending.reject(Object.assign(new Error('Storyteller channel closed.'), { reason: 'socket-closed' }));
      }
    });
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    return this.ws;
  }

  handleMessage(event) {
    let message = null;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    this.lastMessages.push(message);
    this.lastMessages = this.lastMessages.slice(-40);
    for (const listener of this.listeners) listener(message);

    if (message.type === 'error') {
      const pending = this.pending.shift();
      if (pending) {
        clearTimeout(pending.timer);
        pending.reject(Object.assign(new Error(message.data?.message || message.data?.code || 'Server error.'), {
          reason: message.data?.code || message.data?.message || 'request-failed',
          details: message.data || {}
        }));
      }
      return;
    }

    const index = this.pending.findIndex((pending) => pending.expected.has(message.type));
    if (index >= 0) {
      const [pending] = this.pending.splice(index, 1);
      clearTimeout(pending.timer);
      pending.resolve(message);
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

const transport = new StorytellerV3Transport();

export const commandClient = {
  async createRoom(state) {
    return runOnlineOrOffline(async () => {
      const scriptName = normalizeScriptName(state?.room?.script || 'Trouble Brewing');
      const roomId = state?.room?.id || createRoomId();
      const password = state?.room?.password || 'v3-demo';
      const playerCount = clampPlayerCount(state?.players?.length || state?.room?.playerCount || 12);
      const message = await transport.request('create_room', { roomId, password, playerCount, scriptId: scriptIdFromName(scriptName) }, ['room_created']);
      return success('createRoom', `真实房间已创建：${message.data.roomId}`, (draft) => applyRoomCreated(draft, message.data, password), { message });
    }, () => offlineCreateRoom());
  },

  async fillAiTestPlayers(state) {
    return runOnlineOrOffline(async () => {
      const message = await transport.request('storyteller_fill_ai_test_players', { roomId: requireRoomId(state) }, ['ai_test_players_filled']);
      return success('fillAiTestPlayers', 'AI 测试玩家已补齐。', (draft) => {
        applyLobby(draft, message.data?.lobby);
        applyPlayers(draft, message.data?.players);
        draft.setup.feedback = { tone: 'success', message: 'AI 测试玩家已补齐，可以生成配板。' };
      }, { message });
    }, () => offlineFillAiPlayers());
  },

  async selectScript(state, script) {
    return runOnlineOrOffline(async () => {
      const prepared = await ensureOnlineRoomReady(state, script);
      const preparedState = prepared.state;
      const scriptName = normalizeScriptName(script || preparedState.room?.script || 'Trouble Brewing');
      const scriptId = scriptIdFromName(scriptName);
      const message = await transport.request('select_script', { roomId: requireRoomId(preparedState), scriptId }, ['script_selected']);
      return success('selectScript', `已选择剧本：${scriptName}`, (draft) => {
        for (const apply of prepared.applies) apply(draft);
        draft.room.script = message.data?.scriptName || scriptName;
        draft.room.scriptId = message.data?.scriptId || scriptId;
        draft.setup.scriptSelected = true;
        draft.setup.setupGenerated = false;
        draft.setup.setupConfirmed = false;
        draft.setup.feedback = { tone: 'success', message: `已选择剧本：${draft.room.script}` };
        applyLobby(draft, message.data?.lobby);
      }, { message, preparedMessages: prepared.messages });
    }, () => offlineSelectScript(script));
  },

  async generateSetup(state) {
    return commandClient.generateSetupCandidate(state);
  },

  async generateSetupCandidate(state) {
    return runOnlineOrOffline(async () => {
      const message = await transport.request('generate_setup_candidate', {
        roomId: requireRoomId(state),
        seed: `${state.room.id}:${Date.now()}:${Math.random()}`
      }, ['setup_candidate_generated']);
      return success('generateSetupCandidate', '配板候选已生成。', (draft) => {
        applySetupCandidate(draft, message.data?.candidate);
        applyLobby(draft, message.data?.lobby);
        draft.setup.setupGenerated = true;
        draft.setup.setupConfirmed = false;
        draft.setup.feedback = { tone: 'success', message: '配板候选已生成，请确认后再发送身份。' };
      }, { message });
    }, () => offlineGenerateSetup(state));
  },

  async confirmSetup(state) {
    return runOnlineOrOffline(async () => {
      const candidateId = state?.setup?.candidateId || state?.setup?.candidate?.candidateId || state?.setup?.candidate?.id;
      if (!candidateId) return failure('no-candidate');
      const message = await transport.request('confirm_setup_candidate', { roomId: requireRoomId(state), candidateId }, ['setup_candidate_confirmed']);
      return success('confirmSetup', '配板已确认并锁定。', (draft) => {
        applySetupCandidate(draft, message.data?.candidate);
        applyLobby(draft, message.data?.lobby);
        draft.setup.setupConfirmed = true;
        draft.setup.feedback = { tone: 'success', message: '配板已确认，下一步发送身份。' };
      }, { message });
    }, () => offlineConfirmSetup(state));
  },

  async dealRoles(state) {
    return runOnlineOrOffline(async () => {
      if (!state?.setup?.setupConfirmed) return failure('setup-not-confirmed');
      const candidateId = state?.setup?.candidateId || state?.setup?.candidate?.candidateId || state?.setup?.candidate?.id;
      const message = await transport.request('deal_roles', { roomId: requireRoomId(state), candidateId }, ['roles_dealt']);
      return success('dealRoles', '身份已发送，回执在同一工作台显示。', (draft) => {
        applyRolesDealt(draft, message.data);
        applyLobby(draft, message.data?.lobby);
        draft.setup.rolesDealt = true;
        const confirmed = draft.receipts.filter((receipt) => receipt.confirmed).length;
        draft.setup.feedback = { tone: 'success', message: `身份已发送，回执 ${confirmed}/${draft.players.length}` };
      }, { message });
    }, () => offlineDealRoles(state));
  },

  async loadIdentityReceipts(state) {
    const summary = state?.identityReceiptSummary || summarizeReceipts(state?.receipts || []);
    return success('loadIdentityReceipts', '身份回执已读取。', null, { projection: summary });
  },

  async startFirstNight(state) {
    return runOnlineOrOffline(async () => {
      if (!state?.setup?.rolesDealt) return failure('identity-not-sent');
      const message = await transport.request('storyteller_start_night_collection', {
        roomId: requireRoomId(state),
        isFirstNight: true,
        nightNumber: 1
      }, ['night_collection_started', 'ai_test_night_actions_submitted']);
      return success('startFirstNight', '首夜已开始。V3.2 将接入夜晚裁决工作台。', (draft) => {
        draft.setup.firstNightStarted = true;
        draft.phase = 'night';
        draft.room.dayLabel = '\u7b2c 1 \u591c';
        draft.setup.feedback = { tone: 'success', message: '首夜已开始。' };
        draft.night = { batchId: message.data?.batchId || message.data?.summary?.batchId || null, started: true };
      }, { message });
    }, () => offlineStartFirstNight(state));
  },

  getTransport() {
    return transport;
  }
};

export function normalizeCommandError(error, fallbackReason = 'request-failed') {
  if (error?.ok === false) return failure(error.reason || fallbackReason, error.message, error.details);
  return failure(error?.reason || fallbackReason, error?.message || REASON_MESSAGES[error?.reason || fallbackReason] || REASON_MESSAGES['request-failed'], {
    error: error?.code || error?.message || String(error || fallbackReason),
    details: error?.details || null
  });
}

export function getCommandBoundary(commandName) {
  return COMMAND_BOUNDARIES[commandName] ? { ...COMMAND_BOUNDARIES[commandName] } : null;
}

function success(commandName, notice, apply = null, data = {}) {
  return { ok: true, data: { commandId: createCommandId(commandName), boundary: getCommandBoundary(commandName), ...(data || {}) }, notice, message: notice, apply };
}

function failure(reason, message = null, details = {}) {
  const normalizedReason = reason || 'request-failed';
  return { ok: false, reason: normalizedReason, message: message || REASON_MESSAGES[normalizedReason] || REASON_MESSAGES['request-failed'], details: details || {} };
}

async function runOnlineOrOffline(onlineFn, offlineFn) {
  if (transport.isAvailable()) {
    try {
      return await onlineFn();
    } catch (error) {
      if (error?.reason === 'transport-unavailable') return offlineFn();
      return normalizeCommandError(error, 'request-failed');
    }
  }
  return offlineFn();
}

async function ensureOnlineRoomReady(state, script) {
  const applies = [];
  const messages = [];
  let workingState = structuredClone(state);
  if (!workingState.room?.id) {
    const created = await commandClient.createRoom(workingState);
    if (!created.ok) throw Object.assign(new Error(created.message), { reason: created.reason, details: created.details });
    created.apply?.(workingState);
    applies.push(created.apply);
    messages.push(created.data?.message);
  }
  const occupied = (workingState.players || []).filter((player) => player?.connected || player?.aiTestPlayer).length;
  const playerCount = workingState.room?.playerCount || workingState.players?.length || 12;
  if (occupied < playerCount) {
    const filled = await commandClient.fillAiTestPlayers(workingState);
    if (!filled.ok) throw Object.assign(new Error(filled.message), { reason: filled.reason, details: filled.details });
    filled.apply?.(workingState);
    applies.push(filled.apply);
    messages.push(filled.data?.message);
  }
  if (script) workingState.room.script = normalizeScriptName(script);
  return { state: workingState, applies, messages };
}

function applyRoomCreated(draft, data, password) {
  draft.room.id = data?.roomId || draft.room.id;
  draft.room.code = data?.roomId || draft.room.code;
  draft.room.password = password || draft.room.password;
  draft.room.scriptId = data?.scriptId || draft.room.scriptId || 'trouble-brewing';
  draft.room.script = scriptNameFromId(draft.room.scriptId);
  draft.phase = 'setup';
  draft.runtime = { ...(draft.runtime || {}), transport: 'websocket', connectionStatus: 'connected' };
  draft.setup.feedback = { tone: 'success', message: `真实房间已创建：${draft.room.code}` };
  applyLobby(draft, data?.lobby);
}

function applyLobby(draft, lobby) {
  if (!lobby) return;
  draft.room.id = lobby.roomId || draft.room.id;
  draft.room.code = lobby.roomId || draft.room.code;
  draft.room.scriptId = lobby.scriptId || draft.room.scriptId;
  draft.room.script = scriptNameFromId(lobby.scriptId || draft.room.scriptId || 'trouble-brewing');
  draft.phase = lobby.phase === 'night' ? 'night' : draft.phase || 'setup';
  draft.room.dayLabel = lobby.phase === 'night' ? `Night ${lobby.round || 1}` : draft.room.dayLabel;
  draft.room.playerCount = lobby.playerCount || draft.room.playerCount;
  if (Array.isArray(lobby.seats) && lobby.seats.length > 0) {
    const bySeat = new Map((draft.players || []).map((player) => [Number(player.seat), player]));
    draft.players = lobby.seats.map((seat) => ({
      ...(bySeat.get(Number(seat.seat)) || {}),
      seat: Number(seat.seat),
      name: seat.name || bySeat.get(Number(seat.seat))?.name || `${seat.seat}?`,
      alive: seat.alive !== false,
      connected: seat.connected === true,
      aiTestPlayer: seat.aiTestPlayer === true
    }));
  }
}

function applyPlayers(draft, players) {
  if (!Array.isArray(players)) return;
  const bySeat = new Map((draft.players || []).map((player) => [Number(player.seat), player]));
  draft.players = players.map((player) => ({
    ...(bySeat.get(Number(player.seat)) || {}),
    ...player,
    seat: Number(player.seat),
    name: player.name || `${player.seat}?`,
    alive: player.alive !== false,
    connected: player.connected === true,
    aiTestPlayer: player.aiTestPlayer === true || player.localTestOnly === true
  }));
}

function applySetupCandidate(draft, candidate) {
  if (!candidate) return;
  draft.setup.candidate = candidate;
  draft.setup.candidateId = candidate.candidateId || candidate.id;
  const bySeat = new Map((draft.players || []).map((player) => [Number(player.seat), player]));
  draft.players = (candidate.seatCandidates || []).map((seatCandidate) => {
    const existing = bySeat.get(Number(seatCandidate.seat)) || {};
    const roleId = seatCandidate.shownRoleId || seatCandidate.roleId || seatCandidate.trueRoleId;
    return {
      ...existing,
      seat: Number(seatCandidate.seat),
      name: existing.name || `${seatCandidate.seat}?`,
      roleId,
      role: formatRoleName(seatCandidate.shownRole || seatCandidate.role || roleId),
      alignment: seatCandidate.shownTeam || seatCandidate.team || existing.alignment || null,
      alive: existing.alive !== false
    };
  });
}

function applyRolesDealt(draft, data) {
  applySetupCandidate(draft, data?.candidate);
  const summary = data?.identityReceiptSummary || null;
  draft.identityReceiptSummary = summary;
  draft.receipts = buildReceiptsFromSummary(draft.players, summary);
  draft.players = draft.players.map((player) => ({ ...player, identityConfirmed: draft.receipts.some((receipt) => Number(receipt.seat) === Number(player.seat) && receipt.confirmed) }));
}

function buildReceiptsFromSummary(players, summary) {
  const confirmed = new Set((summary?.confirmedSeats || []).map(Number));
  return (players || []).map((player) => ({ seat: Number(player.seat), name: player.name || `${player.seat}?`, role: player.role || null, confirmed: confirmed.has(Number(player.seat)), aiTestPlayer: player.aiTestPlayer === true, at: summary?.updatedAt || null }));
}

function summarizeReceipts(receipts) {
  const confirmedSeats = receipts.filter((item) => item.confirmed).map((item) => Number(item.seat));
  const pendingSeats = receipts.filter((item) => !item.confirmed).map((item) => Number(item.seat));
  return { total: receipts.length, confirmedCount: confirmedSeats.length, confirmedSeats, pendingSeats };
}

function offlineCreateRoom() {
  return success('createRoom', '离线演示房间已就绪。', (draft) => {
    draft.room.id = draft.room.id || 'V3-DEMO';
    draft.room.code = draft.room.code || 'V3-DEMO';
    draft.room.password = draft.room.password || 'v3-demo';
    draft.room.script = draft.room.script || 'Trouble Brewing';
    draft.phase = 'setup';
    draft.runtime = { ...(draft.runtime || {}), transport: 'offline', connectionStatus: 'offline-demo' };
    draft.setup.feedback = { tone: 'success', message: '离线演示房间已就绪。' };
  });
}

function offlineFillAiPlayers() {
  return success('fillAiTestPlayers', 'AI 测试玩家已补齐。', (draft) => {
    draft.players = draft.players.map((player, index) => ({ ...player, name: player.name || `AI Test Player ${index + 1}`, connected: true, aiTestPlayer: true }));
    draft.setup.feedback = { tone: 'success', message: 'AI 测试玩家已补齐。' };
  });
}

function offlineSelectScript(script) {
  const scriptName = normalizeScriptName(script || 'Trouble Brewing');
  return success('selectScript', `已选择剧本：${scriptName}`, (draft) => {
    draft.room.script = scriptName;
    draft.setup.scriptSelected = true;
    draft.setup.setupGenerated = false;
    draft.setup.setupConfirmed = false;
    draft.setup.feedback = { tone: 'success', message: `已选择剧本：${scriptName}` };
  });
}

function offlineGenerateSetup(state) {
  if (!state?.setup?.scriptSelected) return failure('missing-script');
  const roles = OFFLINE_ROLES.slice(0, state.players.length);
  return success('generateSetupCandidate', '配板候选已生成。', (draft) => {
    draft.players = draft.players.map((player, index) => ({ ...player, role: roles[index]?.[1] || 'Traveler', roleId: roles[index]?.[0] || 'traveler', alignment: roles[index]?.[2] || 'traveler' }));
    draft.setup.candidateId = `offline:${Date.now()}`;
    draft.setup.setupGenerated = true;
    draft.setup.feedback = { tone: 'success', message: '配板已生成。' };
  });
}

function offlineConfirmSetup(state) {
  if (!state?.setup?.setupGenerated) return failure('no-candidate');
  return success('confirmSetup', '配板已确认并锁定。', (draft) => {
    draft.setup.setupConfirmed = true;
    draft.setup.feedback = { tone: 'success', message: '配板已确认，下一步发送身份。' };
  });
}

function offlineDealRoles(state) {
  if (!state?.setup?.setupConfirmed) return failure('setup-not-confirmed');
  return success('dealRoles', '身份已发送，回执在同一工作台显示。', (draft) => {
    draft.setup.rolesDealt = true;
    draft.players = draft.players.map((player) => ({ ...player, identityConfirmed: true }));
    draft.receipts = draft.players.map((player) => ({ seat: player.seat, name: player.name, role: player.role, confirmed: true, at: new Date().toISOString() }));
    draft.identityReceiptSummary = summarizeReceipts(draft.receipts);
    draft.setup.feedback = { tone: 'success', message: `Roles dealt. Receipts ${draft.receipts.length}/${draft.players.length}.` };
  });
}

function offlineStartFirstNight(state) {
  if (!state?.setup?.rolesDealt) return failure('identity-not-sent');
  return success('startFirstNight', '首夜已开始。V3.2 将接入夜晚裁决工作台。', (draft) => {
    draft.setup.firstNightStarted = true;
    draft.phase = 'night';
    draft.room.dayLabel = '\u7b2c 1 \u591c';
    draft.setup.feedback = { tone: 'success', message: '首夜已开始。' };
  });
}

function normalizeScriptName(script) {
  const raw = String(script || '').trim();
  if (!raw) return '';
  if (SCRIPT_ID_BY_NAME[raw]) return raw;
  return SCRIPT_NAME_BY_ID[raw] || raw;
}

function scriptNameFromId(scriptId) {
  return SCRIPT_NAME_BY_ID[scriptId] || normalizeScriptName(scriptId) || 'Trouble Brewing';
}

function scriptIdFromName(scriptName) {
  return SCRIPT_ID_BY_NAME[normalizeScriptName(scriptName)] || String(scriptName || 'trouble-brewing').trim().toLowerCase().replace(/\s+/g, '-');
}

function createRoomId() {
  return `V3${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function createCommandId(commandName) {
  return `${commandName}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function clampPlayerCount(value) {
  const count = Number(value) || 12;
  return Math.max(7, Math.min(15, count));
}

function requireRoomId(state) {
  const roomId = state?.room?.id;
  if (!roomId) throw Object.assign(new Error(REASON_MESSAGES['missing-room']), { reason: 'missing-room' });
  return roomId;
}

function formatRoleName(role) {
  if (!role) return 'Unknown role';
  if (typeof role === 'string') return role;
  return role.name || role.nameZh || role.nameEn || role.id || 'Unknown role';
}
