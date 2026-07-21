const SCHEMA_VERSION = 'stage6.candidateResolution.v1';
const AI_AUDIT_SCHEMA_VERSION = 'stage8.ai-audit.v1';
const DOWNGRADE_STRATEGY = 'local-manual-storyteller-flow';
const {
  DEMON_ROLE_IDS: AUTOMATION_DEMON_ROLE_IDS,
  MINION_ROLE_IDS: AUTOMATION_MINION_ROLE_IDS,
  TOWNSFOLK_ROLE_IDS: AUTOMATION_TOWNSFOLK_ROLE_IDS,
  getAlignmentForPlayer,
  getAutomationRoleIds,
  getRule,
  normalizeRoleId: normalizeAutomationRoleId
} = require('./RuleAutomation');
const {
  buildCandidateRuleContract
} = require('./RoleRuleEngine');
const { getScriptById } = require('../ScriptCatalog');
const {
  assertAtomicRoleTransitionPatches,
  buildRoleSwapPatches,
  buildRoleTransitionPatches,
  getRoleStateInvariantViolations
} = require('./RoleStateTransition');
const {
  normalizeNightCandidateConfirmationOptions
} = require('./NightCandidateOverride');
const {
  buildComplexRulingGate,
  requiresVerifiedComplexRulingTemplate
} = require('./ComplexRulingGate');

const TERMINAL_STATUSES = new Set(['confirmed', 'rejected', 'superseded']);
const IMPORTED_STATE_PATCH_REQUIRED_TYPES = new Set([
  'imported-role-status',
  'imported-role-change'
]);
const SUPPORTED_ROLE_IDS = new Set([
  'fortune-teller',
  'chef',
  'empath',
  'poisoner',
  'monk',
  'imp',
  'sailor',
  'chambermaid',
  'innkeeper',
  'professor',
  'devilsadvocate',
  'assassin',
  'shabaloth',
  ...getAutomationRoleIds()
]);
const DEMON_ROLE_IDS = new Set(['imp', 'pukka', 'shabaloth', 'po', 'zombuul', ...AUTOMATION_DEMON_ROLE_IDS]);
const MINION_ROLE_IDS = new Set([
  'poisoner',
  'spy',
  'scarlet-woman',
  'baron',
  'godfather',
  'devilsadvocate',
  'assassin',
  'mastermind',
  ...AUTOMATION_MINION_ROLE_IDS
]);
const OUTSIDER_ROLE_IDS = new Set([
  'butler',
  'drunk',
  'recluse',
  'saint',
  'sweetheart',
  'mutant',
  'lunatic',
  'klutz',
  'barber',
  'goon',
  'tinker',
  'moonchild',
  'puzzlemaster',
  'damsel',
  'politician'
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
  'pacifist',
  ...AUTOMATION_TOWNSFOLK_ROLE_IDS
]);

const ROLE_DISPLAY_NAMES_ZH = Object.freeze({
  washerwoman: '洗衣妇',
  librarian: '图书管理员',
  investigator: '调查员',
  chef: '厨师',
  empath: '共情者',
  fortuneteller: '占卜师',
  'fortune-teller': '占卜师',
  undertaker: '掘墓人',
  monk: '僧侣',
  ravenkeeper: '守鸦人',
  slayer: '杀手',
  soldier: '士兵',
  mayor: '市长',
  butler: '管家',
  drunk: '酒鬼',
  recluse: '陌客',
  saint: '圣徒',
  poisoner: '投毒者',
  spy: '间谍',
  scarletwoman: '猩红女人',
  'scarlet-woman': '猩红女人',
  baron: '男爵',
  imp: '小恶魔',
  sailor: '水手',
  chambermaid: '侍女',
  innkeeper: '旅店老板',
  professor: '教授',
  devilsadvocate: '恶魔代言人',
  assassin: '刺客',
  shabaloth: '沙巴洛斯',
  grandmother: '祖母',
  balloonist: '气球驾驶员',
  dreamer: '筑梦师',
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
  'pit-hag': '麻脸巫婆',
  widow: '寡妇',
  vigormortis: '亡骨魔',
  fanggu: '方古',
  apprentice: '学徒',
  barista: '咖啡师',
  zombuul: '僵怖',
  pukka: '亡灵法师',
  po: '珀',
  none: '无'
});

function displayRoleName(roleId) {
  const normalized = normalizeAutomationRoleId(roleId);
  const raw = String(roleId || '').trim();
  return ROLE_DISPLAY_NAMES_ZH[normalized] || ROLE_DISPLAY_NAMES_ZH[raw] || raw || '未知角色';
}

function displaySeatList(seats) {
  const list = asArray(seats)
    .map((seat) => Number(seat))
    .filter((seat) => Number.isInteger(seat) && seat > 0)
    .map((seat) => `${seat}号`);
  return list.length > 0 ? list.join('、') : '无';
}

