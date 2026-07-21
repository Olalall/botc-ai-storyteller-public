const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

const TEAM_TO_GROUP = Object.freeze({
  townsfolk: 'townsfolk',
  outsider: 'outsiders',
  minion: 'minions',
  demon: 'demons',
  traveller: 'travellers',
  traveler: 'travellers',
});

const GROUP_TO_ALIGNMENT = Object.freeze({
  townsfolk: 'good',
  outsiders: 'good',
  minions: 'evil',
  demons: 'evil',
  travellers: 'traveller',
});

const CANONICAL_ROLE_DISPLAY_NAMES = Object.freeze({
  imp: '小恶魔',
  ravenkeeper: '守鸦人',
});

const ROLE_LOCALIZATION_ZH = Object.freeze({
  imp: { name: '小恶魔', ability: '每个夜晚*，你要选择一名玩家：他死亡。如果你以这种方式自杀，一名爪牙会变成小恶魔。' },
  investigator: { name: '调查员', ability: '在你的首个夜晚，你会得知两名玩家和一个爪牙角色：这两名玩家之一是该角色。' },
  chef: { name: '厨师', ability: '在你的首个夜晚，你会得知场上邻座的邪恶玩家有多少对。' },
  grandmother: { name: '祖母', ability: '在你的首个夜晚，你会得知一名善良玩家和他的角色。如果恶魔杀死了他，你也会死亡。' },
  balloonist: { name: '气球驾驶员', ability: '每个夜晚，你会得知一名与上个夜晚得知的玩家角色类型不同的玩家。[+0~1外来者]' },
  dreamer: { name: '筑梦师', ability: '每个夜晚，你要选择除你及旅行者以外的一名玩家：你会得知一个善良角色和一个邪恶角色，该玩家是其中一个角色。' },
  fortuneteller: { name: '占卜师', ability: '每个夜晚，你要选择两名玩家：你会得知他们之中是否有恶魔。会有一名善良玩家始终被你的能力当作恶魔。' },
  snakecharmer: { name: '舞蛇人', ability: '每个夜晚，你要选择一名存活的玩家：如果你选中了恶魔，你和他交换角色和阵营，然后他中毒。' },
  gambler: { name: '赌徒', ability: '每个夜晚*，你要选择一名玩家并猜测该玩家的角色：如果你猜错了，你会死亡。' },
  savant: { name: '博学者', ability: '每个白天，你可以私下询问说书人以得知两条信息：一个是正确的，一个是错误的。' },
  philosopher: { name: '哲学家', ability: '每局游戏限一次，在夜晚时，你可以选择一个善良角色：你获得该角色的能力。如果这个角色在场，他醉酒。' },
  ravenkeeper: { name: '守鸦人', ability: '如果你在夜晚死亡，你会被唤醒，然后你要选择一名玩家：你会得知他的角色。' },
  amnesiac: { name: '失忆者', ability: '你不知道你的能力是什么。每个白天你可以找说书人猜测一次，你会得知你的猜测有多准确。' },
  cannibal: { name: '食人族', ability: '你拥有上个死于处决的玩家的能力。如果该玩家属于邪恶阵营，你中毒直到下个善良玩家死于处决。' },
  drunk: { name: '酒鬼', ability: '你不知道你是酒鬼。你以为你是一个镇民角色，但其实你不是。' },
  recluse: { name: '陌客', ability: '你可能会被当作邪恶阵营、爪牙角色或恶魔角色，即使你已死亡。' },
  sweetheart: { name: '心上人', ability: '当你死亡时，会有一名玩家开始醉酒。' },
  mutant: { name: '畸形秀演员', ability: '如果你“疯狂”地证明自己是外来者，你可能被处决。' },
  lunatic: { name: '疯子', ability: '你以为你是一个恶魔，但其实你不是。恶魔知道你是疯子以及你在每个夜晚选择了哪些玩家。' },
  godfather: { name: '教父', ability: '在你的首个夜晚，你会得知有哪些外来者角色在场。如果有外来者在白天死亡，你会在当晚被唤醒并且你要选择一名玩家：他死亡。[-1或+1外来者]' },
  cerenovus: { name: '洗脑师', ability: '每个夜晚，你要选择一名玩家和一个善良角色。他明天白天和夜晚需要“疯狂”地证明自己是这个角色，不然他可能被处决。' },
  pithag: { name: '麻脸巫婆', ability: '每个夜晚*，你要选择一名玩家和一个角色，如果该角色不在场，他变成该角色。如果因此创造了一个恶魔，当晚的死亡由说书人决定。' },
  widow: { name: '寡妇', ability: '在你的首个夜晚，你能查看魔典并选择一名玩家：他中毒。随后，始终会有一名善良玩家知道寡妇在场。' },
  vigormortis: { name: '亡骨魔', ability: '每个夜晚*，你要选择一名玩家：他死亡。被你杀死的爪牙保留他的能力，且与他邻近的两名镇民之一中毒。[-1外来者]' },
  fanggu: { name: '方古', ability: '每个夜晚*，你要选择一名玩家：他死亡。被该能力杀死的外来者改为变成邪恶的方古且你代替他死亡，但每局游戏仅能成功转化一次。[+1外来者]' },
  apprentice: { name: '学徒', ability: '在你的首个夜晚，如果你是善良的，你会获得一个镇民角色的能力；如果你是邪恶的，你会获得一个爪牙角色的能力。' },
  barista: { name: '咖啡师', ability: '每个夜晚，直至下个黄昏，由说书人二选一：1）一名玩家解除并免受醉酒和中毒影响，且会得知正确信息；2）一名玩家的能力可以生效两次。该玩家会得知是哪个效果。' },
  beggar: { name: '乞丐', ability: '你只能使用投票标记才能投票。死亡的玩家可以将他的投票标记给你，如果他这么做，你会得知他的阵营。你不会中毒和醉酒。' },
  bonecollector: { name: '集骨者', ability: '每局游戏限一次，在夜晚时*，你可以选择一名死亡的玩家：他重新获得能力直到下个黄昏。' },
  harlot: { name: '流莺', ability: '每个夜晚*，你要选择一名存活的玩家：如果他同意，你会得知他的角色，但是你们两个可能同时死亡。' },
});


