function kebab(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const CLASS_DEFS = Object.freeze({
  'information-options': {
    id: 'information-options',
    name: '信息类选项',
    rule: '提交目标或选项后生成私密信息候选，不直接改变权威状态。',
  },
  'storyteller-execution-options': {
    id: 'storyteller-execution-options',
    name: '半自动执行类',
    rule: '提交目标或选项后生成状态变化候选，需说书人确认执行。',
  },
  'auto-calculable': {
    id: 'auto-calculable',
    name: '可自动计算类',
    rule: '账本、标记和提交齐全时可自动算出结果候选，正式局仍需确认。',
  },
  'passive-manual': {
    id: 'passive-manual',
    name: '被动/手工裁定类',
    rule: '设置、疯狂、全局规则或触发条件复杂，主要由说书人维护。',
  },
});

const GROUP_BY_TEAM = Object.freeze({
  townsfolk: 'townsfolk',
  outsider: 'outsiders',
  minion: 'minions',
  demon: 'demons',
  fabled: 'travellers',
});

const ALIGNMENT_BY_TEAM = Object.freeze({
  townsfolk: 'good',
  outsider: 'good',
  minion: 'evil',
  demon: 'evil',
  fabled: 'fabled',
});

function classifyResult(classId) {
  if (classId === 'information-options' || classId === 'auto-calculable') return 'information';
  if (classId === 'storyteller-execution-options') return 'status';
  return 'manual';
}

function candidateTypeFor(resultType, classId) {
  if (classId === 'passive-manual') return null;
  if (resultType === 'information') return 'custom-info-candidate';
  if (resultType === 'kill') return 'custom-kill-candidate';
  if (resultType === 'poison') return 'custom-poison-candidate';
  if (resultType === 'protect') return 'custom-protect-candidate';
  if (resultType === 'role-change') return 'custom-role-change-candidate';
  return 'custom-choice-candidate';
}

function firstSelectionClause(ability) {
  const text = String(ability || '');
  const match = text.match(/选择[^：；。]+/);
  return match ? match[0] : '';
}

function defaultTargetRules(promptKind, ability = '') {
  const count = promptKind === 'select_4' ? 4
    : promptKind === 'select_3' ? 3
      : promptKind === 'select_2' ? 2
        : promptKind === 'select_1' || promptKind === 'select_player_role' ? 1
          : 0;
  const selection = firstSelectionClause(ability);
  const mustBeDead = /死亡玩家/.test(selection);
  return {
    count,
    allowSelf: !/除你以外|非自己|不能选择自己/.test(selection),
    allowDead: mustBeDead || !/存活玩家/.test(selection),
    mustBeDistinct: true,
    mustBeDead
  };
}

function inferPromptKind({ classId, team, ability }) {
  if (classId === 'passive-manual') return null;
  const text = String(ability || '');
  const selection = firstSelectionClause(text);
  if (/每个白天|每白天|白天|公开/.test(text) && !/每个夜晚|每夜|首个夜晚|夜晚/.test(text)) return null;
  if (selection) {
    if (/二至四名|2\s*[-~至]\s*4/.test(selection)) return 'select_4';
    if (/四名|四个/.test(selection)) return 'select_4';
    if (/三名|三个/.test(selection)) return 'select_3';
    if (/两名|两个/.test(selection)) return 'select_2';
    const selectsPlayer = /玩家/.test(selection);
    const selectsRole = /角色/.test(selection);
    const guessesRole = /猜测[^：；。]*角色/.test(text);
    if (selectsPlayer && (selectsRole || guessesRole)) return 'select_player_role';
    if (!selectsPlayer && selectsRole) return 'select_role';
    return 'select_1';
  }
  if (/选一|选中/.test(text)) return 'select_1';
  if (team === 'demon' && /死亡|死/.test(text)) return 'select_1';
  return 'auto_info';
}

function buildLogicProfile({ scriptId, role, sourceTag }) {
  const classId = role.classId || 'passive-manual';
  if (classId === 'passive-manual') return null;
  const promptKind = role.promptKind || inferPromptKind({ classId, team: role.team, ability: role.ability }) || 'auto_info';
  const resultType = role.resultType || classifyResult(classId);
  const classDef = CLASS_DEFS[classId] || CLASS_DEFS['passive-manual'];
  return {
    schemaVersion: 'botc.imported-role-logic.v1',
    source: sourceTag,
    triggerMode: role.triggerMode || (/首个夜晚|首夜/.test(role.ability || '') && !/每个夜晚|每夜/.test(role.ability || '') ? 'first-night' : /每个白天|白天/.test(role.ability || '') && !/夜晚|每夜/.test(role.ability || '') ? 'day' : 'first-and-other-night'),
    promptKind,
    riskLevel: role.riskLevel || (classId === 'information-options' ? 'medium' : 'high'),
    resultType,
    candidateType: candidateTypeFor(resultType, classId),
    targetRules: role.targetRules || defaultTargetRules(promptKind, role.ability),
    roleRules: role.roleRules || null,
    storytellerConfirmationRequired: true,
    playerVisibleBoundary: 'confirmed-candidate-only',
    manualTweaksAllowed: true,
    automationClass: classDef.id,
    automationClassName: classDef.name,
    automationRule: classDef.rule,
    notes: role.notes || [],
  };
}

function buildRole(scriptId, sourceTag, role, index) {
  const id = role.id || kebab(role.nameEn || role.name);
  const group = GROUP_BY_TEAM[role.team];
  const classId = role.classId || 'passive-manual';
  const classDef = CLASS_DEFS[classId] || CLASS_DEFS['passive-manual'];
  const logicProfile = buildLogicProfile({ scriptId, role: { ...role, id }, sourceTag });
  const wakes = Boolean(logicProfile && ['first-night', 'first-and-other-night', 'other-night'].includes(logicProfile.triggerMode));
  const isFirstOnly = logicProfile?.triggerMode === 'first-night';
  const isOtherOnly = logicProfile?.triggerMode === 'other-night';
  const baseOrder = role.order || (index + 1) * 10;
  return {
    id,
    name: role.name,
    nameEn: role.nameEn || id,
    team: role.team,
    type: group,
    group,
    alignment: ALIGNMENT_BY_TEAM[role.team] || 'unknown',
    ability: role.ability || '',
    firstNight: wakes && !isOtherOnly,
    otherNights: wakes && !isFirstOnly,
    nightOrder: {
      first: wakes && !isOtherOnly ? baseOrder : 0,
      other: wakes && !isFirstOnly ? baseOrder : 0,
    },
    abilityType: logicProfile ? 'imported_logic_profile' : 'manual',
    actionType: logicProfile ? 'storyteller_confirmed_candidate' : 'manual_review',
    logicClassification: {
      classId: classDef.id,
      name: classDef.name,
      reason: role.reason || classDef.rule,
      rule: classDef.rule,
      storytellerBoundary: role.storytellerBoundary || '正式局不直接改权威状态，需说书人确认。',
    },
    logicProfile,
    reminders: role.reminders || [],
    remindersGlobal: [],
    source: { scriptId, image: role.image || null },
  };
}

function buildNightOrder(characters) {
  const allRoles = Object.values(characters).flat();
  const ordered = (key) => allRoles
    .filter((role) => Number(role.nightOrder?.[key] || 0) > 0)
    .sort((left, right) => Number(left.nightOrder[key]) - Number(right.nightOrder[key]))
    .map((role) => role.id);
  return { first: ordered('first'), other: ordered('other') };
}

function buildImportedImageScript(definition) {
  const sourceTag = `${definition.id}-image-import-2026-07-09`;
  const characters = { townsfolk: [], outsiders: [], minions: [], demons: [], travellers: [] };
  let index = 0;
  for (const team of ['townsfolk', 'outsider', 'minion', 'demon', 'fabled']) {
    const group = GROUP_BY_TEAM[team];
    for (const item of definition.roles[team] || []) {
      characters[group].push(buildRole(definition.id, sourceTag, { ...item, team, image: definition.source.imagePath }, index));
      index += 1;
    }
  }
  const nightOrder = buildNightOrder(characters);
  const allRoles = Object.values(characters).flat();
  return Object.freeze({
    id: definition.id,
    name: definition.name,
    nameEn: definition.nameEn,
    difficulty: definition.difficulty || 4,
    description: definition.description,
    source: definition.source,
    characters,
    nightOrder,
    ruleLogic: {
      schemaVersion: 'botc.imported-script-rule-logic.v1',
      source: sourceTag,
      roles: Object.fromEntries(allRoles.filter((role) => role.logicProfile).map((role) => [role.id, role.logicProfile])),
    },
    roleLogicClasses: CLASS_DEFS,
    roleLogicClassification: Object.fromEntries(allRoles.map((role) => [role.id, role.logicClassification])),
    balanceRules: {},
    runtimeSupport: {
      setupCandidate: true,
      dealRoles: true,
      playerView: true,
      ruleAutomation: 'logic-profile-candidate-confirmation',
    },
  });
}

module.exports = {
  CLASS_DEFS,
  buildImportedImageScript,
};