const FORBIDDEN_PLAYER_VIEW_KEYS = new Set([
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

const FORBIDDEN_AI_KEYS = new Set([
  'apiKey',
  'authorization',
  'authorizationHeader',
  'billingToken',
  'candidateResolutions',
  'eventLog',
  'eventLogEntry',
  'fullEventLog',
  'gameStatePatch',
  'password',
  'playerToken',
  'providerSecret',
  'rawHiddenState',
  'rawGrimoire',
  'stateChangeDraft',
  'statePatch',
  'token'
]);

const FORBIDDEN_PLAYER_TEXT_PATTERNS = [
  /醉酒/,
  /中毒/,
  /红鲱鱼/,
  /真实身份/,
  /隐藏状态/,
  /\bAI\b/i,
  /audit/i,
  /candidate/i
];

const EDITABLE_POISON_TYPES = new Set([
  'poison',
  'poison-target',
  'widow-poison-and-warning',
  'imported-role-poison'
]);

const EDITABLE_PROTECT_TYPES = new Set([
  'protect',
  'imported-role-protect'
]);

const EDITABLE_DRUNK_TYPES = new Set([
  'drunk'
]);

const EDITABLE_REVIVE_TYPES = new Set([
  'revive',
  'bmr-professor-revive'
]);

const EDITABLE_KILL_TYPES = new Set([
  'kill',
  'death',
  'demon-kill',
  'demon-kill-vigormortis',
  'demon-kill-fanggu',
  'vortox-kill-and-false-info',
  'bmr-assassin-kill',
  'bmr-shabaloth-kill',
  'imported-role-kill'
]);

const EDITABLE_ROLE_TEMPLATE_TYPES = new Set([
  'butler-master',
  'gambler-guess',
  'cerenovus-madness',
  'pithag-character-change'
]);

const EDITABLE_CONTEXT_TEMPLATE_TYPES = new Set([
  'snakecharmer-swap',
  'philosopher-gain-ability',
  'imp-self-kill-transfer',
  'demon-kill-fanggu',
  'bmr-sailor-drunk-choice',
  'bmr-innkeeper-protect-and-drunk-choice',
  'bmr-professor-revive'
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso(now) {
  if (now instanceof Date) return now.toISOString();
  if (typeof now === 'string') return now;
  return new Date().toISOString();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  throw error;
}

function getRoomState(room) {
  if (!room || typeof room !== 'object') fail('missing-room', 'room is required');
  return room.state && typeof room.state === 'object' ? room.state : room;
}

function getPlayers(room) {
  return asArray(getRoomState(room).players).slice().sort((left, right) => Number(left.seat) - Number(right.seat));
}

function getCandidateStore(room) {
  const roomState = getRoomState(room);
  return asArray(roomState.candidateResolutions);
}

function getSubmissions(room) {
  const roomState = getRoomState(room);
  return [
    ...asArray(roomState.nightSubmissions),
    ...asArray(roomState.allNightSubmissions)
  ];
}

function getRoomId(room) {
  const roomState = getRoomState(room);
  return roomState.id || roomState.roomId || room.id || room.roomId || null;
}

function getScriptId(room) {
  const roomState = getRoomState(room);
  return roomState.scriptId || roomState.currentScript || 'trouble-brewing';
}

function getRoomScript(room) {
  const roomState = getRoomState(room);
  return roomState.script || getScriptById(getScriptId(room));
}

function roleIdMatches(left, right) {
  return normalizeAutomationRoleId(left) === normalizeAutomationRoleId(right);
}

function findRoleInScript(room, roleId) {
  const script = getRoomScript(room);
  for (const roles of Object.values(script?.characters || {})) {
    const found = asArray(roles).find((role) => roleIdMatches(role.id, roleId));
    if (found) return found;
  }
  return null;
}

function getImportedRoleLogicProfile(room, roleId) {
  const roomState = getRoomState(room);
  const normalizedRoleId = normalizeAutomationRoleId(roleId);
  const role = findRoleInScript(room, normalizedRoleId);
  return roomState.ruleLogic?.roles?.[normalizedRoleId]
    || getRoomScript(room)?.ruleLogic?.roles?.[normalizedRoleId]
    || role?.logicProfile
    || null;
}

function findPlayerBySeat(players, seat) {
  return players.find((player) => Number(player.seat) === Number(seat)) || null;
}

function getPlayerRoleId(player) {
  return normalizeAutomationRoleId(player.trueRoleId || player.realRoleId || player.roleId || player.role || player.shownRoleId || null);
}

function buildSnakeCharmerSwapPatches(actor, target, room = null) {
  return [
    ...buildRoleSwapPatches(room, actor, target),
    { op: 'set', path: `playersBySeat.${target.seat}.poisoned`, value: true }
  ];
}

function getRoleIdForSubmission(submission, player) {
  return normalizeAutomationRoleId(submission.roleIdAtPrompt || submission.roleId || getPlayerRoleId(player));
}

function getTeam(player) {
  return String(player.trueTeam || player.realTeam || player.team || player.alignment || '').toLowerCase();
}

function isDemon(player) {
  const roleId = getPlayerRoleId(player);
  const roleKind = String(player.trueRoleType || player.realRoleType || player.roleType || player.type || '').toLowerCase();
  return DEMON_ROLE_IDS.has(roleId) || roleKind === 'demon' || roleKind === 'demons';
}

function isTownsfolk(player) {
  const roleId = getPlayerRoleId(player);
  const roleKind = String(player.trueRoleType || player.realRoleType || player.roleType || player.type || '').toLowerCase();
  return TOWNSFOLK_ROLE_IDS.has(roleId) || roleKind === 'townsfolk';
}

function isMinion(player) {
  const roleId = getPlayerRoleId(player);
  const roleKind = String(player.trueRoleType || player.realRoleType || player.roleType || player.type || '').toLowerCase();
  return MINION_ROLE_IDS.has(roleId) || roleKind === 'minion' || roleKind === 'minions';
}

function isOutsider(player) {
  const roleId = getPlayerRoleId(player);
  const roleKind = String(player.trueRoleType || player.realRoleType || player.roleType || player.type || '').toLowerCase();
  const team = String(player.trueTeam || player.realTeam || player.team || '').toLowerCase();
  return OUTSIDER_ROLE_IDS.has(roleId) || roleKind === 'outsider' || roleKind === 'outsiders' || team === 'outsider' || team === 'outsiders';
}

function isAlive(player) {
  return player.alive !== false;
}

function isEvil(player) {
  const roleId = getPlayerRoleId(player);
  const team = getTeam(player);
  return team === 'evil' || isDemon(player) || MINION_ROLE_IDS.has(roleId);
}

function isImpaired(player) {
  return player.isDrunk === true || player.isPoisoned === true || player.drunk === true || player.poisoned === true;
}

function getAlivePlayers(players) {
  return players.filter(isAlive).sort((left, right) => Number(left.seat) - Number(right.seat));
}

function getAliveNeighbors(seat, players) {
  const alivePlayers = getAlivePlayers(players);
  const index = alivePlayers.findIndex((player) => Number(player.seat) === Number(seat));
  if (index === -1 || alivePlayers.length === 0) return { left: null, right: null };

  return {
    left: alivePlayers[(index - 1 + alivePlayers.length) % alivePlayers.length],
    right: alivePlayers[(index + 1) % alivePlayers.length]
  };
}

function normalizeTargets(payload) {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.targets)) return payload.targets.map(Number);
  if (payload.target !== undefined) return [Number(payload.target)];
  if (payload.target1 !== undefined || payload.target2 !== undefined) {
    return [payload.target1, payload.target2].filter((target) => target !== undefined).map(Number);
  }
  return [];
}

function normalizeEditableTargetSeats(draft, fallbackDraft) {
  const rawTargets = [];
  if (Array.isArray(draft?.targetSeats)) rawTargets.push(...draft.targetSeats);
  if (draft?.targetSeat !== undefined && draft?.targetSeat !== null) rawTargets.push(draft.targetSeat);
  if (draft?.target !== undefined && draft?.target !== null) rawTargets.push(draft.target);
  if (rawTargets.length === 0 && Array.isArray(fallbackDraft?.targetSeats)) rawTargets.push(...fallbackDraft.targetSeats);
  if (rawTargets.length === 0 && fallbackDraft?.targetSeat !== undefined && fallbackDraft?.targetSeat !== null) rawTargets.push(fallbackDraft.targetSeat);
  return [...new Set(rawTargets
    .map((seat) => Number(seat))
    .filter((seat) => Number.isInteger(seat) && seat > 0))]
    .sort((left, right) => left - right);
}

function normalizeStateChangePatchTargetSeats(draft, fallbackDraft, options = {}) {
  const rawTargets = [];
  if (options.preferKilledTargets && Array.isArray(draft?.killedTargets)) rawTargets.push(...draft.killedTargets);
  if (Array.isArray(draft?.targetSeats)) rawTargets.push(...draft.targetSeats);
  if (Array.isArray(draft?.targets)) rawTargets.push(...draft.targets);
  if (draft?.targetSeat !== undefined && draft?.targetSeat !== null) rawTargets.push(draft.targetSeat);
  if (draft?.target !== undefined && draft?.target !== null) rawTargets.push(draft.target);
  if (rawTargets.length === 0 && options.preferKilledTargets && Array.isArray(fallbackDraft?.killedTargets)) rawTargets.push(...fallbackDraft.killedTargets);
  if (rawTargets.length === 0 && Array.isArray(fallbackDraft?.targetSeats)) rawTargets.push(...fallbackDraft.targetSeats);
  if (rawTargets.length === 0 && Array.isArray(fallbackDraft?.targets)) rawTargets.push(...fallbackDraft.targets);
  if (rawTargets.length === 0 && fallbackDraft?.targetSeat !== undefined && fallbackDraft?.targetSeat !== null) rawTargets.push(fallbackDraft.targetSeat);
  if (rawTargets.length === 0 && fallbackDraft?.target !== undefined && fallbackDraft?.target !== null) rawTargets.push(fallbackDraft.target);
  return [...new Set(rawTargets
    .map((seat) => Number(seat))
    .filter((seat) => Number.isInteger(seat) && seat > 0))]
    .sort((left, right) => left - right);
}

function getEditableStatePatchField(type) {
  if (EDITABLE_POISON_TYPES.has(type)) return { field: 'poisoned', value: true, effect: 'poison' };
  if (EDITABLE_PROTECT_TYPES.has(type)) return { field: 'protected', value: true, effect: 'protect' };
  if (EDITABLE_DRUNK_TYPES.has(type)) return { field: 'drunk', value: true, effect: 'drunk' };
  if (EDITABLE_REVIVE_TYPES.has(type)) return { field: 'alive', value: true, effect: 'revive' };
  if (EDITABLE_KILL_TYPES.has(type)) return { field: 'alive', value: false, effect: 'kill' };
  return null;
}

function buildDefaultStateChangePatches(type, stateChangeDraft, baseDraft) {
  const editablePatchField = getEditableStatePatchField(type);
  if (!editablePatchField) return [];
  if (editablePatchField.effect === 'kill') {
    if (stateChangeDraft.killed === false || stateChangeDraft.blocked === true || stateChangeDraft.blockedBy) return [];
    return normalizeStateChangePatchTargetSeats(stateChangeDraft, baseDraft, { preferKilledTargets: true }).map((seat) => ({
      op: 'set',
      path: `playersBySeat.${seat}.${editablePatchField.field}`,
      value: editablePatchField.value
    }));
  }
  return normalizeStateChangePatchTargetSeats(stateChangeDraft, baseDraft).map((seat) => ({
    op: 'set',
    path: `playersBySeat.${seat}.${editablePatchField.field}`,
    value: editablePatchField.value
  }));
}

function extractAliveFalsePatchSeat(patch) {
  if (!patch || patch.op !== 'set' || patch.value !== false) return null;
  const match = String(patch.path || '').match(/^playersBySeat\.(\d+)\.alive$/);
  if (!match) return null;
  const seat = Number(match[1]);
  return Number.isInteger(seat) && seat > 0 ? seat : null;
}

function hasSetPatch(patches, pathExpression) {
  return asArray(patches).some((patch) => patch?.op === 'set' && patch.path === pathExpression);
}

function pushSetPatchIfMissing(patches, pathExpression, value) {
  if (hasSetPatch(patches, pathExpression)) return;
  patches.push({ op: 'set', path: pathExpression, value });
}

function getCandidateNightBatch(candidate, roomState) {
  return asArray(roomState?.nightBatches).find((item) => item?.batchId === candidate?.batchId) || null;
}

function getCandidateNightNumber(candidate, roomState) {
  const batch = getCandidateNightBatch(candidate, roomState);
  const rawNightNumber = batch?.nightNumber
    ?? candidate?.nightNumber
    ?? (roomState?.phase === 'night' ? roomState?.nightNumber ?? roomState?.round : null);
  const nightNumber = Number(rawNightNumber);
  return Number.isInteger(nightNumber) && nightNumber > 0 ? nightNumber : null;
}

function isNightCandidate(candidate, roomState) {
  if (getCandidateNightBatch(candidate, roomState)) return true;
  return roomState?.phase === 'night' || Number.isInteger(Number(candidate?.nightNumber));
}

function appendNightDeathMetadataPatches(statePatches, candidate, options = {}) {
  const roomState = options.roomState || options.room || {};
  if (!isNightCandidate(candidate, roomState)) return statePatches;
  const nightNumber = getCandidateNightNumber(candidate, roomState);
  const sourceRoleId = candidate?.roleIdAtPrompt || candidate?.roleId || null;
  const killedSeats = [...new Set(asArray(statePatches)
    .map(extractAliveFalsePatchSeat)
    .filter((seat) => Number.isInteger(seat) && seat > 0))];

  for (const seat of killedSeats) {
    pushSetPatchIfMissing(statePatches, `playersBySeat.${seat}.diedTonight`, true);
    pushSetPatchIfMissing(statePatches, `playersBySeat.${seat}.deadTonight`, true);
    pushSetPatchIfMissing(statePatches, `playersBySeat.${seat}.killedTonight`, true);
    pushSetPatchIfMissing(statePatches, `playersBySeat.${seat}.nightKilled`, true);
    pushSetPatchIfMissing(statePatches, `playersBySeat.${seat}.deathPhase`, 'night');
    pushSetPatchIfMissing(statePatches, `playersBySeat.${seat}.lastDeathPhase`, 'night');
    if (Number.isInteger(nightNumber)) {
      pushSetPatchIfMissing(statePatches, `playersBySeat.${seat}.deathNight`, nightNumber);
      pushSetPatchIfMissing(statePatches, `playersBySeat.${seat}.lastDeathNight`, nightNumber);
    }
    if (sourceRoleId) {
      pushSetPatchIfMissing(statePatches, `playersBySeat.${seat}.lastDeathSourceRoleId`, sourceRoleId);
    }
    if (candidate?.candidateId) {
      pushSetPatchIfMissing(statePatches, `playersBySeat.${seat}.lastDeathCandidateId`, candidate.candidateId);
    }
  }
  return statePatches;
}

function normalizeEditableRoleId(draft, fallbackDraft) {
  const rawRoleId = draft?.chosenRoleId
    || draft?.roleId
    || draft?.guessedRoleId
    || fallbackDraft?.chosenRoleId
    || fallbackDraft?.roleId
    || fallbackDraft?.guessedRoleId
    || null;
  const roleId = normalizeAutomationRoleId(rawRoleId);
  return roleId || null;
}

function normalizeEditableTransferSeat(draft, fallbackDraft) {
  const rawSeat = draft?.newDemonSeat
    ?? draft?.transferSeat
    ?? draft?.newDemonTargetSeat
    ?? fallbackDraft?.newDemonSeat
    ?? fallbackDraft?.transferSeat
    ?? fallbackDraft?.newDemonTargetSeat
    ?? null;
  const seat = Number(rawSeat);
  return Number.isInteger(seat) && seat > 0 ? seat : null;
}

function normalizeFangGuRegistrationRuling(draft, fallbackDraft) {
  const raw = draft?.fangguRegistrationRuling
    ?? draft?.registrationRuling
    ?? draft?.targetRegistration
    ?? fallbackDraft?.fangguRegistrationRuling
    ?? fallbackDraft?.registrationRuling
    ?? fallbackDraft?.targetRegistration
    ?? null;
  const value = String(raw || '').trim().toLowerCase();
  if (['outsider', 'as-outsider', 'jump', 'true', 'yes'].includes(value)) return 'outsider';
  if (['not-outsider', 'non-outsider', 'kill', 'false', 'no'].includes(value)) return 'not-outsider';
  return 'default';
}

function isRegistrationFlexible(player) {
  return ['recluse', 'spy'].includes(getPlayerRoleId(player));
}

function findDefaultImpTransferSeat(players, actorSeat) {
  const minion = players.find((player) => {
    return Number(player.seat) !== Number(actorSeat) && isAlive(player) && isMinion(player);
  });
  return minion ? Number(minion.seat) : null;
}

function makeImpSelfKillTransferDraft(actorSeat, transferSeat) {
  const patches = [
    { op: 'set', path: `playersBySeat.${actorSeat}.alive`, value: false }
  ];
  const privateMessageDrafts = [];
  if (Number.isInteger(transferSeat)) {
    patches.push(
      ...buildRoleTransitionPatches(null, transferSeat, 'imp'),
      { op: 'set', path: `playersBySeat.${transferSeat}.becameDemonByImpSelfKill`, value: true }
    );
    privateMessageDrafts.push({
      type: 'ability-result',
      text: '你现在是小恶魔。',
      toSeat: transferSeat
    });
  }
  return {
    type: 'imp-self-kill-transfer',
    targetSeat: actorSeat,
    transferSeat,
    newDemonSeat: transferSeat,
    killed: true,
    patches,
    privateMessageDrafts
  };
}

function makeFangGuAttackDraft(actorSeat, targetSeat, target, roomState = {}, options = {}) {
  const blocked = target?.protected === true;
  const soldierBlocked = target && getPlayerRoleId(target) === 'soldier';
  const registrationRuling = options.registrationRuling || 'default';
  const registersAsOutsider = registrationRuling === 'outsider'
    ? true
    : registrationRuling === 'not-outsider'
      ? false
      : Boolean(target && isOutsider(target));
  const canJump = !blocked && !soldierBlocked && target && registersAsOutsider && roomState.fangguJumpUsed !== true;
  if (blocked || soldierBlocked) {
    return {
      type: 'demon-kill-fanggu',
      targetSeat,
      killed: false,
      jumped: false,
      registrationRuling,
      blockedBy: blocked ? 'protection' : 'soldier',
      patches: [],
      privateMessageDrafts: []
    };
  }
  if (canJump) {
    return {
      type: 'demon-kill-fanggu',
      targetSeat,
      killed: false,
      jumped: true,
      registrationRuling,
      transferSeat: targetSeat,
      newDemonSeat: targetSeat,
      patches: [
        { op: 'set', path: `playersBySeat.${actorSeat}.alive`, value: false },
        ...buildRoleTransitionPatches(roomState, targetSeat, 'fanggu'),
        { op: 'set', path: `playersBySeat.${targetSeat}.becameDemonByFangGu`, value: true },
        { op: 'set', path: 'fangguJumpUsed', value: true }
      ],
      privateMessageDrafts: [
        {
          type: 'ability-result',
          text: '你现在是方古。',
          toSeat: targetSeat
        }
      ]
    };
  }
  return {
    type: 'demon-kill-fanggu',
    targetSeat,
    killed: true,
    jumped: false,
    registrationRuling,
    patches: [
      { op: 'set', path: `playersBySeat.${targetSeat}.alive`, value: false }
    ],
    privateMessageDrafts: []
  };
}

function buildEditableTemplateDraft(candidate, stateChangeDraft, baseDraft, options = {}) {
  const type = baseDraft.type || stateChangeDraft.type;
  if (!EDITABLE_ROLE_TEMPLATE_TYPES.has(type)) return null;

  const actorSeat = Number(candidate.seat);
  const targetSeats = normalizeEditableTargetSeats(stateChangeDraft, baseDraft);
  const targetSeat = targetSeats[0] || null;
  const roleId = normalizeEditableRoleId(stateChangeDraft, baseDraft);
  const nextDraft = {
    ...clone(baseDraft),
    ...clone(stateChangeDraft),
    type,
    patches: [],
    editableStatePatch: {
      effect: type,
      generatedFrom: 'storyteller-final-ruling'
    }
  };

  if (type === 'butler-master') {
    if (!Number.isInteger(actorSeat) || !Number.isInteger(targetSeat)) {
      fail('missing-butler-master-target', 'butler master edit requires a target seat');
    }
    nextDraft.targetSeat = targetSeat;
    nextDraft.targetSeats = [targetSeat];
    nextDraft.patches = [{ op: 'set', path: `playersBySeat.${actorSeat}.butlerMasterSeat`, value: targetSeat }];
    return nextDraft;
  }

  if (type === 'gambler-guess') {
    if (!Number.isInteger(actorSeat) || !Number.isInteger(targetSeat) || !roleId) {
      fail('missing-gambler-ruling-fields', 'gambler edit requires target seat and guessed role');
    }
    const correct = stateChangeDraft.correct === true;
    nextDraft.targetSeat = targetSeat;
    nextDraft.targetSeats = [targetSeat];
    nextDraft.guessedRoleId = roleId;
    nextDraft.correct = correct;
    nextDraft.patches = correct ? [] : [{ op: 'set', path: `playersBySeat.${actorSeat}.alive`, value: false }];
    return nextDraft;
  }

  if (type === 'cerenovus-madness') {
    if (!Number.isInteger(targetSeat) || !roleId) {
      fail('missing-cerenovus-ruling-fields', 'cerenovus edit requires target seat and mad role');
    }
    nextDraft.targetSeat = targetSeat;
    nextDraft.targetSeats = [targetSeat];
    nextDraft.chosenRoleId = roleId;
    nextDraft.patches = [{ op: 'set', path: `playersBySeat.${targetSeat}.madAsRoleId`, value: roleId }];
    return nextDraft;
  }

  if (type === 'pithag-character-change') {
    if (!Number.isInteger(targetSeat) || !roleId) {
      fail('missing-pithag-ruling-fields', 'pit-hag edit requires target seat and new role');
    }
    nextDraft.targetSeat = targetSeat;
    nextDraft.targetSeats = [targetSeat];
    nextDraft.chosenRoleId = roleId;
    nextDraft.scriptLegalityReview = 'storyteller-confirmed';
    nextDraft.patches = [
      ...buildRoleTransitionPatches(options.roomState || options.room || null, targetSeat, roleId),
      { op: 'set', path: `playersBySeat.${targetSeat}.pithagChangedRoleId`, value: roleId }
    ];
    return nextDraft;
  }

  return null;
}

function buildEditableContextTemplateDraft(candidate, stateChangeDraft, baseDraft, options = {}) {
  const type = baseDraft.type || stateChangeDraft.type;
  if (!EDITABLE_CONTEXT_TEMPLATE_TYPES.has(type)) return null;
  if (
    ['bmr-sailor-drunk-choice', 'bmr-innkeeper-protect-and-drunk-choice', 'bmr-professor-revive'].includes(type)
    && options.editableOverride !== true
  ) {
    return null;
  }

  const roomState = options.roomState || options.room || null;
  if (!roomState) {
    fail('missing-editable-ruling-room-state', `${type} edit requires current room state`);
  }

  const players = getPlayers(roomState);
  const actorSeat = Number(candidate.seat);
  const actor = findPlayerBySeat(players, actorSeat);
  if (!Number.isInteger(actorSeat) || !actor) {
    fail('missing-editable-ruling-actor', `${type} edit requires an actor in current room state`);
  }

  const nextDraft = {
    ...clone(baseDraft),
    ...clone(stateChangeDraft),
    type,
    patches: [],
    editableStatePatch: {
      effect: type,
      generatedFrom: 'storyteller-final-ruling'
    }
  };

  if (type === 'bmr-sailor-drunk-choice') {
    const selectedSeat = Number(stateChangeDraft.drunkTargetSeat || stateChangeDraft.drunkSeat);
    const submittedTargetSeat = Number(baseDraft.targetSeat);
    const allowedSeats = new Set([actorSeat, submittedTargetSeat].filter(Number.isInteger));
    if (!Number.isInteger(selectedSeat)) {
      fail('missing-sailor-drunk-target-choice', 'sailor ruling requires an explicit drunk target choice');
    }
    if (!allowedSeats.has(selectedSeat)) {
      fail('invalid-sailor-drunk-target', 'sailor drunk target must be the Sailor or the submitted target');
    }
    if (!findPlayerBySeat(players, selectedSeat)) {
      fail('invalid-sailor-drunk-target', 'sailor drunk target must exist in current room state');
    }
    nextDraft.targetSeat = selectedSeat;
    nextDraft.targetSeats = [selectedSeat];
    nextDraft.drunkTargetSeat = selectedSeat;
    nextDraft.patches = [{ op: 'set', path: `playersBySeat.${selectedSeat}.drunk`, value: true }];
    nextDraft.editableStatePatch.targetSeats = [selectedSeat];
    nextDraft.editableStatePatch.effect = 'drunk';
    return nextDraft;
  }

  if (type === 'bmr-innkeeper-protect-and-drunk-choice') {
    const protectedTargetSeats = Array.isArray(stateChangeDraft.targetSeats) && stateChangeDraft.targetSeats.length > 0
      ? [...new Set(stateChangeDraft.targetSeats.map(Number).filter(Number.isInteger))]
      : [...new Set(asArray(stateChangeDraft.protectedTargetSeats || baseDraft.protectedTargetSeats)
        .map(Number)
        .filter(Number.isInteger))];
    if (protectedTargetSeats.length !== 2 || protectedTargetSeats.some((seat) => !findPlayerBySeat(players, seat))) {
      fail('invalid-innkeeper-protected-targets', 'innkeeper ruling requires two existing protected targets');
    }
    const drunkTargetSeat = Number(stateChangeDraft.drunkTargetSeat || stateChangeDraft.drunkSeat);
    if (!Number.isInteger(drunkTargetSeat) || !protectedTargetSeats.includes(drunkTargetSeat)) {
      fail('invalid-innkeeper-drunk-target', 'innkeeper drunk target must be one of the two protected targets');
    }
    nextDraft.targetSeat = protectedTargetSeats[0];
    nextDraft.targetSeats = protectedTargetSeats;
    nextDraft.protectedTargetSeats = protectedTargetSeats;
    nextDraft.drunkTargetSeat = drunkTargetSeat;
    nextDraft.drunkChoiceRequired = false;
    nextDraft.patches = [
      ...protectedTargetSeats.map((seat) => ({
        op: 'set',
        path: `playersBySeat.${seat}.protected`,
        value: true
      })),
      { op: 'set', path: `playersBySeat.${drunkTargetSeat}.drunk`, value: true }
    ];
    nextDraft.editableStatePatch.targetSeats = protectedTargetSeats;
    nextDraft.editableStatePatch.drunkTargetSeat = drunkTargetSeat;
    nextDraft.editableStatePatch.effect = 'protect-and-drunk';
    return nextDraft;
  }

  if (type === 'bmr-professor-revive') {
    const targetSeat = normalizeEditableTargetSeats(stateChangeDraft, baseDraft)[0] || null;
    const target = findPlayerBySeat(players, targetSeat);
    if (!Number.isInteger(targetSeat) || !target || isAlive(target) || !isTownsfolk(target)) {
      fail('invalid-professor-revive-target', 'professor revive target must be a dead Townsfolk');
    }
    nextDraft.targetSeat = targetSeat;
    nextDraft.targetSeats = [targetSeat];
    nextDraft.revived = true;
    nextDraft.patches = [{ op: 'set', path: `playersBySeat.${targetSeat}.alive`, value: true }];
    nextDraft.editableStatePatch.targetSeats = [targetSeat];
    nextDraft.editableStatePatch.effect = 'revive';
    return nextDraft;
  }

  if (type === 'snakecharmer-swap') {
    const targetSeat = normalizeEditableTargetSeats(stateChangeDraft, baseDraft)[0] || null;
    if (!Number.isInteger(targetSeat)) {
      fail('missing-snakecharmer-ruling-target', 'snake charmer edit requires one target seat');
    }
    const target = findPlayerBySeat(players, targetSeat);
    if (!target) {
      fail('missing-snakecharmer-ruling-target-player', 'snake charmer target must exist in current room state');
    }
    const targetIsDemon = isDemon(target);
    const actorImpaired = isImpaired(actor);
    const swapApplied = targetIsDemon && !actorImpaired;
    nextDraft.targetSeat = targetSeat;
    nextDraft.targetSeats = [targetSeat];
    nextDraft.targetIsDemon = targetIsDemon;
    nextDraft.actorImpaired = actorImpaired;
    nextDraft.swapApplied = swapApplied;
    nextDraft.patches = swapApplied ? buildSnakeCharmerSwapPatches(actor, target, roomState) : [];
    nextDraft.editableStatePatch.targetSeats = [targetSeat];
    nextDraft.editableStatePatch.targetIsDemon = targetIsDemon;
    nextDraft.editableStatePatch.actorImpaired = actorImpaired;
    nextDraft.editableStatePatch.swapApplied = swapApplied;
    return nextDraft;
  }

  if (type === 'philosopher-gain-ability') {
    const roleId = normalizeEditableRoleId(stateChangeDraft, baseDraft);
    if (!roleId) {
      fail('missing-philosopher-ruling-role', 'philosopher edit requires a role choice');
    }
    const originalHolder = players.find((player) => {
      return Number(player.seat) !== actorSeat && getPlayerRoleId(player) === roleId;
    });
    nextDraft.targetSeat = null;
    nextDraft.targetSeats = [];
    nextDraft.chosenRoleId = roleId;
    nextDraft.patches = [
      { op: 'set', path: `playersBySeat.${actorSeat}.gainedAbilityRoleId`, value: roleId }
    ];
    if (originalHolder) {
      nextDraft.patches.push({ op: 'set', path: `playersBySeat.${originalHolder.seat}.drunk`, value: true });
      nextDraft.patches.push({ op: 'set', path: `playersBySeat.${actorSeat}.philosopherDrunkedSeat`, value: Number(originalHolder.seat) });
    }
    nextDraft.editableStatePatch.chosenRoleId = roleId;
    nextDraft.editableStatePatch.originalHolderSeat = originalHolder ? Number(originalHolder.seat) : null;
    return nextDraft;
  }

  if (type === 'imp-self-kill-transfer') {
    const transferSeat = normalizeEditableTransferSeat(stateChangeDraft, baseDraft)
      || findDefaultImpTransferSeat(players, actorSeat);
    if (!Number.isInteger(transferSeat)) {
      const targetSeat = Number(stateChangeDraft.targetSeat || stateChangeDraft.target || baseDraft.targetSeat || baseDraft.target || actorSeat);
      const patches = Array.isArray(stateChangeDraft.patches) && stateChangeDraft.patches.length > 0
        ? clone(stateChangeDraft.patches)
        : [{ op: 'set', path: `playersBySeat.${targetSeat}.alive`, value: false }];
      return {
        ...nextDraft,
        type: 'imp-self-kill-transfer',
        targetSeat,
        targetSeats: [targetSeat],
        transferSeat: null,
        newDemonSeat: null,
        killed: true,
        patches,
        privateMessageDrafts: clone(stateChangeDraft.privateMessageDrafts || baseDraft.privateMessageDrafts || []),
        editableStatePatch: {
          effect: 'imp-self-kill-no-transfer',
          generatedFrom: 'storyteller-final-ruling',
          targetSeats: [targetSeat],
          transferSeat: null
        }
      };
    }
    const transferTarget = findPlayerBySeat(players, transferSeat);
    if (!transferTarget || !isAlive(transferTarget) || !isMinion(transferTarget)) {
      fail('invalid-imp-transfer-seat', 'imp self-kill transfer target must be a living Minion');
    }
    return {
      ...nextDraft,
      ...makeImpSelfKillTransferDraft(actorSeat, transferSeat),
      editableStatePatch: {
        effect: type,
        generatedFrom: 'storyteller-final-ruling',
        transferSeat
      }
    };
  }

  if (type === 'demon-kill-fanggu') {
    const targetSeat = normalizeEditableTargetSeats(stateChangeDraft, baseDraft)[0] || null;
    if (!Number.isInteger(targetSeat)) {
      fail('missing-fanggu-ruling-target', 'fang gu edit requires one target seat');
    }
    const target = findPlayerBySeat(players, targetSeat);
    if (!target) {
      fail('missing-fanggu-ruling-target-player', 'fang gu target must exist in current room state');
    }
    const registrationRuling = normalizeFangGuRegistrationRuling(stateChangeDraft, baseDraft);
    const fangGuDraft = makeFangGuAttackDraft(actorSeat, targetSeat, target, getRoomState(roomState), { registrationRuling });
    return {
      ...nextDraft,
      ...fangGuDraft,
      targetSeats: [targetSeat],
      editableStatePatch: {
        effect: type,
        generatedFrom: 'storyteller-final-ruling',
        targetSeats: [targetSeat],
        registrationRuling,
        jumped: fangGuDraft.jumped === true
      }
    };
  }

  return null;
}

function makeId(prefix, parts) {
  return [prefix, ...parts.filter((part) => part !== undefined && part !== null && part !== '')].join('-');
}

function makeWarning(code, text, severity = 'storyteller-review') {
  return { code, severity, text };
}

function makeBaseCandidate({ room, submission, player, roleId, source = 'rules', candidateKind, status, now }) {
  return {
    candidateId: makeId('cand', [submission.batchId || 'batch', submission.actionId || submission.submissionId || submission.id || player.seat]),
    schemaVersion: SCHEMA_VERSION,
    roomId: getRoomId(room),
    batchId: submission.batchId || null,
    actionId: submission.actionId || null,
    sourceSubmissionId: submission.submissionId || submission.id || null,
    seat: Number(submission.seat || player.seat),
    roleId,
    roleIdAtPrompt: submission.roleIdAtPrompt || roleId,
    source,
    candidateKind,
    status,
    requiresStorytellerConfirmation: true,
    visibleResultDraft: null,
    stateChangeDraft: null,
    publicEventDraft: null,
    diaryDraft: null,
    warnings: [],
    ruleEvidence: {
      sourcePolicy: 'official-structured-or-local-official-rule-only',
      scriptId: getScriptId(room),
      ruleEngineVersion: 'stage6-local-rules',
      officialRoleIds: [roleId]
    },
    roleRuleContract: buildCandidateRuleContract(roleId, candidateKind),
    aiAssistance: null,
    auditRef: null,
    createdAt: nowIso(now),
    createdBy: source === 'rules' ? 'rules-engine' : 'ai-assistance',
    updatedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: null,
    confirmationCommandId: null,
    eventLogWritten: false,
    stateChanged: false,
    privateMessagesSent: false,
    diaryWritten: false
  };
}

function makeManualRulingCandidate(context, warningText) {
  const candidate = makeBaseCandidate({
    ...context,
    candidateKind: 'manual-ruling-required',
    status: 'needs-storyteller-ruling'
  });
  candidate.warnings.push(makeWarning('manual-ruling-required', warningText));
  candidate.diaryDraft = {
    storytellerText: `${candidate.seat} 号 ${candidate.roleId} 需要说书人裁决。`,
    playerPrivateText: null
  };
  return candidate;
}

function buildImportedLogicCandidate(context, submission, logicProfile) {
  const payload = submission.payload || {};
  const targets = normalizeTargets(payload);
  const promptKind = logicProfile?.promptKind || payload.kind || 'auto_info';
  const resultType = logicProfile?.resultType || (promptKind === 'auto_info' ? 'information' : 'choice');
  const importedRole = findRoleInScript(context.room, context.roleId) || {
    id: context.roleId,
    ability: '',
    logicProfile
  };
  const complexRulingGate = buildComplexRulingGate({
    boardId: getScriptId(context.room),
    role: importedRole
  });
  const manualStateRulingRequired = resultType === 'status' || resultType === 'role-change';
  const manualComplexRulingRequired = complexRulingGate.storytellerRequired === true;
  const candidate = makeBaseCandidate({
    ...context,
    source: 'rules',
    candidateKind: logicProfile?.candidateType || (resultType === 'information' ? 'custom-info-candidate' : 'custom-choice-candidate'),
    status: manualComplexRulingRequired ? 'needs-storyteller-ruling' : 'pending-storyteller'
  });
  candidate.complexRulingGate = complexRulingGate;
  candidate.importedLogicProfile = {
    schemaVersion: logicProfile?.schemaVersion || 'botc.imported-role-logic.v1',
    source: logicProfile?.source || 'storyteller-reviewed-import',
    triggerMode: logicProfile?.triggerMode || null,
    promptKind,
    resultType,
    riskLevel: logicProfile?.riskLevel || 'medium',
    automationClass: logicProfile?.automationClass || logicProfile?.classId || null,
    automationClassName: logicProfile?.automationClassName || null,
    automationRule: logicProfile?.automationRule || null,
    storytellerConfirmationRequired: logicProfile?.storytellerConfirmationRequired !== false,
    playerVisibleBoundary: logicProfile?.playerVisibleBoundary || 'confirmed-candidate-only'
  };
  candidate.ruleEvidence = {
    sourcePolicy: 'storyteller-reviewed-imported-role-logic-profile',
    scriptId: getScriptId(context.room),
    ruleEngineVersion: 'imported-role-logic-profile-v1',
    officialRoleIds: []
  };
  candidate.diaryDraft = {
    storytellerText: `${displayRoleName(context.roleId)}提交导入角色行动 ${promptKind}：${JSON.stringify(payload)}`,
    playerPrivateText: promptKind === 'auto_info'
      ? '你的自定义能力结果已准备好，等待说书人确认。'
      : null
  };
  if (resultType === 'information' || promptKind === 'auto_info') {
    candidate.visibleResultDraft = {
      recipientSeat: candidate.seat,
      messageType: 'private',
      text: '你的自定义能力结果已准备好。',
      redactedForPlayer: true
    };
  } else {
    const typeByResult = {
      choice: 'imported-role-choice',
      poison: 'imported-role-poison',
      protect: 'imported-role-protect',
      kill: 'imported-role-kill',
      status: 'imported-role-status',
      'role-change': 'imported-role-change'
    };
    candidate.stateChangeDraft = {
      type: typeByResult[resultType] || 'imported-role-choice',
      targetSeat: targets.length === 1 ? targets[0] : null,
      targetSeats: targets,
      roleId: payload.roleId || payload.guessedRoleId || null,
      resultType,
      patches: [],
      privateMessageDrafts: [],
      summary: `${displayRoleName(context.roleId)}导入角色候选已记录，类型：${resultType}，等待说书人确认。`
    };
  }
  if (manualComplexRulingRequired) {
    candidate.manualRulingRequired = true;
    candidate.rulingRequirement = {
      code: manualStateRulingRequired
        ? 'imported-state-effect-needs-final-patch'
        : 'imported-complex-effect-needs-safe-template',
      resultType,
      reasons: complexRulingGate.reasons,
      reason: manualStateRulingRequired
        ? '复杂状态或转职效果尚无可安全写入的状态补丁，不能直接确认。'
        : '多效果或延迟效果尚无已验证的完整裁决模板，不能直接确认。'
    };
    candidate.warnings.push(makeWarning(
      manualStateRulingRequired
        ? 'imported-state-effect-needs-final-patch'
        : 'imported-complex-effect-needs-safe-template',
      manualStateRulingRequired
        ? '此复杂状态或转职候选不会自动写入魔典；请由说书人手动裁决，不能把空状态变化确认为已生效。'
        : '此多效果或延迟效果候选没有已验证的完整模板；只能由说书人复核、仅记录或不采用。',
      'high-risk-storyteller-review'
    ));
  }
  candidate.warnings.push(makeWarning(
    'imported-role-logic-profile',
    '导入/自定义角色逻辑来自已审核的 logicProfile；最终裁决仍需说书人确认。',
    logicProfile?.riskLevel === 'high' ? 'high-risk-storyteller-review' : 'storyteller-review'
  ));
  return candidate;
}

function requiresEffectiveImportedStatePatch(candidate = {}) {
  return IMPORTED_STATE_PATCH_REQUIRED_TYPES.has(candidate?.stateChangeDraft?.type);
}

function hasEffectiveStatePatch(patches = []) {
  return asArray(patches).some((patch) => patch?.op === 'set' && String(patch?.path || '').trim());
}

function buildVisibleCandidate(context, text, storytellerText, playerText, warnings = [], visibleMeta = {}) {
  const candidate = makeBaseCandidate({
    ...context,
    candidateKind: 'rule-result',
    status: 'pending-storyteller'
  });
  candidate.visibleResultDraft = {
    recipientSeat: candidate.seat,
    messageType: 'private',
    text,
    redactedForPlayer: true,
    ...clone(visibleMeta)
  };
  candidate.diaryDraft = {
    storytellerText,
    playerPrivateText: playerText
  };
  candidate.warnings.push(...warnings);
  return candidate;
}

function buildStateCandidate(context, stateChangeDraft, storytellerText, warnings = []) {
  const candidate = makeBaseCandidate({
    ...context,
    candidateKind: 'state-change',
    status: 'pending-storyteller'
  });
  candidate.stateChangeDraft = stateChangeDraft;
  candidate.diaryDraft = {
    storytellerText,
    playerPrivateText: null
  };
  candidate.warnings.push(...warnings);
  return candidate;
}

function buildFortuneTellerCandidate(context, players, submission, player) {
  if (isImpaired(player)) {
    return makeManualRulingCandidate(
      context,
      '占卜师醉酒或中毒时不得自动随机给假信息；请说书人确认最终“是/否”。'
    );
  }

  const targets = normalizeTargets(submission.payload);
  if (targets.length !== 2 || new Set(targets).size !== 2) {
    return makeManualRulingCandidate(context, '占卜师需要两个不同目标。');
  }

  const targetPlayers = targets.map((seat) => findPlayerBySeat(players, seat));
  if (targetPlayers.some((target) => !target)) {
    return makeManualRulingCandidate(context, '占卜师目标座位不存在。');
  }

  const hasDemon = targetPlayers.some((target) => isDemon(target) || target.redHerring === true);
  const registrationSensitive = targetPlayers.some((target) => target.redHerring === true || isRegistrationFlexible(target));
  const text = hasDemon ? '是' : '否';
  return buildVisibleCandidate(
    context,
    text,
    `占卜师 ${player.seat} 号选择 ${targets.join('、')} 号，规则候选结果：${text}。`,
    `你选择 ${targets.join('、')} 号，收到结果：${text}。`,
    registrationSensitive
      ? [makeWarning('red-herring-registration', '目标包含红鲱鱼登记风险；玩家端不得知道原因。')]
      : [],
    {
      resultKind: 'yes-no',
      resultValue: hasDemon ? 'yes' : 'no',
      resultOptions: [
        { value: 'yes', text: '是' },
        { value: 'no', text: '否' }
      ],
      targetSeats: targets,
      registrationSensitive
    }
  );
}

function buildChefCandidate(context, players, player) {
  if (isImpaired(player)) {
    return makeManualRulingCandidate(context, '厨师醉酒或中毒时不得自动随机给假信息；请说书人确认最终数字。');
  }

  const alivePlayers = getAlivePlayers(players);
  let pairs = 0;
  for (let index = 0; index < alivePlayers.length; index += 1) {
    const current = alivePlayers[index];
    const next = alivePlayers[(index + 1) % alivePlayers.length];
    if (isEvil(current) && isEvil(next)) pairs += 1;
  }

  return buildVisibleCandidate(
    context,
    String(pairs),
    `厨师 ${player.seat} 号规则候选结果：${pairs} 对邻座邪恶玩家。`,
    `你收到结果：${pairs}。`,
    [],
    {
      resultKind: 'number',
      resultValue: String(pairs),
      min: 0,
      max: alivePlayers.length,
      registrationSensitive: players.some(isRegistrationFlexible)
    }
  );
}

function buildEmpathCandidate(context, players, player) {
  if (isImpaired(player)) {
    return makeManualRulingCandidate(context, '共情者醉酒或中毒时不得自动随机给假信息；请说书人确认最终数字。');
  }

  const neighbors = getAliveNeighbors(player.seat, players);
  const count = [neighbors.left, neighbors.right].filter((neighbor) => neighbor && isEvil(neighbor)).length;
  return buildVisibleCandidate(
    context,
    String(count),
    `共情者 ${player.seat} 号规则候选结果：邻座 ${count} 个邪恶玩家。`,
    `你收到结果：${count}。`,
    [],
    {
      resultKind: 'number',
      resultValue: String(count),
      min: 0,
      max: 2,
      registrationSensitive: [neighbors.left, neighbors.right].some((neighbor) => neighbor && isRegistrationFlexible(neighbor))
    }
  );
}

function buildPoisonerCandidate(context, submission) {
  const [targetSeat] = normalizeTargets(submission.payload);
  if (!Number.isInteger(targetSeat)) {
    return makeManualRulingCandidate(context, '投毒者需要一个目标。');
  }

  return buildStateCandidate(
    context,
    {
      type: 'poison',
      targetSeat,
      patches: [
        { op: 'set', path: `playersBySeat.${targetSeat}.poisoned`, value: true }
      ],
      privateMessageDrafts: []
    },
    `投毒者 ${context.player.seat} 号候选：${targetSeat} 号本夜中毒。`
  );
}

function buildMonkCandidate(context, submission, player, candidateContext = {}) {
  const [targetSeat] = normalizeTargets(submission.payload);
  if (Number.isInteger(targetSeat)) candidateContext.protectedSeats?.add(Number(targetSeat));
  if (!Number.isInteger(targetSeat)) {
    return makeManualRulingCandidate(context, '僧侣需要一个目标。');
  }
  if (Number(targetSeat) === Number(player.seat)) {
    return makeManualRulingCandidate(context, '僧侣不能选择自己；请说书人裁决或拒绝。');
  }

  return buildStateCandidate(
    context,
    {
      type: 'protect',
      targetSeat,
      patches: [
        { op: 'set', path: `playersBySeat.${targetSeat}.protected`, value: true }
      ],
      privateMessageDrafts: []
    },
    `僧侣 ${player.seat} 号候选：${targetSeat} 号本夜受保护。`
  );
}

function buildImpCandidate(context, players, submission, player, candidateContext = {}) {
  const [targetSeat] = normalizeTargets(submission.payload);
  if (!Number.isInteger(targetSeat)) {
    return makeManualRulingCandidate(context, '小恶魔需要一个目标。');
  }

  const target = findPlayerBySeat(players, targetSeat);
  if (!target) {
    return makeManualRulingCandidate(context, '小恶魔目标座位不存在。');
  }

  if (target.protected === true || candidateContext.protectedSeats?.has(Number(targetSeat))) {
    return buildStateCandidate(
      context,
      {
        type: 'imp-kill-prevented',
        targetSeat,
        reason: 'protected',
        patches: [],
        privateMessageDrafts: []
      },
      `小恶魔 ${player.seat} 号攻击 ${targetSeat} 号，候选为被保护阻止。`
    );
  }

  if (getPlayerRoleId(target) === 'soldier') {
    return buildStateCandidate(
      context,
      {
        type: 'imp-kill-prevented',
        targetSeat,
        reason: 'soldier-immune',
        patches: [],
        privateMessageDrafts: []
      },
      `小恶魔 ${player.seat} 号攻击 ${targetSeat} 号，候选为士兵免疫。`
    );
  }

  if (Number(targetSeat) === Number(player.seat)) {
    const transferSeat = findDefaultImpTransferSeat(players, player.seat);
    const transferDraft = makeImpSelfKillTransferDraft(Number(player.seat), transferSeat);
    const warnings = transferSeat
    ? [makeWarning('demon-transfer-storyteller-editable', '小恶魔自杀转移已按首个存活爪牙生成；确认前说书人可以修改新恶魔。')]
    : [makeWarning('demon-transfer-missing-minion', '小恶魔自杀转移没有找到存活爪牙；说书人必须手动处理“无新恶魔”边界。', 'high-risk-storyteller-review')];
    return buildStateCandidate(
      context,
      transferDraft,
      `小恶魔 ${player.seat} 号选择自己，候选为小恶魔死亡并转移恶魔。`,
      warnings
    );
    return buildStateCandidate(
      context,
      {
        type: 'imp-self-kill-transfer',
        targetSeat,
        patches: [
          { op: 'set', path: `playersBySeat.${targetSeat}.alive`, value: false },
          { op: 'manual', path: 'demon-transfer', value: 'requires-storyteller-choice' }
        ],
        privateMessageDrafts: [
          { type: 'ability-result', text: '你现在是小恶魔。', toSeat: null, requiresStorytellerTarget: true }
        ]
      },
      `小恶魔 ${player.seat} 号选择自己，候选为死亡并转移恶魔；需说书人确认新恶魔。`,
      [makeWarning('demon-transfer-requires-storyteller', '小恶魔自杀转移必须由说书人确认新恶魔。')]
    );
  }

  return buildStateCandidate(
    context,
    {
      type: 'kill',
      targetSeat,
      patches: [
        { op: 'set', path: `playersBySeat.${targetSeat}.alive`, value: false }
      ],
      privateMessageDrafts: []
    },
    `小恶魔 ${player.seat} 号候选：${targetSeat} 号死亡。`
  );
}

function buildSailorCandidate(context, submission, player) {
  const [targetSeat] = normalizeTargets(submission.payload);
  if (!Number.isInteger(targetSeat)) {
    return makeManualRulingCandidate(context, '水手需要选择 1 名目标。');
  }

  return buildStateCandidate(
    context,
    {
      type: 'bmr-sailor-drunk-choice',
      actorSeat: Number(player.seat),
      targetSeat,
      requiresStorytellerChoice: true,
      patches: [],
      privateMessageDrafts: []
    },
    `${player.seat}号水手选择${targetSeat}号；由说书人决定水手或目标醉酒到黄昏。`,
    [makeWarning('bmr-partial-rules', '水手醉酒对象不会自动写入，请说书人确认后处理。')]
  );
}

function buildChambermaidCandidate(context, submission, submissions) {
  const targets = normalizeTargets(submission.payload);
  if (targets.length !== 2 || new Set(targets).size !== 2) {
    return makeManualRulingCandidate(context, '侍女需要选择 2 名不同目标。');
  }

  const batchSubmissions = submissions.filter((item) => item.batchId === submission.batchId && item.status === 'locked');
  const wokeSeats = new Set(batchSubmissions.map((item) => Number(item.seat)));
  const count = targets.filter((targetSeat) => wokeSeats.has(Number(targetSeat))).length;
  return buildVisibleCandidate(
    context,
    String(count),
    `${context.player.seat}号侍女选择${displaySeatList(targets)}；本地候选结果为 ${count}。`,
    `你得知：${count}。`,
    [makeWarning('bmr-partial-rules', '侍女计数只统计当前已支持的夜晚行动；最终数字需说书人确认。')],
    {
      resultKind: 'number',
      resultValue: String(count),
      min: 0,
      max: 2,
      targetSeats: targets
    }
  );
}

function buildInnkeeperCandidate(context, submission, candidateContext = {}) {
  const targets = normalizeTargets(submission.payload);
  for (const targetSeat of targets) candidateContext.protectedSeats?.add(Number(targetSeat));
  if (targets.length !== 2 || new Set(targets).size !== 2) {
    return makeManualRulingCandidate(context, '旅店老板需要选择 2 名不同目标。');
  }

  return buildStateCandidate(
    context,
    {
      type: 'bmr-innkeeper-protect-and-drunk-choice',
      protectedTargetSeats: targets,
      drunkChoiceRequired: true,
      patches: targets.map((targetSeat) => ({ op: 'set', path: `playersBySeat.${targetSeat}.protected`, value: true })),
      privateMessageDrafts: []
    },
    `${context.player.seat}号旅店老板保护${displaySeatList(targets)}；由说书人选择其中一名醉酒。`,
    [makeWarning('bmr-partial-rules', '旅店老板的醉酒对象不会自动写入，请说书人确认后处理。')]
  );
}

function buildProfessorCandidate(context, players, submission) {
  const [targetSeat] = normalizeTargets(submission.payload);
  if (!Number.isInteger(targetSeat)) {
    return makeManualRulingCandidate(context, '教授需要选择 1 名目标。');
  }

  const target = findPlayerBySeat(players, targetSeat);
  if (!target) return makeManualRulingCandidate(context, '教授目标座位不存在。');
  if (isAlive(target) || !isTownsfolk(target)) {
    return buildStateCandidate(
      context,
      {
        type: 'bmr-professor-revive',
        targetSeat,
        revived: false,
        patches: [],
        privateMessageDrafts: []
      },
      `${context.player.seat}号教授选择${targetSeat}号；本地检查未确认目标是已死亡镇民。`,
      [makeWarning('bmr-professor-target-check', '教授目标必须是已死亡镇民，请说书人裁决。')]
    );
  }

  return buildStateCandidate(
    context,
    {
      type: 'bmr-professor-revive',
      targetSeat,
      revived: true,
      patches: [
        { op: 'set', path: `playersBySeat.${targetSeat}.alive`, value: true }
      ],
      privateMessageDrafts: []
    },
    `${context.player.seat}号教授候选：${targetSeat}号复活，等待说书人确认。`
  );
}

function buildDevilsAdvocateCandidate(context, submission) {
  const [targetSeat] = normalizeTargets(submission.payload);
  if (!Number.isInteger(targetSeat)) {
    return makeManualRulingCandidate(context, '恶魔代言人需要选择 1 名目标。');
  }

  return buildStateCandidate(
    context,
    {
      type: 'bmr-devils-advocate-execution-protect',
      targetSeat,
      duration: 'tomorrow-day',
      patches: [
        { op: 'set', path: `playersBySeat.${targetSeat}.executionProtected`, value: true }
      ],
      privateMessageDrafts: []
    },
    `${context.player.seat}号恶魔代言人保护${targetSeat}号免于明日处决，等待说书人确认。`,
    [makeWarning('bmr-partial-rules', '“不能连续选择同一目标”的限制不会自动执行，请说书人核对。')]
  );
}

function buildAssassinCandidate(context, submission) {
  const [targetSeat] = normalizeTargets(submission.payload);
  if (!Number.isInteger(targetSeat)) {
    return makeManualRulingCandidate(context, '刺客需要选择 1 名目标。');
  }

  return buildStateCandidate(
    context,
    {
      type: 'bmr-assassin-kill',
      targetSeat,
      bypassesProtection: true,
      patches: [
        { op: 'set', path: `playersBySeat.${targetSeat}.alive`, value: false }
      ],
      privateMessageDrafts: []
    },
    `${context.player.seat}号刺客候选：${targetSeat}号死亡，等待说书人确认。`,
    [makeWarning('bmr-partial-rules', '刺客“一局一次”用量由说书人确认。')]
  );
}

function buildShabalothCandidate(context, submission, candidateContext = {}) {
  const targets = normalizeTargets(submission.payload);
  if (targets.length !== 2 || new Set(targets).size !== 2) {
    return makeManualRulingCandidate(context, '沙巴洛斯需要选择 2 名不同目标。');
  }

  const blockedTargets = targets.filter((targetSeat) => candidateContext.protectedSeats?.has(Number(targetSeat)));
  const killedTargets = targets.filter((targetSeat) => !candidateContext.protectedSeats?.has(Number(targetSeat)));

  return buildStateCandidate(
    context,
    {
      type: 'bmr-shabaloth-kill',
      targetSeats: targets,
      killedTargetSeats: killedTargets,
      blockedTargetSeats: blockedTargets,
      patches: killedTargets.map((targetSeat) => ({ op: 'set', path: `playersBySeat.${targetSeat}.alive`, value: false })),
      privateMessageDrafts: []
    },
    `${context.player.seat}号沙巴洛斯候选：死亡 ${displaySeatList(killedTargets)}；受保护 ${displaySeatList(blockedTargets)}。`,
    [makeWarning('bmr-partial-rules', '沙巴洛斯的反刍复活仍需说书人确认。')]
  );
}

function getLatestExecutedSeat(room) {
  const execution = room?.stage7DayVoteExecution?.execution;
  if (execution?.status === 'confirmed' && Number.isInteger(Number(execution.nomineeSeat))) {
    return Number(execution.nomineeSeat);
  }
  const event = asArray(room?.publicEvents).slice().reverse().find((item) => {
    return item?.type === 'execution_confirmed' && Number.isInteger(Number(item.nomineeSeat ?? item.payload?.nomineeSeat));
  });
  return event ? Number(event.nomineeSeat ?? event.payload.nomineeSeat) : null;
}

function makePrivateInfo(context, text, storytellerText, warnings = [], visibleMeta = {}) {
  return buildVisibleCandidate(context, text, storytellerText, text, warnings, visibleMeta);
}

function buildLearnTwoAndRoleCandidate(context, players, rule) {
  const candidates = players.filter((player) => {
    if (Number(player.seat) === Number(context.player.seat)) return false;
    if (rule.learnTeam === 'minion') return MINION_ROLE_IDS.has(getPlayerRoleId(player));
    if (rule.learnTeam === 'outsider') return getAlignmentForPlayer(player) === 'good' && String(player.team || '').toLowerCase().includes('outsider');
    if (rule.learnTeam === 'townsfolk') return TOWNSFOLK_ROLE_IDS.has(getPlayerRoleId(player));
    return false;
  });
  const trueSeat = candidates[0] || players.find((player) => Number(player.seat) !== Number(context.player.seat));
  const decoySeat = players.find((player) => {
    return Number(player.seat) !== Number(context.player.seat) && Number(player.seat) !== Number(trueSeat?.seat);
  });
  const seats = [trueSeat?.seat, decoySeat?.seat].filter(Number.isInteger);
  const roleId = trueSeat ? getPlayerRoleId(trueSeat) : null;
  const text = seats.length === 2 && roleId
    ? `你得知：${displaySeatList(seats)}中有一人是${displayRoleName(roleId)}。`
    : '你得知：本局没有匹配角色。';
  return makePrivateInfo(
    context,
    text,
    `${displayRoleName(context.roleId)}信息已生成：${text}`,
    [makeWarning('storyteller-ai-info', '登记与误导项需说书人确认。')],
    {
      resultKind: 'two-seats-role',
      resultSeats: seats,
      resultRoleId: roleId,
      resultValue: seats.length === 2 && roleId ? `${seats.join(',')}:${roleId}` : 'none',
      registrationSensitive: true
    }
  );
}

function buildGenericInfoCandidate(context, players, rule) {
  if (rule.resolution === 'learn-two-and-role') return buildLearnTwoAndRoleCandidate(context, players, rule);
  if (rule.resolution === 'grimoire-info') {
    return buildPrivateGrimoireCandidate(context);
  }
  if (rule.resolution === 'undertaker-executed-role') {
    const executedSeat = getLatestExecutedSeat(context.room);
    const executedPlayer = findPlayerBySeat(players, executedSeat);
    const roleId = executedPlayer ? getPlayerRoleId(executedPlayer) : 'none';
    return makePrivateInfo(
      context,
      `你得知：${displayRoleName(roleId)}。`,
      `掘墓人得知今日处决角色：${displayRoleName(roleId)}。`,
      [],
      {
        resultKind: 'role',
        resultRoleId: roleId,
        resultValue: roleId
      }
    );
  }
  if (rule.resolution === 'grandmother-grandchild') {
    const good = players.find((player) => Number(player.seat) !== Number(context.player.seat) && getAlignmentForPlayer(player) === 'good');
    const text = good ? `你得知：${good.seat}号是${displayRoleName(getPlayerRoleId(good))}。` : '本地信息未找到可用的善良玩家。';
    return makePrivateInfo(
      context,
      text,
      `祖母信息已生成：${text}`,
      [],
      {
        resultKind: 'seat-role',
        resultSeat: Number(good?.seat) || null,
        resultRoleId: good ? getPlayerRoleId(good) : 'none',
        resultValue: good ? `${good.seat}:${getPlayerRoleId(good)}` : 'none',
        registrationSensitive: true
      }
    );
  }
  if (rule.resolution === 'godfather-outsider-death-kill') {
    const outsiders = players.filter((player) => String(player.team || '').toLowerCase().includes('outsider'));
    const text = outsiders.length > 0
      ? `在场外来者：${displaySeatList(outsiders.map((player) => player.seat))}。`
      : '在场外来者：无。';
    return makePrivateInfo(context, text, `教父外来者信息已生成：${text}`);
  }
  if (rule.resolution === 'balloonist-type-info') {
    const target = players.find((player) => Number(player.seat) !== Number(context.player.seat));
    const text = target ? `你得知：${target.seat}号。` : '没有可用目标。';
    return makePrivateInfo(context, text, `气球驾驶员信息已生成：${text}`, [
      makeWarning('storyteller-ai-info', '不同角色类型的历史记录需说书人确认。')
    ], {
      resultKind: 'seat',
      resultSeat: Number(target?.seat) || null,
      resultValue: target ? String(target.seat) : 'none',
      registrationSensitive: true
    });
  }
  return makePrivateInfo(
    context,
    '你的夜晚信息已准备好。',
    `${displayRoleName(context.roleId)}信息已由规则库生成。`,
    [makeWarning('storyteller-ai-info', '此信息仍需说书人确认。')]
  );
}

function displayRoleList(roleIds) {
  const list = asArray(roleIds).map((item) => {
    if (typeof item === 'string') return item;
    return item?.roleId || item?.id || item?.name || null;
  }).filter(Boolean);
  return list.length > 0 ? list.join(', ') : 'none';
}

function firstGoodPlayer(players, excludedSeat) {
  return players.find((player) => Number(player.seat) !== Number(excludedSeat) && getAlignmentForPlayer(player) === 'good') || null;
}

function firstDemonPlayer(players, excludedSeat = null) {
  return players.find((player) => {
    if (excludedSeat !== null && Number(player.seat) === Number(excludedSeat)) return false;
    return isDemon(player);
  }) || null;
}

function buildPrivateGrimoireCandidate(context) {
  return buildStateCandidate(
    context,
    {
      type: `${context.roleId}-private-grimoire`,
      actorSeat: Number(context.player.seat),
      patches: [],
      privateMessageDrafts: [
        {
          toSeat: Number(context.player.seat),
          type: 'ability-result',
          text: '你的私密魔典已在玩家端可查看。'
        }
      ]
    },
    `${context.player.seat}号私密魔典已准备。`
  );
}

function buildLunaticCandidate(context, players, submission) {
  const payload = submission.payload || {};
  const [targetSeat] = normalizeTargets(payload);
  const actorSeat = Number(context.player.seat);
  const realDemon = firstDemonPlayer(players, actorSeat);
  const fakeMinions = players
    .filter((player) => Number(player.seat) !== actorSeat && !isDemon(player))
    .slice(0, 2)
    .map((player) => player.seat);
  const bluffs = displayRoleList(context.room?.demonBluffs);
  const privateMessageDrafts = [
    {
      toSeat: actorSeat,
      type: 'ability-result',
      text: `恶魔信息：爪牙 ${fakeMinions.join('、') || '无'}；恶魔伪装 ${bluffs}。`
    }
  ];
  if (realDemon) {
    privateMessageDrafts.push({
      toSeat: Number(realDemon.seat),
      type: 'ability-result',
      text: Number.isInteger(targetSeat)
        ? `疯子${actorSeat}号提交目标${targetSeat}号。`
        : `疯子${actorSeat}号尚未提交目标。`
    });
  }

  const patches = [
    { op: 'set', path: `playersBySeat.${actorSeat}.lunaticDecoyRoleId`, value: 'demon' }
  ];
  if (Number.isInteger(targetSeat)) {
    patches.push({ op: 'set', path: `playersBySeat.${actorSeat}.lunaticDecoyTargetSeat`, value: targetSeat });
  }

  return buildStateCandidate(
    context,
    {
      type: 'lunatic-demon-decoy',
      actorSeat,
      targetSeat: Number.isInteger(targetSeat) ? targetSeat : null,
      realDemonSeat: realDemon ? Number(realDemon.seat) : null,
      killed: false,
      patches,
      privateMessageDrafts
    },
      `疯子${actorSeat}号的误导信息/行动已准备；该误导不会直接造成死亡。`
  );
}

function buildEvilTwinCandidate(context, players) {
  const actorSeat = Number(context.player.seat);
  const goodTwin = firstGoodPlayer(players, actorSeat);
  if (!goodTwin) return makeManualRulingCandidate(context, '邪恶双子需要一名善良双子候选。');
  const goodTwinRoleId = getPlayerRoleId(goodTwin);
  return buildStateCandidate(
    context,
    {
      type: 'evil-twin-pair-and-win-condition',
      actorSeat,
      goodTwinSeat: Number(goodTwin.seat),
      goodTwinRoleId,
      patches: [
        { op: 'set', path: `playersBySeat.${actorSeat}.evilTwinPairSeat`, value: Number(goodTwin.seat) },
        { op: 'set', path: `playersBySeat.${goodTwin.seat}.evilTwinPairSeat`, value: actorSeat }
      ],
      privateMessageDrafts: [
        {
          toSeat: actorSeat,
          type: 'ability-result',
          text: `你的善良双子是${goodTwin.seat}号，显示为${displayRoleName(goodTwinRoleId)}。`
        },
        {
          toSeat: Number(goodTwin.seat),
          type: 'ability-result',
          text: `你的邪恶双子是${actorSeat}号。`
        }
      ]
    },
    `${actorSeat}号邪恶双子与${goodTwin.seat}号善良双子配对；处决胜利条件需说书人确认。`
  );
}

function buildAutomationCandidate(context, players, submission, candidateContext = {}) {
  const roleId = normalizeAutomationRoleId(context.roleId);
  const rule = getRule(roleId);
  if (!rule) return null;
  const payload = submission.payload || {};
  const targets = normalizeTargets(payload);
  const [targetSeat] = targets;
  const target = Number.isInteger(targetSeat) ? findPlayerBySeat(players, targetSeat) : null;
  const actorSeat = Number(context.player.seat);

  if (roleId === 'lunatic') return buildLunaticCandidate(context, players, submission);
  if (roleId === 'eviltwin') return buildEvilTwinCandidate(context, players);
  if (roleId === 'spy') return buildPrivateGrimoireCandidate(context);

  if (payload.kind === 'auto_info' || rule.automation?.includes('info')) {
    return buildGenericInfoCandidate(context, players, rule);
  }

  if (['poison-target', 'widow-poison-and-warning'].includes(rule.resolution)) {
    if (!Number.isInteger(targetSeat)) return makeManualRulingCandidate(context, `${displayRoleName(roleId)}需要选择 1 名目标。`);
    return buildStateCandidate(
      context,
      {
        type: rule.resolution,
        targetSeat,
        patches: [
          { op: 'set', path: `playersBySeat.${targetSeat}.poisoned`, value: true }
        ],
        privateMessageDrafts: roleId === 'widow'
          ? [
              {
                toSeat: actorSeat,
                type: 'ability-result',
          text: `已查看私密魔典；中毒目标记录为${targetSeat}号。`
              }
            ]
          : [],
        widowWarningRequired: roleId === 'widow'
      },
      `${targetSeat}号中毒，需说书人确认。${roleId === 'widow' ? ' 寡妇提示仍由说书人处理。' : ''}`
    );
  }

  if (rule.resolution === 'butler-master') {
    if (!Number.isInteger(targetSeat)) return makeManualRulingCandidate(context, '管家需要选择 1 名目标。');
    return buildStateCandidate(
      context,
      {
        type: 'butler-master',
        targetSeat,
        patches: [
          { op: 'set', path: `playersBySeat.${actorSeat}.butlerMasterSeat`, value: targetSeat }
        ],
        privateMessageDrafts: []
      },
      `${actorSeat}号管家选择${targetSeat}号为主人。`
    );
  }

  if (rule.resolution === 'protect-target') {
    if (!Number.isInteger(targetSeat)) return makeManualRulingCandidate(context, `${displayRoleName(roleId)}需要选择 1 名目标。`);
    candidateContext.protectedSeats?.add(Number(targetSeat));
    return buildStateCandidate(
      context,
      {
        type: 'protect',
        targetSeat,
        patches: [
          { op: 'set', path: `playersBySeat.${targetSeat}.protected`, value: true }
        ],
        privateMessageDrafts: []
      },
      `${targetSeat}号获得保护。`
    );
  }

  if (['demon-kill', 'demon-kill-vigormortis', 'demon-kill-fanggu', 'vortox-kill-and-false-info'].includes(rule.resolution)) {
    if (!Number.isInteger(targetSeat)) return makeManualRulingCandidate(context, `${displayRoleName(roleId)}需要选择 1 名目标。`);
    const blocked = target?.protected === true || candidateContext.protectedSeats?.has(Number(targetSeat));
    const soldierBlocked = target && getPlayerRoleId(target) === 'soldier';
    if (rule.resolution === 'demon-kill-fanggu') {
      const targetForDraft = blocked && target ? { ...target, protected: true } : target;
      const fangGuDraft = makeFangGuAttackDraft(Number(context.player.seat), targetSeat, targetForDraft, getRoomState(context.room));
      const fangGuWarnings = [];
      if (fangGuDraft.jumped === true) {
        fangGuWarnings.push(makeWarning('fanggu-outsider-jump', '方古首次外来者跳转已生成；确认前说书人可以修改目标。'));
      }
      if (target && isRegistrationFlexible(target)) {
        fangGuWarnings.push(makeWarning('fanggu-registration-ruling', '方古目标存在弹性登记；确认前说书人可以选择本次是否登记为外来者。'));
      }
      return buildStateCandidate(
        context,
        fangGuDraft,
        `${context.player.seat}号方古攻击${targetSeat}号；跳转：${fangGuDraft.jumped === true ? '是' : '否'}；死亡：${fangGuDraft.killed === true ? '是' : '否'}。`,
        fangGuWarnings
      );
    }
    const patches = blocked || soldierBlocked
      ? []
      : [{ op: 'set', path: `playersBySeat.${targetSeat}.alive`, value: false }];
    return buildStateCandidate(
      context,
      {
        type: rule.resolution,
        targetSeat,
        killed: patches.length > 0,
        blockedBy: blocked ? 'protection' : soldierBlocked ? 'soldier' : null,
        falseInfoContext: rule.resolution === 'vortox-kill-and-false-info' ? 'vortox' : null,
        patches,
        privateMessageDrafts: []
      },
      `${displayRoleName(roleId)}攻击${targetSeat}号；死亡：${patches.length > 0 ? '是' : '否'}。`,
      rule.resolution === 'demon-kill-fanggu'
        ? [makeWarning('fanggu-outsider-jump', '方古首次外来者跳转需说书人确认。')]
        : rule.resolution === 'vortox-kill-and-false-info'
          ? [makeWarning('vortox-false-info', '涡流在场时，所有镇民信息均需由说书人确认并保持错误信息。')]
        : []
    );
  }

  if (rule.resolution === 'gambler-guess') {
    if (!target || !payload.guessedRoleId) return makeManualRulingCandidate(context, '赌徒需要目标座位和猜测角色。');
    const guessedRoleId = normalizeAutomationRoleId(payload.guessedRoleId);
    const correct = getPlayerRoleId(target) === guessedRoleId;
    return buildStateCandidate(
      context,
      {
        type: 'gambler-guess',
        targetSeat,
        guessedRoleId,
        correct,
        patches: correct ? [] : [{ op: 'set', path: `playersBySeat.${actorSeat}.alive`, value: false }],
        privateMessageDrafts: []
      },
      `${actorSeat}号赌徒猜测${targetSeat}号是${displayRoleName(guessedRoleId)}；结果：${correct ? '猜中，不死亡' : '猜错，赌徒死亡'}。`
    );
  }

  if (rule.resolution === 'snakecharmer-swap') {
    if (!target) return makeManualRulingCandidate(context, '舞蛇人需要选择 1 名存活目标。');
    const targetIsDemon = isDemon(target);
    const actorImpaired = isImpaired(context.player);
    const swapApplied = targetIsDemon && !actorImpaired;
    const patches = swapApplied ? buildSnakeCharmerSwapPatches(context.player, target, context.room) : [];
    return buildStateCandidate(
      context,
      {
        type: 'snakecharmer-swap',
        targetSeat,
        targetIsDemon,
        actorImpaired,
        swapApplied,
        patches,
        privateMessageDrafts: []
      },
      `${actorSeat}号舞蛇人选择${targetSeat}号；交换：${swapApplied ? '是' : (actorImpaired ? '否（醉酒或中毒）' : '否')}。`
    );
  }

  if (['cerenovus-madness', 'pithag-character-change', 'philosopher-gain-ability'].includes(rule.resolution)) {
    const chosenRoleId = normalizeAutomationRoleId(payload.roleId || payload.guessedRoleId);
    if (!chosenRoleId) return makeManualRulingCandidate(context, `${displayRoleName(roleId)}需要选择 1 个角色。`);
    const patches = [];
    if (rule.resolution === 'cerenovus-madness' && Number.isInteger(targetSeat)) {
      patches.push({ op: 'set', path: `playersBySeat.${targetSeat}.madAsRoleId`, value: chosenRoleId });
    }
    if (rule.resolution === 'pithag-character-change' && Number.isInteger(targetSeat)) {
      patches.push(...buildRoleTransitionPatches(context.room, targetSeat, chosenRoleId));
      patches.push({ op: 'set', path: `playersBySeat.${targetSeat}.pithagChangedRoleId`, value: chosenRoleId });
    }
    if (rule.resolution === 'philosopher-gain-ability') {
      const originalHolder = players.find((candidate) => {
        return Number(candidate.seat) !== actorSeat && getPlayerRoleId(candidate) === chosenRoleId;
      });
      patches.push({ op: 'set', path: `playersBySeat.${actorSeat}.gainedAbilityRoleId`, value: chosenRoleId });
      if (originalHolder) {
        patches.push({ op: 'set', path: `playersBySeat.${originalHolder.seat}.drunk`, value: true });
        patches.push({ op: 'set', path: `playersBySeat.${actorSeat}.philosopherDrunkedSeat`, value: Number(originalHolder.seat) });
      }
    }
    return buildStateCandidate(
      context,
      {
        type: rule.resolution,
        targetSeat: Number.isInteger(targetSeat) ? targetSeat : null,
        chosenRoleId,
        scriptLegalityReview: rule.resolution === 'pithag-character-change' ? 'storyteller-confirmed' : null,
        patches,
        privateMessageDrafts: []
      },
      `${displayRoleName(roleId)}选择${displayRoleName(chosenRoleId)}，等待说书人确认。`,
      [makeWarning('storyteller-ai-state', `${displayRoleName(roleId)}存在复杂边界；最终效果需说书人确认。`)]
    );
  }

  return makeManualRulingCandidate(context, `${displayRoleName(roleId)}已有规则库候选，但仍需说书人最终裁决。`);
}

function buildRuleCandidate({ room, submission, submissions, players, candidateContext, now }) {
  if (submission.status !== 'locked') {
    fail('submission-not-locked', 'candidate generation requires locked submissions');
  }

  const player = findPlayerBySeat(players, submission.seat);
  if (!player) fail('missing-submission-player', `missing player for seat ${submission.seat}`);

  const roleId = getRoleIdForSubmission(submission, player);
  const context = { room, submission, player, roleId, now };
  const importedLogicProfile = getImportedRoleLogicProfile(room, roleId);
  if (importedLogicProfile && getRoomScript(room)?.source?.kind === 'local-image') {
    return buildImportedLogicCandidate(context, submission, importedLogicProfile);
  }
  if (!SUPPORTED_ROLE_IDS.has(roleId)) {
    if (importedLogicProfile) {
      return buildImportedLogicCandidate(context, submission, importedLogicProfile);
    }
    return makeManualRulingCandidate(context, `角色 ${roleId} 暂未进入阶段 6 自动候选支持。`);
  }

  switch (roleId) {
    case 'fortune-teller':
      return buildFortuneTellerCandidate(context, players, submission, player);
    case 'chef':
      return buildChefCandidate(context, players, player);
    case 'empath':
      return buildEmpathCandidate(context, players, player);
    case 'poisoner':
      return buildPoisonerCandidate(context, submission);
    case 'monk':
      return buildMonkCandidate(context, submission, player, candidateContext);
    case 'imp':
      return buildImpCandidate(context, players, submission, player, candidateContext);
    case 'sailor':
      return buildSailorCandidate(context, submission, player);
    case 'chambermaid':
      return buildChambermaidCandidate(context, submission, submissions || []);
    case 'innkeeper':
      return buildInnkeeperCandidate(context, submission, candidateContext);
    case 'professor':
      return buildProfessorCandidate(context, players, submission);
    case 'devilsadvocate':
      return buildDevilsAdvocateCandidate(context, submission);
    case 'assassin':
      return buildAssassinCandidate(context, submission);
    case 'shabaloth':
      return buildShabalothCandidate(context, submission, candidateContext);
    default:
      return buildAutomationCandidate(context, players, submission, candidateContext)
        || makeManualRulingCandidate(context, `角色 ${roleId} 需要说书人裁决。`);
  }
}

function collectForbiddenKeys(value, path = '$') {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectForbiddenKeys(item, `${path}[${index}]`));
  }

  const paths = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_PLAYER_VIEW_KEYS.has(key) || FORBIDDEN_AI_KEYS.has(key)) paths.push(childPath);
    paths.push(...collectForbiddenKeys(child, childPath));
  }
  return paths;
}

