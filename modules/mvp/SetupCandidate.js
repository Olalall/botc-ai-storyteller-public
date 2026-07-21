const RoleDistributor = require('../RoleDistributor');
const {
  buildRoleCatalog,
  getScriptById,
} = require('../ScriptCatalog');

const SCRIPT_ID = 'trouble-brewing';
const SCRIPT_EDITION = 'tb';
const MIN_PLAYER_COUNT = 7;
const MAX_PLAYER_COUNT = 15;

const ROLE_ID_ALIASES = Object.freeze({
  'fortune-teller': 'fortuneteller',
  'scarlet-woman': 'scarletwoman',
});

const TB_REVERSE_ROLE_ID_ALIASES = Object.freeze(Object.fromEntries(
  Object.entries(ROLE_ID_ALIASES).map(([localId, officialId]) => [officialId, localId]),
));

const TEAM_BY_GROUP = Object.freeze({
  townsfolk: 'townsfolk',
  outsiders: 'outsider',
  minions: 'minion',
  demons: 'demon',
});

const COUNT_KEY_BY_TEAM = Object.freeze({
  townsfolk: 'townsfolk',
  outsider: 'outsiders',
  minion: 'minions',
  demon: 'demons',
});

function normalizeRoleId(roleId, scriptId = SCRIPT_ID) {
  const value = String(roleId || '').trim();
  if (scriptId === SCRIPT_ID) return ROLE_ID_ALIASES[value] || value;
  return value;
}

function normalizeRoleIds(roleIds, scriptId = SCRIPT_ID) {
  const seen = new Set();
  const normalized = [];

  for (const roleId of roleIds || []) {
    const officialRoleId = normalizeRoleId(roleId, scriptId);
    if (!officialRoleId || seen.has(officialRoleId)) continue;
    seen.add(officialRoleId);
    normalized.push(officialRoleId);
  }

  return normalized;
}

