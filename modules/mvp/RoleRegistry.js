const fs = require('fs');
const path = require('path');
const { getRuntimeScripts } = require('../ScriptCatalog');
const { loadRoleTokenAliasRegistry } = require('./RoleTokenAliasResolver');

const rootDir = path.join(__dirname, '..', '..');

const ROLE_ID_ALIASES = Object.freeze({
  'fortune-teller': 'fortuneteller',
  fortune_teller: 'fortuneteller',
  scarlet_woman: 'scarletwoman',
  'scarlet-woman': 'scarletwoman',
  pit_hag: 'pithag',
  'pit-hag': 'pithag',
  snake_charmer: 'snakecharmer',
  'snake-charmer': 'snakecharmer',
  devils_advocate: 'devilsadvocate',
  "devil's-advocate": 'devilsadvocate',
  'devils-advocate': 'devilsadvocate',
  'devil-advocate': 'devilsadvocate',
  vigormortis: 'vigormortis'
});

const EXTRA_ROLE_ALIASES = Object.freeze({
  washerwoman: ['Washerwoman', 'Washer Woman', '洗衣妇', '洗衣女', '洗衣工'],
  librarian: ['Librarian', '图书管理员', '图书馆员'],
  investigator: ['Investigator', '调查员', '调查者', '侦探'],
  chef: ['Chef', '厨师'],
  empath: ['Empath', '共情者', '感同身受者'],
  butler: ['Butler', '管家'],
  fortuneteller: ['Fortune Teller', 'Fortuneteller', '占卜师', '占卜者', '预言家'],
  spy: ['Spy', '间谍', '密探'],
  poisoner: ['Poisoner', '投毒者', '下毒者'],
  monk: ['Monk', '僧侣', '僧人'],
  undertaker: ['Undertaker', '守夜人', '殡葬师', '送葬者'],
  ravenkeeper: ['Ravenkeeper', '守鸦人', '乌鸦守卫', '渡鸦守卫', '鸦守'],
  imp: ['Imp', '小恶魔', '小鬼', '地狱恶犬'],
  scarletwoman: ['Scarlet Woman', '猩红女郎', '红唇女郎', '红衣女郎'],
  baron: ['Baron', '男爵'],
  drunk: ['Drunk', '酒鬼', '醉鬼'],
  recluse: ['Recluse', '隐士', '隐居者'],
  soldier: ['Soldier', '士兵'],
  slayer: ['Slayer', '杀手', '猎魔人'],
  virgin: ['Virgin', '处女', '圣女'],
  mayor: ['Mayor', '市长'],
  saint: ['Saint', '圣徒', '圣人'],
  grandmother: ['Grandmother', '祖母', '老奶奶'],
  balloonist: ['Balloonist', '气球驾驶员', '热气球驾驶员', '气球师'],
  dreamer: ['Dreamer', '筑梦师', '做梦者', '梦卜者'],
  snakecharmer: ['Snake Charmer', '弄蛇人', '耍蛇人', '驯蛇师'],
  gambler: ['Gambler', '赌徒', '赌鬼'],
  savant: ['Savant', '博学者', '学者'],
  philosopher: ['Philosopher', '哲学家'],
  amnesiac: ['Amnesiac', '失忆者', '失忆症患者'],
  cannibal: ['Cannibal', '食人族', '食人者'],
  sweetheart: ['Sweetheart', '心上人', '甜心'],
  mutant: ['Mutant', '突变体', '变种人'],
  lunatic: ['Lunatic', '疯子', '月狂'],
  godfather: ['Godfather', '教父'],
  cerenovus: ['Cerenovus', '洗脑师', '赛瑞诺维斯', '脑蛆'],
  pithag: ['Pit-Hag', 'Pit Hag', '深坑女巫', '坑巫', '女巫'],
  widow: ['Widow', '寡妇'],
  vigormortis: ['Vigormortis', '活尸', '维格魔', '僵尸魔'],
  fanggu: ['Fang Gu', '方古', '方咕'],
  apprentice: ['Apprentice', '学徒'],
  barista: ['Barista', '咖啡师'],
  beggar: ['Beggar', '乞丐'],
  bonecollector: ['Bone Collector', '拾骨者', '骨头收藏家'],
  harlot: ['Harlot', '妓女', '风尘女']
});

