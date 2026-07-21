const {
  getAutomationRoleIds,
  getNightOrderForScript,
  getPromptDefinitionForRole,
  getRule,
  normalizeRoleId: normalizeAutomationRoleId
} = require('./RuleAutomation');
const { buildBoardRoleLogicProfile, roleMatchesId } = require('./RoleLogicProfile');
const { getScriptById } = require('../ScriptCatalog');

const SUPPORTED_ROLE_IDS = new Set([
  'fortune-teller',
  'poisoner',
  'imp',
  'monk',
  'sailor',
  'chambermaid',
  'innkeeper',
  'professor',
  'devilsadvocate',
  'assassin',
  'shabaloth',
  ...getAutomationRoleIds()
]);

const DEMON_ROLE_IDS = new Set([
  'imp',
  'pukka',
  'shabaloth',
  'po',
  'zombuul'
]);

const MINION_ROLE_IDS = new Set([
  'poisoner',
  'spy',
  'baron',
  'scarlet-woman',
  'scarlet_woman',
  'devilsadvocate',
  'devils-advocate',
  'godfather',
  'cerenovus',
  'pithag',
  'widow',
  'witch',
  'evil-twin',
  'eviltwin'
]);

const TOWNSFOLK_ROLE_IDS = new Set([
  'grandmother',
  'sailor',
  'chambermaid',
  'innkeeper',
  'gambler',
  'exorcist',
  'gossip',
  'courtier',
  'professor',
  'minstrel',
  'tealady',
  'fool',
  'pacifist'
]);

const DEFAULT_NIGHT_ORDER = {
  first: ['poisoner', 'fortune-teller'],
  other: ['poisoner', 'monk', 'imp', 'fortune-teller']
};

const IMPORTED_PROMPT_KINDS = new Set([
  'auto_info',
  'select_1',
  'select_2',
  'select_3',
  'select_4',
  'select_role',
  'select_player_role'
]);

const SCRIPT_NIGHT_ORDERS = {
  'trouble-brewing': DEFAULT_NIGHT_ORDER,
  'bad-moon-rising': {
    first: ['sailor', 'chambermaid', 'devilsadvocate'],
    other: ['sailor', 'chambermaid', 'innkeeper', 'professor', 'devilsadvocate', 'assassin', 'shabaloth']
  },
  catfishing: {
    first: getNightOrderForScript('catfishing', true),
    other: getNightOrderForScript('catfishing', false)
  }
};

const ROLE_NAMES = {
  'fortune-teller': '占卜师',
  poisoner: '投毒者',
  imp: '小恶魔',
  monk: '僧侣'
};

Object.assign(ROLE_NAMES, {
  sailor: '水手',
  chambermaid: '侍女',
  innkeeper: '旅店老板',
  professor: '教授',
  devilsadvocate: '恶魔代言人',
  assassin: '刺客',
  shabaloth: '沙巴洛斯',
  washerwoman: '洗衣妇',
  librarian: '图书管理员',
  investigator: '调查员',
  chef: '厨师',
  empath: '共情者',
  butler: '管家',
  spy: '间谍',
  undertaker: '掘墓人',
  ravenkeeper: '守鸦人',
  grandmother: '祖母',
  balloonist: '气球驾驶员',
  dreamer: '筑梦师',
  fortuneteller: '占卜师',
  snakecharmer: '舞蛇人',
  gambler: '赌徒',
  savant: '博学者',
  philosopher: '哲学家',
  amnesiac: '失忆者',
  cannibal: '食人族',
  sweetheart: '心上人',
  mutant: '畸形秀演员',
  lunatic: '疯子',
  godfather: '教父',
  cerenovus: '洗脑师',
  pithag: '麻脸巫婆',
  widow: '寡妇',
  vigormortis: '亡骨魔',
  fanggu: '方古',
  apprentice: '学徒',
  barista: '咖啡师',
  beggar: '乞丐',
  bonecollector: '骸骨收藏家',
  harlot: '妓女'
});

const FORBIDDEN_PLAYER_PROMPT_KEYS = new Set([
  'order',
  'trueRoleId',
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isoNow(options = {}) {
  return options.now || new Date().toISOString();
}

function normalizeRoleId(value) {
  return String(value || '').toLowerCase();
}

function getRoleIdAtPrompt(player) {
  return normalizeRoleId(
    player.shownRoleId
    || player.displayRoleId
    || player.visibleRoleId
    || player.trueRoleId
    || player.realRoleId
    || player.roleId
    || player.role
  );
}

function getTrueRoleId(player) {
  return normalizeRoleId(
    player.trueRoleId
    || player.realRoleId
    || player.roleId
    || player.role
    || player.shownRoleId
  );
}

function getPlayerToken(player) {
  return player.playerToken || player.token || player.seatToken || player.playerTokenHash || null;
}

function getPlayers(roomState) {
  return asArray(roomState.players).slice().sort((left, right) => {
    return Number(left.seat || 0) - Number(right.seat || 0);
  });
}

function getPlayerBySeat(roomState, seat) {
  return getPlayers(roomState).find((player) => Number(player.seat) === Number(seat)) || null;
}

function getPlayerByToken(roomState, playerToken) {
  return getPlayers(roomState).find((player) => getPlayerToken(player) === playerToken) || null;
}

function getConfirmedExecutionSeat(roomState) {
  const execution = roomState.stage7DayVoteExecution?.execution;
  if (execution?.status === 'confirmed' && Number.isInteger(Number(execution.nomineeSeat))) {
    return Number(execution.nomineeSeat);
  }
  const event = asArray(roomState.eventLog).slice().reverse().find((item) => {
    return item?.type === 'execution_confirmed' && Number.isInteger(Number(item.nomineeSeat ?? item.payload?.nomineeSeat));
  });
  return event ? Number(event.nomineeSeat ?? event.payload?.nomineeSeat) : null;
}

function isOutsiderPlayer(player) {
  const team = normalizeRoleId(player?.trueRoleType || player?.roleType || player?.trueTeam || player?.team || '');
  return team === 'outsider';
}

function hasOutsiderDeathToday(roomState) {
  const executedSeat = getConfirmedExecutionSeat(roomState);
  if (Number.isInteger(executedSeat)) {
    const executedPlayer = getPlayerBySeat(roomState, executedSeat);
    if (executedPlayer?.alive === false && isOutsiderPlayer(executedPlayer)) return true;
  }
  return getPlayers(roomState).some((player) => {
    if (player.alive !== false || !isOutsiderPlayer(player)) return false;
    return Boolean(
      player.diedToday
      || player.deadToday
      || player.executedToday
      || player.deathPhase === 'day'
      || player.lastDeathPhase === 'day'
      || Number(player.deathRound) === Number(roomState.round)
      || Number(player.lastDeathRound) === Number(roomState.round)
    );
  });
}

function diedAtNight(player, roomState) {
  return player.alive === false && Boolean(
    player.diedTonight
    || player.deadTonight
    || player.nightKilled
    || player.pendingRavenkeeper
    || player.deathPhase === 'night'
    || player.lastDeathPhase === 'night'
    || Number(player.deathNight) === Number(roomState.nightNumber)
    || Number(player.lastDeathNight) === Number(roomState.nightNumber)
  );
}

function getScriptId(roomState) {
  return roomState?.scriptId || roomState?.currentScript || roomState?.script?.id || 'trouble-brewing';
}

function getRoomScript(roomState) {
  return roomState?.script || getScriptById(getScriptId(roomState));
}

function findRoleInScript(roomState, roleId) {
  const normalizedRoleId = normalizeRoleId(roleId);
  const script = getRoomScript(roomState);
  for (const roles of Object.values(script?.characters || {})) {
    const found = asArray(roles).find((role) => roleMatchesId(role.id, normalizedRoleId));
    if (found) return found;
  }
  return null;
}

function getImportedRoleLogicProfile(roomState, roleId) {
  const normalizedRoleId = normalizeRoleId(roleId);
  const player = getPlayers(roomState).find((item) => {
    return roleMatchesId(getRoleIdAtPrompt(item), normalizedRoleId)
      || roleMatchesId(getTrueRoleId(item), normalizedRoleId);
  });
  const script = getRoomScript(roomState);
  const role = findRoleInScript(roomState, normalizedRoleId);
  return player?.logicProfile
    || roomState?.ruleLogic?.roles?.[normalizedRoleId]
    || script?.ruleLogic?.roles?.[normalizedRoleId]
    || role?.logicProfile
    || null;
}

function getRoleNameForPrompt(roomState, roleId) {
  const role = findRoleInScript(roomState, roleId);
  return role?.name || role?.nameEn || ROLE_NAMES[roleId] || roleId;
}

function decodeEscapedText(value) {
  return String(value || '').replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
}

function normalizeVisibleText(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeVisibleText).filter(Boolean).join('、');
  }
  if (value && typeof value === 'object') {
    const direct = value.text
      || value.message
      || value.content
      || value.summary
      || value.label
      || value.result
      || value.value;
    if (direct !== undefined && direct !== value) return normalizeVisibleText(direct);
    return '';
  }
  return decodeEscapedText(value).replace(/\s+/g, ' ').trim();
}

