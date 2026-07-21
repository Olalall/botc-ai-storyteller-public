const { buildRoleCatalog, getScriptById } = require('../ScriptCatalog');
const {
  buildOfficialNightOrderForRoleIds,
  matchRoleEntryFromJson,
  matchScriptEntriesFromJson,
  normalizeRoleId: normalizeRegistryRoleId
} = require('./RoleRegistry');

const SCRIPT_ALIASES = Object.freeze({
  'trouble-brewing': 'trouble-brewing',
  troublebrewing: 'trouble-brewing',
  tb: 'trouble-brewing',
  '暗流涌动': 'trouble-brewing',
  'bad-moon-rising': 'bad-moon-rising',
  badmoonrising: 'bad-moon-rising',
  bmr: 'bad-moon-rising',
  '黯月初升': 'bad-moon-rising',
  '血月升起': 'bad-moon-rising',
  'sects-and-violets': 'sects-and-violets',
  sectsandviolets: 'sects-and-violets',
  snv: 'sects-and-violets',
  '梦殒春宵': 'sects-and-violets',
  catfishing: 'catfishing',
  'catfishing/瓦釜雷鸣': 'catfishing',
  'catfishing / 瓦釜雷鸣': 'catfishing',
  '瓦釜雷鸣': 'catfishing',
  '鲶鱼': 'catfishing',
  '沽名钓誉': 'catfishing',
  'trust-issues-plus': 'trust-issues-plus',
  trustissuesplus: 'trust-issues-plus',
  'trust-issues+': 'trust-issues-plus',
  '信念解离+': 'trust-issues-plus',
  '信念解离': 'trust-issues-plus',
  'wrath-of-storyteller': 'wrath-of-storyteller',
  wrathofstoryteller: 'wrath-of-storyteller',
  '说书人之怒': 'wrath-of-storyteller',
  'outed-evil': 'outed-evil',
  outedevil: 'outed-evil',
  '横行霸道': 'outed-evil',
  'to-cast-large-shadow': 'to-cast-large-shadow',
  tocastlargeshadow: 'to-cast-large-shadow',
  '只手遮天': 'to-cast-large-shadow',
  'hero-vs-dragon': 'hero-vs-dragon',
  herovsdragon: 'hero-vs-dragon',
  '勇者斗恶龙': 'hero-vs-dragon'
});

const ROLE_ALIASES = Object.freeze({
  fortuneteller: 'fortuneteller',
  'fortune-teller': 'fortune-teller',
  scarletwoman: 'scarlet-woman',
  scarlet_woman: 'scarlet-woman',
  pithag: 'pithag',
  'pit-hag': 'pithag'
});

const TEAM_ALIGNMENT = Object.freeze({
  townsfolk: 'good',
  outsiders: 'good',
  outsider: 'good',
  minions: 'evil',
  minion: 'evil',
  demons: 'evil',
  demon: 'evil',
  travellers: 'traveller',
  traveller: 'traveller'
});

const DEMON_ROLE_IDS = new Set(['imp', 'pukka', 'shabaloth', 'po', 'zombuul', 'vigormortis', 'fanggu', 'nodashii', 'vortox']);
const MINION_ROLE_IDS = new Set([
  'poisoner',
  'spy',
  'scarlet-woman',
  'scarletwoman',
  'baron',
  'godfather',
  'devilsadvocate',
  'assassin',
  'mastermind',
  'cerenovus',
  'pithag',
  'widow',
  'devilsadvocate',
  'assassin',
  'mastermind',
  'witch',
  'eviltwin',
  'vigormortis'
]);
const TOWNSFOLK_ROLE_IDS = new Set([
  'chef',
  'investigator',
  'washerwoman',
  'librarian',
  'empath',
  'fortune-teller',
  'fortuneteller',
  'undertaker',
  'monk',
  'slayer',
  'soldier',
  'ravenkeeper',
  'mayor',
  'virgin',
  'grandmother',
  'sailor',
  'chambermaid',
  'innkeeper',
  'balloonist',
  'dreamer',
  'gambler',
  'exorcist',
  'gossip',
  'courtier',
  'professor',
  'minstrel',
  'tealady',
  'fool',
  'pacifist',
  'clockmaker',
  'mathematician',
  'flowergirl',
  'towncrier',
  'oracle',
  'seamstress',
  'artist',
  'juggler',
  'sage',
  'snakecharmer',
  'savant',
  'philosopher',
  'amnesiac',
  'cannibal'
]);

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[()]/g, '');
}

function normalizeScriptId(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const direct = SCRIPT_ALIASES[raw];
  if (direct) return direct;
  const normalized = normalizeKey(raw);
  return SCRIPT_ALIASES[normalized] || SCRIPT_ALIASES[normalized.replace(/-/g, '')] || null;
}

function normalizeRoleId(value) {
  const normalized = normalizeKey(value);
  return ROLE_ALIASES[normalized] || normalized;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePromptCopyText(value, fallback) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text || text === '[object Object]' || /\?{3,}/.test(text) || /^[?？\s/-]+$/.test(text)) return fallback;
  return text;
}

function fallbackPromptCopy(promptKind) {
  if (promptKind === 'auto_info') {
    return {
      title: '夜晚信息',
      body: '本角色夜晚无需玩家选择；系统只准备待说书人确认的私密信息记录。'
    };
  }
  if (promptKind === 'select_2') {
    return {
      title: '选择两名玩家',
      body: '请选择 2 名玩家；最终结果只作为候选，必须由说书人确认。'
    };
  }
  if (promptKind === 'select_3') {
    return {
      title: '选择三名玩家',
      body: '请选择 3 名玩家；最终结果只作为候选，必须由说书人确认。'
    };
  }
  if (promptKind === 'select_role') {
    return {
      title: '选择角色',
      body: '请选择 1 个角色；最终结果只作为候选，必须由说书人确认。'
    };
  }
  if (promptKind === 'select_player_role') {
    return {
      title: '选择玩家和角色',
      body: '请选择 1 名玩家和 1 个角色；最终结果只作为候选，必须由说书人确认。'
    };
  }
  return {
    title: '选择一名玩家',
    body: '请选择 1 名玩家；最终结果只作为候选，必须由说书人确认。'
  };
}

function prompt(promptKind, targetRules, title, body, extra = {}) {
  const fallback = fallbackPromptCopy(promptKind);
  const passivePrompt = promptKind === 'auto_info';
  return {
    promptKind,
    required: extra.required !== false,
    autoSubmit: extra.autoSubmit === true,
    targetRules,
    roleRules: extra.roleRules || null,
    copy: {
      title: normalizePromptCopyText(title, fallback.title),
      body: normalizePromptCopyText(body, fallback.body),
      submitLabel: passivePrompt ? null : (extra.submitLabel === undefined ? '提交选择' : extra.submitLabel),
      withdrawLabel: passivePrompt ? null : (extra.withdrawLabel === undefined ? '撤回选择' : extra.withdrawLabel)
    }
  };
}