const OFFICIAL_FIXTURE_SCRIPTS = Object.freeze([
  {
    scriptId: 'bad-moon-rising',
    name: 'Bad Moon Rising',
    nameEn: 'Bad Moon Rising',
    fixturePath: 'data/runtime/scripts/normalized/bad-moon-rising-import.json',
  },
  {
    scriptId: 'sects-and-violets',
    name: 'Sects & Violets',
    nameEn: 'Sects & Violets',
    fixturePath: 'data/runtime/scripts/normalized/sects-and-violets-import.json',
  },
]);

let cachedOfficialRolesById = null;
let cachedScripts = null;
const runtimeScriptOverrides = new Map();

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

function getOfficialRolesById() {
  if (cachedOfficialRolesById) return cachedOfficialRolesById;
  const roles = readJson('data/runtime/official/normalized/official-roles.json').items || [];
  cachedOfficialRolesById = new Map(roles.map((role) => [role.id, role]));
  return cachedOfficialRolesById;
}

function groupForTeam(team) {
  return TEAM_TO_GROUP[String(team || '').toLowerCase()] || null;
}

function canonicalRoleDisplayName(roleId, fallback) {
  return ROLE_LOCALIZATION_ZH[roleId]?.name || CANONICAL_ROLE_DISPLAY_NAMES[roleId] || fallback || roleId;
}

function localizedRoleAbility(roleId, fallback) {
  return ROLE_LOCALIZATION_ZH[roleId]?.ability || fallback || '';
}

function roleToCharacter(role, fallback = {}) {
  const group = groupForTeam(role.team || fallback.team);
  if (!group) return null;
  const firstNight = Number(role.firstNight || 0);
  const otherNight = Number(role.otherNight || 0);
  return {
    id: role.id,
    name: canonicalRoleDisplayName(role.id, role.name || fallback.name || role.id),
    nameEn: role.name || fallback.nameEn || role.id,
    ability: localizedRoleAbility(role.id, role.ability),
    abilityType: fallback.abilityType || 'manual',
    actionType: fallback.actionType || 'manual_review',
    firstNight: firstNight > 0,
    otherNights: otherNight > 0,
    setup: Boolean(role.setup),
    reminders: Array.isArray(role.reminders) ? role.reminders : [],
    remindersGlobal: Array.isArray(role.remindersGlobal) ? role.remindersGlobal : [],
    nightOrder: { first: firstNight, other: otherNight },
    type: group,
    team: role.team || fallback.team,
    alignment: GROUP_TO_ALIGNMENT[group] || 'unknown',
    edition: role.edition || fallback.edition || null,
    image: role.image || null,
    source: role.source || fallback.source || null,
  };
}

function emptyCharacters() {
  return {
    townsfolk: [],
    outsiders: [],
    minions: [],
    demons: [],
    travellers: [],
  };
}

function buildNightOrder(characters) {
  const allRoles = Object.values(characters).flat();
  const ordered = (nightKey) => allRoles
    .filter((role) => Number(role.nightOrder?.[nightKey] || 0) > 0)
    .sort((left, right) => Number(left.nightOrder[nightKey]) - Number(right.nightOrder[nightKey]))
    .map((role) => role.id);

  return {
    first: ordered('first'),
    other: ordered('other'),
  };
}