function collectForbiddenPlayerViewPaths(value, path = '$') {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectForbiddenPlayerViewPaths(item, `${path}[${index}]`));
  }

  const paths = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_PLAYER_VIEW_KEYS.has(key)) paths.push(childPath);
    paths.push(...collectForbiddenPlayerViewPaths(child, childPath));
  }
  return paths;
}

function playerVisibleTextIsSafe(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || {});
  return !FORBIDDEN_PLAYER_TEXT_PATTERNS.some((pattern) => pattern.test(text));
}

function normalizeStructuredVisibleResultText(candidate, rawResult) {
  const draft = candidate.visibleResultDraft || {};
  const resultKind = rawResult?.resultKind || draft.resultKind || null;
  const rawValue = rawResult?.resultValue ?? rawResult?.value ?? null;
  if (!resultKind) return null;

  if (resultKind === 'yes-no') {
    if (rawValue === null || rawValue === undefined || rawValue === '') return null;
    const value = String(rawValue).trim().toLowerCase();
    if (['yes', 'true', '1', '是'].includes(value)) return '是';
    if (['no', 'false', '0', '否'].includes(value)) return '否';
    fail('invalid-visible-result-value', 'yes-no result must be yes or no');
  }

  if (resultKind === 'number') {
    if (rawValue === null || rawValue === undefined || rawValue === '') return null;
    const number = Number(rawValue);
    const min = Number.isFinite(Number(draft.min)) ? Number(draft.min) : 0;
    const max = Number.isFinite(Number(draft.max)) ? Number(draft.max) : 99;
    if (!Number.isInteger(number) || number < min || number > max) {
      fail('invalid-visible-result-value', `number result must be an integer from ${min} to ${max}`);
    }
    return String(number);
  }

  if (resultKind === 'role') {
    const roleId = String(rawResult?.resultRoleId ?? rawValue).trim();
    if (!roleId) fail('invalid-visible-result-value', 'role result must include a role id');
    return `你得知：${displayRoleName(roleId)}。`;
  }

  if (resultKind === 'seat') {
    const seat = Number(rawResult?.resultSeat ?? rawValue);
    if (!Number.isInteger(seat) || seat <= 0) {
      fail('invalid-visible-result-value', 'seat result must include a positive seat number');
    }
    return `你得知：${seat}号。`;
  }

  if (resultKind === 'seat-role') {
    const seat = Number(rawResult?.resultSeat ?? draft.resultSeat);
    const roleId = String(rawResult?.resultRoleId ?? draft.resultRoleId ?? '').trim();
    if (!Number.isInteger(seat) || seat <= 0 || !roleId || roleId === 'none') {
      return '本地信息未找到可用的善良玩家。';
    }
    return `你得知：${seat}号是${displayRoleName(roleId)}。`;
  }

  if (resultKind === 'two-seats-role') {
    const seats = asArray(rawResult?.resultSeats ?? draft.resultSeats)
      .map((seat) => Number(seat))
      .filter((seat) => Number.isInteger(seat) && seat > 0);
    const roleId = String(rawResult?.resultRoleId ?? draft.resultRoleId ?? '').trim();
    if (seats.length !== 2 || !roleId || roleId === 'none') {
      return '你得知：本局没有匹配角色。';
    }
    return `你得知：${displaySeatList(seats)}中有一人是${displayRoleName(roleId)}。`;
  }

  return null;
}