function autoInfo(title, body) {
  return prompt('auto_info', { count: 0 }, title, body, {
    required: false,
    autoSubmit: true,
    submitLabel: null,
    withdrawLabel: null
  });
}

function selectOne(title, body, targetRules = {}) {
  return prompt('select_1', {
    count: 1,
    allowSelf: targetRules.allowSelf !== false,
    allowDead: targetRules.allowDead !== false,
    mustBeDistinct: true,
    ...targetRules
  }, title, body);
}

function selectTwo(title, body, targetRules = {}) {
  return prompt('select_2', {
    count: 2,
    allowSelf: targetRules.allowSelf !== false,
    allowDead: targetRules.allowDead !== false,
    mustBeDistinct: true,
    ...targetRules
  }, title, body);
}

function selectThree(title, body, targetRules = {}) {
  return prompt('select_3', {
    count: 3,
    allowSelf: targetRules.allowSelf !== false,
    allowDead: targetRules.allowDead !== false,
    mustBeDistinct: true,
    ...targetRules
  }, title, body);
}

function selectRole(title, body, roleRules = {}) {
  return prompt('select_role', { count: 0 }, title, body, { roleRules });
}

function selectPlayerRole(title, body, targetRules = {}, roleRules = {}) {
  return prompt('select_player_role', {
    count: 1,
    allowSelf: targetRules.allowSelf !== false,
    allowDead: targetRules.allowDead !== false,
    mustBeDistinct: true,
    ...targetRules
  }, title, body, { roleRules });
}

