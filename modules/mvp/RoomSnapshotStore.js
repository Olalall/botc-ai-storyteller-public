const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SNAPSHOT_SCHEMA_VERSION = 'mvp-room-snapshot.v1';
const DEFAULT_SNAPSHOT_DIR = '.botc-room-snapshots';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hashPlayerToken(token) {
  if (typeof token !== 'string' || !token) return null;
  return crypto.createHash('sha256').update(token).digest('hex');
}

function verifyPlayerTokenHash(player, token) {
  const expectedHash = player?.playerTokenHash || player?.tokenHash || null;
  if (!expectedHash || typeof token !== 'string' || !token) return false;
  const candidateHash = hashPlayerToken(token);
  const left = Buffer.from(String(expectedHash), 'hex');
  const right = Buffer.from(String(candidateHash), 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function attachVerifiedPlayerToken(player, token) {
  if (!player || typeof token !== 'string' || !token) return;
  player.playerToken = token;
  player.playerTokenHash = hashPlayerToken(token);
  player.playerTokenHashVersion = 'sha256:v1';
}

function getSnapshotDir(rootDir = process.cwd(), env = process.env) {
  const configured = env.BOTC_ROOM_SNAPSHOT_DIR;
  if (configured && path.isAbsolute(configured)) return configured;
  if (configured) return path.resolve(rootDir, configured);
  return path.resolve(rootDir, DEFAULT_SNAPSHOT_DIR);
}

function sanitizePlayerForSnapshot(player) {
  const nextPlayer = clone(player || {});
  const tokenHash = nextPlayer.playerTokenHash || hashPlayerToken(nextPlayer.playerToken);
  delete nextPlayer.playerToken;
  delete nextPlayer.token;
  delete nextPlayer.seatToken;
  if (tokenHash) {
    nextPlayer.playerTokenHash = tokenHash;
    nextPlayer.playerTokenHashVersion = nextPlayer.playerTokenHashVersion || 'sha256:v1';
  }
  nextPlayer.connected = false;
  return nextPlayer;
}

function sanitizeRoomStateForSnapshot(state) {
  const nextState = clone(state || {});
  nextState.players = Array.isArray(nextState.players)
    ? nextState.players.map(sanitizePlayerForSnapshot)
    : [];
  return nextState;
}

function serializeRoomForSnapshot(room, now = new Date().toISOString()) {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    savedAt: now,
    room: {
      id: room.id,
      passwordRequired: room.passwordRequired === true,
      password: room.password ? clone(room.password) : null,
      storytellerReconnectTokenHash: room.storytellerReconnectTokenHash || null,
      state: sanitizeRoomStateForSnapshot(room.state)
    }
  };
}

function restoreRoomFromSnapshot(snapshot) {
  if (snapshot?.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new Error('unsupported-room-snapshot-schema');
  }
  const storedRoom = snapshot.room;
  if (!storedRoom?.id || !storedRoom?.state) {
    throw new Error('invalid-room-snapshot');
  }
  const state = clone(storedRoom.state);
  state.players = Array.isArray(state.players)
    ? state.players.map((player) => ({
      ...player,
      connected: false
    }))
    : [];
  return {
    id: storedRoom.id,
    storyteller: null,
    passwordRequired: storedRoom.passwordRequired === true,
    password: storedRoom.password ? clone(storedRoom.password) : null,
    storytellerReconnectTokenHash: storedRoom.storytellerReconnectTokenHash || null,
    clients: new Map(),
    state
  };
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function saveRoomSnapshots(rooms, options = {}) {
  const snapshotDir = options.snapshotDir || getSnapshotDir(options.rootDir, options.env);
  fs.mkdirSync(snapshotDir, { recursive: true });
  const savedAt = options.now || new Date().toISOString();
  const roomList = [...rooms.values()].filter((room) => room?.id && room?.state);
  const index = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    savedAt,
    roomIds: roomList.map((room) => room.id)
  };

  for (const room of roomList) {
    writeJsonAtomic(
      path.join(snapshotDir, `${room.id}.json`),
      serializeRoomForSnapshot(room, savedAt)
    );
  }
  const expectedSnapshotFiles = new Set(roomList.map((room) => `${room.id}.json`));
  for (const entry of fs.readdirSync(snapshotDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name === 'index.json') continue;
    if (!expectedSnapshotFiles.has(entry.name)) {
      fs.rmSync(path.join(snapshotDir, entry.name), { force: true });
    }
  }
  writeJsonAtomic(path.join(snapshotDir, 'index.json'), index);
  return { snapshotDir, roomCount: roomList.length, roomIds: index.roomIds };
}

function loadRoomSnapshots(options = {}) {
  const snapshotDir = options.snapshotDir || getSnapshotDir(options.rootDir, options.env);
  if (!fs.existsSync(snapshotDir)) {
    return { snapshotDir, rooms: [] };
  }

  const entries = fs.readdirSync(snapshotDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'index.json');
  const rooms = [];
  for (const entry of entries) {
    const raw = fs.readFileSync(path.join(snapshotDir, entry.name), 'utf8');
    rooms.push(restoreRoomFromSnapshot(JSON.parse(raw)));
  }
  return { snapshotDir, rooms };
}

module.exports = {
  SNAPSHOT_SCHEMA_VERSION,
  attachVerifiedPlayerToken,
  getSnapshotDir,
  hashPlayerToken,
  loadRoomSnapshots,
  restoreRoomFromSnapshot,
  saveRoomSnapshots,
  serializeRoomForSnapshot,
  verifyPlayerTokenHash
};