function normalizeFinalVisibleResult(candidate, rawResult) {
  if (!rawResult) return null;
  if (typeof rawResult === 'string') {
    return {
      recipientSeat: candidate.seat,
      messageType: 'ability-result',
      text: rawResult
    };
  }
  if (typeof rawResult !== 'object') {
    return {
      recipientSeat: candidate.seat,
      messageType: 'ability-result',
      text: String(rawResult)
    };
  }
  const text = normalizeStructuredVisibleResultText(candidate, rawResult)
    ?? rawResult.text
    ?? rawResult.messageDraft
    ?? rawResult.result;
  if (text === undefined || text === null || String(text).trim() === '') {
    fail('missing-final-visible-result-text', 'final visible result text is required');
  }
  return {
    ...clone(rawResult),
    text: String(text)
  };
}

function makeDefaultProviderMetadata(aiMode) {
  return {
    provider: aiMode === 'mock' ? 'mock' : 'none',
    model: aiMode === 'mock' ? 'local-mock' : 'disabled',
    requestId: null
  };
}

function makeAiAuditRecord({
  room,
  candidate,
  status,
  aiMode,
  downgradeReason,
  now,
  providerMetadata,
  runtimeBoundary,
  usage
}) {
  return {
    auditId: makeId('ai-audit', [candidate.candidateId]),
    createdAt: nowIso(now),
    roomId: getRoomId(room),
    requesterRole: 'storyteller',
    routeClass: 'draft-decision',
    mode: aiMode,
    contextProfile: 'redacted-candidate-summary',
    schemaVersion: AI_AUDIT_SCHEMA_VERSION,
    inputTokenBudget: Number(usage?.promptTokens || 0),
    outputTokenBudget: Number(usage?.completionTokens || 0),
    providerMetadata: providerMetadata || makeDefaultProviderMetadata(aiMode),
    contextDigest: {
      candidateId: candidate.candidateId,
      roleId: candidate.roleId,
      candidateKind: candidate.candidateKind
    },
    schemaValidation: {
      valid: status === 'accepted',
      errors: status === 'accepted' ? [] : ['ai-output-discarded-or-disabled']
    },
    redactionSummary: {
      rawHiddenStateIncluded: false,
      playerTokensIncluded: false,
      secretsIncluded: false
    },
    failureDowngrade: downgradeReason
      ? {
          strategy: DOWNGRADE_STRATEGY,
          reason: downgradeReason,
          blocksLiveGame: false,
          discardedAiOutput: true
        }
      : null,
    storytellerConfirmation: {
      required: true,
      status: 'pending'
    },
    outputDisposition: {
      draftOnly: true,
      eventLogWritten: false,
      actionHistoryAppended: false,
      directMutation: false,
      playerVisible: false
    },
    runtimeBoundary: runtimeBoundary || {
      providerIntegration: false,
      modelCalled: false,
      serverSideSecretsOnly: true
    }
  };
}