const RULES = Object.freeze({
  chef: {
    roleId: 'chef',
    phases: ['firstNight'],
    firstNight: autoInfo('', ''),
    resolution: 'chef-evil-neighbor-pairs',
    automation: 'deterministic-info'
  },
  investigator: {
    roleId: 'investigator',
    phases: ['firstNight'],
    firstNight: autoInfo('', ''),
    resolution: 'learn-two-and-role',
    learnTeam: 'minion',
    automation: 'storyteller-ai-info'
  },
  washerwoman: {
    roleId: 'washerwoman',
    phases: ['firstNight'],
    firstNight: autoInfo('', ''),
    resolution: 'learn-two-and-role',
    learnTeam: 'townsfolk',
    automation: 'storyteller-ai-info'
  },
  librarian: {
    roleId: 'librarian',
    phases: ['firstNight'],
    firstNight: autoInfo('', ''),
    resolution: 'learn-two-and-role',
    learnTeam: 'outsider',
    automation: 'storyteller-ai-info'
  },
  empath: {
    roleId: 'empath',
    phases: ['firstNight', 'otherNight'],
    firstNight: autoInfo('', ''),
    otherNight: autoInfo('', ''),
    resolution: 'empath-evil-neighbors',
    automation: 'deterministic-info'
  },
  butler: {
    roleId: 'butler',
    phases: ['firstNight'],
    firstNight: selectOne('', '', { allowSelf: false, allowDead: false }),
    resolution: 'butler-master',
    automation: 'state-marker'
  },
  'fortune-teller': {
    roleId: 'fortune-teller',
    phases: ['firstNight', 'otherNight'],
    firstNight: selectTwo('', ''),
    otherNight: selectTwo('', ''),
    resolution: 'fortune-teller-demon-check',
    automation: 'deterministic-info-with-registration'
  },
  fortuneteller: {
    roleId: 'fortuneteller',
    phases: ['firstNight', 'otherNight'],
    firstNight: selectTwo('', ''),
    otherNight: selectTwo('', ''),
    resolution: 'fortune-teller-demon-check',
    automation: 'deterministic-info-with-registration'
  },
  spy: {
    roleId: 'spy',
    phases: ['firstNight', 'otherNight'],
    firstNight: autoInfo('', ''),
    otherNight: autoInfo('', ''),
    resolution: 'grimoire-info',
    automation: 'storyteller-ai-info'
  },
  poisoner: {
    roleId: 'poisoner',
    phases: ['firstNight', 'otherNight'],
    firstNight: selectOne('', ''),
    otherNight: selectOne('', ''),
    resolution: 'poison-target',
    automation: 'state-change'
  },
  monk: {
    roleId: 'monk',
    phases: ['otherNight'],
    otherNight: selectOne('', '', { allowSelf: false }),
    resolution: 'protect-target',
    automation: 'state-change'
  },
  undertaker: {
    roleId: 'undertaker',
    phases: ['otherNight'],
    otherNight: autoInfo('', ''),
    resolution: 'undertaker-executed-role',
    automation: 'deterministic-info'
  },
  ravenkeeper: {
    roleId: 'ravenkeeper',
    phases: ['deathNight'],
    otherNight: selectOne('', ''),
    resolution: 'learn-target-role',
    automation: 'death-trigger-info'
  },
  imp: {
    roleId: 'imp',
    phases: ['otherNight'],
    otherNight: selectOne('', ''),
    resolution: 'demon-kill',
    automation: 'state-change'
  },
  'scarlet-woman': {
    roleId: 'scarlet-woman',
    phases: ['deathTrigger'],
    resolution: 'scarlet-woman-demon-transfer',
    automation: 'death-trigger-state'
  },
  scarletwoman: {
    roleId: 'scarletwoman',
    phases: ['deathTrigger'],
    resolution: 'scarlet-woman-demon-transfer',
    automation: 'death-trigger-state'
  },
  baron: {
    roleId: 'baron',
    phases: ['setup'],
    resolution: 'setup-outsider-count',
    automation: 'setup-state'
  },
  drunk: {
    roleId: 'drunk',
    phases: ['setup', 'passive'],
    resolution: 'hidden-role-passive',
    automation: 'setup-passive'
  },
  recluse: {
    roleId: 'recluse',
    phases: ['registration'],
    resolution: 'false-registration',
    automation: 'storyteller-ai-registration'
  },
  soldier: {
    roleId: 'soldier',
    phases: ['deathPrevention'],
    resolution: 'demon-kill-immune',
    automation: 'state-prevention'
  },
  slayer: {
    roleId: 'slayer',
    phases: ['day'],
    day: selectOne('', '', { allowDead: false }),
    resolution: 'day-demon-shot',
    automation: 'day-state-change'
  },
  virgin: {
    roleId: 'virgin',
    phases: ['nominationTrigger'],
    resolution: 'virgin-nominator-execution',
    automation: 'day-trigger-state'
  },
  mayor: {
    roleId: 'mayor',
    phases: ['gameEnd', 'deathPrevention'],
    resolution: 'mayor-win-or-bounce',
    automation: 'game-end-and-death-prevention'
  },
  saint: {
    roleId: 'saint',
    phases: ['executionGameEnd'],
    resolution: 'saint-executed-evil-win',
    automation: 'game-end'
  },
  grandmother: {
    roleId: 'grandmother',
    phases: ['firstNight', 'deathTrigger'],
    firstNight: autoInfo('', ''),
    resolution: 'grandmother-grandchild',
    automation: 'storyteller-ai-info-and-death-trigger'
  },
  balloonist: {
    roleId: 'balloonist',
    phases: ['firstNight', 'otherNight'],
    firstNight: autoInfo('', ''),
    otherNight: autoInfo('', ''),
    resolution: 'balloonist-type-info',
    automation: 'storyteller-ai-info'
  },
  dreamer: {
    roleId: 'dreamer',
    phases: ['firstNight', 'otherNight'],
    firstNight: selectOne('', '', { allowSelf: false }),
    otherNight: selectOne('', '', { allowSelf: false }),
    resolution: 'dreamer-two-characters',
    automation: 'storyteller-ai-info'
  },
  snakecharmer: {
    roleId: 'snakecharmer',
    phases: ['firstNight', 'otherNight'],
    firstNight: selectOne('', ''),
    otherNight: selectOne('', ''),
    resolution: 'snakecharmer-swap',
    automation: 'state-change'
  },
  gambler: {
    roleId: 'gambler',
    phases: ['otherNight'],
    otherNight: selectPlayerRole('', ''),
    resolution: 'gambler-guess',
    automation: 'state-change'
  },
  savant: {
    roleId: 'savant',
    phases: ['day'],
    resolution: 'savant-two-statements',
    automation: 'storyteller-ai-day-info'
  },
  philosopher: {
    roleId: 'philosopher',
    phases: ['firstNight', 'otherNight'],
    firstNight: selectRole('', '', { alignment: 'good' }),
    otherNight: selectRole('', '', { alignment: 'good' }),
    resolution: 'philosopher-gain-ability',
    automation: 'state-change'
  },
  amnesiac: {
    roleId: 'amnesiac',
    phases: ['day'],
    resolution: 'amnesiac-private-guess',
    automation: 'storyteller-ai-day-info'
  },
  cannibal: {
    roleId: 'cannibal',
    phases: ['executionTrigger', 'passive'],
    resolution: 'cannibal-executee-ability',
    automation: 'execution-trigger-state'
  },
  sweetheart: {
    roleId: 'sweetheart',
    phases: ['deathTrigger'],
    resolution: 'sweetheart-drunk-player',
    automation: 'death-trigger-state'
  },
  mutant: {
    roleId: 'mutant',
    phases: ['day'],
    resolution: 'mutant-madness-execution',
    automation: 'storyteller-ai-day-trigger'
  },
  lunatic: {
    roleId: 'lunatic',
    phases: ['firstNight', 'otherNight'],
    firstNight: autoInfo('', ''),
    otherNight: selectOne('', ''),
    resolution: 'lunatic-demon-decoy',
    automation: 'storyteller-ai-info'
  },
  godfather: {
    roleId: 'godfather',
    phases: ['firstNight', 'otherNight'],
    firstNight: autoInfo('', ''),
    otherNight: selectOne('', ''),
    resolution: 'godfather-outsider-death-kill',
    automation: 'state-change'
  },
  cerenovus: {
    roleId: 'cerenovus',
    phases: ['firstNight', 'otherNight'],
    firstNight: selectPlayerRole('', '', {}, { alignment: 'good' }),
    otherNight: selectPlayerRole('', '', {}, { alignment: 'good' }),
    resolution: 'cerenovus-madness',
    automation: 'day-marker'
  },
  pithag: {
    roleId: 'pithag',
    phases: ['otherNight'],
    otherNight: selectPlayerRole('', ''),
    resolution: 'pithag-character-change',
    automation: 'state-change'
  },
  widow: {
    roleId: 'widow',
    phases: ['firstNight'],
    firstNight: selectOne('', ''),
    resolution: 'widow-poison-and-warning',
    automation: 'state-change'
  },
  vigormortis: {
    roleId: 'vigormortis',
    phases: ['otherNight'],
    otherNight: selectOne('', ''),
    resolution: 'demon-kill-vigormortis',
    automation: 'state-change'
  },
  fanggu: {
    roleId: 'fanggu',
    phases: ['otherNight'],
    otherNight: selectOne('', ''),
    resolution: 'demon-kill-fanggu',
    automation: 'state-change'
  },
  apprentice: {
    roleId: 'apprentice',
    phases: ['firstNight'],
    firstNight: autoInfo('', ''),
    resolution: 'apprentice-gain-ability',
    automation: 'storyteller-ai-info'
  },
  barista: {
    roleId: 'barista',
    phases: ['firstNight', 'otherNight'],
    firstNight: selectOne('', ''),
    otherNight: selectOne('', ''),
    resolution: 'barista-mode',
    automation: 'storyteller-ai-state'
  },
  beggar: {
    roleId: 'beggar',
    phases: ['votePassive'],
    resolution: 'beggar-vote-token',
    automation: 'vote-passive'
  },
  bonecollector: {
    roleId: 'bonecollector',
    phases: ['otherNight'],
    otherNight: selectOne('', '', { allowDead: true, mustBeDead: true }),
    resolution: 'bonecollector-restore-ability',
    automation: 'state-change'
  },
  harlot: {
    roleId: 'harlot',
    phases: ['otherNight'],
    otherNight: selectOne('', ''),
    resolution: 'harlot-character-info',
    automation: 'storyteller-ai-info-and-death-risk'
  },
  sailor: {
    roleId: 'sailor',
    phases: ['firstNight', 'otherNight'],
    firstNight: selectOne('', ''),
    otherNight: selectOne('', ''),
    resolution: 'sailor-drunk-check',
    automation: 'storyteller-confirmed-state'
  },
  chambermaid: {
    roleId: 'chambermaid',
    phases: ['firstNight', 'otherNight'],
    firstNight: selectTwo('', '', { allowSelf: false, allowDead: false }),
    otherNight: selectTwo('', '', { allowSelf: false, allowDead: false }),
    resolution: 'chambermaid-woke-count',
    automation: 'deterministic-info-with-storyteller-review'
  },
  innkeeper: {
    roleId: 'innkeeper',
    phases: ['otherNight'],
    otherNight: selectTwo('', ''),
    resolution: 'innkeeper-protect-and-drunk',
    automation: 'state-change'
  },
  exorcist: {
    roleId: 'exorcist',
    phases: ['otherNight'],
    otherNight: selectOne('', ''),
    resolution: 'exorcist-block-demon',
    automation: 'state-prevention-and-private-info'
  },
  gossip: {
    roleId: 'gossip',
    phases: ['day', 'otherNight'],
    otherNight: autoInfo('', ''),
    resolution: 'gossip-statement-death',
    automation: 'storyteller-confirmed-state'
  },
  courtier: {
    roleId: 'courtier',
    phases: ['firstNight', 'otherNight'],
    firstNight: selectRole('', ''),
    otherNight: selectRole('', ''),
    resolution: 'courtier-drunk-role',
    automation: 'state-marker'
  },
  professor: {
    roleId: 'professor',
    phases: ['otherNight'],
    otherNight: selectOne('', '', { allowDead: true, mustBeDead: true }),
    resolution: 'professor-resurrect',
    automation: 'state-change'
  },
  minstrel: {
    roleId: 'minstrel',
    phases: ['executionTrigger', 'passive'],
    resolution: 'minstrel-minion-execution-drunk',
    automation: 'execution-trigger-state'
  },
  tealady: {
    roleId: 'tealady',
    phases: ['deathPrevention', 'passive'],
    resolution: 'tea-lady-neighbor-protection',
    automation: 'state-prevention'
  },
  fool: {
    roleId: 'fool',
    phases: ['deathPrevention', 'passive'],
    resolution: 'fool-first-death-prevention',
    automation: 'state-prevention'
  },
  pacifist: {
    roleId: 'pacifist',
    phases: ['executionPrevention', 'passive'],
    resolution: 'pacifist-good-execution-prevention',
    automation: 'storyteller-confirmed-prevention'
  },
  goon: {
    roleId: 'goon',
    phases: ['registration', 'alignmentChange', 'passive'],
    resolution: 'goon-drunk-and-alignment-change',
    automation: 'target-trigger-state'
  },
  tinker: {
    roleId: 'tinker',
    phases: ['deathTrigger', 'otherNight'],
    otherNight: autoInfo('', ''),
    resolution: 'tinker-storyteller-death',
    automation: 'storyteller-confirmed-state'
  },
  moonchild: {
    roleId: 'moonchild',
    phases: ['deathNight', 'otherNight'],
    otherNight: selectOne('', '', { allowDead: false }),
    resolution: 'moonchild-death-choice',
    automation: 'death-trigger-state'
  },
  devilsadvocate: {
    roleId: 'devilsadvocate',
    phases: ['firstNight', 'otherNight'],
    firstNight: selectOne('', '', { allowDead: false }),
    otherNight: selectOne('', '', { allowDead: false }),
    resolution: 'devils-advocate-execution-protection',
    automation: 'state-marker'
  },
  assassin: {
    roleId: 'assassin',
    phases: ['otherNight'],
    otherNight: selectOne('', ''),
    resolution: 'assassin-kill',
    automation: 'state-change'
  },
  mastermind: {
    roleId: 'mastermind',
    phases: ['gameEndTrigger', 'passive'],
    resolution: 'mastermind-extra-day',
    automation: 'game-end-delay'
  },
  pukka: {
    roleId: 'pukka',
    phases: ['firstNight', 'otherNight'],
    firstNight: selectOne('', ''),
    otherNight: selectOne('', ''),
    resolution: 'pukka-poison-and-kill',
    automation: 'state-change'
  },
  shabaloth: {
    roleId: 'shabaloth',
    phases: ['otherNight'],
    otherNight: selectTwo('', ''),
    resolution: 'shabaloth-kill-and-regurgitate',
    automation: 'state-change'
  },
  po: {
    roleId: 'po',
    phases: ['otherNight'],
    otherNight: selectThree('', ''),
    resolution: 'po-charge-or-kill-three',
    automation: 'storyteller-confirmed-state'
  },
  zombuul: {
    roleId: 'zombuul',
    phases: ['otherNight', 'passive'],
    otherNight: selectOne('', ''),
    resolution: 'zombuul-conditional-kill',
    automation: 'state-change'
  },
  matron: {
    roleId: 'matron',
    phases: ['traveller', 'day'],
    resolution: 'matron-seat-management',
    automation: 'storyteller-confirmed-traveller-rule'
  },
  judge: {
    roleId: 'judge',
    phases: ['traveller', 'vote'],
    resolution: 'judge-vote-modifier',
    automation: 'storyteller-confirmed-vote-rule'
  },
  bishop: {
    roleId: 'bishop',
    phases: ['traveller', 'nomination'],
    resolution: 'bishop-storyteller-nomination',
    automation: 'storyteller-confirmed-nomination-rule'
  },
  voudon: {
    roleId: 'voudon',
    phases: ['traveller', 'votePassive'],
    resolution: 'voudon-dead-vote-rule',
    automation: 'storyteller-confirmed-vote-rule'
  },
  clockmaker: {
    roleId: 'clockmaker',
    phases: ['firstNight'],
    firstNight: autoInfo('', ''),
    resolution: 'clockmaker-demon-minion-distance',
    automation: 'deterministic-info'
  },
  mathematician: {
    roleId: 'mathematician',
    phases: ['firstNight', 'otherNight'],
    firstNight: autoInfo('', ''),
    otherNight: autoInfo('', ''),
    resolution: 'mathematician-abnormal-ability-count',
    automation: 'deterministic-info-with-storyteller-review'
  },
  flowergirl: {
    roleId: 'flowergirl',
    phases: ['otherNight'],
    otherNight: autoInfo('', ''),
    resolution: 'flowergirl-demon-voted',
    automation: 'deterministic-info'
  },
  towncrier: {
    roleId: 'towncrier',
    phases: ['otherNight'],
    otherNight: autoInfo('', ''),
    resolution: 'town-crier-minion-nominated',
    automation: 'deterministic-info'
  },
  oracle: {
    roleId: 'oracle',
    phases: ['otherNight'],
    otherNight: autoInfo('', ''),
    resolution: 'oracle-dead-evil-count',
    automation: 'deterministic-info'
  },
  seamstress: {
    roleId: 'seamstress',
    phases: ['firstNight', 'otherNight'],
    firstNight: selectTwo('', '', { allowSelf: false }),
    otherNight: selectTwo('', '', { allowSelf: false }),
    resolution: 'seamstress-same-alignment',
    automation: 'deterministic-info-with-registration'
  },
  artist: {
    roleId: 'artist',
    phases: ['day'],
    resolution: 'artist-private-yes-no-question',
    automation: 'storyteller-ai-day-info'
  },
  juggler: {
    roleId: 'juggler',
    phases: ['day', 'otherNight'],
    otherNight: autoInfo('', ''),
    resolution: 'juggler-correct-guess-count',
    automation: 'deterministic-info-with-storyteller-review'
  },
  sage: {
    roleId: 'sage',
    phases: ['deathNight', 'otherNight'],
    otherNight: autoInfo('', ''),
    resolution: 'sage-two-demon-candidates',
    automation: 'death-trigger-info'
  },
  klutz: {
    roleId: 'klutz',
    phases: ['deathTrigger', 'gameEnd'],
    resolution: 'klutz-death-choice-game-end',
    automation: 'death-trigger-game-end'
  },
  barber: {
    roleId: 'barber',
    phases: ['deathTrigger', 'otherNight'],
    otherNight: autoInfo('', ''),
    resolution: 'barber-demon-character-swap',
    automation: 'death-trigger-state'
  },
  witch: {
    roleId: 'witch',
    phases: ['firstNight', 'otherNight', 'nominationTrigger'],
    firstNight: selectOne('', ''),
    otherNight: selectOne('', ''),
    resolution: 'witch-curse-nomination-death',
    automation: 'state-marker-and-day-trigger'
  },
  eviltwin: {
    roleId: 'eviltwin',
    phases: ['firstNight', 'gameEnd', 'executionTrigger'],
    firstNight: autoInfo('', ''),
    resolution: 'evil-twin-pair-and-win-condition',
    automation: 'setup-info-and-game-end'
  },
  nodashii: {
    roleId: 'nodashii',
    phases: ['otherNight', 'passive'],
    otherNight: selectOne('', ''),
    resolution: 'nodashii-kill-and-neighbor-poison',
    automation: 'state-change'
  },
  vortox: {
    roleId: 'vortox',
    phases: ['otherNight', 'gameEnd', 'registration'],
    otherNight: selectOne('', ''),
    resolution: 'vortox-kill-and-false-info',
    automation: 'state-change-and-game-end'
  },
  butcher: {
    roleId: 'butcher',
    phases: ['traveller', 'nomination'],
    resolution: 'butcher-extra-nomination',
    automation: 'storyteller-confirmed-nomination-rule'
  },
  deviant: {
    roleId: 'deviant',
    phases: ['traveller', 'exilePrevention'],
    resolution: 'deviant-funny-exile-prevention',
    automation: 'storyteller-confirmed-traveller-rule'
  }
});