function isUnreadableText(value) {
  const text = normalizeVisibleText(value);
  return !text || text === '[object Object]' || /\?{3,}/.test(text) || /^[?？\s]+$/.test(text);
}

function promptCopyFallback(promptKind, roleName) {
  const name = roleName || '本角色';
  if (promptKind === 'auto_info') {
    return {
      title: `${name}信息`,
      body: `${name}夜晚无需玩家选择；系统只准备一条待说书人确认的私密信息记录。`
    };
  }
  if (promptKind === 'waiting') {
    return {
      title: `${name}等待`,
      body: `${name}本夜无需玩家选择；说书人确认后继续流程。`
    };
  }
  if (promptKind === 'select_2') {
    return {
      title: `${name}行动`,
      body: `请选择 2 名玩家；最终结果只作为候选，必须由说书人确认。`
    };
  }
  if (promptKind === 'select_3') {
    return {
      title: `${name}行动`,
      body: `请选择 3 名玩家；最终结果只作为候选，必须由说书人确认。`
    };
  }
  if (promptKind === 'select_4') {
    return {
      title: `${name}行动`,
      body: `请选择 4 名玩家；最终结果只作为候选，必须由说书人确认。`
    };
  }
  if (promptKind === 'select_role') {
    return {
      title: `${name}行动`,
      body: `请选择 1 个角色；最终结果只作为候选，必须由说书人确认。`
    };
  }
  if (promptKind === 'select_player_role') {
    return {
      title: `${name}行动`,
      body: `请选择 1 名玩家和 1 个角色；最终结果只作为候选，必须由说书人确认。`
    };
  }
  return {
    title: `${name}行动`,
    body: `请选择 1 名玩家；最终结果只作为候选，必须由说书人确认。`
  };
}

function normalizePromptDefinition(definition, roleName) {
  if (!definition) return null;
  const promptKind = definition.promptKind || 'auto_info';
  const fallback = promptCopyFallback(promptKind, roleName);
  const copy = definition.copy && typeof definition.copy === 'object' ? definition.copy : {};
  const isPassive = ['waiting', 'auto_info'].includes(promptKind);
  return {
    ...definition,
    required: isPassive ? false : definition.required !== false,
    autoSubmit: promptKind === 'auto_info' ? true : definition.autoSubmit === true,
    targetRules: isPassive
      ? { ...(definition.targetRules || {}), count: 0 }
      : (definition.targetRules || defaultImportedTargetRules(promptKind)),
    copy: {
      ...copy,
      title: isUnreadableText(copy.title) ? fallback.title : normalizeVisibleText(copy.title),
      body: isUnreadableText(copy.body) ? fallback.body : normalizeVisibleText(copy.body),
      submitLabel: isPassive
        ? null
        : (isUnreadableText(copy.submitLabel) ? '提交选择' : normalizeVisibleText(copy.submitLabel)),
      withdrawLabel: isPassive
        ? null
        : (isUnreadableText(copy.withdrawLabel) ? '撤回选择' : normalizeVisibleText(copy.withdrawLabel))
    }
  };
}

function getBoardRoleIds(roomState) {
  const roleIds = new Set();
  for (const player of getPlayers(roomState)) {
    const shownRoleId = getRoleIdAtPrompt(player);
    const trueRoleId = getTrueRoleId(player);
    if (shownRoleId) roleIds.add(shownRoleId);
    if (trueRoleId) roleIds.add(trueRoleId);
  }
  return [...roleIds];
}

function makeId(prefix, batchId, index) {
  return `${prefix}-${batchId}-${String(index).padStart(2, '0')}`;
}

function makeSelectPrompt(promptKind, targetRules, title, body) {
  return {
    promptKind,
    required: true,
    targetRules,
    copy: {
      title,
      body,
      submitLabel: '提交选择',
      withdrawLabel: '撤回选择'
    }
  };
}

function shouldImportedLogicWake(profile, isFirstNight) {
  const triggerMode = String(profile?.triggerMode || 'passive');
  if (triggerMode === 'first-and-other-night') return true;
  if (triggerMode === 'first-night') return isFirstNight === true;
  if (triggerMode === 'other-night') return isFirstNight !== true;
  return false;
}

function defaultImportedTargetRules(promptKind) {
  if (promptKind === 'select_2') return { count: 2, allowSelf: true, allowDead: true, mustBeDistinct: true, mustBeDead: false };
  if (promptKind === 'select_3') return { count: 3, allowSelf: true, allowDead: true, mustBeDistinct: true, mustBeDead: false };
  if (promptKind === 'select_4') return { count: 4, allowSelf: true, allowDead: true, mustBeDistinct: true, mustBeDead: false };
  if (promptKind === 'select_1' || promptKind === 'select_player_role') return { count: 1, allowSelf: true, allowDead: true, mustBeDistinct: true, mustBeDead: false };
  return { count: 0, allowSelf: true, allowDead: true, mustBeDistinct: true, mustBeDead: false };
}

function buildImportedTargetRules(promptKind, targetRules = {}) {
  const defaults = defaultImportedTargetRules(promptKind);
  const rules = targetRules && typeof targetRules === 'object' ? targetRules : {};
  return {
    ...defaults,
    allowSelf: rules.allowSelf !== undefined ? rules.allowSelf === true || rules.allowSelf === 'true' : defaults.allowSelf,
    allowDead: rules.allowDead !== undefined ? rules.allowDead === true || rules.allowDead === 'true' : defaults.allowDead,
    mustBeDistinct: rules.mustBeDistinct !== undefined ? rules.mustBeDistinct === true || rules.mustBeDistinct === 'true' : defaults.mustBeDistinct,
    mustBeDead: rules.mustBeDead !== undefined ? rules.mustBeDead === true || rules.mustBeDead === 'true' : defaults.mustBeDead
  };
}

function getImportedPromptDefinition(roleId, isFirstNight, roomState) {
  const profile = getImportedRoleLogicProfile(roomState, roleId);
  if (!profile || !shouldImportedLogicWake(profile, isFirstNight)) return null;
  const promptKind = IMPORTED_PROMPT_KINDS.has(profile.promptKind) ? profile.promptKind : 'auto_info';
  const roleName = getRoleNameForPrompt(roomState, roleId);
  const isAutoInfo = promptKind === 'auto_info';
  return {
    promptKind,
    required: !isAutoInfo,
    autoSubmit: isAutoInfo,
    targetRules: buildImportedTargetRules(promptKind, profile.targetRules),
    roleRules: ['select_role', 'select_player_role'].includes(promptKind)
      ? { source: 'current-script-public-role-list', ...(profile.roleRules || {}) }
      : null,
    importedLogicProfile: {
      schemaVersion: profile.schemaVersion || 'botc.imported-role-logic.v1',
      source: profile.source || 'storyteller-reviewed-import',
      riskLevel: profile.riskLevel || 'medium',
      automationClass: profile.automationClass || profile.classId || null,
      automationClassName: profile.automationClassName || null,
      automationRule: profile.automationRule || null,
      resultType: profile.resultType || (isAutoInfo ? 'information' : 'choice'),
      targetRules: buildImportedTargetRules(promptKind, profile.targetRules),
      candidateType: profile.candidateType || (isAutoInfo ? 'custom-info-candidate' : 'custom-choice-candidate'),
      storytellerConfirmationRequired: profile.storytellerConfirmationRequired !== false,
      playerVisibleBoundary: profile.playerVisibleBoundary || 'confirmed-candidate-only'
    },
    copy: {
      title: `${roleName}行动`,
      body: isAutoInfo
        ? '该导入角色会生成一条需说书人确认的私密信息候选。'
        : '提交该导入角色要求的选择；最终效果仍需说书人确认。',
      submitLabel: isAutoInfo ? null : '提交选择',
      withdrawLabel: isAutoInfo ? null : '撤回选择'
    }
  };
}