function sanitizeMockAiOutput(output) {
  if (!output || typeof output !== 'object') {
    return { ok: false, reason: 'missing-ai-output' };
  }

  const forbiddenPaths = collectForbiddenKeys(output);
  if (forbiddenPaths.length > 0) {
    return { ok: false, reason: 'unsafe-ai-output', forbiddenPaths };
  }
  if (output.claimsEventLogWrite === true || output.claimsDirectMutation === true) {
    return { ok: false, reason: 'unsafe-ai-output', forbiddenPaths: [] };
  }

  return {
    ok: true,
    copySuggestion: String(output.copySuggestion || output.text || ''),
    riskSummary: String(output.riskSummary || output.warning || '')
  };
}

function attachAiAssistance({ room, candidate, aiMode, mockOutput, now }) {
  if (aiMode === 'mock') {
    const validated = sanitizeMockAiOutput(mockOutput);
    if (validated.ok) {
      const auditRecord = makeAiAuditRecord({ room, candidate, status: 'accepted', aiMode, now });
      return {
        candidate: {
          ...candidate,
          aiAssistance: {
            enabled: true,
            source: 'ai',
            routeClass: 'draft-decision',
            copySuggestion: validated.copySuggestion,
            riskSummary: validated.riskSummary,
            auditRef: auditRecord.auditId
          },
          auditRef: auditRecord.auditId
        },
        auditRecord
      };
    }

    const auditRecord = makeAiAuditRecord({
      room,
      candidate,
      status: 'discarded',
      aiMode,
      downgradeReason: validated.reason,
      now
    });
    return {
      candidate: {
        ...candidate,
        aiAssistance: {
          enabled: false,
          routeClass: 'draft-decision',
          failureDowngrade: auditRecord.failureDowngrade
        },
        auditRef: auditRecord.auditId
      },
      auditRecord,
      rejectedAiOutput: validated
    };
  }

  const auditRecord = makeAiAuditRecord({
    room,
    candidate,
    status: 'disabled',
    aiMode: 'disabled',
    downgradeReason: 'disabled',
    now
  });
  return {
    candidate: {
      ...candidate,
      aiAssistance: {
        enabled: false,
        routeClass: 'draft-decision',
        failureDowngrade: auditRecord.failureDowngrade
      },
      auditRef: auditRecord.auditId
    },
    auditRecord
  };
}

