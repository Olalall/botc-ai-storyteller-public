const createDemoPlayers = (count = 12) => Array.from({ length: count }, (_, index) => ({
  seat: index + 1,
  name: `${index + 1}号`,
  role: null,
  alignment: null,
  alive: true,
  identityConfirmed: false,
  connected: index < 8
}));

export const initialState = {
  room: {
    code: 'V3-DEMO',
    password: 'v3-demo',
    script: 'Trouble Brewing',
    dayLabel: '开局',
    aliveCount: 12,
    playerCount: 12
  },
  runtime: {
    transport: 'offline',
    connectionStatus: 'offline-demo',
    commandInFlight: null
  },
  phase: 'setup',
  setup: {
    scriptSelected: false,
    setupGenerated: false,
    setupConfirmed: false,
    rolesDealt: false,
    firstNightStarted: false,
    primaryAction: 'selectScript',
    feedback: { tone: 'neutral', message: '先选择剧本并生成配板。' }
  },
  players: createDemoPlayers(12),
  receipts: [],
  journal: [
    { time: '系统', text: 'V3.1 开局工作台已就绪。' }
  ]
};

let state = structuredClone(initialState);
const listeners = new Set();

export function getState() {
  return structuredClone(state);
}

export function setState(updater) {
  const nextState = typeof updater === 'function' ? updater(structuredClone(state)) : updater;
  state = normalizeState(nextState);
  emit();
  return getState();
}

export function subscribe(listener) {
  listeners.add(listener);
  listener(getState());
  return () => listeners.delete(listener);
}

export function resetState() {
  state = structuredClone(initialState);
  emit();
}

export function pushJournal(text, time = new Date().toLocaleTimeString('zh-CN', { hour12: false })) {
  setState((draft) => {
    draft.journal.unshift({ time, text });
    draft.journal = draft.journal.slice(0, 12);
    return draft;
  });
}

function normalizeState(nextState) {
  const normalized = nextState || structuredClone(initialState);
  const players = Array.isArray(normalized.players) ? normalized.players : [];
  normalized.room = normalized.room || {};
  normalized.room.playerCount = players.length;
  normalized.room.aliveCount = players.filter((player) => player.alive !== false).length;
  normalized.receipts = Array.isArray(normalized.receipts) ? normalized.receipts : [];
  normalized.journal = Array.isArray(normalized.journal) ? normalized.journal : [];
  return normalized;
}

function emit() {
  const snapshot = getState();
  for (const listener of listeners) {
    listener(snapshot);
  }
}