const SCRIPT_NIGHT_ORDER = Object.freeze({
  'trouble-brewing': {
    first: ['poisoner', 'washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'butler', 'fortune-teller', 'spy'],
    other: ['poisoner', 'monk', 'imp', 'ravenkeeper', 'undertaker', 'empath', 'fortune-teller', 'spy']
  },
  'bad-moon-rising': {
    first: ['apprentice', 'lunatic', 'sailor', 'courtier', 'godfather', 'devilsadvocate', 'pukka', 'grandmother', 'chambermaid'],
    other: [
      'sailor',
      'courtier',
      'innkeeper',
      'gambler',
      'devilsadvocate',
      'lunatic',
      'exorcist',
      'zombuul',
      'pukka',
      'shabaloth',
      'po',
      'assassin',
      'godfather',
      'gossip',
      'professor',
      'tinker',
      'moonchild',
      'grandmother',
      'chambermaid'
    ]
  },
  'sects-and-violets': {
    first: [
      'barista',
      'philosopher',
      'snakecharmer',
      'eviltwin',
      'witch',
      'cerenovus',
      'clockmaker',
      'dreamer',
      'seamstress',
      'mathematician'
    ],
    other: [
      'barista',
      'harlot',
      'bonecollector',
      'philosopher',
      'snakecharmer',
      'witch',
      'cerenovus',
      'pithag',
      'fanggu',
      'nodashii',
      'vortox',
      'vigormortis',
      'barber',
      'sweetheart',
      'sage',
      'dreamer',
      'flowergirl',
      'towncrier',
      'oracle',
      'seamstress',
      'juggler',
      'mathematician'
    ]
  },
  catfishing: {
    first: [
      'investigator',
      'chef',
      'grandmother',
      'balloonist',
      'dreamer',
      'fortuneteller',
      'snakecharmer',
      'philosopher',
      'widow',
      'godfather',
      'cerenovus',
      'lunatic',
      'apprentice',
      'barista'
    ],
    other: [
      'balloonist',
      'dreamer',
      'fortuneteller',
      'snakecharmer',
      'gambler',
      'philosopher',
      'godfather',
      'cerenovus',
      'pithag',
      'imp',
      'vigormortis',
      'fanggu',
      'lunatic',
      'barista',
      'bonecollector',
      'harlot'
    ]
  }
});

function getRule(roleId) {
  return RULES[normalizeRoleId(roleId)] || null;
}

function getAutomationRoleIds() {
  return Object.keys(RULES);
}

function getNightOrderForScript(scriptId, isFirstNight) {
  const normalizedScriptId = normalizeScriptId(scriptId) || scriptId;
  const order = SCRIPT_NIGHT_ORDER[normalizedScriptId];
  if (!order) return [];
  return [...(isFirstNight ? order.first : order.other)].filter((roleId) => {
    const rule = getRule(roleId);
    return Boolean(rule && (isFirstNight ? rule.firstNight : rule.otherNight));
  });
}

function getPromptDefinitionForRole(roleId, isFirstNight) {
  const rule = getRule(roleId);
  if (!rule) return null;
  const definition = isFirstNight ? rule.firstNight : rule.otherNight;
  return definition ? clone(definition) : null;
}

function getRoleDisplayName(roleId) {
  const rule = getRule(roleId);
  if (!rule) return roleId;
  return rule.roleId;
}

function getAlignmentForPlayer(player) {
  const team = normalizeKey(player?.trueTeam || player?.realTeam || player?.team || player?.roleType || '');
  if (TEAM_ALIGNMENT[team]) return TEAM_ALIGNMENT[team];
  const roleId = normalizeRoleId(player?.trueRoleId || player?.realRoleId || player?.roleId || player?.role || player?.shownRoleId);
  if (DEMON_ROLE_IDS.has(roleId) || MINION_ROLE_IDS.has(roleId)) return 'evil';
  if (TOWNSFOLK_ROLE_IDS.has(roleId) || ['drunk', 'recluse', 'saint', 'butler', 'sweetheart', 'mutant', 'lunatic', 'klutz', 'barber', 'goon'].includes(roleId)) return 'good';
  return 'unknown';
}

function roleTeamFromCatalog(role) {
  return role?.group || role?.team || role?.type || null;
}

function buildScriptRuleAutomationProfile(scriptId) {
  const normalizedScriptId = normalizeScriptId(scriptId) || scriptId;
  const script = getScriptById(normalizedScriptId);
  if (!script) {
    return {
      scriptId: normalizedScriptId,
      status: 'NO-GO',
      reason: 'unknown-script',
      roles: [],
      coverage: { total: 0, automated: 0, unsupported: 0, unsupportedRoleIds: [] }
    };
  }

  const roles = [];
  const catalog = buildRoleCatalog(normalizedScriptId);
  for (const [roleId, role] of catalog.entries()) {
    const rule = getRule(roleId);
    roles.push({
      roleId,
      name: role.name || role.nameEn || roleId,
      team: roleTeamFromCatalog(role),
      phases: rule?.phases || [],
      automation: rule?.automation || 'unsupported',
      resolution: rule?.resolution || null,
      hasNightPrompt: Boolean(rule?.firstNight || rule?.otherNight),
      hasDayRule: Boolean(rule?.phases?.some((phase) => String(phase).toLowerCase().includes('day'))),
      hasTriggerRule: Boolean(rule?.phases?.some((phase) => String(phase).toLowerCase().includes('trigger'))),
      supported: Boolean(rule)
    });
  }

  const unsupportedRoleIds = roles.filter((role) => !role.supported).map((role) => role.roleId);
  return {
    scriptId: normalizedScriptId,
    name: script.name,
    nameEn: script.nameEn,
    status: unsupportedRoleIds.length === 0 ? 'GO' : 'NO-GO',
    nightOrder: {
      first: getNightOrderForScript(normalizedScriptId, true),
      other: getNightOrderForScript(normalizedScriptId, false)
    },
    roles,
    coverage: {
      total: roles.length,
      automated: roles.length - unsupportedRoleIds.length,
      unsupported: unsupportedRoleIds.length,
      unsupportedRoleIds
    }
  };
}

function collectJsonIdentityFields(input) {
  const item = input?.item && typeof input.item === 'object' ? input.item : {};
  const metadata = input?.metadata || item.metadata || {};
  return [
    input?.scriptId,
    input?.id,
    input?.displayName,
    input?.name,
    input?.nameEn,
    item.scriptId,
    item.id,
    item.displayName,
    item.name,
    item.nameEn,
    metadata.name,
    metadata.id
  ].filter(Boolean);
}

function collectEntryIds(input) {
  const entries = asArray(input?.entries).length > 0 ? input.entries : asArray(input?.item?.entries);
  return entries
    .map((entry) => {
      const match = matchRoleEntryFromJson(typeof entry === 'string' ? { id: entry } : entry);
      if (match.roleId && !match.requiresReview) return normalizeRoleId(match.roleId);
      return normalizeRoleId(entry?.id || entry?.roleId || entry?.name || entry?.display?.name || entry);
    })
    .filter((roleId) => roleId && roleId !== '-meta' && roleId !== '_meta');
}

function identifyScriptFromJson(input) {
  const warnings = [];
  const identityFields = collectJsonIdentityFields(input);
  for (const field of identityFields) {
    const resolved = normalizeScriptId(field);
    if (resolved) {
      if (String(field).includes('瓦釜雷鸣') && identityFields.some((value) => normalizeScriptId(value) === 'bad-moon-rising')) {
        warnings.push('legacy-name-conflict: 瓦釜雷鸣 is treated as Catfishing in the current project; Bad Moon Rising uses 黯月初升/血月升起.');
        return { scriptId: 'catfishing', confidence: 'alias-with-conflict', identityFields, warnings };
      }
      return { scriptId: resolved, confidence: 'alias', identityFields, warnings };
    }
  }

  const roleIds = collectEntryIds(input);
  const catfishingSignature = [
    'balloonist',
    'snakecharmer',
    'gambler',
    'amnesiac',
    'cerenovus',
    'pithag',
    'widow',
    'vigormortis',
    'fanggu'
  ];
  if (catfishingSignature.filter((roleId) => roleIds.includes(roleId)).length >= 5) {
    return { scriptId: 'catfishing', confidence: 'role-signature', identityFields, warnings };
  }

  const badMoonRisingSignature = [
    'sailor',
    'chambermaid',
    'innkeeper',
    'exorcist',
    'gossip',
    'courtier',
    'professor',
    'devilsadvocate',
    'pukka',
    'shabaloth',
    'zombuul'
  ];
  if (badMoonRisingSignature.filter((roleId) => roleIds.includes(roleId)).length >= 5) {
    return { scriptId: 'bad-moon-rising', confidence: 'role-signature', identityFields, warnings };
  }

  const sectsAndVioletsSignature = [
    'clockmaker',
    'mathematician',
    'flowergirl',
    'towncrier',
    'oracle',
    'seamstress',
    'juggler',
    'eviltwin',
    'nodashii',
    'vortox'
  ];
  if (sectsAndVioletsSignature.filter((roleId) => roleIds.includes(roleId)).length >= 5) {
    return { scriptId: 'sects-and-violets', confidence: 'role-signature', identityFields, warnings };
  }

  const troubleBrewingSignature = ['washerwoman', 'librarian', 'chef', 'empath', 'imp', 'baron', 'saint'];
  if (troubleBrewingSignature.filter((roleId) => roleIds.includes(roleId) || roleIds.includes(roleId.replace('-', ''))).length >= 5) {
    return { scriptId: 'trouble-brewing', confidence: 'role-signature', identityFields, warnings };
  }

  return { scriptId: null, confidence: 'none', identityFields, warnings: [...warnings, 'unknown-script-json'] };
}

function buildImportedScriptRuleAutomationProfile(input) {
  const scriptMatch = identifyScriptFromJson(input);
  const roleMatchSummary = matchScriptEntriesFromJson(input);
  const roleIds = roleMatchSummary.matches
    .filter((match) => match.roleId && !match.requiresReview)
    .map((match) => normalizeRegistryRoleId(match.roleId));
  const uniqueRoleIds = [...new Set(roleIds)];
  const unsupportedRoleIds = uniqueRoleIds.filter((roleId) => !getRule(roleId));
  const reviewRequired = roleMatchSummary.matches.filter((match) => match.requiresReview);
  const unmatched = roleMatchSummary.matches.filter((match) => !match.roleId);
  const nightOrder = scriptMatch.scriptId
    ? {
      first: getNightOrderForScript(scriptMatch.scriptId, true),
      other: getNightOrderForScript(scriptMatch.scriptId, false)
    }
    : buildOfficialNightOrderForRoleIds(uniqueRoleIds);
  const status = unsupportedRoleIds.length === 0 && reviewRequired.length === 0 && unmatched.length === 0
    ? 'GO'
    : 'REVIEW';

  return {
    status,
    scriptId: scriptMatch.scriptId,
    scriptConfidence: scriptMatch.confidence,
    scriptWarnings: scriptMatch.warnings,
    nightOrder,
    roleMatches: roleMatchSummary.matches,
    coverage: {
      total: roleMatchSummary.matches.length,
      matched: uniqueRoleIds.length,
      unsupported: unsupportedRoleIds.length,
      reviewRequired: reviewRequired.length,
      unmatched: unmatched.length,
      unsupportedRoleIds
    }
  };
}

function getPlayers(roomState) {
  return asArray(roomState.players).slice().sort((left, right) => Number(left.seat) - Number(right.seat));
}

function findPlayerByRole(players, roleId) {
  const normalized = normalizeRoleId(roleId);
  return players.find((player) => normalizeRoleId(player.trueRoleId || player.roleId || player.role) === normalized) || null;
}

function findPlayerBySeat(players, seat) {
  return players.find((player) => Number(player.seat) === Number(seat)) || null;
}

function alivePlayers(players) {
  return players.filter((player) => player.alive !== false);
}

function isDemonPlayer(player) {
  return DEMON_ROLE_IDS.has(normalizeRoleId(player?.trueRoleId || player?.roleId || player?.role))
    || normalizeKey(player?.team) === 'demon'
    || normalizeKey(player?.group) === 'demons';
}

function isEvilPlayer(player) {
  return getAlignmentForPlayer(player) === 'evil';
}

function chooseTarget(players, actor, { preferDemon = false, avoidSelf = false, requireAlive = true, requireDead = false } = {}) {
  let candidates = players.filter((player) => {
    if (avoidSelf && Number(player.seat) === Number(actor?.seat)) return false;
    if (requireAlive && player.alive === false) return false;
    if (requireDead && player.alive !== false) return false;
    return true;
  });
  if (preferDemon) {
    const demon = candidates.find(isDemonPlayer);
    if (demon) return demon;
  }
  return candidates[0] || null;
}

function killPlayer(state, seat, sourceRoleId, events) {
  const player = findPlayerBySeat(state.players, seat);
  if (!player || player.alive === false) return false;
  if (normalizeRoleId(player.trueRoleId || player.roleId) === 'soldier' && DEMON_ROLE_IDS.has(normalizeRoleId(sourceRoleId))) {
    events.push({ phase: state.phase, type: 'death-prevented', seat, reason: 'soldier' });
    return false;
  }
  player.alive = false;
  player.diedToday = state.phase === 'day';
  player.diedTonight = state.phase === 'night';
  events.push({ phase: state.phase, type: 'death', seat, sourceRoleId });
  return true;
}

function executePlayer(state, seat, events) {
  const player = findPlayerBySeat(state.players, seat);
  if (!player || player.alive === false) return false;
  player.alive = false;
  player.executed = true;
  player.diedToday = true;
  state.latestExecutedSeat = seat;
  events.push({ phase: state.phase, type: 'execution', seat, roleId: player.trueRoleId });
  if (normalizeRoleId(player.trueRoleId) === 'sweetheart') {
    const drunkTarget = alivePlayers(state.players).find((candidate) => Number(candidate.seat) !== Number(seat));
    if (drunkTarget) {
      drunkTarget.drunk = true;
      events.push({ phase: state.phase, type: 'sweetheart-drunk', seat: drunkTarget.seat });
    }
  }
  if (normalizeRoleId(player.trueRoleId) === 'cannibal') {
    events.push({ phase: state.phase, type: 'cannibal-own-execution-no-copy', seat });
  }
  const cannibal = findPlayerByRole(state.players, 'cannibal');
  if (cannibal && cannibal.alive !== false && Number(cannibal.seat) !== Number(seat)) {
    cannibal.cannibalAbilityRoleId = player.trueRoleId;
    events.push({ phase: state.phase, type: 'cannibal-gains-ability', seat: cannibal.seat, roleId: player.trueRoleId });
  }
  return true;
}

function checkGameEnd(state, events) {
  const living = alivePlayers(state.players);
  const aliveDemon = living.find(isDemonPlayer);
  if (!aliveDemon && state.players.some(isDemonPlayer)) {
    state.gameEnd = { winningTeam: 'good', reason: 'no-alive-demon' };
    events.push({ phase: state.phase, type: 'game-end', winningTeam: 'good', reason: 'no-alive-demon' });
    return true;
  }
  if (living.length <= 2 && aliveDemon) {
    state.gameEnd = { winningTeam: 'evil', reason: 'two-alive-with-demon' };
    events.push({ phase: state.phase, type: 'game-end', winningTeam: 'evil', reason: 'two-alive-with-demon' });
    return true;
  }
  return false;
}

function makePlayersForSimulation(scriptId, playerCount) {
  const catalog = buildRoleCatalog(scriptId);
  let desired = ['washerwoman', 'chef', 'empath', 'fortune-teller', 'ravenkeeper', 'butler', 'poisoner', 'imp'];
  if (scriptId === 'catfishing') {
    desired = ['investigator', 'chef', 'grandmother', 'dreamer', 'gambler', 'drunk', 'godfather', 'imp'];
  } else if (scriptId === 'bad-moon-rising') {
    desired = ['sailor', 'chambermaid', 'innkeeper', 'professor', 'fool', 'gambler', 'devilsadvocate', 'shabaloth'];
  } else if (scriptId === 'sects-and-violets') {
    desired = ['clockmaker', 'dreamer', 'flowergirl', 'seamstress', 'juggler', 'barber', 'witch', 'vortox'];
  }
  const roles = desired.slice(0, playerCount);
  if (!roles.some((roleId) => DEMON_ROLE_IDS.has(normalizeRoleId(roleId)))) roles[roles.length - 1] = 'imp';
  return roles.map((roleId, index) => {
    const catalogRole = catalog.get(roleId) || catalog.get(roleId.replace('-', '')) || {};
    const team = roleTeamFromCatalog(catalogRole);
    return {
      seat: index + 1,
      name: `AI${index + 1}`,
      trueRoleId: roleId,
      shownRoleId: roleId,
      team,
      alignment: TEAM_ALIGNMENT[team] || getAlignmentForPlayer({ roleId, team }),
      alive: true,
      deadVoteAvailable: true,
      playerToken: `ai-token-${index + 1}`
    };
  });
}

function resolveNightAction(state, actor, roleId, isFirstNight, events) {
  const rule = getRule(roleId);
  if (!rule) {
    events.push({ phase: 'night', type: 'manual-rule-missing', seat: actor.seat, roleId });
    return;
  }
  if ((isFirstNight && rule.firstNight?.promptKind === 'auto_info') || (!isFirstNight && rule.otherNight?.promptKind === 'auto_info')) {
    events.push({ phase: 'night', type: 'private-info', seat: actor.seat, roleId, resolution: rule.resolution });
    return;
  }
  if (['poisoner', 'widow'].includes(roleId)) {
    const target = chooseTarget(state.players, actor, { avoidSelf: false });
    if (target) {
      target.poisoned = true;
      events.push({ phase: 'night', type: 'poison', seat: target.seat, actorSeat: actor.seat, roleId });
    }
    return;
  }
  if (roleId === 'monk') {
    const target = chooseTarget(state.players, actor, { avoidSelf: true });
    if (target) {
      target.protected = true;
      events.push({ phase: 'night', type: 'protect', seat: target.seat, actorSeat: actor.seat, roleId });
    }
    return;
  }
  if (['imp', 'pukka', 'shabaloth', 'po', 'zombuul', 'vigormortis', 'fanggu', 'nodashii', 'vortox'].includes(roleId)) {
    const target = chooseTarget(state.players, actor, { preferDemon: false, avoidSelf: true });
    if (target) killPlayer(state, target.seat, roleId, events);
    return;
  }
  if (roleId === 'gambler') {
    const target = chooseTarget(state.players, actor, { avoidSelf: false });
    if (target) {
      const guessedRoleId = target.trueRoleId;
      events.push({ phase: 'night', type: 'gambler-correct', actorSeat: actor.seat, targetSeat: target.seat, guessedRoleId });
    }
    return;
  }
  if (roleId === 'snakecharmer') {
    const target = chooseTarget(state.players, actor, { preferDemon: true, avoidSelf: false });
    if (target && isDemonPlayer(target)) {
      const actorRole = actor.trueRoleId;
      actor.trueRoleId = target.trueRoleId;
      target.trueRoleId = actorRole;
      target.poisoned = true;
      events.push({ phase: 'night', type: 'snakecharmer-swap', actorSeat: actor.seat, targetSeat: target.seat });
    } else if (target) {
      events.push({ phase: 'night', type: 'snakecharmer-no-swap', actorSeat: actor.seat, targetSeat: target.seat });
    }
    return;
  }
  events.push({ phase: 'night', type: 'storyteller-ai-ruling', seat: actor.seat, roleId, resolution: rule.resolution });
}

function runNight(state, nightNumber, events) {
  state.phase = 'night';
  const isFirstNight = nightNumber === 1;
  for (const player of state.players) {
    player.protected = false;
    player.diedTonight = false;
  }
  const order = getNightOrderForScript(state.scriptId, isFirstNight);
  events.push({ phase: 'night', type: 'night-start', nightNumber, order });
  for (const roleId of order) {
    const actors = state.players.filter((player) => {
      if (player.alive === false && normalizeRoleId(player.trueRoleId) !== 'ravenkeeper') return false;
      return normalizeRoleId(player.trueRoleId) === normalizeRoleId(roleId);
    });
    for (const actor of actors) resolveNightAction(state, actor, normalizeRoleId(roleId), isFirstNight, events);
  }
}

function runDay(state, dayNumber, events) {
  state.phase = 'day';
  for (const player of state.players) {
    player.diedToday = false;
    player.protected = false;
  }
  events.push({ phase: 'day', type: 'day-start', dayNumber });

  const slayer = findPlayerByRole(state.players, 'slayer');
  if (slayer && slayer.alive !== false && !slayer.slayerUsed) {
    const demon = alivePlayers(state.players).find(isDemonPlayer);
    if (demon) {
      slayer.slayerUsed = true;
      killPlayer(state, demon.seat, 'slayer', events);
      if (checkGameEnd(state, events)) return;
    }
  }

  const demon = alivePlayers(state.players).find(isDemonPlayer);
  const nominee = dayNumber >= 2 && demon
    ? demon
    : alivePlayers(state.players).find((player) => !isDemonPlayer(player)) || demon;
  if (!nominee) return;

  events.push({ phase: 'day', type: 'nomination', nomineeSeat: nominee.seat });
  if (normalizeRoleId(nominee.trueRoleId) === 'saint') {
    executePlayer(state, nominee.seat, events);
    state.gameEnd = { winningTeam: 'evil', reason: 'saint-executed' };
    events.push({ phase: 'day', type: 'game-end', winningTeam: 'evil', reason: 'saint-executed' });
    return;
  }
  executePlayer(state, nominee.seat, events);
  checkGameEnd(state, events);
}

function simulateAiSelfPlay({ scriptId, playerCount = 8, maxDays = 3 } = {}) {
  const normalizedScriptId = normalizeScriptId(scriptId) || scriptId;
  const profile = buildScriptRuleAutomationProfile(normalizedScriptId);
  if (profile.status !== 'GO') {
    return {
      status: 'NO-GO',
      scriptId: normalizedScriptId,
      reason: 'profile-not-fully-supported',
      profile,
      events: []
    };
  }

  const state = {
    scriptId: normalizedScriptId,
    phase: 'setup',
    players: makePlayersForSimulation(normalizedScriptId, playerCount),
    gameEnd: null,
    latestExecutedSeat: null
  };
  const events = [{ phase: 'setup', type: 'roles-assigned', roles: state.players.map((player) => ({ seat: player.seat, roleId: player.trueRoleId })) }];

  for (let index = 1; index <= maxDays; index += 1) {
    runNight(state, index, events);
    if (checkGameEnd(state, events)) break;
    runDay(state, index, events);
    if (state.gameEnd) break;
  }

  return {
    status: state.gameEnd ? 'GO' : 'NO-GO',
    scriptId: normalizedScriptId,
    playerCount: state.players.length,
    aiMode: 'local-deterministic-storyteller-and-players',
    profile,
    finalState: {
      phase: state.phase,
      aliveSeats: alivePlayers(state.players).map((player) => player.seat),
      gameEnd: state.gameEnd
    },
    events,
    failures: state.gameEnd ? [] : ['self-play-did-not-reach-game-end']
  };
}

module.exports = {
  DEMON_ROLE_IDS,
  MINION_ROLE_IDS,
  RULES,
  SCRIPT_ALIASES,
  TOWNSFOLK_ROLE_IDS,
  buildImportedScriptRuleAutomationProfile,
  buildScriptRuleAutomationProfile,
  getAlignmentForPlayer,
  getAutomationRoleIds,
  getNightOrderForScript,
  getPromptDefinitionForRole,
  getRoleDisplayName,
  getRule,
  identifyScriptFromJson,
  normalizeRoleId,
  normalizeScriptId,
  simulateAiSelfPlay
};
