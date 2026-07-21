const {
  DEMON_ROLE_IDS,
  MINION_ROLE_IDS,
  TOWNSFOLK_ROLE_IDS,
  getAlignmentForPlayer,
  normalizeRoleId
} = require('./RuleAutomation');
const { getRuntimeScripts, getScriptById } = require('../ScriptCatalog');

const OUTSIDER_ROLE_IDS = new Set([
  'butler', 'drunk', 'recluse', 'saint', 'sweetheart', 'mutant', 'lunatic',
  'klutz', 'barber', 'goon', 'tinker', 'moonchild', 'puzzlemaster', 'damsel', 'politician'
]);

const ROLE_TYPE_BY_GROUP = Object.freeze({
  townsfolk: 'townsfolk',
  outsiders: 'outsider',
  outsider: 'outsider',
  minions: 'minion',
  minion: 'minion',
  demons: 'demon',
  demon: 'demon',
  travellers: 'traveller',
  travelers: 'traveller',
  traveller: 'traveller'
});

const GROUP_BY_ROLE_TYPE = Object.freeze({
  townsfolk: 'townsfolk',
  outsider: 'outsiders',
  minion: 'minions',
  demon: 'demons',
  traveller: 'travellers'
});

const ATOMIC_ROLE_FIELDS = Object.freeze([
  'trueRoleId',
  'roleId',
  'trueRoleType',
  'roleType',
  'team',
  'alignment',
  'trueAlignment',
  'shownRoleId',
  'shownTeam',
  'shownAlignment'
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getRoomState(room) {
  return room?.state && typeof room.state === 'object' ? room.state : (room || {});
}

function normalizeRoleType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ROLE_TYPE_BY_GROUP[normalized] || normalized || null;
}

function roleTypeFromRoleId(roleId) {
  const normalized = normalizeRoleId(roleId);
  if (DEMON_ROLE_IDS.has(normalized)) return 'demon';
  if (MINION_ROLE_IDS.has(normalized)) return 'minion';
  if (OUTSIDER_ROLE_IDS.has(normalized)) return 'outsider';
  if (TOWNSFOLK_ROLE_IDS.has(normalized)) return 'townsfolk';
  return null;
}

function findRoleDefinition(room, roleId) {
  const state = getRoomState(room);
  const requested = normalizeRoleId(roleId);
  const scripts = [];
  const roomScript = state.script || getScriptById(state.currentScript || state.scriptId || 'trouble-brewing');
  if (roomScript) scripts.push(roomScript);
  for (const script of getRuntimeScripts()) {
    if (!scripts.some((item) => item?.id === script?.id)) scripts.push(script);
  }

  for (const script of scripts) {
    for (const [group, roles] of Object.entries(script?.characters || {})) {
      const role = asArray(roles).find((item) => normalizeRoleId(item?.id) === requested);
      if (role) return { ...role, group };
    }
  }
  return null;
}

function descriptorFromRole(room, roleId) {
  const normalizedRoleId = normalizeRoleId(roleId);
  const role = findRoleDefinition(room, normalizedRoleId);
  const roleType = normalizeRoleType(role?.team || role?.group || role?.type) || roleTypeFromRoleId(normalizedRoleId);
  if (!roleType) return null;
  const group = role?.group || GROUP_BY_ROLE_TYPE[roleType] || roleType;
  const alignment = role?.alignment || (['minion', 'demon'].includes(roleType) ? 'evil' : 'good');
  return {
    roleId: normalizedRoleId,
    roleType,
    team: roleType,
    alignment,
    group,
    roleName: role?.name || role?.nameEn || normalizedRoleId,
    roleNameEn: role?.nameEn || role?.name || normalizedRoleId,
    ability: role?.ability || role?.desc || null
  };
}

function descriptorFromPlayer(player, room) {
  if (!player) return null;
  const roleId = normalizeRoleId(player.trueRoleId || player.realRoleId || player.roleId || player.role || player.shownRoleId);
  const descriptor = descriptorFromRole(room, roleId) || {
    roleId,
    roleType: normalizeRoleType(player.trueRoleType || player.realRoleType || player.roleType || player.type || player.team),
    team: normalizeRoleType(player.trueTeam || player.realTeam || player.team || player.roleType),
    alignment: player.trueAlignment || player.realAlignment || player.alignment || getAlignmentForPlayer(player),
    group: GROUP_BY_ROLE_TYPE[normalizeRoleType(player.trueRoleType || player.roleType || player.team)] || null,
    roleName: player.trueRoleName || player.roleName || player.shownRoleName || roleId,
    roleNameEn: player.trueRoleNameEn || player.roleNameEn || player.shownRoleNameEn || roleId,
    ability: player.ability || player.roleAbility || player.shownAbility || null
  };
  return {
    ...descriptor,
    roleId,
    roleType: normalizeRoleType(player.trueRoleType || player.realRoleType || player.roleType || player.type) || descriptor.roleType,
    team: normalizeRoleType(player.trueTeam || player.realTeam || player.team || player.roleType) || descriptor.team,
    alignment: player.trueAlignment || player.realAlignment || player.alignment || descriptor.alignment
  };
}

function buildRoleTransitionState(room, roleId, options = {}) {
  const sourcePlayer = options.sourcePlayer || null;
  const descriptor = sourcePlayer
    ? descriptorFromPlayer(sourcePlayer, room)
    : descriptorFromRole(room, roleId);
  if (!descriptor?.roleId || !descriptor.roleType) {
    const error = new Error(`unknown-role-transition-role:${roleId}`);
    error.code = 'unknown-role-transition-role';
    throw error;
  }
  const group = descriptor.group || GROUP_BY_ROLE_TYPE[descriptor.roleType] || descriptor.roleType;
  return {
    ...descriptor,
    shownRoleId: descriptor.roleId,
    shownRoleName: descriptor.roleName,
    shownRoleNameEn: descriptor.roleNameEn,
    shownAbility: descriptor.ability,
    shownTeam: group,
    shownAlignment: descriptor.alignment
  };
}

function buildRoleTransitionPatches(room, seat, roleId, options = {}) {
  const normalizedSeat = Number(seat);
  if (!Number.isInteger(normalizedSeat) || normalizedSeat <= 0) {
    const error = new Error('invalid-role-transition-seat');
    error.code = 'invalid-role-transition-seat';
    throw error;
  }
  const next = buildRoleTransitionState(room, roleId, options);
  const prefix = `playersBySeat.${normalizedSeat}`;
  const patches = [
    ['trueRoleId', next.roleId],
    ['roleId', next.roleId],
    ['role', next.roleId],
    ['trueRoleType', next.roleType],
    ['roleType', next.roleType],
    ['team', next.team],
    ['trueTeam', next.team],
    ['alignment', next.alignment],
    ['trueAlignment', next.alignment],
    ['trueRoleName', next.roleName],
    ['trueRoleNameEn', next.roleNameEn],
    ['roleName', next.roleName],
    ['roleNameEn', next.roleNameEn],
    ['roleAbility', next.ability],
    ['ability', next.ability]
  ];
  if (options.updateShown !== false) {
    patches.push(
      ['shownRoleId', next.shownRoleId],
      ['shownRoleName', next.shownRoleName],
      ['shownRoleNameEn', next.shownRoleNameEn],
      ['shownAbility', next.shownAbility],
      ['shownTeam', next.shownTeam],
      ['shownAlignment', next.shownAlignment]
    );
  }
  return patches.map(([field, value]) => ({ op: 'set', path: `${prefix}.${field}`, value }));
}

function buildRoleSwapPatches(room, leftPlayer, rightPlayer, options = {}) {
  if (!leftPlayer || !rightPlayer) return [];
  return [
    ...buildRoleTransitionPatches(room, leftPlayer.seat, rightPlayer.trueRoleId || rightPlayer.roleId || rightPlayer.role, {
      sourcePlayer: rightPlayer,
      updateShown: options.updateShown !== false
    }),
    ...buildRoleTransitionPatches(room, rightPlayer.seat, leftPlayer.trueRoleId || leftPlayer.roleId || leftPlayer.role, {
      sourcePlayer: leftPlayer,
      updateShown: options.updateShown !== false
    })
  ];
}

function applyRoleTransitionToPlayer(room, player, roleId, options = {}) {
  const patches = buildRoleTransitionPatches(room, player?.seat, roleId, options);
  const next = { ...player };
  for (const patch of patches) {
    const field = String(patch.path).split('.').pop();
    next[field] = patch.value;
  }
  return next;
}

function assertAtomicRoleTransitionPatches(patches, seats) {
  const requiredBySeat = new Map();
  for (const patch of asArray(patches)) {
    const match = String(patch?.path || '').match(/^playersBySeat\.(\d+)\.(.+)$/);
    if (!match || match[2] !== 'trueRoleId') continue;
    requiredBySeat.set(Number(match[1]), new Set());
  }
  for (const seat of asArray(seats)) requiredBySeat.set(Number(seat), requiredBySeat.get(Number(seat)) || new Set());
  for (const patch of asArray(patches)) {
    const match = String(patch?.path || '').match(/^playersBySeat\.(\d+)\.(.+)$/);
    if (!match || !requiredBySeat.has(Number(match[1]))) continue;
    requiredBySeat.get(Number(match[1])).add(match[2]);
  }
  for (const [seat, fields] of requiredBySeat.entries()) {
    const missing = ATOMIC_ROLE_FIELDS.filter((field) => !fields.has(field));
    if (missing.length > 0) {
      const error = new Error(`incomplete-role-transition-patch:${seat}:${missing.join(',')}`);
      error.code = 'incomplete-role-transition-patch';
      error.seat = seat;
      error.missingFields = missing;
      throw error;
    }
  }
}

function getRoleStateInvariantViolations(room, seats = [], options = {}) {
  const state = getRoomState(room);
  const players = asArray(state.players);
  const selectedSeats = new Set(asArray(seats).map((seat) => Number(seat)).filter(Number.isInteger));
  const scopedPlayers = selectedSeats.size > 0
    ? players.filter((player) => selectedSeats.has(Number(player.seat)))
    : players;
  const violations = [];
  for (const player of scopedPlayers) {
    const roleId = normalizeRoleId(player.trueRoleId || player.roleId || player.role || player.shownRoleId);
    const expected = descriptorFromRole(room, roleId);
    if (!expected) continue;
    const actualRoleType = normalizeRoleType(player.trueRoleType || player.roleType || player.type);
    if (actualRoleType && actualRoleType !== expected.roleType) {
      violations.push({ seat: player.seat, field: 'roleType', expected: expected.roleType, actual: actualRoleType });
    }
    const actualTeam = normalizeRoleType(player.trueTeam || player.team || player.roleType);
    if (actualTeam && actualTeam !== expected.team) {
      violations.push({ seat: player.seat, field: 'team', expected: expected.team, actual: actualTeam });
    }
    if (player.alignment !== undefined && player.trueAlignment !== undefined && player.alignment !== player.trueAlignment) {
      violations.push({ seat: player.seat, field: 'alignment', expected: player.trueAlignment, actual: player.alignment });
    }
    if (options.checkShownRole === true && player.shownRoleId !== undefined && normalizeRoleId(player.shownRoleId) !== roleId) {
      violations.push({ seat: player.seat, field: 'shownRoleId', expected: roleId, actual: player.shownRoleId });
    }
  }
  return violations;
}

module.exports = {
  ATOMIC_ROLE_FIELDS,
  applyRoleTransitionToPlayer,
  assertAtomicRoleTransitionPatches,
  buildRoleSwapPatches,
  buildRoleTransitionPatches,
  getRoleStateInvariantViolations
};