function getPromptDefinition(roleId, isFirstNight, roomState = null) {
  const roleName = getRoleNameForPrompt(roomState, roleId);
  const isLocalImageScript = roomState
    ? (roomState.script?.source?.kind === 'local-image' || getRoomScript(roomState)?.source?.kind === 'local-image')
    : false;
  const importedPromptDefinition = isLocalImageScript
    ? getImportedPromptDefinition(roleId, isFirstNight, roomState)
    : null;
  if (importedPromptDefinition) return normalizePromptDefinition(importedPromptDefinition, roleName);

  if (roleId === 'fortune-teller') {
    return normalizePromptDefinition({
      promptKind: 'select_2',
      required: true,
      targetRules: {
        count: 2,
        allowSelf: true,
        allowDead: true,
        mustBeDistinct: true
      },
      copy: {
        title: '占卜师行动',
        body: '请选择两名玩家。你会在说书人确认后得知这两名玩家中是否至少一名是恶魔。',
        submitLabel: '提交选择',
        withdrawLabel: '撤回提交'
      }
    }, roleName);
  }

  if (roleId === 'poisoner') {
    return normalizePromptDefinition({
      promptKind: 'select_1',
      required: true,
      targetRules: {
        count: 1,
        allowSelf: true,
        allowDead: true,
        mustBeDistinct: true
      },
      copy: {
        title: '投毒者行动',
        body: '请选择一名玩家。收集关闭前可以修改或撤回。',
        submitLabel: '提交选择',
        withdrawLabel: '撤回提交'
      }
    }, roleName);
  }

  if (roleId === 'imp' && isFirstNight) {
    return normalizePromptDefinition({
      promptKind: 'waiting',
      required: false,
      targetRules: {
        count: 0
      },
      copy: {
        title: '夜晚等待',
        body: '首夜无需选择击杀目标。',
        submitLabel: null,
        withdrawLabel: null
      }
    }, roleName);
  }

  if (roleId === 'imp') {
    return normalizePromptDefinition({
      promptKind: 'select_1',
      required: true,
      targetRules: {
        count: 1,
        allowSelf: true,
        allowDead: true,
        mustBeDistinct: true
      },
      copy: {
        title: '小恶魔行动',
        body: '请选择一名玩家作为攻击目标。收集关闭前可以修改或撤回。',
        submitLabel: '提交选择',
        withdrawLabel: '撤回提交'
      }
    }, roleName);
  }

  if (roleId === 'monk' && !isFirstNight) {
    return normalizePromptDefinition({
      promptKind: 'select_1',
      required: true,
      targetRules: {
        count: 1,
        allowSelf: false,
        allowDead: true,
        mustBeDistinct: true
      },
      copy: {
        title: '僧侣行动',
        body: '请选择一名其他玩家。本夜该玩家可能免受恶魔攻击。',
        submitLabel: '提交选择',
        withdrawLabel: '撤回提交'
      }
    }, roleName);
  }

  if (roleId === 'sailor') {
    return makeSelectPrompt(
      'select_1',
      {
        count: 1,
        allowSelf: true,
        allowDead: false,
        mustBeDistinct: true
      },
      '水手行动',
      '选择一名存活玩家。系统只生成“谁醉酒”的待确认候选，由说书人裁决。'
    );
  }

  if (roleId === 'chambermaid') {
    return makeSelectPrompt(
      'select_2',
      {
        count: 2,
        allowSelf: false,
        allowDead: false,
        mustBeDistinct: true
      },
      '侍女行动',
      '选择两名自己以外的存活玩家。结果会作为需说书人确认的私密数字。'
    );
  }

  if (roleId === 'innkeeper' && !isFirstNight) {
    return makeSelectPrompt(
      'select_2',
      {
        count: 2,
        allowSelf: true,
        allowDead: false,
        mustBeDistinct: true
      },
      '旅店老板行动',
      '选择两名存活玩家。保护与醉酒结果需说书人确认。'
    );
  }

  if (roleId === 'professor' && !isFirstNight) {
    return makeSelectPrompt(
      'select_1',
      {
        count: 1,
        allowSelf: true,
        allowDead: true,
        mustBeDead: true,
        mustBeDistinct: true
      },
      '教授行动',
      '选择一名死亡玩家。复活候选只会等待说书人确认，不会自动生效。'
    );
  }

  if (roleId === 'devilsadvocate') {
    return makeSelectPrompt(
      'select_1',
      {
        count: 1,
        allowSelf: true,
        allowDead: false,
        mustBeDistinct: true
      },
      '恶魔代言人行动',
      '选择一名存活玩家。是否违反“不能连续同目标”由说书人确认。'
    );
  }

  if (roleId === 'assassin' && !isFirstNight) {
    return makeSelectPrompt(
      'select_1',
      {
        count: 1,
        allowSelf: true,
        allowDead: false,
        mustBeDistinct: true
      },
      '刺客行动',
      '选择一名存活玩家。“一局一次”和穿透细节需说书人确认。'
    );
  }

  if (roleId === 'shabaloth' && !isFirstNight) {
    return makeSelectPrompt(
      'select_2',
      {
        count: 2,
        allowSelf: true,
        allowDead: false,
        mustBeDistinct: true
      },
      '沙巴洛斯行动',
      '选择两名存活玩家。死亡候选会等待说书人确认。'
    );
  }

  if (roleId === 'spy') {
    return normalizePromptDefinition({
      promptKind: 'auto_info',
      required: false,
      autoSubmit: true,
      targetRules: {
        count: 0,
        allowSelf: true,
        allowDead: true,
        mustBeDistinct: false
      },
      copy: {
        title: '间谍查看魔典',
        body: '间谍每个夜晚醒来查看魔典；不需要选择号码。说书人确认后记录本次私密信息。',
        submitLabel: null,
        withdrawLabel: null
      }
    }, roleName);
  }

  const automationDefinition = getPromptDefinitionForRole(roleId, isFirstNight);
  if (automationDefinition) return normalizePromptDefinition(automationDefinition, roleName);
  return normalizePromptDefinition(getImportedPromptDefinition(roleId, isFirstNight, roomState), roleName);
}

function getNightOrder(roomState, isFirstNight) {
  const scriptId = getScriptId(roomState);
  const roomScript = getRoomScript(roomState);
  const isLocalImageScript = roomScript?.source?.kind === 'local-image';
  const fallbackOrder = SCRIPT_NIGHT_ORDERS[scriptId] || DEFAULT_NIGHT_ORDER;
  const automationOrder = getNightOrderForScript(scriptId, isFirstNight);
  const boardProfile = buildBoardRoleLogicProfile({
    scriptId,
    roleIds: getBoardRoleIds(roomState)
  });
  const boardOrderSources = [
    roomState.script?.nightOrder,
    roomScript?.nightOrder,
    boardProfile.nightOrder
  ];
  const orderSources = [
    ...(isLocalImageScript ? boardOrderSources : [roomState.nightOrder, ...boardOrderSources]),
    ...(isLocalImageScript ? [roomState.nightOrder] : []),
    automationOrder.length > 0
      ? {
        first: isFirstNight ? automationOrder : [],
        other: isFirstNight ? [] : automationOrder
      }
      : null,
    fallbackOrder,
    DEFAULT_NIGHT_ORDER
  ];
  const orderSource = orderSources.find((source) => {
    const sourceOrder = isFirstNight ? source?.first : source?.other;
    return asArray(sourceOrder)
      .map(normalizeRoleId)
      .some((roleId) => Boolean(getPromptDefinition(roleId, isFirstNight, roomState)));
  }) || fallbackOrder;
  const order = isFirstNight ? orderSource.first : orderSource.other;
  return asArray(order)
    .map(normalizeRoleId)
    .filter((roleId) => Boolean(getPromptDefinition(roleId, isFirstNight, roomState)));
}

function getActionOrderIndex(roleId, nightOrder) {
  const index = nightOrder.findIndex((orderedRoleId) => roleMatchesId(orderedRoleId, roleId));
  return index === -1 ? Number.MAX_SAFE_INTEGER : index + 1;
}

function nightOrderIncludesRole(nightOrder, roleId) {
  return nightOrder.some((orderedRoleId) => roleMatchesId(orderedRoleId, roleId));
}

function publicSeatOptions(roomState) {
  return getPlayers(roomState).map((player) => ({
    seat: player.seat,
    name: player.name || `玩家${player.seat}`,
    alive: player.alive !== false
  }));
}

function publicRoleOptions(roomState, roleRules = null) {
  const script = getRoomScript(roomState);
  const rolesById = new Map();
  const allowedAlignment = normalizeRoleId(roleRules?.alignment);
  for (const [group, roles] of Object.entries(script?.characters || {})) {
    const alignment = ['townsfolk', 'outsiders'].includes(group)
      ? 'good'
      : ['minions', 'demons'].includes(group) ? 'evil' : 'neutral';
    if (allowedAlignment && alignment !== allowedAlignment) continue;
    for (const role of asArray(roles)) {
      const roleId = normalizeRoleId(role?.id);
      if (!roleId || rolesById.has(roleId)) continue;
      rolesById.set(roleId, {
        roleId,
        name: role.name || role.nameEn || ROLE_NAMES[roleId] || roleId
      });
    }
  }
  return [...rolesById.values()].sort((left, right) => left.roleId.localeCompare(right.roleId));
}