const ABILITY_KEYWORDS = Object.freeze({
  washerwoman: [
    [['start', 'know'], ['2', 'two'], ['townsfolk']],
    [['首夜', '起始'], ['两', '2'], ['镇民']]
  ],
  librarian: [
    [['start', 'know'], ['2', 'two'], ['outsider']],
    [['首夜', '起始'], ['两', '2'], ['外来者', '外来']]
  ],
  investigator: [
    [['start', 'know'], ['2', 'two'], ['minion']],
    [['首夜', '起始'], ['两', '2'], ['爪牙']]
  ],
  chef: [
    [['start', 'know'], ['pairs'], ['evil']],
    [['首夜', '起始'], ['邻座', '相邻'], ['邪恶']]
  ],
  empath: [
    [['each', 'night'], ['alive', 'neighbors'], ['evil']],
    [['每夜'], ['邻座', '左右'], ['邪恶']]
  ],
  fortuneteller: [
    [['each', 'night'], ['choose'], ['2', 'two'], ['demon']],
    [['每夜'], ['选择'], ['两', '2'], ['恶魔']]
  ],
  butler: [
    [['choose'], ['master'], ['vote']],
    [['选择'], ['主人'], ['投票']]
  ],
  poisoner: [
    [['each', 'night'], ['choose'], ['poison']],
    [['每夜'], ['选择'], ['中毒', '投毒', '下毒']]
  ],
  monk: [
    [['each', 'night'], ['choose'], ['safe', 'protect', 'die']],
    [['每夜'], ['选择'], ['保护', '不会死亡', '免于死亡']]
  ],
  imp: [
    [['each', 'night'], ['choose'], ['die'], ['minion']],
    [['每夜'], ['选择'], ['死亡', '杀死'], ['爪牙']]
  ],
  ravenkeeper: [
    [['die'], ['night'], ['learn'], ['character']],
    [['夜间', '夜晚'], ['死亡'], ['得知'], ['身份', '角色']]
  ],
  undertaker: [
    [['each', 'night'], ['executed'], ['character']],
    [['每夜'], ['处决'], ['身份', '角色']]
  ],
  virgin: [
    [['first'], ['nominated'], ['townsfolk'], ['die']],
    [['首次', '第一次'], ['提名'], ['镇民'], ['死亡']]
  ],
  slayer: [
    [['once'], ['publicly'], ['choose'], ['demon']],
    [['一次'], ['公开'], ['选择'], ['恶魔']]
  ],
  soldier: [
    [['safe'], ['demon']],
    [['免疫', '免疫于'], ['恶魔']]
  ],
  mayor: [
    [['3'], ['alive'], ['no', 'execution'], ['good']],
    [['3', '三'], ['存活'], ['无处决', '没有处决'], ['好人']]
  ],
  saint: [
    [['executed'], ['evil'], ['wins']],
    [['处决'], ['邪恶'], ['获胜']]
  ],
  grandmother: [
    [['start', 'know'], ['good'], ['grandchild']],
    [['首夜', '起始'], ['好人'], ['孙', '孙子', '孙女']]
  ],
  balloonist: [
    [['each', 'night'], ['different', 'character', 'type']],
    [['每夜'], ['不同'], ['角色类型', '类型']]
  ],
  dreamer: [
    [['choose'], ['good'], ['evil'], ['character']],
    [['选择'], ['好人'], ['邪恶'], ['角色', '身份']]
  ],
  snakecharmer: [
    [['choose'], ['demon'], ['swap']],
    [['选择'], ['恶魔'], ['交换', '互换']]
  ],
  gambler: [
    [['choose'], ['guess'], ['character'], ['wrong', 'die']],
    [['选择'], ['猜'], ['身份', '角色'], ['错误', '死亡']]
  ],
  philosopher: [
    [['choose'], ['good'], ['character'], ['gain']],
    [['选择'], ['好人'], ['角色'], ['获得']]
  ],
  cerenovus: [
    [['choose'], ['mad'], ['execute']],
    [['选择'], ['疯狂'], ['处决']]
  ],
  pithag: [
    [['choose'], ['player'], ['character'], ['become']],
    [['选择'], ['玩家'], ['角色', '身份'], ['变成']]
  ],
  widow: [
    [['look'], ['grimoire'], ['poison']],
    [['查看', '看'], ['魔典'], ['中毒', '下毒']]
  ],
  vigormortis: [
    [['each', 'night'], ['choose'], ['die'], ['minion', 'ability']],
    [['每夜'], ['选择'], ['死亡', '杀死'], ['爪牙', '能力']]
  ],
  fanggu: [
    [['each', 'night'], ['choose'], ['outsider'], ['fang', 'gu']],
    [['每夜'], ['选择'], ['外来者', '外来'], ['方古']]
  ],
  godfather: [
    [['start', 'know'], ['outsiders'], ['died'], ['choose']],
    [['首夜', '起始'], ['外来者', '外来'], ['死亡'], ['选择']]
  ],
  lunatic: [
    [['think'], ['demon'], ['not']],
    [['以为'], ['恶魔'], ['不是']]
  ],
  barista: [
    [['each', 'night'], ['ability'], ['works', 'twice']],
    [['每夜'], ['能力'], ['两次', '正常']]
  ],
  bonecollector: [
    [['dead'], ['player'], ['regain'], ['ability']],
    [['死亡', '已死'], ['玩家'], ['恢复', '重新获得'], ['能力']]
  ],
  harlot: [
    [['choose'], ['alive'], ['character'], ['die']],
    [['选择'], ['存活'], ['角色', '身份'], ['死亡']]
  ]
});

