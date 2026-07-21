const PLAYER_VIEW_FORBIDDEN_KEYS = new Set([
  'trueRoleId',
  'realRoleId',
  'trueRoleName',
  'realRoleName',
  'trueAlignment',
  'realAlignment',
  'drunk',
  'poisoned',
  'isDrunk',
  'isPoisoned',
  'redHerring',
  'reminders',
  'storytellerNotes',
  'candidateResolutions',
  'fullEventLog',
  'aiAudit',
  'allNightSubmissions',
  'nightSubmissions'
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clonePublicValue(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function sanitizePublicEvent(event) {
  if (!event || typeof event !== 'object') return null;

  const safe = {};
  const allowedKeys = [
    'id',
    'type',
    'title',
    'summary',
    'text',
    'message',
    'publicText',
    'createdAt',
    'phase',
    'round',
    'day',
    'night',
    'seat',
    'seats',
    'fromSeat',
    'toSeat',
    'nominatorSeat',
    'nomineeSeat',
    'executedSeat',
    'killedSeat',
    'deadSeats',
    'winningTeam'
  ];

  for (const key of allowedKeys) {
    if (event[key] !== undefined) {
      safe[key] = clonePublicValue(event[key]);
    }
  }

  return Object.keys(safe).length > 0 ? safe : null;
}

function getRoomState(input) {
  if (input?.state) return input.state;
  return input || {};
}

function getPlayers(roomState) {
  return asArray(roomState.players).slice().sort((left, right) => {
    return Number(left?.seat ?? 0) - Number(right?.seat ?? 0);
  });
}

function getPlayerCount(roomState, players) {
  if (Number.isInteger(roomState.playerCount)) return roomState.playerCount;
  if (Number.isInteger(roomState.setupLock?.playerCount)) return roomState.setupLock.playerCount;
  return players.length;
}

function getShownRole(player) {
  return {
    roleId: player.shownRoleId ?? player.displayRoleId ?? player.visibleRoleId ?? player.role ?? null,
    roleName: player.shownRoleName ?? player.displayRoleName ?? player.roleName ?? null,
    roleNameEn: player.shownRoleNameEn ?? player.displayRoleNameEn ?? player.roleNameEn ?? null,
    ability: player.shownAbility ?? player.displayAbility ?? player.roleAbility ?? player.ability ?? null,
    team: player.shownTeam ?? player.displayTeam ?? player.team ?? null,
    alignment: player.shownAlignment ?? player.displayAlignment ?? player.alignment ?? null
  };
}

function normalizeRoleId(value) {
  return String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function getTrueRoleId(player) {
  return normalizeRoleId(player.trueRoleId ?? player.realRoleId ?? player.roleId ?? player.role);
}

function getTrueRoleKind(player) {
  const raw = player.trueRoleType
    ?? player.realRoleType
    ?? player.roleType
    ?? player.type
    ?? player.team
    ?? '';
  const value = String(raw).toLowerCase();
  if (['demons', 'demon'].includes(value)) return 'demon';
  if (['minions', 'minion'].includes(value)) return 'minion';
  if (['townsfolk', 'townsfolk'].includes(value)) return 'townsfolk';
  if (['outsiders', 'outsider'].includes(value)) return 'outsider';

  const roleId = getTrueRoleId(player);
  if (roleId === 'imp') return 'demon';
  if (['poisoner', 'spy', 'scarlet-woman', 'baron'].includes(roleId)) return 'minion';
  return null;
}

function isDemon(player) {
  return getTrueRoleKind(player) === 'demon';
}

function isMinion(player) {
  return getTrueRoleKind(player) === 'minion';
}

function isTownsfolk(player) {
  return getTrueRoleKind(player) === 'townsfolk';
}

function isOutsider(player) {
  return getTrueRoleKind(player) === 'outsider';
}

function isEvil(player) {
  const alignment = String(player.trueAlignment ?? player.realAlignment ?? player.alignment ?? '').toLowerCase();
  return alignment === 'evil' || isDemon(player) || isMinion(player);
}

function publicSeatFor(player) {
  return {
    seat: player.seat,
    name: player.name ?? `Player ${player.seat}`,
    occupied: true,
    alive: player.alive !== false,
    deadVoteAvailable: player.deadVoteAvailable !== false,
    connected: player.connected === true,
    aiTestPlayer: player.aiTestPlayer === true
  };
}

function publicSeatInfo(player) {
  if (!player) return null;
  return {
    seat: player.seat,
    name: player.name ?? `Player ${player.seat}`,
    alive: player.alive !== false
  };
}

function emptyPublicSeatFor(seat) {
  return {
    seat,
    name: null,
    occupied: false,
    alive: true,
    deadVoteAvailable: true,
    connected: false
  };
}

function buildPublicSeats(players, playerCount) {
  const playersBySeat = new Map(players.map((player) => [player.seat, player]));
  const maxSeat = Math.max(playerCount, ...players.map((player) => Number(player.seat) || 0));
  return Array.from({ length: maxSeat }, (_, index) => {
    const seat = index + 1;
    const player = playersBySeat.get(seat);
    return player ? publicSeatFor(player) : emptyPublicSeatFor(seat);
  });
}

function isPrivateGrimoireViewer(player) {
  return ['spy', 'widow'].includes(getTrueRoleId(player));
}

function getPrivateGrimoireRole(player) {
  const roleId = player.trueRoleId ?? player.realRoleId ?? player.roleId ?? player.role ?? null;
  return {
    roleId,
    roleName: player.trueRoleName ?? player.realRoleName ?? player.roleName ?? player.shownRoleName ?? null,
    roleNameEn: player.trueRoleNameEn ?? player.realRoleNameEn ?? player.roleNameEn ?? player.shownRoleNameEn ?? null,
    team: player.trueTeam ?? player.realTeam ?? player.team ?? player.roleType ?? null,
    alignment: player.trueAlignment ?? player.realAlignment ?? player.alignment ?? null
  };
}

function buildPrivateRoleInfo(player) {
  if (!player) return null;
  return {
    roleId: player.trueRoleId ?? player.realRoleId ?? player.roleId ?? player.role ?? null,
    roleName: player.trueRoleName ?? player.realRoleName ?? player.roleName ?? player.shownRoleName ?? null,
    roleNameEn: player.trueRoleNameEn ?? player.realRoleNameEn ?? player.roleNameEn ?? player.shownRoleNameEn ?? null,
    team: player.trueTeam ?? player.realTeam ?? player.team ?? player.roleType ?? null,
    alignment: player.trueAlignment ?? player.realAlignment ?? player.alignment ?? null
  };
}

function buildPrivateGrimoire(roomState, players, viewer) {
  if (!isPrivateGrimoireViewer(viewer)) return null;
  const viewerRoleId = getTrueRoleId(viewer);

  return {
    kind: `${viewerRoleId}-private-grimoire`,
    viewerSeat: viewer.seat,
    viewerRoleId,
    phase: roomState.phase ?? 'waiting',
    round: Number.isInteger(roomState.round) ? roomState.round : 0,
    seats: players.map((player) => ({
      seat: player.seat,
      name: player.name ?? `Player ${player.seat}`,
      alive: player.alive !== false,
      deadVoteAvailable: player.deadVoteAvailable !== false,
      role: getPrivateGrimoireRole(player)
    }))
  };
}

function sanitizeMessage(message) {
  return {
    id: message.id ?? null,
    type: message.type ?? 'private',
    title: message.title ?? null,
    text: message.text ?? message.message ?? '',
    createdAt: message.createdAt ?? message.sentAt ?? null,
    readAt: message.readAt ?? null
  };
}

function messageTargetsSeat(message, seat) {
  return message.privateToSeat === seat
    || message.toSeat === seat
    || message.seat === seat
    || asArray(message.toSeats).includes(seat);
}

function getPrivateMessages(roomState, seat) {
  return asArray(roomState.privateMessages)
    .filter((message) => messageTargetsSeat(message, seat))
    .map(sanitizeMessage);
}

function adjacentPairs(players) {
  if (players.length < 2) return [];
  return players.map((player, index) => [player, players[(index + 1) % players.length]]);
}

function circularDistance(players, leftSeat, rightSeat) {
  const leftIndex = players.findIndex((player) => Number(player.seat) === Number(leftSeat));
  const rightIndex = players.findIndex((player) => Number(player.seat) === Number(rightSeat));
  if (leftIndex === -1 || rightIndex === -1 || leftIndex === rightIndex || players.length < 2) return null;
  const gap = Math.abs(leftIndex - rightIndex);
  return Math.min(gap, players.length - gap);
}

function nearestAliveNeighbor(players, seat, direction) {
  const index = players.findIndex((player) => Number(player.seat) === Number(seat));
  if (index === -1 || players.length < 2) return null;
  for (let offset = 1; offset < players.length; offset += 1) {
    const nextIndex = (index + (direction * offset) + players.length) % players.length;
    const player = players[nextIndex];
    if (player?.alive !== false) return player;
  }
  return null;
}

function firstRoleOfKind(players, predicate) {
  return players.find(predicate) || null;
}

function deadPlayers(players) {
  return players.filter((player) => player?.alive === false);
}

function getRecordedVotes(roomState) {
  return [
    ...asArray(roomState.stage5Voting?.votes),
    ...asArray(roomState.dayVote?.votes),
    ...asArray(roomState.publicDayVote?.votes),
    ...asArray(roomState.votes)
  ];
}

function getRecordedNominations(roomState) {
  return [
    roomState.stage5Nomination?.currentNomination,
    roomState.stage5Voting?.sourceNomination,
    roomState.dayVote?.currentNomination,
    roomState.publicDayVote?.currentNomination,
    ...asArray(roomState.nominations),
    ...asArray(roomState.dayNominations)
  ].filter(Boolean);
}

function getSeatFromRecord(record, keys) {
  for (const key of keys) {
    const value = Number(record?.[key]);
    if (Number.isInteger(value)) return value;
  }
  return null;
}

function getAbnormalAbilityCount(roomState) {
  const candidates = [
    roomState.mathematicianAbnormalAbilityCount,
    roomState.abnormalAbilityCount,
    roomState.abilityAbnormalCount,
    roomState.nightResolution?.abnormalAbilityCount,
    roomState.storytellerReview?.mathematicianAbnormalAbilityCount
  ];
  for (const value of candidates) {
    const count = Number(value);
    if (Number.isInteger(count) && count >= 0) return count;
  }
  return null;
}

function findLearnTwoCandidate(players, actorSeat, predicate) {
  const matching = players.find((player) => Number(player.seat) !== Number(actorSeat) && predicate(player));
  if (!matching) return { seats: [], role: null, count: 0 };
  const decoy = players.find((player) => (
    Number(player.seat) !== Number(actorSeat)
    && Number(player.seat) !== Number(matching.seat)
    && !predicate(player)
  )) || players.find((player) => (
    Number(player.seat) !== Number(actorSeat)
    && Number(player.seat) !== Number(matching.seat)
  ));
  const seats = [matching, decoy].filter(Boolean).sort((left, right) => Number(left.seat) - Number(right.seat));
  return {
    seats: seats.map((player) => ({ seat: player.seat, name: player.name ?? `Player ${player.seat}` })),
    role: buildPrivateRoleInfo(matching),
    count: 1
  };
}

function findExecutedPlayer(roomState, players) {
  const execution = roomState.stage7DayVoteExecution?.execution
    ?? roomState.dayVote?.execution
    ?? roomState.publicDayVote?.execution
    ?? null;
  const nomineeSeat = execution?.effective === true || execution?.status === 'confirmed'
    ? Number(execution.nomineeSeat)
    : null;
  if (Number.isInteger(nomineeSeat)) {
    return players.find((player) => Number(player.seat) === nomineeSeat) || null;
  }
  return null;
}

function buildPrivateInfoForPrompt(roomState, players, seat, prompt) {
  const roleId = normalizeRoleId(prompt?.roleIdAtPrompt ?? prompt?.roleId);
  if (!roleId) return null;

  if (roleId === 'chef') {
    const count = adjacentPairs(players).filter(([left, right]) => isEvil(left) && isEvil(right)).length;
    return {
      kind: 'count',
      roleId,
      label: '邪恶相邻对数',
      count
    };
  }

  if (roleId === 'clockmaker') {
    const demon = firstRoleOfKind(players, isDemon);
    const minionDistances = players
      .filter(isMinion)
      .map((minion) => circularDistance(players, demon?.seat, minion.seat))
      .filter((distance) => Number.isInteger(distance));
    return {
      kind: 'count',
      roleId,
      label: 'Distance from Demon to nearest Minion',
      count: minionDistances.length > 0 ? Math.min(...minionDistances) : 0
    };
  }

  if (roleId === 'oracle') {
    const count = deadPlayers(players).filter(isEvil).length;
    return {
      kind: 'count',
      roleId,
      label: 'Dead evil players',
      count
    };
  }

  if (roleId === 'flowergirl') {
    const demonSeats = new Set(players.filter(isDemon).map((player) => Number(player.seat)));
    const demonVoted = getRecordedVotes(roomState).some((vote) => (
      demonSeats.has(getSeatFromRecord(vote, ['voterSeat', 'seat', 'playerSeat']))
      && vote.vote === true
    ));
    return {
      kind: 'boolean',
      roleId,
      label: 'A Demon voted today',
      value: demonVoted,
      reviewRequired: getRecordedVotes(roomState).length === 0
    };
  }

  if (roleId === 'towncrier') {
    const minionSeats = new Set(players.filter(isMinion).map((player) => Number(player.seat)));
    const minionNominated = getRecordedNominations(roomState).some((nomination) => (
      minionSeats.has(getSeatFromRecord(nomination, ['nominatorSeat', 'seat', 'playerSeat']))
    ));
    return {
      kind: 'boolean',
      roleId,
      label: 'A Minion nominated today',
      value: minionNominated,
      reviewRequired: getRecordedNominations(roomState).length === 0
    };
  }

  if (roleId === 'mathematician') {
    const count = getAbnormalAbilityCount(roomState);
    return {
      kind: 'count',
      roleId,
      label: 'Abilities that malfunctioned',
      count: count ?? 0,
      reviewRequired: count === null
    };
  }

  if (roleId === 'empath') {
    const neighbors = [
      nearestAliveNeighbor(players, seat, -1),
      nearestAliveNeighbor(players, seat, 1)
    ].filter(Boolean);
    const count = neighbors.filter(isEvil).length;
    return {
      kind: 'count',
      roleId,
      label: '存活邻座邪恶数',
      count,
      seats: neighbors.map((player) => ({ seat: player.seat, name: player.name ?? `Player ${player.seat}` }))
    };
  }

  if (roleId === 'washerwoman') {
    return {
      kind: 'two_seats_one_role',
      roleId,
      label: '两名玩家中有一名镇民',
      ...findLearnTwoCandidate(players, seat, isTownsfolk)
    };
  }

  if (roleId === 'librarian') {
    return {
      kind: 'two_seats_one_role',
      roleId,
      label: '两名玩家中有一名外来者',
      zeroLabel: '场上没有外来者',
      ...findLearnTwoCandidate(players, seat, isOutsider)
    };
  }

  if (roleId === 'investigator') {
    return {
      kind: 'two_seats_one_role',
      roleId,
      label: '两名玩家中有一名爪牙',
      ...findLearnTwoCandidate(players, seat, isMinion)
    };
  }

  if (roleId === 'undertaker') {
    const executed = findExecutedPlayer(roomState, players);
    return {
      kind: 'executed_role',
      roleId,
      label: '今天被处决玩家的角色',
      seat: executed ? { seat: executed.seat, name: executed.name ?? `Player ${executed.seat}` } : null,
      role: buildPrivateRoleInfo(executed),
      count: executed ? 1 : 0
    };
  }

  return null;
}

function getPrivateDiary(roomState, seat) {
  return asArray(roomState.diaryEntries)
    .filter((entry) => entry.privateToSeat === seat || entry.seat === seat || asArray(entry.visibleToSeats).includes(seat))
    .map((entry) => ({
      id: entry.id ?? null,
      phase: entry.phase ?? null,
      round: entry.round ?? null,
      title: entry.title ?? null,
      text: entry.text ?? '',
      createdAt: entry.createdAt ?? null
    }));
}

function sanitizeActionPrompt(prompt, context = {}) {
  if (!prompt) return null;
  return {
    batchId: prompt.batchId ?? null,
    actionId: prompt.actionId ?? null,
    promptId: prompt.promptId ?? null,
    roleId: prompt.roleId ?? null,
    roleIdAtPrompt: prompt.roleIdAtPrompt ?? null,
    roleName: prompt.roleName ?? null,
    roleNameAtPrompt: prompt.roleNameAtPrompt ?? null,
    actionType: prompt.actionType ?? null,
    promptKind: prompt.promptKind ?? null,
    title: prompt.title ?? null,
    prompt: prompt.prompt ?? prompt.copy?.body ?? null,
    copy: clonePublicValue(prompt.copy ?? null),
    minTargets: prompt.minTargets ?? null,
    maxTargets: prompt.maxTargets ?? null,
    targetRules: clonePublicValue(prompt.targetRules ?? null),
    options: asArray(prompt.options).map((option) => ({
      seat: option.seat,
      name: option.name ?? null,
      alive: option.alive !== false
    })),
    roleOptions: asArray(prompt.roleOptions)
      .map((option) => ({
        roleId: option.roleId ?? option.id ?? null,
        name: option.name ?? option.roleName ?? option.roleNameEn ?? null
      }))
      .filter((option) => Boolean(option.roleId)),
    targetScope: prompt.targetScope ?? 'players',
    canRevise: prompt.canRevise === true,
    canModify: prompt.canModify === true,
    canWithdraw: prompt.canWithdraw === true,
    submissionStatus: prompt.submissionStatus ?? null,
    privateInfo: clonePublicValue(context.privateInfo ?? null),
    status: prompt.status ?? null
  };
}

function getActionPrompt(roomState, seat, players) {
  const directPrompt = asArray(roomState.playerActionPrompts).find((prompt) => prompt?.seat === seat);
  if (directPrompt) {
    return sanitizeActionPrompt(directPrompt, {
      privateInfo: buildPrivateInfoForPrompt(roomState, players, seat, directPrompt)
    });
  }

  const activeBatches = asArray(roomState.nightBatches).filter((batch) => {
    return ['collecting', 'closed'].includes(batch?.status);
  });
  for (const batch of activeBatches.slice().reverse()) {
    const prompt = asArray(batch.prompts).find((item) => item?.seat === seat);
    if (prompt) {
      const fullPrompt = {
        batchId: batch.batchId ?? batch.id ?? null,
        ...prompt
      };
      return sanitizeActionPrompt(fullPrompt, {
        privateInfo: buildPrivateInfoForPrompt(roomState, players, seat, fullPrompt)
      });
    }
  }

  return null;
}

function sanitizeBluff(bluff) {
  if (typeof bluff === 'string') {
    return { roleId: bluff, roleName: null, ability: null, team: 'good' };
  }

  return {
    roleId: bluff.roleId ?? bluff.id ?? null,
    roleName: bluff.roleName ?? bluff.name ?? null,
    roleNameEn: bluff.roleNameEn ?? bluff.nameEn ?? null,
    ability: bluff.ability ?? null,
    team: 'good'
  };
}

function buildEvilInfo({ roomState, players, player, playerCount }) {
  const roleKind = getTrueRoleKind(player);
  if (!['minion', 'demon'].includes(roleKind)) return null;

  if (playerCount < 7) {
    return {
      playerCountRule: 'teensy-exception',
      kind: roleKind === 'demon' ? 'demon-info' : 'minion-info',
      demon: null,
      otherMinions: [],
      minions: [],
      demonBluffs: []
    };
  }

  const demons = players.filter(isDemon);
  const minions = players.filter(isMinion);

  if (roleKind === 'minion') {
    const demon = demons[0] || null;
    return {
      playerCountRule: '7-plus',
      kind: 'minion-info',
      demon: demon ? { seat: demon.seat, name: demon.name ?? `Player ${demon.seat}` } : null,
      otherMinions: minions
        .filter((other) => other.seat !== player.seat)
        .map((other) => ({ seat: other.seat, name: other.name ?? `Player ${other.seat}` })),
      minions: [],
      demonBluffs: []
    };
  }

  return {
    playerCountRule: '7-plus',
    kind: 'demon-info',
    demon: null,
    minions: minions.map((minion) => ({ seat: minion.seat, name: minion.name ?? `Player ${minion.seat}` })),
    otherMinions: [],
    demonBluffs: asArray(roomState.demonBluffs ?? roomState.evilInfo?.demonBluffs).slice(0, 3).map(sanitizeBluff)
  };
}

function buildPlayerView(input, seat) {
  const roomState = getRoomState(input);
  const players = getPlayers(roomState);
  const targetSeat = Number(seat);
  const player = players.find((item) => item.seat === targetSeat);
  if (!player) {
    throw new Error(`Player seat not found: ${seat}`);
  }

  const playerCount = getPlayerCount(roomState, players);
  const gameNumber = Number.isInteger(roomState.gameNumber)
    ? roomState.gameNumber
    : (Number.isInteger(roomState.series?.currentGameNumber) ? roomState.series.currentGameNumber : 1);
  const privateMessages = getPrivateMessages(roomState, targetSeat);
  const publicView = {
    roomId: roomState.id ?? roomState.roomId ?? null,
    scriptId: roomState.currentScript ?? roomState.scriptId ?? 'trouble-brewing',
    scriptName: roomState.scriptName ?? 'Trouble Brewing',
    phase: roomState.phase ?? 'waiting',
    round: Number.isInteger(roomState.round) ? roomState.round : 0,
    gameNumber,
    playerCount,
    seats: buildPublicSeats(players, playerCount),
    nomination: clonePublicValue(roomState.publicNomination ?? null),
    vote: clonePublicValue(roomState.publicVote ?? null),
    publicEvents: asArray(roomState.publicEvents).map(sanitizePublicEvent).filter(Boolean).slice(-50),
    gameOver: clonePublicValue(roomState.publicGameOver ?? null),
    gameEnd: clonePublicValue(roomState.publicGameOver ?? null)
  };

  const privateView = {
    seat: player.seat,
    name: player.name ?? `Player ${player.seat}`,
    role: getShownRole(player),
    evilInfo: buildEvilInfo({ roomState, players, player, playerCount }),
    privateGrimoire: buildPrivateGrimoire(roomState, players, player),
    actionPrompt: getActionPrompt(roomState, targetSeat, players),
    privateMessages,
    unreadCount: privateMessages.filter((message) => !message.readAt).length,
    privateDiary: getPrivateDiary(roomState, targetSeat)
  };

  const view = { publicView, privateView };
  const leakPaths = findForbiddenPlayerViewPaths(view);
  if (leakPaths.length > 0) {
    throw new Error(`Forbidden player view fields: ${leakPaths.join(', ')}`);
  }

  return view;
}

function findForbiddenPlayerViewPaths(value, path = '$') {
  if (!value || typeof value !== 'object') return [];

  const paths = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      paths.push(...findForbiddenPlayerViewPaths(item, `${path}[${index}]`));
    });
    return paths;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (PLAYER_VIEW_FORBIDDEN_KEYS.has(key)) {
      paths.push(childPath);
    }
    paths.push(...findForbiddenPlayerViewPaths(child, childPath));
  }

  return paths;
}

module.exports = {
  PLAYER_VIEW_FORBIDDEN_KEYS,
  buildPlayerView,
  findForbiddenPlayerViewPaths
};