function createSeededRandom(seed) {
  let value = hashString(String(seed || 'setup-candidate'));
  return () => {
    value += 0x6D2B79F5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffleValues(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function getScript(scriptId) {
  const script = getScriptById(scriptId);
  if (!script) throw new Error(`Unsupported script: ${scriptId}`);
  return script;
}

function getRolePools(scriptId = SCRIPT_ID) {
  const script = getScript(scriptId);
  const characters = script.characters || {};
  return {
    townsfolk: (characters.townsfolk || []).map((role) => normalizeRoleId(role.id, scriptId)),
    outsiders: (characters.outsiders || []).map((role) => normalizeRoleId(role.id, scriptId)),
    minions: (characters.minions || []).map((role) => normalizeRoleId(role.id, scriptId)),
    demons: (characters.demons || []).map((role) => normalizeRoleId(role.id, scriptId)),
  };
}

function getRoleGroupById(scriptId = SCRIPT_ID) {
  const pools = getRolePools(scriptId);
  return new Map(
    Object.entries(pools).flatMap(([group, roleIds]) => roleIds.map((roleId) => [roleId, group])),
  );
}

function getBaseRoleCounts(playerCount, scriptId = SCRIPT_ID) {
  assertPlayerCount(playerCount);
  const script = getScript(scriptId);
  const distributor = new RoleDistributor({ getScript: () => script });
  const counts = distributor.calculateRoleCount(playerCount);
  return {
    townsfolk: counts.townsfolk,
    outsiders: counts.outsiders,
    minions: counts.minions,
    demons: counts.demons,
  };
}

function applySetupCountEffects(baseCounts, selectedMinionRoleIds, scriptId = SCRIPT_ID, rolePools = getRolePools(scriptId)) {
  const effectiveCounts = { ...baseCounts };
  const setupEffects = [];

  if (scriptId === SCRIPT_ID && selectedMinionRoleIds.includes('baron')) {
    effectiveCounts.townsfolk -= 2;
    effectiveCounts.outsiders += 2;
    setupEffects.push({
      roleId: 'baron',
      effect: 'outsiders+2_townsfolk-2',
      from: {
        townsfolk: baseCounts.townsfolk,
        outsiders: baseCounts.outsiders,
      },
      to: {
        townsfolk: effectiveCounts.townsfolk,
        outsiders: effectiveCounts.outsiders,
      },
    });
  }

  if (effectiveCounts.townsfolk < 0) {
    throw new Error('Setup effects produced a negative townsfolk count');
  }
  if (effectiveCounts.outsiders > rolePools.outsiders.length) {
    throw new Error(`Setup effects require more outsiders than script ${scriptId} supports`);
  }

  return { effectiveCounts, setupEffects };
}

function createSetupCandidate(options = {}) {
  const {
    roomId = null,
    scriptId = SCRIPT_ID,
    playerCount,
    occupiedSeats,
    seed = `${scriptId}-${playerCount}`,
    forceIncludeRoleIds = [],
    forceExcludeRoleIds = [],
    drunkShownRoleId = null,
    source = 'rules',
  } = options;

  const script = getScript(scriptId);
  assertPlayerCount(playerCount);

  const rolePools = getRolePools(scriptId);
  const roleGroupById = getRoleGroupById(scriptId);
  const seats = normalizeOccupiedSeats(occupiedSeats, playerCount);
  const random = createSeededRandom(seed);
  const forcedRoleIds = normalizeRoleIds(forceIncludeRoleIds, scriptId);
  const excludedRoleIds = new Set(normalizeRoleIds(forceExcludeRoleIds, scriptId));

  assertKnownRoleIds(forcedRoleIds, scriptId);
  assertKnownRoleIds([...excludedRoleIds], scriptId);
  for (const roleId of forcedRoleIds) {
    if (excludedRoleIds.has(roleId)) {
      throw new Error(`Role cannot be both forced and excluded: ${roleId}`);
    }
  }

  const baseCounts = getBaseRoleCounts(playerCount, scriptId);
  const forcedByGroup = groupRoleIds(forcedRoleIds, roleGroupById);

  const selectedMinionRoleIds = selectRoleIds({
    pool: rolePools.minions,
    group: 'minions',
    count: baseCounts.minions,
    forcedRoleIds: forcedByGroup.minions,
    excludedRoleIds,
    random,
  });

  const { effectiveCounts, setupEffects } = applySetupCountEffects(baseCounts, selectedMinionRoleIds, scriptId, rolePools);

  const selectedRoleIdsByGroup = {
    townsfolk: selectRoleIds({
      pool: rolePools.townsfolk,
      group: 'townsfolk',
      count: effectiveCounts.townsfolk,
      forcedRoleIds: forcedByGroup.townsfolk,
      excludedRoleIds,
      random,
    }),
    outsiders: selectRoleIds({
      pool: rolePools.outsiders,
      group: 'outsiders',
      count: effectiveCounts.outsiders,
      forcedRoleIds: forcedByGroup.outsiders,
      excludedRoleIds,
      random,
    }),
    minions: selectedMinionRoleIds,
    demons: selectRoleIds({
      pool: rolePools.demons,
      group: 'demons',
      count: effectiveCounts.demons,
      forcedRoleIds: forcedByGroup.demons,
      excludedRoleIds,
      random,
    }),
  };

  const selectedTrueRoleIds = Object.values(selectedRoleIdsByGroup).flat();
  const drunkCoverRoleId = selectedTrueRoleIds.includes('drunk')
    ? selectDrunkShownRoleId({
      selectedTrueRoleIds,
      requestedShownRoleId: drunkShownRoleId,
      random,
      rolePools,
      scriptId,
    })
    : null;

  if (drunkCoverRoleId) {
    setupEffects.push({
      roleId: 'drunk',
      effect: 'shownRoleId_is_not_trueRoleId',
      shownRoleId: drunkCoverRoleId,
    });
  }

  const unassignedRoleCandidates = buildRoleCandidates({
    selectedRoleIdsByGroup,
    drunkCoverRoleId,
    source,
    scriptId,
    roleGroupById,
  });
  const seatCandidates = shuffleValues(unassignedRoleCandidates, random).map((candidate, index) => ({
    seat: seats[index],
    ...candidate,
  }));
  const demonBluffs = selectDemonBluffs({
    selectedTrueRoleIds,
    drunkCoverRoleId,
    random,
    rolePools,
  });

  return {
    candidateId: buildCandidateId({ scriptId, playerCount, seed }),
    roomId,
    scriptId,
    scriptEdition: script.source?.edition || script.id,
    scriptName: script.name,
    playerCount,
    seatCount: seats.length,
    occupiedSeats: seats,
    baseCounts,
    effectiveCounts,
    seatCandidates,
    demonBluffs,
    setupEffects,
    roleIdSource: scriptId === SCRIPT_ID ? 'official' : 'normalized-fixture',
    boundary: {
      previewOnly: true,
      storytellerConfirmationRequired: true,
      roleLock: false,
      roleDeal: false,
      playerViewEmission: false,
      eventLogWrite: false,
      nightStart: false,
      stateMutation: false,
      aiCanLock: false,
      complexRoleAutomation: scriptId === SCRIPT_ID ? 'partial-local-rules' : 'manual-storyteller-confirmed',
    },
  };
}

function buildCandidateId({ scriptId, playerCount, seed }) {
  return `setup_${scriptId}_${playerCount}_${hashString(String(seed)).toString(16)}`;
}

function normalizeOccupiedSeats(occupiedSeats, playerCount) {
  const seats = Array.isArray(occupiedSeats)
    ? occupiedSeats.map((seat) => Number(seat))
    : Array.from({ length: playerCount }, (_value, index) => index + 1);
  const uniqueSeats = new Set(seats);

  if (seats.length !== playerCount) {
    throw new Error(`Occupied seat count must match playerCount: ${seats.length} !== ${playerCount}`);
  }
  if (uniqueSeats.size !== seats.length) {
    throw new Error('Occupied seats must be unique');
  }
  if (!seats.every((seat) => Number.isInteger(seat) && seat > 0)) {
    throw new Error('Occupied seats must be positive integers');
  }

  return seats;
}

function groupRoleIds(roleIds, roleGroupById) {
  const grouped = {
    townsfolk: [],
    outsiders: [],
    minions: [],
    demons: [],
  };

  for (const roleId of roleIds) {
    const group = roleGroupById.get(roleId);
    if (!group || !grouped[group]) {
      throw new Error(`Unknown role group for role: ${roleId}`);
    }
    grouped[group].push(roleId);
  }

  return grouped;
}

function selectRoleIds({ pool, group, count, forcedRoleIds, excludedRoleIds, random }) {
  const forced = [...forcedRoleIds];
  const available = pool.filter((roleId) => !excludedRoleIds.has(roleId) && !forced.includes(roleId));

  if (forced.length > count) {
    throw new Error(`Too many forced ${group} roles for count ${count}: ${forced.join(', ')}`);
  }
  if (forced.some((roleId) => !pool.includes(roleId))) {
    throw new Error(`Forced role does not belong to ${group}: ${forced.join(', ')}`);
  }
  if (forced.length + available.length < count) {
    throw new Error(`Not enough ${group} roles to fill count ${count}`);
  }

  return [
    ...forced,
    ...shuffleValues(available, random).slice(0, count - forced.length),
  ];
}

function buildRoleCandidates({ selectedRoleIdsByGroup, drunkCoverRoleId, source, scriptId, roleGroupById }) {
  return Object.entries(selectedRoleIdsByGroup).flatMap(([group, roleIds]) => (
    roleIds.map((trueRoleId) => {
      const shownRoleId = trueRoleId === 'drunk' ? drunkCoverRoleId : trueRoleId;
      const trueTeam = TEAM_BY_GROUP[group];
      const shownGroup = roleGroupById.get(shownRoleId);
      const shownTeam = TEAM_BY_GROUP[shownGroup];
      return {
        roleId: trueRoleId,
        trueRoleId,
        shownRoleId,
        team: trueTeam,
        shownTeam,
        source,
        role: getRoleMetadata(trueRoleId, scriptId),
        shownRole: getRoleMetadata(shownRoleId, scriptId),
      };
    })
  ));
}

function selectDrunkShownRoleId({ selectedTrueRoleIds, requestedShownRoleId, random, rolePools, scriptId }) {
  const selectedSet = new Set(selectedTrueRoleIds);
  const candidates = rolePools.townsfolk.filter((roleId) => !selectedSet.has(roleId));
  const normalizedRequestedShownRoleId = requestedShownRoleId ? normalizeRoleId(requestedShownRoleId, scriptId) : null;

  if (normalizedRequestedShownRoleId) {
    if (!rolePools.townsfolk.includes(normalizedRequestedShownRoleId)) {
      throw new Error(`Drunk shownRoleId must be a townsfolk role: ${normalizedRequestedShownRoleId}`);
    }
    if (selectedSet.has(normalizedRequestedShownRoleId)) {
      throw new Error(`Drunk shownRoleId must not be a true in-play role: ${normalizedRequestedShownRoleId}`);
    }
    return normalizedRequestedShownRoleId;
  }

  if (candidates.length === 0) {
    throw new Error('No not-in-play townsfolk role is available for the Drunk shownRoleId');
  }

  return shuffleValues(candidates, random)[0];
}

function selectDemonBluffs({ selectedTrueRoleIds, drunkCoverRoleId, random, rolePools }) {
  const unavailable = new Set(selectedTrueRoleIds);
  unavailable.add('drunk');
  if (drunkCoverRoleId) unavailable.add(drunkCoverRoleId);

  const goodRoleIds = [...rolePools.townsfolk, ...rolePools.outsiders];
  const candidates = goodRoleIds.filter((roleId) => !unavailable.has(roleId));
  if (candidates.length < 3) {
    throw new Error('Not enough not-in-play good roles to create 3 demon bluffs');
  }

  return shuffleValues(candidates, random).slice(0, 3);
}

function getRoleMetadata(roleId, scriptId = SCRIPT_ID) {
  const catalog = buildRoleCatalog(scriptId);
  const metadata = catalog.get(roleId) || (scriptId === SCRIPT_ID ? catalog.get(TB_REVERSE_ROLE_ID_ALIASES[roleId]) : null);
  if (metadata) {
    return {
      id: metadata.id,
      name: metadata.name,
      nameEn: metadata.nameEn,
      ability: metadata.ability,
      setup: Boolean(metadata.setup),
      team: metadata.team || TEAM_BY_GROUP[metadata.group],
    };
  }

  return {
    id: roleId,
    name: roleId,
    nameEn: roleId,
    ability: '',
    setup: false,
    team: null,
  };
}

function countSeatCandidateTeams(seatCandidates) {
  const counts = {
    townsfolk: 0,
    outsiders: 0,
    minions: 0,
    demons: 0,
  };

  for (const candidate of seatCandidates || []) {
    const countKey = COUNT_KEY_BY_TEAM[candidate.team];
    if (countKey) counts[countKey] += 1;
  }

  return counts;
}

function assertPlayerCount(playerCount) {
  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYER_COUNT || playerCount > MAX_PLAYER_COUNT) {
    throw new Error(`playerCount must be an integer from ${MIN_PLAYER_COUNT} to ${MAX_PLAYER_COUNT}`);
  }
}

function assertKnownRoleIds(roleIds, scriptId = SCRIPT_ID) {
  const roleGroupById = getRoleGroupById(scriptId);
  const unknownRoleIds = roleIds.filter((roleId) => !roleGroupById.has(roleId));
  if (unknownRoleIds.length > 0) {
    throw new Error(`Unknown ${scriptId} role IDs: ${unknownRoleIds.join(', ')}`);
  }
}

module.exports = {
  SCRIPT_ID,
  SCRIPT_EDITION,
  ROLE_ID_ALIASES,
  ROLE_POOLS: getRolePools(SCRIPT_ID),
  TEAM_BY_GROUP,
  normalizeRoleId,
  getBaseRoleCounts,
  applySetupCountEffects,
  createSetupCandidate,
  countSeatCandidateTeams,
};