function buildPrompt({ action, promptId, roomState }) {
  const definition = getPromptDefinition(action.roleIdAtPrompt, action.isFirstNight, roomState);
  const roleNameAtPrompt = getRoleNameForPrompt(roomState, action.roleIdAtPrompt);
  return {
    promptId,
    batchId: action.batchId,
    actionId: action.actionId,
    seat: action.seat,
    roleIdAtPrompt: action.roleIdAtPrompt,
    roleNameAtPrompt,
    nightNumber: action.nightNumber,
    isFirstNight: action.isFirstNight,
    promptKind: definition.promptKind,
    required: definition.required,
    targetRules: clone(definition.targetRules),
    roleRules: definition.roleRules ? clone(definition.roleRules) : null,
    importedLogicProfile: definition.importedLogicProfile ? clone(definition.importedLogicProfile) : null,
    autoSubmit: definition.autoSubmit === true,
    options: ['waiting', 'auto_info'].includes(definition.promptKind) ? [] : publicSeatOptions(roomState),
    roleOptions: ['select_role', 'select_player_role'].includes(definition.promptKind)
      ? publicRoleOptions(roomState, definition.roleRules)
      : [],
    copy: clone(definition.copy),
    submissionStatus: 'none',
    canModify: !['waiting', 'auto_info'].includes(definition.promptKind),
    canWithdraw: false
  };
}

function hasEnoughEligibleTargets(roomState, definition, actorSeat) {
  if (!definition || ['waiting', 'auto_info', 'select_role'].includes(definition.promptKind)) return true;
  const rules = definition.targetRules || {};
  const expectedCount = Number(rules.count || (
    definition.promptKind === 'select_4' ? 4
      : definition.promptKind === 'select_3' ? 3
        : definition.promptKind === 'select_2' ? 2 : 1
  ));
  if (!Number.isInteger(expectedCount) || expectedCount <= 0) return true;
  const eligibleCount = getPlayers(roomState).filter((target) => {
    if (rules.allowSelf === false && Number(target.seat) === Number(actorSeat)) return false;
    if (rules.mustBeDead === true && target.alive !== false) return false;
    if (rules.allowDead === false && target.alive === false) return false;
    return true;
  }).length;
  return eligibleCount >= expectedCount;
}