function attachProviderAiAssistance({ room, candidate, providerResult, now }) {
  const result = providerResult || {};
  const providerMetadata = result.providerMetadata || {
    provider: 'none',
    model: 'disabled',
    requestId: null
  };
  const runtimeBoundary = result.runtimeBoundary || {
    providerIntegration: false,
    modelCalled: false,
    serverSideSecretsOnly: true
  };

  if (result.status === 'accepted') {
    const validated = sanitizeMockAiOutput(result.output);
    if (validated.ok) {
      const auditRecord = makeAiAuditRecord({
        room,
        candidate,
        status: 'accepted',
        aiMode: 'provider',
        now,
        providerMetadata,
        runtimeBoundary,
        usage: result.usage
      });
      return {
        candidate: {
          ...candidate,
          aiAssistance: {
            enabled: true,
            source: 'ai-provider',
            routeClass: 'draft-decision',
            copySuggestion: validated.copySuggestion,
            riskSummary: validated.riskSummary,
            auditRef: auditRecord.auditId
          },
          auditRef: auditRecord.auditId
        },
        auditRecord
      };
    }

    const auditRecord = makeAiAuditRecord({
      room,
      candidate,
      status: 'discarded',
      aiMode: 'provider',
      downgradeReason: validated.reason,
      now,
      providerMetadata,
      runtimeBoundary,
      usage: result.usage
    });
    return {
      candidate: {
        ...candidate,
        aiAssistance: {
          enabled: false,
          routeClass: 'draft-decision',
          failureDowngrade: auditRecord.failureDowngrade
        },
        auditRef: auditRecord.auditId
      },
      auditRecord,
      rejectedAiOutput: validated
    };
  }

  const auditRecord = makeAiAuditRecord({
    room,
    candidate,
    status: 'discarded',
    aiMode: 'provider',
    downgradeReason: result.failureReason || 'provider-unavailable',
    now,
    providerMetadata,
    runtimeBoundary,
    usage: result.usage
  });
  return {
    candidate: {
      ...candidate,
      aiAssistance: {
        enabled: false,
        routeClass: 'draft-decision',
        failureDowngrade: auditRecord.failureDowngrade
      },
      auditRef: auditRecord.auditId
    },
    auditRecord
  };
}