const UTF8_ROLE_ALIASES = Object.freeze({
  ravenkeeper: ['守鸦人'],
  undertaker: ['掘墓人'],
  scarletwoman: ['猩红女人'],
  imp: ['地狱恶犬'],
  slayer: ['刺客'],
  assassin: ['刺客'],
  virgin: ['贞女'],
  drunk: ['醉汉', '无赖']
});

const UTF8_ABILITY_KEYWORDS = Object.freeze({
  undertaker: [
    [['处决'], ['角色']]
  ],
  scarletwoman: [
    [['恶魔'], ['死亡'], ['成为']]
  ],
  imp: [
    [['选择'], ['死亡'], ['爪牙']]
  ],
  slayer: [
    [['白天', '公开', '一次'], ['选择'], ['恶魔'], ['死亡']]
  ],
  virgin: [
    [['首次', '第一次'], ['镇民'], ['提名'], ['死亡']]
  ],
  drunk: [
    [['以为', '认为'], ['能力', '实际'], ['失效']]
  ]
});

let cachedOfficialRoles = null;
let cachedNightSheet = null;
let cachedRegistry = null;

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

function getOfficialRoles() {
  if (!cachedOfficialRoles) {
    cachedOfficialRoles = readJson('data/runtime/official/normalized/official-roles.json').items || [];
  }
  return cachedOfficialRoles;
}