function buildActions({ roomState, batchId, nightNumber, isFirstNight }) {
  const nightOrder = getNightOrder(roomState, isFirstNight);
  const players = getPlayers(roomState);
  return players
    .map((player) => {
      const roleIdAtPrompt = getRoleIdAtPrompt(player);
      if (nightOrder.length > 0 && !nightOrderIncludesRole(nightOrder, roleIdAtPrompt)) return null;
      const rule = getRule(roleIdAtPrompt);
      if (rule?.phases?.includes('deathNight') && !diedAtNight(player, { ...roomState, nightNumber })) return null;
      if (player.alive === false && !rule?.phases?.includes('deathNight')) return null;
      if (roleIdAtPrompt === 'godfather' && !isFirstNight && !hasOutsiderDeathToday(roomState)) return null;
      if (roleIdAtPrompt === 'undertaker' && !isFirstNight && !Number.isInteger(getConfirmedExecutionSeat(roomState))) return null;
      const definition = getPromptDefinition(roleIdAtPrompt, isFirstNight, roomState);
      if (!definition) return null;
      if (!hasEnoughEligibleTargets(roomState, definition, player.seat)) return null;
      const roleNameAtPrompt = getRoleNameForPrompt(roomState, roleIdAtPrompt);
      return {
        actionId: makeId('night-action', batchId, player.seat),
        batchId,
        seat: player.seat,
        roleIdAtPrompt,
        roleNameAtPrompt,
        nightNumber,
        isFirstNight,
        required: definition.required,
        promptKind: definition.promptKind,
        autoSubmit: definition.autoSubmit === true,
        aiTestPlayer: player.aiTestPlayer === true || player.localTestOnly === true,
        order: getActionOrderIndex(roleIdAtPrompt, nightOrder),
        status: 'collecting'
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.seat - right.seat);
}

function sanitizePromptForPlayer(prompt) {
  const safePrompt = clone(prompt);
  const leakPaths = findForbiddenPlayerPromptPaths(safePrompt);
  if (leakPaths.length > 0) {
    throw new Error(`Forbidden player prompt fields: ${leakPaths.join(', ')}`);
  }
  return safePrompt;
}

function getActiveBatch(roomState, batchId) {
  return asArray(roomState.nightBatches).find((batch) => batch.batchId === batchId) || null;
}

function getPrompt(roomState, batchId, promptId) {
  const batch = getActiveBatch(roomState, batchId);
  if (!batch) return null;
  return asArray(batch.prompts).find((prompt) => prompt.promptId === promptId) || null;
}

function getSubmission(roomState, batchId, promptId) {
  return asArray(roomState.nightSubmissions)
    .find((submission) => submission.batchId === batchId && submission.promptId === promptId) || null;
}

function getCurrentSubmissionForPrompt(roomState, batchId, promptId) {
  const submission = getSubmission(roomState, batchId, promptId);
  if (!submission || submission.status !== 'submitted') return null;
  return submission;
}

function normalizePayload(payload, prompt) {
  if (prompt.promptKind === 'auto_info') {
    return { kind: 'auto_info' };
  }

  if (prompt.promptKind === 'waiting') {
    return { kind: 'waiting' };
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('提交 payload 缺失');
  }

  if (prompt.promptKind === 'select_4') {
    const targets = asArray(payload.targets).map(Number);
    return {
      kind: 'select_4',
      targets
    };
  }

  if (prompt.promptKind === 'select_3') {
    const targets = asArray(payload.targets).map(Number);
    return {
      kind: 'select_3',
      targets
    };
  }

  if (prompt.promptKind === 'select_2') {
    const targets = asArray(payload.targets).map(Number);
    return {
      kind: 'select_2',
      targets
    };
  }

  if (prompt.promptKind === 'select_1') {
    const target = Number(payload.target ?? asArray(payload.targets)[0]);
    return {
      kind: 'select_1',
      target
    };
  }

  if (prompt.promptKind === 'select_role') {
    return {
      kind: 'select_role',
      roleId: normalizeAutomationRoleId(payload.roleId || payload.characterId || payload.guessedRoleId)
    };
  }

  if (prompt.promptKind === 'select_player_role') {
    const roleId = normalizeAutomationRoleId(payload.roleId || payload.characterId || payload.guessedRoleId);
    return {
      kind: 'select_player_role',
      target: Number(payload.target ?? asArray(payload.targets)[0]),
      roleId,
      guessedRoleId: roleId
    };
  }

  throw new Error(`该 prompt 不接受提交: ${prompt.promptKind}`);
}

function validateTargets(roomState, prompt, normalizedPayload) {
  const targetRules = prompt.targetRules || {};
  if (['auto_info', 'waiting', 'select_role'].includes(normalizedPayload.kind)) {
    if (normalizedPayload.kind === 'select_role' && !normalizedPayload.roleId) {
      throw new Error('roleId is required');
    }
    if (normalizedPayload.kind === 'select_role') {
      const allowedRoleIds = new Set(asArray(prompt.roleOptions).map((option) => normalizeRoleId(option.roleId)));
      if (!allowedRoleIds.has(normalizeRoleId(normalizedPayload.roleId))) {
        throw new Error('所选角色不在当前技能允许的角色列表中');
      }
    }
    return;
  }

  const targets = ['select_2', 'select_3', 'select_4'].includes(normalizedPayload.kind)
    ? normalizedPayload.targets
    : [normalizedPayload.target];
  const expectedCount = Number(targetRules.count || targets.length);

  if (targets.length !== expectedCount) {
    throw new Error(`目标数量不正确，应为 ${expectedCount}`);
  }

  if (targetRules.mustBeDistinct && new Set(targets).size !== targets.length) {
    throw new Error('目标必须互不相同');
  }

  for (const targetSeat of targets) {
    const targetPlayer = getPlayerBySeat(roomState, targetSeat);
    if (targetPlayer && targetRules.mustBeDead === true && targetPlayer.alive !== false) {
      throw new Error('This action must target a dead player');
    }
    if (!targetPlayer) {
      throw new Error(`目标玩家不存在: ${targetSeat}`);
    }
    if (targetRules.allowSelf === false && Number(targetSeat) === Number(prompt.seat)) {
      throw new Error('该行动不能选择自己');
    }
    if (targetRules.allowDead === false && targetPlayer.alive === false) {
      throw new Error('该行动不能选择死亡玩家');
    }
  }

  if (normalizedPayload.kind === 'select_player_role' && !normalizedPayload.roleId) {
    throw new Error('roleId is required');
  }
  if (['select_role', 'select_player_role'].includes(normalizedPayload.kind)) {
    const allowedRoleIds = new Set(asArray(prompt.roleOptions).map((option) => normalizeRoleId(option.roleId)));
    if (!allowedRoleIds.has(normalizeRoleId(normalizedPayload.roleId))) {
      throw new Error('所选角色不在当前技能允许的角色列表中');
    }
  }
}

function updateBatch(roomState, batchId, updater) {
  return {
    ...roomState,
    nightBatches: asArray(roomState.nightBatches).map((batch) => {
      if (batch.batchId !== batchId) return batch;
      return updater(batch);
    })
  };
}

function updatePromptInBatch(batch, promptId, updater) {
  return {
    ...batch,
    prompts: asArray(batch.prompts).map((prompt) => {
      if (prompt.promptId !== promptId) return prompt;
      return updater(prompt);
    })
  };
}

function activeCollectionExists(roomState) {
  return asArray(roomState.nightBatches).some((batch) => {
    return ['collecting', 'evaluating'].includes(batch.status);
  });
}

function resetNightTransientPlayerState(roomState, nightNumber) {
  const normalizedNightNumber = Number(nightNumber);
  if (!Number.isInteger(normalizedNightNumber) || normalizedNightNumber <= 0) return roomState;
  if (Number(roomState?.nightTransientResetNight) === normalizedNightNumber) return roomState;

  return {
    ...roomState,
    nightNumber: normalizedNightNumber,
    nightTransientResetNight: normalizedNightNumber,
    players: asArray(roomState.players).map((player) => ({
      ...player,
      protected: false,
      protectedTonight: false,
      diedTonight: false,
      deadTonight: false,
      killedTonight: false,
      nightKilled: false
    }))
  };
}

function createStartReceipt(batch) {
  return {
    type: 'night_collection_started',
    data: {
      status: batch.status,
      batchId: batch.batchId,
      scriptId: batch.scriptId,
      nightNumber: batch.nightNumber,
      isFirstNight: batch.isFirstNight,
      promptCount: batch.prompts.length,
      mutationScope: 'room.state.nightBatches-and-player-private-prompts-only',
      simultaneousCollection: true,
      sequentialEvaluation: false,
      eventLogWritten: false,
      stateChanged: false
    }
  };
}

function createSubmissionReceipt(submission, prompt) {
  return {
    type: 'player_night_action_submitted',
    data: {
      status: submission.status,
      batchId: submission.batchId,
      promptId: submission.promptId,
      submissionId: submission.submissionId,
      revision: submission.revision,
      canModify: true,
      canWithdraw: true,
      eventLogWritten: false,
      stateChanged: false,
      abilityExecuted: false,
      promptKind: prompt.promptKind
    }
  };
}

function createWithdrawReceipt(submission) {
  return {
    type: 'player_night_action_withdrawn',
    data: {
      status: submission.status,
      batchId: submission.batchId,
      promptId: submission.promptId,
      submissionId: submission.submissionId,
      revision: submission.revision,
      canModify: true,
      canWithdraw: false,
      eventLogWritten: false,
      stateChanged: false,
      abilityExecuted: false
    }
  };
}

function summarizeSubmissionPayload(payload) {
  if (!payload || typeof payload !== 'object') return 'no payload';
  if (Array.isArray(payload.targets)) return `${payload.targets.length} targets`;
  if (Number.isInteger(Number(payload.target)) && payload.roleId) return '1 target + 1 role';
  if (Number.isInteger(Number(payload.target))) return '1 target';
  if (payload.roleId) return '1 role';
  return payload.kind || 'payload';
}

function isDemon(player) {
  const roleKind = normalizeRoleId(player.trueRoleType || player.realRoleType || player.roleType || player.team);
  if (['demon', 'demons'].includes(roleKind)) return true;
  return DEMON_ROLE_IDS.has(getTrueRoleId(player));
}

function isMinion(player) {
  const roleKind = normalizeRoleId(player.trueRoleType || player.realRoleType || player.roleType || player.team);
  if (['minion', 'minions'].includes(roleKind)) return true;
  return MINION_ROLE_IDS.has(getTrueRoleId(player));
}

function isTownsfolk(player) {
  const roleKind = normalizeRoleId(player.trueRoleType || player.realRoleType || player.roleType || player.team);
  if (roleKind === 'townsfolk') return true;
  return TOWNSFOLK_ROLE_IDS.has(getTrueRoleId(player));
}

function isPlayerImpaired(player) {
  return player.drunk === true || player.isDrunk === true || player.poisoned === true || player.isPoisoned === true;
}

function buildWarningsForPlayer(player, roleId) {
  const warnings = [];
  if (isPlayerImpaired(player)) {
    warnings.push(`${ROLE_NAMES[roleId] || roleId} 可能醉酒或中毒；候选结果需说书人确认，可改为假信息。`);
  }
  return warnings;
}

function createCandidateBase({ batchId, action, submission, index, roleId }) {
  const inputSource = action.aiTestPlayer === true
    ? 'ai-test'
    : submission.recordedBy === 'rules-auto'
      ? 'auto-info'
      : submission.recordedBy === 'storyteller'
        ? 'storyteller'
        : 'player';
  const inputSourceLabels = {
    'ai-test': 'AI测试',
    'auto-info': '自动信息',
    storyteller: '说书人代填',
    player: '玩家提交'
  };
  return {
    candidateResolutionId: makeId('night-candidate', batchId, index + 1),
    batchId,
    actionId: action.actionId,
    sourceSubmissionId: submission.submissionId,
    seat: action.seat,
    roleId,
    generatedBy: 'rules',
    status: 'pending-storyteller',
    visibleResultDraft: null,
    stateChangeDraft: null,
    inputSource,
    inputSourceLabel: inputSourceLabels[inputSource] || '玩家提交',
    warnings: [],
    eventLogWritten: false,
    stateChanged: false,
    privateMessagesSent: false,
    requiresStorytellerConfirmation: true
  };
}

function prepareFortuneTellerCandidate({ roomState, batchId, action, submission, index }) {
  const player = getPlayerBySeat(roomState, action.seat);
  const candidate = createCandidateBase({ batchId, action, submission, index, roleId: 'fortune-teller' });
  const targetSeats = submission.payload.targets;
  const targets = targetSeats.map((seat) => getPlayerBySeat(roomState, seat)).filter(Boolean);
  const hasDemon = targets.some(isDemon) || targets.some((target) => target.redHerring === true);
  return {
    ...candidate,
    visibleResultDraft: {
      recipientSeat: action.seat,
      result: hasDemon ? 'yes' : 'no',
      messageDraft: hasDemon ? '是' : '否',
      targetSeats
    },
    warnings: buildWarningsForPlayer(player, 'fortune-teller')
  };
}

function preparePoisonerCandidate({ batchId, action, submission, index, candidateContext }) {
  const target = submission.payload.target;
  candidateContext.poisonedSeat = target;
  return {
    ...createCandidateBase({ batchId, action, submission, index, roleId: 'poisoner' }),
    stateChangeDraft: {
      type: 'poison',
      target,
      summary: `${target} 号本夜中毒`
    }
  };
}

function prepareMonkCandidate({ batchId, action, submission, index, candidateContext }) {
  const target = submission.payload.target;
  candidateContext.protectedSeats.add(target);
  return {
    ...createCandidateBase({ batchId, action, submission, index, roleId: 'monk' }),
    stateChangeDraft: {
      type: 'protect',
      target,
      summary: `${target} 号本夜受僧侣保护`
    }
  };
}

function prepareImpCandidate({ roomState, batchId, action, submission, index, candidateContext }) {
  const target = submission.payload.target;
  const targetPlayer = getPlayerBySeat(roomState, target);
  const candidate = createCandidateBase({ batchId, action, submission, index, roleId: 'imp' });

  if (candidateContext.protectedSeats.has(target)) {
    return {
      ...candidate,
      stateChangeDraft: {
        type: 'kill',
        target,
        killed: false,
        blockedBy: 'monk',
        summary: `${target} 号被攻击，但受僧侣保护`
      }
    };
  }

  if (getTrueRoleId(targetPlayer) === 'soldier') {
    return {
      ...candidate,
      stateChangeDraft: {
        type: 'kill',
        target,
        killed: false,
        blockedBy: 'soldier',
        summary: `${target} 号被攻击，但士兵能力免疫`
      }
    };
  }

  if (Number(target) === Number(action.seat)) {
    const transferTarget = getPlayers(roomState).find((item) => (
      Number(item.seat) !== Number(action.seat)
      && item.alive !== false
      && isMinion(item)
    ));
    if (!transferTarget) {
      return {
        ...candidate,
        stateChangeDraft: {
          type: 'kill',
          target,
          targetSeat: target,
          killed: true,
          summary: '小恶魔选择自己，且没有存活爪牙可转移；小恶魔死亡'
        },
        warnings: ['小恶魔自杀但没有存活爪牙可转移；确认后会进入无恶魔结局检查。']
      };
    }
    return {
      ...candidate,
      stateChangeDraft: {
        type: 'imp-self-kill-transfer',
        target,
        targetSeat: target,
        transferSeat: Number(transferTarget.seat),
        newDemonSeat: Number(transferTarget.seat),
        killed: true,
        summary: '小恶魔选择自己，可能触发恶魔转移候选'
      },
      warnings: ['恶魔转移必须由说书人确认后才可改真实身份和私信。']
    };
  }

  return {
    ...candidate,
    stateChangeDraft: {
      type: 'kill',
      target,
      killed: true,
      summary: `${target} 号可能在本夜死亡`
    }
  };
}

function prepareSailorCandidate({ batchId, action, submission, index }) {
  const target = submission.payload.target;
  return {
    ...createCandidateBase({ batchId, action, submission, index, roleId: 'sailor' }),
    stateChangeDraft: {
      type: 'bmr-sailor-drunk-choice',
      actor: action.seat,
      target,
      requiresStorytellerChoice: true,
      summary: `${action.seat}号水手选择${target}号；由说书人决定谁醉酒到黄昏。`
    },
    warnings: ['醉酒对象不会自动写入，请说书人确认后处理。']
  };
}

function prepareChambermaidCandidate({ batchId, action, submission, index, candidateContext }) {
  const targets = submission.payload.targets;
  const wokeCount = targets.filter((target) => candidateContext.lockedActionSeats.has(Number(target))).length;
  return {
    ...createCandidateBase({ batchId, action, submission, index, roleId: 'chambermaid' }),
    visibleResultDraft: {
      recipientSeat: action.seat,
      result: String(wokeCount),
      messageDraft: String(wokeCount),
      targetSeats: targets
    },
    warnings: ['该数字只统计当前已支持并已提交的夜晚行动，最终结果需说书人确认。']
  };
}

function prepareInnkeeperCandidate({ batchId, action, submission, index, candidateContext }) {
  const targets = submission.payload.targets;
  for (const target of targets) candidateContext.protectedSeats.add(Number(target));
  return {
    ...createCandidateBase({ batchId, action, submission, index, roleId: 'innkeeper' }),
    stateChangeDraft: {
      type: 'bmr-innkeeper-protect-and-drunk-choice',
      protectedTargets: targets,
      drunkChoiceRequired: true,
      summary: `旅店老板保护${targets.map((target) => `${target}号`).join('、')}；由说书人选择其中一名醉酒。`
    },
    warnings: ['保护会作为候选展示；醉酒对象仍需说书人确认。']
  };
}

function prepareProfessorCandidate({ roomState, batchId, action, submission, index }) {
  const target = submission.payload.target;
  const targetPlayer = getPlayerBySeat(roomState, target);
  const canRevive = Boolean(targetPlayer && targetPlayer.alive === false && isTownsfolk(targetPlayer));
  return {
    ...createCandidateBase({ batchId, action, submission, index, roleId: 'professor' }),
    stateChangeDraft: {
      type: 'bmr-professor-revive',
      target,
      revived: canRevive,
      summary: canRevive
        ? `${target}号可复活，等待说书人确认。`
        : `${target}号未确认是已死亡镇民，需说书人裁决。`
    },
    warnings: canRevive ? [] : ['教授目标未通过本地“已死亡镇民”检查。']
  };
}

function prepareDevilsAdvocateCandidate({ batchId, action, submission, index }) {
  const target = submission.payload.target;
  return {
    ...createCandidateBase({ batchId, action, submission, index, roleId: 'devilsadvocate' }),
    stateChangeDraft: {
      type: 'bmr-devils-advocate-execution-protect',
      target,
      duration: 'tomorrow-day',
      summary: `${target}号明日免于处决，等待说书人确认。`
    },
    warnings: ['是否连续选择同一目标不会自动判断，请说书人核对。']
  };
}

function prepareAssassinCandidate({ batchId, action, submission, index }) {
  const target = submission.payload.target;
  return {
    ...createCandidateBase({ batchId, action, submission, index, roleId: 'assassin' }),
    stateChangeDraft: {
      type: 'bmr-assassin-kill',
      target,
      killed: true,
      bypassesProtection: true,
      summary: `${target}号死亡，等待说书人确认；“一局一次”用量请说书人核对。`
    },
    warnings: ['刺客“一局一次”用量需说书人确认。']
  };
}

function prepareShabalothCandidate({ batchId, action, submission, index, candidateContext }) {
  const targets = submission.payload.targets;
  const blockedTargets = targets.filter((target) => candidateContext.protectedSeats.has(Number(target)));
  const killedTargets = targets.filter((target) => !candidateContext.protectedSeats.has(Number(target)));
  return {
    ...createCandidateBase({ batchId, action, submission, index, roleId: 'shabaloth' }),
    stateChangeDraft: {
      type: 'bmr-shabaloth-kill',
      targets,
      killedTargets,
      blockedTargets,
      summary: `沙巴洛斯选择${targets.map((target) => `${target}号`).join('、')}；死亡 ${killedTargets.map((target) => `${target}号`).join('、') || '无'}，受保护 ${blockedTargets.map((target) => `${target}号`).join('、') || '无'}。`
    },
    warnings: ['沙巴洛斯的反刍复活需说书人确认。']
  };
}

function prepareAutomationCandidate({ roomState, batchId, action, submission, index, candidateContext }) {
  const roleId = normalizeAutomationRoleId(action.roleIdAtPrompt);
  const rule = getRule(roleId);
  if (!rule) return null;
  const candidate = createCandidateBase({ batchId, action, submission, index, roleId });
  const payload = submission.payload || {};
  const target = Number(payload.target);
  const targets = Array.isArray(payload.targets) ? payload.targets.map(Number) : [target].filter(Number.isInteger);

  if (['poison-target', 'widow-poison-and-warning'].includes(rule.resolution)) {
    return {
      ...candidate,
      stateChangeDraft: {
        type: rule.resolution,
        target,
        summary: `${ROLE_NAMES[roleId] || roleId}使${target}号中毒，等待说书人确认。`
      }
    };
  }

  if (rule.resolution === 'protect-target') {
    candidateContext.protectedSeats.add(Number(target));
    return {
      ...candidate,
      stateChangeDraft: {
        type: 'protect',
        target,
        summary: `${ROLE_NAMES[roleId] || roleId}保护${target}号，等待说书人确认。`
      }
    };
  }

  if (['demon-kill', 'demon-kill-vigormortis', 'demon-kill-fanggu'].includes(rule.resolution)) {
    const blocked = candidateContext.protectedSeats.has(Number(target));
    return {
      ...candidate,
      stateChangeDraft: {
        type: rule.resolution,
        target,
        killed: !blocked,
        blocked,
        summary: blocked
          ? `${ROLE_NAMES[roleId] || roleId}选择${target}号；死亡被本夜保护阻止。`
          : `${ROLE_NAMES[roleId] || roleId}击杀${target}号，等待说书人确认。`
      }
    };
  }

  if (rule.resolution === 'gambler-guess') {
    const targetPlayer = getPlayerBySeat(roomState, target);
    const guessedRoleId = normalizeAutomationRoleId(payload.roleId || payload.guessedRoleId);
    const correct = Boolean(targetPlayer && normalizeAutomationRoleId(getTrueRoleId(targetPlayer)) === guessedRoleId);
    return {
      ...candidate,
      stateChangeDraft: {
        type: 'gambler-guess',
        target,
        guessedRoleId,
        correct,
        killed: !correct,
        summary: correct
          ? `赌徒猜测${target}号是${ROLE_NAMES[guessedRoleId] || guessedRoleId}；猜中，不死亡。`
          : `赌徒猜测${target}号是${ROLE_NAMES[guessedRoleId] || guessedRoleId}；猜错，赌徒死亡。`
      }
    };
  }

  if (rule.resolution === 'butler-master') {
    return {
      ...candidate,
      stateChangeDraft: {
        type: 'butler-master',
        target,
        summary: `管家选择${target}号为主人。`
      }
    };
  }

  if (payload.roleId || payload.guessedRoleId) {
    return {
      ...candidate,
      stateChangeDraft: {
        type: rule.resolution,
        target: Number.isInteger(target) ? target : null,
        targets,
        roleId: payload.roleId || payload.guessedRoleId,
        summary: `${ROLE_NAMES[roleId] || roleId}选择${ROLE_NAMES[normalizeAutomationRoleId(payload.roleId || payload.guessedRoleId)] || payload.roleId || payload.guessedRoleId}，等待说书人确认。`
      },
      warnings: [`${ROLE_NAMES[roleId] || roleId}使用规则库候选，最终效果需说书人确认。`]
    };
  }

  return {
    ...candidate,
    visibleResultDraft: {
      recipientSeat: action.seat,
      result: rule.resolution,
      messageDraft: '你的夜间信息已由说书人确认。',
      targetSeats: targets
    },
    warnings: [`${ROLE_NAMES[roleId] || roleId}信息由规则库准备，需说书人确认。`]
  };
}

function prepareCandidateForSubmission({ roomState, batch, action, submission, index, candidateContext }) {
  if (action.roleIdAtPrompt === 'fortune-teller') {
    return prepareFortuneTellerCandidate({ roomState, batchId: batch.batchId, action, submission, index });
  }
  if (action.roleIdAtPrompt === 'poisoner') {
    return preparePoisonerCandidate({ batchId: batch.batchId, action, submission, index, candidateContext });
  }
  if (action.roleIdAtPrompt === 'monk') {
    return prepareMonkCandidate({ batchId: batch.batchId, action, submission, index, candidateContext });
  }
  if (action.roleIdAtPrompt === 'imp') {
    return prepareImpCandidate({ roomState, batchId: batch.batchId, action, submission, index, candidateContext });
  }
  if (action.roleIdAtPrompt === 'sailor') {
    return prepareSailorCandidate({ batchId: batch.batchId, action, submission, index });
  }
  if (action.roleIdAtPrompt === 'chambermaid') {
    return prepareChambermaidCandidate({ batchId: batch.batchId, action, submission, index, candidateContext });
  }
  if (action.roleIdAtPrompt === 'innkeeper') {
    return prepareInnkeeperCandidate({ batchId: batch.batchId, action, submission, index, candidateContext });
  }
  if (action.roleIdAtPrompt === 'professor') {
    return prepareProfessorCandidate({ roomState, batchId: batch.batchId, action, submission, index });
  }
  if (action.roleIdAtPrompt === 'devilsadvocate') {
    return prepareDevilsAdvocateCandidate({ batchId: batch.batchId, action, submission, index });
  }
  if (action.roleIdAtPrompt === 'assassin') {
    return prepareAssassinCandidate({ batchId: batch.batchId, action, submission, index });
  }
  if (action.roleIdAtPrompt === 'shabaloth') {
    return prepareShabalothCandidate({ batchId: batch.batchId, action, submission, index, candidateContext });
  }
  return prepareAutomationCandidate({ roomState, batchId: batch.batchId, action, submission, index, candidateContext });
}

function startNightCollection(roomState, options = {}) {
  if (activeCollectionExists(roomState)) {
    throw new Error('已有夜晚收集窗口处于开启或验算状态');
  }

  const now = isoNow(options);
  const nightNumber = Number(options.nightNumber || roomState.nightNumber || roomState.round || 1);
  const isFirstNight = options.isFirstNight === true;
  const batchId = options.batchId || `night-batch-${nightNumber}-${Date.parse(now) || Date.now()}`;
  const baseRoomState = resetNightTransientPlayerState(roomState, nightNumber);
  const actions = buildActions({ roomState: baseRoomState, batchId, nightNumber, isFirstNight });
  const prompts = actions.map((action, index) => {
    return buildPrompt({
      action,
      promptId: makeId('night-prompt', batchId, index + 1),
      roomState: baseRoomState
    });
  });

  const batch = {
    batchId,
    scriptId: roomState.scriptId || roomState.currentScript || 'trouble-brewing',
    nightNumber,
    isFirstNight,
    status: 'collecting',
    openedAt: now,
    closedAt: null,
    createdBy: 'storyteller',
    promptIds: prompts.map((prompt) => prompt.promptId),
    submissionIds: [],
    candidateResolutionIds: [],
    mutationScope: 'room.state.nightBatches-and-nightSubmissions-only',
    eventLogWritten: false,
    stateChanged: false,
    actions,
    prompts
  };

  const nextRoomState = {
    ...baseRoomState,
    nightBatches: [...asArray(baseRoomState.nightBatches), batch],
    nightSubmissions: asArray(baseRoomState.nightSubmissions),
    candidateResolutions: asArray(baseRoomState.candidateResolutions)
  };

  return {
    roomState: nextRoomState,
    batch,
    storytellerReceipt: createStartReceipt(batch),
    playerPrompts: prompts.map(sanitizePromptForPlayer)
  };
}

function submitNightAction(roomState, request, options = {}) {
  const batch = getActiveBatch(roomState, request.batchId);
  if (!batch || batch.status !== 'collecting') {
    throw new Error('夜晚收集未开启，不能提交');
  }

  const prompt = getPrompt(roomState, request.batchId, request.promptId);
  if (!prompt) {
    throw new Error('行动 prompt 不存在');
  }

  const player = getPlayerByToken(roomState, request.playerToken);
  if (!player || Number(player.seat) !== Number(prompt.seat)) {
    throw new Error('玩家 token 与行动 prompt 不匹配');
  }

  const normalizedPayload = normalizePayload(request.payload, prompt);
  validateTargets(roomState, prompt, normalizedPayload);

  const now = isoNow(options);
  const existingSubmission = getSubmission(roomState, request.batchId, request.promptId);
  const revision = existingSubmission ? existingSubmission.revision + 1 : 1;
  const submissionId = existingSubmission?.submissionId
    || makeId('night-submission', request.batchId, batch.submissionIds.length + 1);
  const action = batch.actions.find((item) => item.actionId === prompt.actionId);
  const submission = {
    submissionId,
    batchId: request.batchId,
    promptId: request.promptId,
    actionId: prompt.actionId,
    seat: prompt.seat,
    roleIdAtPrompt: prompt.roleIdAtPrompt,
    status: 'submitted',
    revision,
    payload: normalizedPayload,
    submittedAt: now,
    withdrawnAt: null,
    lockedAt: null,
    recordedBy: 'player',
    serverMutation: true,
    eventLogWritten: false,
    stateChanged: false,
    abilityExecuted: false
  };

  const nextSubmissions = existingSubmission
    ? asArray(roomState.nightSubmissions).map((item) => item.submissionId === submissionId ? submission : item)
    : [...asArray(roomState.nightSubmissions), submission];
  const nextBatchSubmissionIds = batch.submissionIds.includes(submissionId)
    ? batch.submissionIds
    : [...batch.submissionIds, submissionId];

  let nextRoomState = {
    ...roomState,
    nightSubmissions: nextSubmissions
  };

  nextRoomState = updateBatch(nextRoomState, request.batchId, (currentBatch) => {
    return updatePromptInBatch({
      ...currentBatch,
      submissionIds: nextBatchSubmissionIds
    }, request.promptId, (currentPrompt) => {
      const canReviseSubmission = !['waiting', 'auto_info'].includes(currentPrompt.promptKind);
      return {
        ...currentPrompt,
        submissionStatus: 'submitted',
        canModify: canReviseSubmission,
        canWithdraw: canReviseSubmission
      };
    });
  });

  return {
    roomState: nextRoomState,
    submission,
    action,
    playerReceipt: createSubmissionReceipt(submission, prompt),
    storytellerReceipt: {
      type: 'storyteller_night_submission_updated',
      data: {
        batchId: request.batchId,
        seat: prompt.seat,
        roleIdAtPrompt: prompt.roleIdAtPrompt,
        status: 'submitted',
        revision,
        submittedTargetSummary: summarizeSubmissionPayload(normalizedPayload),
        visibleToPlayers: false
      }
    }
  };
}

function withdrawNightAction(roomState, request, options = {}) {
  const batch = getActiveBatch(roomState, request.batchId);
  if (!batch || batch.status !== 'collecting') {
    throw new Error('夜晚收集未开启，不能撤回');
  }

  const prompt = getPrompt(roomState, request.batchId, request.promptId);
  if (!prompt) {
    throw new Error('行动 prompt 不存在');
  }

  const player = getPlayerByToken(roomState, request.playerToken);
  if (!player || Number(player.seat) !== Number(prompt.seat)) {
    throw new Error('玩家 token 与行动 prompt 不匹配');
  }

  const existingSubmission = getCurrentSubmissionForPrompt(roomState, request.batchId, request.promptId);
  if (!existingSubmission) {
    throw new Error('没有可撤回的当前提交');
  }

  const submission = {
    ...existingSubmission,
    status: 'withdrawn',
    withdrawnAt: isoNow(options),
    eventLogWritten: false,
    stateChanged: false,
    abilityExecuted: false
  };

  let nextRoomState = {
    ...roomState,
    nightSubmissions: asArray(roomState.nightSubmissions).map((item) => {
      return item.submissionId === submission.submissionId ? submission : item;
    })
  };

  nextRoomState = updateBatch(nextRoomState, request.batchId, (currentBatch) => {
    return updatePromptInBatch(currentBatch, request.promptId, (currentPrompt) => ({
      ...currentPrompt,
      submissionStatus: 'withdrawn',
      canModify: true,
      canWithdraw: false
    }));
  });

  return {
    roomState: nextRoomState,
    submission,
    playerReceipt: createWithdrawReceipt(submission),
    storytellerReceipt: {
      type: 'storyteller_night_submission_updated',
      data: {
        batchId: request.batchId,
        seat: prompt.seat,
        roleIdAtPrompt: prompt.roleIdAtPrompt,
        status: 'withdrawn',
        revision: submission.revision,
        visibleToPlayers: false
      }
    }
  };
}

function closeNightCollection(roomState, request, options = {}) {
  const batch = getActiveBatch(roomState, request.batchId);
  if (!batch || batch.status !== 'collecting') {
    throw new Error('夜晚收集未开启，不能关闭');
  }

  const missingRequiredPrompts = asArray(batch.prompts).filter((prompt) => {
    if (!prompt.required) return false;
    const submission = getCurrentSubmissionForPrompt(roomState, batch.batchId, prompt.promptId);
    return !submission;
  });

  if (missingRequiredPrompts.length > 0 && request.forceClose !== true) {
    throw new Error(`仍有 ${missingRequiredPrompts.length} 个必填夜晚行动未提交`);
  }

  const now = isoNow(options);
  const lockedSubmissionIds = new Set();
  let nextSubmissions = asArray(roomState.nightSubmissions).map((submission) => {
    if (submission.batchId !== batch.batchId || submission.status !== 'submitted') return submission;
    lockedSubmissionIds.add(submission.submissionId);
    return {
      ...submission,
      status: 'locked',
      lockedAt: now,
      eventLogWritten: false,
      stateChanged: false,
      abilityExecuted: false
    };
  });

  for (const prompt of asArray(batch.prompts)) {
    if (prompt.autoSubmit !== true) continue;
    const existing = nextSubmissions.find((submission) => {
      return submission.batchId === batch.batchId && submission.promptId === prompt.promptId;
    });
    if (existing) continue;
    const action = asArray(batch.actions).find((item) => item.actionId === prompt.actionId);
    const submissionId = makeId('night-auto-submission', batch.batchId, prompt.seat);
    lockedSubmissionIds.add(submissionId);
    nextSubmissions = [
      ...nextSubmissions,
      {
        submissionId,
        batchId: batch.batchId,
        promptId: prompt.promptId,
        actionId: prompt.actionId,
        seat: prompt.seat,
        roleIdAtPrompt: prompt.roleIdAtPrompt,
        status: 'locked',
        revision: 1,
        payload: { kind: 'auto_info' },
        submittedAt: now,
        withdrawnAt: null,
        lockedAt: now,
        recordedBy: 'rules-auto',
        serverMutation: true,
        eventLogWritten: false,
        stateChanged: false,
        abilityExecuted: false,
        actionOrder: action?.order ?? null
      }
    ];
  }

  const withdrawnSubmissionCount = nextSubmissions.filter((submission) => {
    return submission.batchId === batch.batchId && submission.status === 'withdrawn';
  }).length;
  const nextBatchSubmissionIds = [
    ...new Set([
      ...asArray(batch.submissionIds),
      ...nextSubmissions
        .filter((submission) => submission.batchId === batch.batchId)
        .map((submission) => submission.submissionId)
    ])
  ];

  let nextRoomState = {
    ...roomState,
    nightSubmissions: nextSubmissions
  };

  nextRoomState = updateBatch(nextRoomState, batch.batchId, (currentBatch) => ({
    ...currentBatch,
    status: 'closed',
    closedAt: now,
    submissionIds: nextBatchSubmissionIds,
    prompts: asArray(currentBatch.prompts).map((prompt) => {
      const submission = nextSubmissions.find((item) => {
        return item.batchId === currentBatch.batchId && item.promptId === prompt.promptId;
      });
      return {
        ...prompt,
        submissionStatus: submission?.status || 'none',
        canModify: false,
        canWithdraw: false
      };
    })
  }));

  return {
    roomState: nextRoomState,
    storytellerReceipt: {
      type: 'night_collection_closed',
      data: {
        status: 'closed',
        batchId: batch.batchId,
        lockedSubmissionCount: lockedSubmissionIds.size,
        withdrawnSubmissionCount,
        missingRequiredCount: missingRequiredPrompts.length,
        mutationScope: 'room.state.nightSubmissions.lock-fields-only',
        eventLogWritten: false,
        stateChanged: false,
        candidateResolutionsCreated: false
      }
    }
  };
}

function prepareNightCandidates(roomState, request) {
  const batch = getActiveBatch(roomState, request.batchId);
  if (!batch || batch.status !== 'closed') {
    throw new Error('夜晚收集未关闭，不能生成候选');
  }

  const lockedSubmissions = asArray(roomState.nightSubmissions).filter((submission) => {
    return submission.batchId === batch.batchId && submission.status === 'locked';
  });
  const lockedByActionId = new Map(lockedSubmissions.map((submission) => [submission.actionId, submission]));
  const candidateContext = {
    poisonedSeat: null,
    protectedSeats: new Set(),
    lockedActionSeats: new Set(lockedSubmissions.map((submission) => Number(submission.seat)))
  };

  const orderedActions = asArray(batch.actions)
    .filter((action) => lockedByActionId.has(action.actionId))
    .slice()
    .sort((left, right) => left.order - right.order);

  const candidateResolutions = orderedActions
    .map((action, index) => {
      return prepareCandidateForSubmission({
        roomState,
        batch,
        action,
        submission: lockedByActionId.get(action.actionId),
        index,
        candidateContext
      });
    })
    .filter(Boolean);

  const candidateResolutionIds = candidateResolutions.map((candidate) => candidate.candidateResolutionId);
  let nextRoomState = {
    ...roomState,
    candidateResolutions: [
      ...asArray(roomState.candidateResolutions).filter((candidate) => candidate.batchId !== batch.batchId),
      ...candidateResolutions
    ]
  };

  nextRoomState = updateBatch(nextRoomState, batch.batchId, (currentBatch) => ({
    ...currentBatch,
    status: 'candidates_ready',
    candidateResolutionIds
  }));

  return {
    roomState: nextRoomState,
    candidateResolutions,
    storytellerReceipt: {
      type: 'night_candidate_resolutions_prepared',
      data: {
        status: 'candidates_ready',
        batchId: batch.batchId,
        candidateCount: candidateResolutions.length,
        evaluationOrderSource: 'official-night-order',
        simultaneousCollection: true,
        sequentialEvaluation: true,
        requiresStorytellerConfirmation: true,
        eventLogWritten: false,
        stateChanged: false,
        privateMessagesSent: false
      }
    }
  };
}

function getPlayerNightPrompt(roomState, request) {
  const player = getPlayerByToken(roomState, request.playerToken);
  if (!player) {
    throw new Error('玩家 token 不存在');
  }

  const batch = getActiveBatch(roomState, request.batchId);
  if (!batch) {
    throw new Error('夜晚收集 batch 不存在');
  }

  const prompt = asArray(batch.prompts).find((item) => Number(item.seat) === Number(player.seat));
  if (!prompt) return null;
  return sanitizePromptForPlayer(prompt);
}

function getStorytellerSubmissionSummary(roomState, batchId) {
  const batch = getActiveBatch(roomState, batchId);
  if (!batch) {
    throw new Error('夜晚收集 batch 不存在');
  }

  return asArray(batch.prompts).map((prompt) => {
    const submission = getSubmission(roomState, batchId, prompt.promptId);
    const player = getPlayers(roomState).find((item) => Number(item.seat) === Number(prompt.seat)) || {};
    const isAiTestPlayer = player.aiTestPlayer === true || player.localTestOnly === true;
    const inputSource = submission
      ? (isAiTestPlayer ? 'ai-test' : (submission.recordedBy === 'rules-auto' ? 'auto-info' : (submission.recordedBy === 'storyteller' ? 'storyteller' : 'player')))
      : null;
    const inputSourceLabels = {
      'ai-test': 'AI测试',
      'auto-info': '自动信息',
      storyteller: '说书人代填',
      player: '玩家提交'
    };
    return {
      seat: prompt.seat,
      roleIdAtPrompt: prompt.roleIdAtPrompt,
      roleNameAtPrompt: prompt.roleNameAtPrompt,
      promptKind: prompt.promptKind,
      required: prompt.required,
      autoSubmit: prompt.autoSubmit === true,
      canModify: prompt.canModify !== false,
      aiTestPlayer: isAiTestPlayer,
      submissionStatus: submission?.status || 'none',
      submittedBy: submission ? (isAiTestPlayer ? 'ai-test-deterministic' : (submission.recordedBy || 'player')) : null,
      inputSource,
      inputSourceLabel: inputSource ? inputSourceLabels[inputSource] : '等待玩家/说书人',
      revision: submission?.revision || 0,
      targetSummary: submission?.payload?.kind === 'select_2'
        ? `${submission.payload.targets.length} 个目标`
        : submission?.payload?.kind === 'select_1'
          ? '1 个目标'
          : '无目标'
    };
  });
}

function findForbiddenPlayerPromptPaths(value, path = '$') {
  if (!value || typeof value !== 'object') return [];
  const paths = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      paths.push(...findForbiddenPlayerPromptPaths(item, `${path}[${index}]`));
    });
    return paths;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_PLAYER_PROMPT_KEYS.has(key)) {
      paths.push(childPath);
    }
    paths.push(...findForbiddenPlayerPromptPaths(child, childPath));
  }
  return paths;
}

module.exports = {
  DEFAULT_NIGHT_ORDER,
  FORBIDDEN_PLAYER_PROMPT_KEYS,
  getPromptDefinition,
  findForbiddenPlayerPromptPaths,
  startNightCollection,
  submitNightAction,
  withdrawNightAction,
  closeNightCollection,
  prepareNightCandidates,
  getPlayerNightPrompt,
  getStorytellerSubmissionSummary
};