function buildOfficialFixtureScript(definition) {
  const fixture = readJson(definition.fixturePath);
  const characters = emptyCharacters();
  for (const entry of fixture.entries || []) {
    const role = roleToCharacter({
      id: entry.id,
      ...(entry.display || {}),
    }, {
      edition: fixture.source?.edition,
      source: fixture.source,
    });
    if (!role) continue;
    characters[groupForTeam(role.team)].push(role);
  }

  return {
    id: definition.scriptId,
    name: definition.name,
    nameEn: definition.nameEn,
    difficulty: 2,
    description: `${definition.nameEn} runtime setup/deal support from official normalized fixtures; complex role rulings remain storyteller-confirmed.`,
    source: fixture.source,
    characters,
    nightOrder: buildNightOrder(characters),
    balanceRules: {},
    runtimeSupport: {
      setupCandidate: true,
      dealRoles: true,
      playerView: true,
      ruleAutomation: 'manual-storyteller-confirmed',
    },
  };
}

function buildCatfishingScript() {
  const fixture = readJson('data/runtime/scripts/normalized/catfishing-import.json');
  const officialRoles = getOfficialRolesById();
  const characters = emptyCharacters();
  for (const entry of fixture.item?.entries || []) {
    if (!['official-id', 'official-deprecated-object'].includes(entry.kind)) continue;
    const officialRole = officialRoles.get(entry.id);
    if (!officialRole) continue;
    const role = roleToCharacter(officialRole, {
      source: fixture.item.source,
    });
    if (!role) continue;
    characters[groupForTeam(role.team)].push(role);
  }

  return {
    id: 'catfishing',
    name: '瓦釜雷鸣',
    nameEn: fixture.item?.metadata?.name || 'Catfishing',
    difficulty: 3,
    description: '\u793e\u533a\u4e8c\u521b\u5267\u672c\u300a\u74e6\u91dc\u96f7\u9e23\u300b\uff1b\u652f\u6301\u672c\u5730\u914d\u677f\u548c\u53d1\u8eab\u4efd\uff0c\u590d\u6742\u88c1\u5b9a\u4ecd\u7531\u8bf4\u4e66\u4eba\u786e\u8ba4\u3002',
    source: fixture.item?.source || null,
    characters,
    nightOrder: buildNightOrder(characters),
    balanceRules: {},
    runtimeSupport: {
      setupCandidate: true,
      dealRoles: true,
      playerView: true,
      ruleAutomation: 'manual-storyteller-confirmed',
    },
  };
}

function getRuntimeScripts() {
  if (cachedScripts) return cachedScripts;
  const troubleBrewing = require('../scripts/trouble-brewing');
  const trustIssuesPlus = require('./imported-scripts/trust-issues-plus');
  const communityImageBoardsA = require('./imported-scripts/community-image-boards-a');
  const communityImageBoardsB = require('./imported-scripts/community-image-boards-b');
  cachedScripts = [
    troubleBrewing,
    ...OFFICIAL_FIXTURE_SCRIPTS.map(buildOfficialFixtureScript),
    buildCatfishingScript(),
    trustIssuesPlus,
    ...communityImageBoardsA,
    ...communityImageBoardsB,
  ];
  for (const script of runtimeScriptOverrides.values()) {
    const existingIndex = cachedScripts.findIndex((item) => item.id === script.id);
    if (existingIndex >= 0) cachedScripts[existingIndex] = script;
    else cachedScripts.push(script);
  }
  return cachedScripts;
}

function registerRuntimeScript(script) {
  if (!script?.id) throw new Error('runtime script requires id');
  runtimeScriptOverrides.set(script.id, script);
  if (!cachedScripts) {
    getRuntimeScripts();
    return script;
  }
  const existingIndex = cachedScripts.findIndex((item) => item.id === script.id);
  if (existingIndex >= 0) cachedScripts[existingIndex] = script;
  else cachedScripts.push(script);
  return script;
}

function getScriptById(scriptId) {
  return getRuntimeScripts().find((script) => script.id === scriptId) || null;
}

function buildRoleCatalog(scriptId) {
  const script = getScriptById(scriptId);
  if (!script) return new Map();
  const catalog = new Map();
  for (const [group, roles] of Object.entries(script.characters || {})) {
    const alignment = GROUP_TO_ALIGNMENT[group] || 'unknown';
    for (const role of roles || []) {
      catalog.set(role.id, {
        ...role,
        name: canonicalRoleDisplayName(role.id, role.name || role.id),
        group,
        alignment,
      });
    }
  }
  return catalog;
}

module.exports = {
  GROUP_TO_ALIGNMENT,
  TEAM_TO_GROUP,
  buildRoleCatalog,
  getRuntimeScripts,
  getScriptById,
  groupForTeam,
  registerRuntimeScript,
};