function orderSubmissionsForEvaluation(roomState, submissions) {
  return submissions
    .map((submission, index) => {
      const batch = asArray(roomState.nightBatches).find((item) => item.batchId === submission.batchId) || null;
      const action = asArray(batch?.actions).find((item) => item.actionId === submission.actionId) || null;
      return {
        submission,
        index,
        order: Number.isFinite(Number(action?.order)) ? Number(action.order) : index + 1
      };
    })
    .sort((left, right) => {
      if (left.order !== right.order) return left.order - right.order;
      return left.index - right.index;
    })
    .map((item) => item.submission);
}

function prepareCandidateResolutions(room, options = {}) {
  const roomState = getRoomState(room);
  const batchId = options.batchId;
  const aiMode = options.aiMode || 'disabled';
  const now = options.now;
  const players = getPlayers(room);
  const submissions = getSubmissions(room).filter((submission) => {
    return !batchId || submission.batchId === batchId;
  });

  if (submissions.length === 0) fail('missing-submissions', 'no submissions found for candidate generation');
  if (submissions.some((submission) => submission.status !== 'locked')) {
    fail('submissions-not-locked', 'all submissions must be locked');
  }

  const candidates = [];
  const aiAuditRecords = [];
  const rejectedAiOutputs = [];
  const orderedSubmissions = orderSubmissionsForEvaluation(roomState, submissions);
  const candidateContext = {
    protectedSeats: new Set()
  };

  for (const submission of orderedSubmissions) {
    const baseCandidate = buildRuleCandidate({ room: roomState, submission, submissions, players, candidateContext, now });
    const withAi = attachAiAssistance({
      room: roomState,
      candidate: baseCandidate,
      aiMode,
      mockOutput: options.mockAiOutput,
      now
    });
    candidates.push(withAi.candidate);
    aiAuditRecords.push(withAi.auditRecord);
    if (withAi.rejectedAiOutput) rejectedAiOutputs.push(withAi.rejectedAiOutput);
  }

  return {
    status: 'GO',
    candidates,
    aiAuditRecords,
    rejectedAiOutputs,
    checks: {
      rulesCandidateGeneratedWithAiDisabled: aiMode === 'disabled' ? candidates.length > 0 : null,
      aiUnavailableBlocksLiveGame: false,
      candidatePhaseEventLogWritten: candidates.some((candidate) => candidate.eventLogWritten === true),
      candidatePhaseStateChanged: candidates.some((candidate) => candidate.stateChanged === true)
    },
    summary: {
      candidateCount: candidates.length,
      ruleCandidateCount: candidates.filter((candidate) => candidate.source === 'rules').length,
      aiAssistanceCount: candidates.filter((candidate) => candidate.aiAssistance?.enabled === true).length,
      requiresStorytellerConfirmation: candidates.every((candidate) => candidate.requiresStorytellerConfirmation === true),
      eventLogWritten: false,
      stateChanged: false,
      privateMessagesSent: false,
      diaryWritten: false
    }
  };
}