function getNightSheet() {
  if (!cachedNightSheet) {
    cachedNightSheet = readJson('data/runtime/official/normalized/official-nightsheet.json').item || {};
  }
  return cachedNightSheet;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[“”"「」『』]/g, '')
    .replace(/[\u3000\s]+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function normalizeLookupKey(value) {
  return normalizeText(value).replace(/\s+/g, '');
}

function normalizeRoleId(value) {
  const key = normalizeText(value).replace(/\s+/g, '-');
  const compact = key.replace(/-/g, '');
  return ROLE_ID_ALIASES[key] || ROLE_ID_ALIASES[compact] || compact || key || null;
}

function abilityFingerprint(value) {
  return normalizeLookupKey(value);
}

function tokenize(value) {
  return normalizeText(value)
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function addAlias(entry, value) {
  const alias = String(value || '').trim();
  if (!alias) return;
  entry.aliases.add(alias);
  entry.aliasKeys.add(normalizeLookupKey(alias));
}

function ensureEntry(entries, roleId) {
  const canonicalRoleId = normalizeRoleId(roleId);
  if (!canonicalRoleId) return null;
  if (!entries.has(canonicalRoleId)) {
    entries.set(canonicalRoleId, {
      roleId: canonicalRoleId,
      names: new Set(),
      aliases: new Set(),
      aliasKeys: new Set(),
      abilities: new Set(),
      abilityFingerprints: new Set(),
      teams: new Set(),
      sources: new Set()
    });
  }
  return entries.get(canonicalRoleId);
}

function addRoleData(entries, role, source) {
  const entry = ensureEntry(entries, role?.id || role?.roleId);
  if (!entry) return;
  for (const value of [role.id, role.roleId, role.name, role.nameEn]) {
    if (value) {
      entry.names.add(String(value));
      addAlias(entry, value);
    }
  }
  for (const alias of EXTRA_ROLE_ALIASES[entry.roleId] || []) addAlias(entry, alias);
  if (role.ability) {
    entry.abilities.add(String(role.ability));
    entry.abilityFingerprints.add(abilityFingerprint(role.ability));
  }
  if (role.team) entry.teams.add(String(role.team).toLowerCase());
  if (role.group) entry.teams.add(String(role.group).toLowerCase());
  if (source) entry.sources.add(source);
}

function buildRoleRegistry() {
  if (cachedRegistry) return cachedRegistry;
  const entries = new Map();
  for (const role of getOfficialRoles()) addRoleData(entries, role, 'official-roles');
  for (const script of getRuntimeScripts()) {
    for (const [group, roles] of Object.entries(script.characters || {})) {
      for (const role of roles || []) addRoleData(entries, { ...role, group }, `runtime-script:${script.id}`);
    }
  }
  for (const [roleId, aliases] of Object.entries(EXTRA_ROLE_ALIASES)) {
    const entry = ensureEntry(entries, roleId);
    if (!entry) continue;
    for (const alias of aliases) addAlias(entry, alias);
  }
  for (const [roleId, aliases] of Object.entries(UTF8_ROLE_ALIASES)) {
    const entry = ensureEntry(entries, roleId);
    if (!entry) continue;
    for (const alias of aliases) addAlias(entry, alias);
  }

  const roleTokenAliasRegistry = loadRoleTokenAliasRegistry();
  if (roleTokenAliasRegistry.state === 'READY') {
    for (const alias of roleTokenAliasRegistry.aliases) {
      const entry = ensureEntry(entries, alias.canonicalRoleId);
      if (!entry) continue;
      addAlias(entry, alias.aliasToken);
      addAlias(entry, alias.displayToken);
      entry.sources.add(`role-token-alias:${alias.aliasId}`);
    }
  }

  const aliasIndex = new Map();
  const abilityIndex = new Map();
  for (const entry of entries.values()) {
    for (const aliasKey of entry.aliasKeys) {
      if (!aliasIndex.has(aliasKey)) aliasIndex.set(aliasKey, new Set());
      aliasIndex.get(aliasKey).add(entry.roleId);
    }
    for (const fingerprint of entry.abilityFingerprints) {
      if (!fingerprint) continue;
      if (!abilityIndex.has(fingerprint)) abilityIndex.set(fingerprint, new Set());
      abilityIndex.get(fingerprint).add(entry.roleId);
    }
  }

  cachedRegistry = {
    entries,
    aliasIndex,
    abilityIndex,
    roleTokenAliasRegistry: {
      enabled: roleTokenAliasRegistry.enabled,
      state: roleTokenAliasRegistry.state,
      aliasCount: roleTokenAliasRegistry.aliases.length,
      failures: roleTokenAliasRegistry.failures,
      registryPath: roleTokenAliasRegistry.registryPath
    }
  };
  return cachedRegistry;
}

function getRoleTokenAliasRegistryStatus() {
  return buildRoleRegistry().roleTokenAliasRegistry;
}

function getEntryValues(entry) {
  return [
    entry?.id,
    entry?.roleId,
    entry?.characterId,
    entry?.name,
    entry?.nameEn,
    entry?.displayName,
    entry?.display?.name,
    entry?.display?.nameEn,
    entry?.metadata?.name,
    entry?.metadata?.nameEn
  ].filter(Boolean);
}

function getEntryAbility(entry) {
  return [
    entry?.ability,
    entry?.abilityText,
    entry?.description,
    entry?.display?.ability,
    entry?.display?.abilityText,
    entry?.metadata?.ability
  ].filter(Boolean).join(' ');
}

function getEntryTeam(entry) {
  return String(entry?.team || entry?.type || entry?.group || entry?.display?.team || '').toLowerCase();
}

function tokenOverlapScore(left, right) {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const ratio = shared / Math.max(leftTokens.size, rightTokens.size);
  if (ratio >= 0.85) return 45;
  if (ratio >= 0.65) return 32;
  if (ratio >= 0.45) return 18;
  return 0;
}

function keywordGroupMatches(text, group) {
  const normalized = normalizeText(text);
  return group.every((alternatives) => {
    return alternatives.some((alternative) => normalized.includes(normalizeText(alternative)));
  });
}

function keywordScore(roleId, abilityText) {
  const normalizedRoleId = normalizeRoleId(roleId);
  const groups = [
    ...(ABILITY_KEYWORDS[normalizedRoleId] || []),
    ...(UTF8_ABILITY_KEYWORDS[normalizedRoleId] || [])
  ];
  if (!abilityText || groups.length === 0) return 0;
  const matches = groups.filter((group) => keywordGroupMatches(abilityText, group)).length;
  if (matches >= 2) return 45;
  if (matches === 1) return 36;
  return 0;
}

function scoreCandidate({ candidate, inputValues, abilityText, team }) {
  const inputKeys = inputValues.map(normalizeLookupKey).filter(Boolean);
  const inputIds = inputValues.map(normalizeRoleId).filter(Boolean);
  let nameScore = 0;
  let abilityScore = 0;
  let teamScore = 0;
  const matchedBy = [];

  if (inputIds.includes(candidate.roleId)) {
    nameScore = Math.max(nameScore, 100);
    matchedBy.push('id');
  }
  if (inputKeys.some((key) => candidate.aliasKeys.has(key))) {
    nameScore = Math.max(nameScore, 90);
    matchedBy.push('alias');
  }
  if (nameScore < 90) {
    for (const inputKey of inputKeys) {
      for (const aliasKey of candidate.aliasKeys) {
        if (inputKey.length >= 3 && aliasKey.length >= 3 && (inputKey.includes(aliasKey) || aliasKey.includes(inputKey))) {
          nameScore = Math.max(nameScore, 42);
          matchedBy.push('partial-name');
        }
      }
    }
  }

  const inputAbilityFingerprint = abilityFingerprint(abilityText);
  if (inputAbilityFingerprint && candidate.abilityFingerprints.has(inputAbilityFingerprint)) {
    abilityScore = Math.max(abilityScore, 80);
    matchedBy.push('ability-exact');
  } else if (inputAbilityFingerprint) {
    for (const knownAbility of candidate.abilities) {
      const knownFingerprint = abilityFingerprint(knownAbility);
      if (
        knownFingerprint
        && (
          inputAbilityFingerprint.includes(knownFingerprint)
          || knownFingerprint.includes(inputAbilityFingerprint)
        )
      ) {
        abilityScore = Math.max(abilityScore, 58);
        matchedBy.push('ability-contained');
      }
      abilityScore = Math.max(abilityScore, tokenOverlapScore(abilityText, knownAbility));
    }
  }
  const keyword = keywordScore(candidate.roleId, abilityText);
  if (keyword > 0) {
    abilityScore = Math.max(abilityScore, keyword);
    matchedBy.push('ability-keywords');
  }

  if (team && candidate.teams.has(team)) {
    teamScore = 8;
    matchedBy.push('team');
  }

  return {
    roleId: candidate.roleId,
    score: nameScore + abilityScore + teamScore,
    nameScore,
    abilityScore,
    teamScore,
    matchedBy: [...new Set(matchedBy)]
  };
}

function classifyMatch(scored) {
  if (!scored || scored.score <= 0) return 'none';
  if (scored.nameScore >= 100) return 'exact-id';
  if (scored.nameScore >= 90 && scored.abilityScore >= 30) return 'name-and-ability';
  if (scored.nameScore >= 90) return 'exact-name';
  if (scored.abilityScore >= 80 && scored.teamScore > 0) return 'exact-ability-and-team';
  if (scored.nameScore >= 40 && scored.abilityScore >= 30) return 'probable-name-and-ability';
  if (scored.abilityScore >= 45 && scored.teamScore > 0) return 'probable-ability-and-team';
  return 'low-confidence';
}

function matchRoleEntryFromJson(entry) {
  const registry = buildRoleRegistry();
  const inputValues = getEntryValues(entry);
  const abilityText = getEntryAbility(entry);
  const team = getEntryTeam(entry);
  const candidates = [...registry.entries.values()]
    .map((candidate) => scoreCandidate({ candidate, inputValues, abilityText, team }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  const best = candidates[0] || null;
  const second = candidates[1] || null;
  const confidence = classifyMatch(best);
  const ambiguous = Boolean(
    best
    && second
    && best.nameScore < 100
    && best.score - second.score < 12
  );
  const requiresReview = ambiguous || ['none', 'low-confidence', 'probable-name-and-ability', 'probable-ability-and-team'].includes(confidence);

  if (!best || confidence === 'none') {
    return {
      roleId: null,
      confidence: 'none',
      score: 0,
      matchedBy: [],
      requiresReview: true,
      warnings: ['role-registry-unmatched'],
      candidates
    };
  }

  return {
    roleId: best.roleId,
    confidence: ambiguous ? 'ambiguous' : confidence,
    score: best.score,
    matchedBy: best.matchedBy,
    requiresReview,
    warnings: ambiguous ? ['role-registry-ambiguous'] : [],
    candidates
  };
}

function collectScriptEntries(input) {
  return Array.isArray(input)
    ? input
    : (Array.isArray(input?.entries) ? input.entries : (Array.isArray(input?.item?.entries) ? input.item.entries : []));
}

function matchScriptEntriesFromJson(input) {
  const entries = collectScriptEntries(input);
  const matches = entries
    .filter((entry) => {
      const id = typeof entry === 'string' ? entry : (entry?.id || entry?.roleId || entry?.name || entry?.display?.name);
      return id && normalizeLookupKey(id) !== 'meta';
    })
    .map((entry, index) => {
      const match = matchRoleEntryFromJson(typeof entry === 'string' ? { id: entry } : entry);
      return {
        index,
        sourceId: typeof entry === 'string' ? entry : (entry.id || entry.roleId || entry.name || entry.display?.name || null),
        ...match
      };
    });
  return {
    matches,
    roleIds: matches.filter((match) => match.roleId && !match.requiresReview).map((match) => match.roleId),
    reviewRequired: matches.filter((match) => match.requiresReview),
    unmatched: matches.filter((match) => !match.roleId)
  };
}

function buildOfficialNightOrderForRoleIds(roleIds) {
  const normalizedRoleIds = new Set(roleIds.map(normalizeRoleId).filter(Boolean));
  const nightSheet = getNightSheet();
  const first = (nightSheet.firstNight || []).filter((roleId) => normalizedRoleIds.has(normalizeRoleId(roleId)));
  const other = (nightSheet.otherNight || []).filter((roleId) => normalizedRoleIds.has(normalizeRoleId(roleId)));
  return { first, other };
}

module.exports = {
  buildOfficialNightOrderForRoleIds,
  buildRoleRegistry,
  getRoleTokenAliasRegistryStatus,
  matchRoleEntryFromJson,
  matchScriptEntriesFromJson,
  normalizeLookupKey,
  normalizeRoleId
};