async function prepareCandidateResolutionsWithAiProvider(room, options = {}) {
  const providerModes = new Set(['provider', 'live', 'openai-compatible', 'openai']);
  if (!providerModes.has(String(options.aiMode || '').toLowerCase())) {
    return prepareCandidateResolutions(room, options);
  }

  const prepared = prepareCandidateResolutions(room, {
    ...options,
    aiMode: 'disabled'
  });
  const roomState = getRoomState(room);
  const aiProvider = options.aiProvider;
  const candidates = [];
  const aiAuditRecords = [];
  const rejectedAiOutputs = [];

  for (const candidate of prepared.candidates) {
    let providerResult;
    if (!aiProvider || typeof aiProvider.callCandidateAi !== 'function') {
      providerResult = {
        status: 'unavailable',
        failureReason: 'provider-not-configured',
        providerMetadata: {
          provider: 'none',
          model: 'disabled',
          requestId: null
        },
        usage: {
          promptTokens: 0,
          completionTokens: 0
        },
        runtimeBoundary: {
          providerIntegration: false,
          modelCalled: false,
          serverSideSecretsOnly: true
        }
      };
    } else {
      providerResult = await aiProvider.callCandidateAi(candidate);
    }

    const withAi = attachProviderAiAssistance({
      room: roomState,
      candidate: {
        ...candidate,
        aiAssistance: null,
        auditRef: null
      },
      providerResult,
      now: options.now
    });
    candidates.push(withAi.candidate);
    aiAuditRecords.push(withAi.auditRecord);
    if (withAi.rejectedAiOutput) rejectedAiOutputs.push(withAi.rejectedAiOutput);
  }

  return {
    ...prepared,
    candidates,
    aiAuditRecords,
    rejectedAiOutputs,
    checks: {
      ...prepared.checks,
      rulesCandidateGeneratedWithAiDisabled: null,
      aiUnavailableBlocksLiveGame: false,
      providerAttempted: aiAuditRecords.some((record) => record.runtimeBoundary.providerIntegration === true),
      providerModelCalled: aiAuditRecords.some((record) => record.runtimeBoundary.modelCalled === true),
      providerOutputPlayerVisible: aiAuditRecords.some((record) => record.outputDisposition.playerVisible === true)
    },
    summary: {
      ...prepared.summary,
      aiAssistanceCount: candidates.filter((candidate) => candidate.aiAssistance?.enabled === true).length,
      providerMode: 'provider',
      providerModelCalled: aiAuditRecords.some((record) => record.runtimeBoundary.modelCalled === true),
      providerDowngradeCount: aiAuditRecords.filter((record) => record.failureDowngrade).length
    }
  };
}

function getCandidateById(candidates, candidateId) {
  const candidate = asArray(candidates).find((item) => item.candidateId === candidateId);
  if (!candidate) fail('missing-candidate', `candidate not found: ${candidateId}`);
  return candidate;
}

function assertCandidateCanBeReviewed(candidate) {
  if (TERMINAL_STATUSES.has(candidate.status)) fail('candidate-terminal', 'candidate is already terminal');
  if (!['pending-storyteller', 'needs-storyteller-ruling'].includes(candidate.status)) {
    fail('candidate-not-reviewable', `candidate status is ${candidate.status}`);
  }
  if (candidate.requiresStorytellerConfirmation !== true) {
    fail('requires-storyteller-confirmation-missing', 'candidate requires storyteller confirmation');
  }
}

function validateStateChangeDraft(candidate, stateChangeDraft, options = {}) {
  if (!stateChangeDraft) return null;
  if (candidate.source === 'ai') fail('ai-candidate-cannot-mutate-state', 'AI candidates cannot mutate state');
  if (collectForbiddenKeys(stateChangeDraft).some((path) => path.includes('aiAudit') || path.includes('eventLog'))) {
    fail('unsafe-state-patch', 'state patch contains forbidden audit or event log data');
  }
  const baseDraft = candidate.stateChangeDraft || {};
  const type = baseDraft.type || stateChangeDraft.type;
  if (options.editableOverride === true) {
    const contextTemplateDraft = buildEditableContextTemplateDraft(candidate, stateChangeDraft, baseDraft, options);
    if (contextTemplateDraft) return contextTemplateDraft;
    const templateDraft = buildEditableTemplateDraft(candidate, stateChangeDraft, baseDraft, options);
    if (templateDraft) return templateDraft;
    const editablePatchField = getEditableStatePatchField(type);
    if (!editablePatchField) {
      return {
        ...clone(baseDraft),
        summary: stateChangeDraft.summary || baseDraft.summary
      };
    }

    const targetSeats = normalizeEditableTargetSeats(stateChangeDraft, baseDraft);
    if (targetSeats.length === 0) {
      fail('missing-editable-state-target', 'editable state candidate requires at least one target seat');
    }
    const patches = targetSeats.map((seat) => ({
      op: 'set',
      path: `playersBySeat.${seat}.${editablePatchField.field}`,
      value: editablePatchField.value
    }));
    return {
      ...clone(baseDraft),
      ...clone(stateChangeDraft),
      type,
      targetSeat: targetSeats[0],
      targetSeats,
      patches,
      editableStatePatch: {
        effect: editablePatchField.effect,
        generatedFrom: 'storyteller-final-ruling',
        targetSeats
      }
    };
  }
  if (options.roomState || options.room) {
    const contextTemplateDraft = buildEditableContextTemplateDraft(candidate, stateChangeDraft, baseDraft, options);
    if (contextTemplateDraft) return contextTemplateDraft;
  }
  const templateDraft = buildEditableTemplateDraft(candidate, stateChangeDraft, baseDraft, options);
  if (templateDraft) return templateDraft;
  const nextDraft = clone(stateChangeDraft);
  if (!Array.isArray(nextDraft.patches)) {
    const patches = buildDefaultStateChangePatches(type, nextDraft, baseDraft);
    if (patches.length > 0) nextDraft.patches = patches;
  }
  return nextDraft;
}

function buildConfirmationCommand(candidate, options = {}) {
  assertCandidateCanBeReviewed(candidate);
  const normalizedOverrides = normalizeNightCandidateConfirmationOptions(candidate, options);
  const recordOnly = normalizedOverrides.resolutionMode === 'record-only';
  const hasVisibleResultOverride = Object.prototype.hasOwnProperty.call(normalizedOverrides, 'finalVisibleResult');
  const finalVisibleResult = recordOnly
    ? null
    : normalizeFinalVisibleResult(
        candidate,
        hasVisibleResultOverride ? normalizedOverrides.finalVisibleResult : candidate.visibleResultDraft
      );
  if (finalVisibleResult && !playerVisibleTextIsSafe(finalVisibleResult.text)) {
    fail('unsafe-final-visible-result', 'final visible result leaks hidden information');
  }

  const hasStateChangeOverride = Object.prototype.hasOwnProperty.call(normalizedOverrides, 'finalStateChange');
  const finalStateChange = recordOnly
    ? null
    : validateStateChangeDraft(
        candidate,
        hasStateChangeOverride ? normalizedOverrides.finalStateChange : candidate.stateChangeDraft,
        {
          editableOverride: hasStateChangeOverride,
          roomState: options.roomState || options.room
        }
      );
  const privateMessages = [];
  const diaryEntries = [];
  const publicEvents = [];
  const statePatches = [];

  if (finalVisibleResult) {
    privateMessages.push({
      id: makeId('msg', [candidate.candidateId]),
      toSeat: finalVisibleResult.recipientSeat || candidate.seat,
      type: finalVisibleResult.messageType || 'ability-result',
      text: finalVisibleResult.text,
      createdAt: nowIso(options.now),
      sourceCandidateId: candidate.candidateId
    });
  }

  if (candidate.diaryDraft?.storytellerText) {
    diaryEntries.push({
      id: makeId('diary-st', [candidate.candidateId]),
      scope: 'storyteller',
      text: candidate.diaryDraft.storytellerText,
      createdAt: nowIso(options.now),
      sourceCandidateId: candidate.candidateId
    });
  }

  if (recordOnly) {
    diaryEntries.push({
      id: makeId('diary-record-only', [candidate.candidateId]),
      scope: 'storyteller',
      text: `仅记录，不应用：${normalizedOverrides.recordOnlyReason}`,
      createdAt: nowIso(options.now),
      sourceCandidateId: candidate.candidateId,
      resolutionMode: 'record-only'
    });
  }

  if (candidate.diaryDraft?.playerPrivateText && finalVisibleResult) {
    diaryEntries.push({
      id: makeId('diary-player', [candidate.candidateId]),
      scope: 'player-private',
      seat: finalVisibleResult.recipientSeat || candidate.seat,
      text: candidate.diaryDraft.playerPrivateText,
      createdAt: nowIso(options.now),
      sourceCandidateId: candidate.candidateId
    });
  }

  if (!recordOnly && candidate.publicEventDraft) publicEvents.push(clone(candidate.publicEventDraft));
  if (finalStateChange?.patches) {
    statePatches.push(...clone(finalStateChange.patches));
    appendNightDeathMetadataPatches(statePatches, candidate, {
      roomState: options.roomState || options.room
    });
  }
  if (finalStateChange?.privateMessageDrafts) {
    for (const draft of finalStateChange.privateMessageDrafts) {
      if (draft.toSeat) {
        privateMessages.push({
          ...clone(draft),
          id: makeId('msg', [candidate.candidateId, draft.toSeat]),
          createdAt: nowIso(options.now),
          sourceCandidateId: candidate.candidateId
        });
      }
    }
  }

  if (!recordOnly && requiresEffectiveImportedStatePatch(candidate) && !hasEffectiveStatePatch(statePatches)) {
    fail(
      'missing-effective-imported-state-patch',
      '复杂状态或转职候选没有可安全写入的状态变化，不能直接确认；请先手动裁决，或暂不应用此候选。'
    );
  }

  if (!recordOnly && requiresVerifiedComplexRulingTemplate(candidate)) {
    fail(
      'missing-safe-complex-ruling-template',
      '此复杂角色没有经可执行验证的完整裁决模板，不能确认为已生效；请仅记录或不采用。'
    );
  }

  if (
    !recordOnly
    && privateMessages.length === 0
    && diaryEntries.length === 0
    && publicEvents.length === 0
    && statePatches.length === 0
  ) {
    fail('empty-confirmation-effects', 'candidate confirmation has no controlled result to apply or record');
  }

  assertAtomicRoleTransitionPatches(statePatches);

  return {
    commandId: makeId('cmd-resolution', [candidate.candidateId]),
    sourceCandidateId: candidate.candidateId,
    commandType: 'confirm-candidate-resolution',
    resolutionMode: normalizedOverrides.resolutionMode,
    recordOnlyReason: normalizedOverrides.recordOnlyReason || null,
    issuedBy: options.reviewedBy || 'storyteller',
    issuedAt: nowIso(options.now),
    effects: {
      privateMessages,
      diaryEntries,
      publicEvents,
      statePatches
    },
    aiAuditRecord: null,
    eventLogWritten: false,
    actionHistoryAppended: false,
    directAiMutation: false
  };
}

function confirmCandidateResolution(candidates, candidateId, options = {}) {
  const candidate = getCandidateById(candidates, candidateId);
  const command = buildConfirmationCommand(candidate, options);
  return {
    candidate: {
      ...candidate,
      status: 'confirmed',
      resolutionMode: command.resolutionMode,
      recordOnlyReason: command.recordOnlyReason,
      reviewedAt: nowIso(options.now),
      reviewedBy: options.reviewedBy || 'storyteller',
      confirmationCommandId: command.commandId,
      privateMessagesSent: command.effects.privateMessages.length > 0,
      diaryWritten: command.effects.diaryEntries.length > 0,
      stateChanged: command.effects.statePatches.length > 0,
      eventLogWritten: false
    },
    command
  };
}

function rejectCandidateResolution(candidates, candidateId, options = {}) {
  const candidate = getCandidateById(candidates, candidateId);
  assertCandidateCanBeReviewed(candidate);
  if (!options.reason) fail('missing-rejection-reason', 'rejection reason is required');

  return {
    candidate: {
      ...candidate,
      status: 'rejected',
      reviewedAt: nowIso(options.now),
      reviewedBy: options.reviewedBy || 'storyteller',
      rejectionReason: options.reason,
      eventLogWritten: false,
      stateChanged: false,
      privateMessagesSent: false,
      diaryWritten: false
    }
  };
}

function setPath(target, pathExpression, value) {
  const parts = String(pathExpression).split('.');
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (part === 'playersBySeat') {
      const seat = Number(parts[index + 1]);
      const player = asArray(cursor.players).find((item) => Number(item.seat) === seat);
      if (!player) fail('state-patch-target-missing', `missing player seat ${seat}`);
      cursor = player;
      index += 1;
      continue;
    }
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = value;
}

function applyConfirmationCommand(room, command) {
  const nextRoom = clone(room);
  const roomState = getRoomState(nextRoom);
  roomState.privateMessages = [...asArray(roomState.privateMessages), ...asArray(command.effects?.privateMessages)];
  roomState.diaryEntries = [...asArray(roomState.diaryEntries), ...asArray(command.effects?.diaryEntries)];
  roomState.publicEvents = [...asArray(roomState.publicEvents), ...asArray(command.effects?.publicEvents)];

  for (const patch of asArray(command.effects?.statePatches)) {
    if (patch.op === 'set') setPath(roomState, patch.path, patch.value);
  }

  const transitionSeats = [...new Set(asArray(command.effects?.statePatches)
    .map((patch) => String(patch?.path || '').match(/^playersBySeat\.(\d+)\.trueRoleId$/)?.[1])
    .filter(Boolean)
    .map(Number))];
  if (transitionSeats.length > 0) {
    const violations = getRoleStateInvariantViolations(nextRoom, transitionSeats, { checkShownRole: true });
    if (violations.length > 0) {
      const error = new Error(`role-state-invariant-violation:${JSON.stringify(violations)}`);
      error.code = 'role-state-invariant-violation';
      error.violations = violations;
      throw error;
    }
  }

  return nextRoom;
}

module.exports = {
  AI_AUDIT_SCHEMA_VERSION,
  DOWNGRADE_STRATEGY,
  FORBIDDEN_PLAYER_VIEW_KEYS,
  SCHEMA_VERSION,
  applyConfirmationCommand,
  buildConfirmationCommand,
  collectForbiddenPlayerViewPaths,
  confirmCandidateResolution,
  prepareCandidateResolutions,
  prepareCandidateResolutionsWithAiProvider,
  rejectCandidateResolution,
  requiresEffectiveImportedStatePatch,
  requiresVerifiedComplexRulingTemplate,
  sanitizeMockAiOutput
};
