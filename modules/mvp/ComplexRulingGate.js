'use strict';

const VERIFIED_EDITABLE_TEMPLATE_TYPES = Object.freeze([
  'butler-master',
  'gambler-guess',
  'cerenovus-madness',
  'pithag-character-change',
  'snakecharmer-swap',
  'philosopher-gain-ability',
  'imp-self-kill-transfer',
  'demon-kill-fanggu',
  'bmr-sailor-drunk-choice',
  'bmr-innkeeper-protect-and-drunk-choice',
  'bmr-professor-revive'
]);

// Imported/local-image roles are intentionally absent until a role-specific
// template has an executable fixture proving its complete effect chain.
const VERIFIED_COMPLEX_ROLE_TEMPLATES = Object.freeze({});

const PROMPT_COUNTS = Object.freeze({
  select_1: 1,
  select_2: 2,
  select_3: 3,
  select_4: 4,
  select_player_role: 1
});

function firstSelectionClause(ability) {
  const match = String(ability || '').match(/选择[^：；。]+/);
  return match ? match[0] : '';
}

function hasDynamicTargetCount(ability) {
  return /二至四名|2\s*[-~至]\s*4|数量相等|等于.*人数|至多|至少/.test(String(ability || ''));
}

function hasDelayedOrPersistentEffect(ability) {
  return /下(?:一)?个?(?:夜晚|白天|黄昏|黎明)|次夜|明晚|明天|直到|持续(?:到|至)|之后|下次|首次[^。；]*(?:时|后)|死亡时|死亡后|被处决时|被处决后/.test(String(ability || ''));
}

function abilityEffectSignals(ability) {
  const text = String(ability || '');
  const signals = [];
  if (/得知|会知道|信息|判断/.test(text)) signals.push('information');
  if (/死亡|杀死|处决/.test(text) && !/不会[^。；]*死亡|免疫死亡/.test(text)) signals.push('kill');
  if (/不会[^。；]*死亡|免疫死亡|负面能力.*无效|保护/.test(text)) signals.push('protect');
  if (/中毒|醉酒/.test(text)) signals.push('poison');
  if (/变成|交换角色|交换.*阵营|加入邪恶|转换为|角色和阵营/.test(text)) signals.push('role-change');
  return [...new Set(signals)];
}

function optionalChoiceModeledAsAutoInfo(ability, logicProfile = {}) {
  return String(logicProfile.promptKind || '') === 'auto_info'
    && /每个夜晚[^。；]*你(?:可以|要|会)?选择/.test(String(ability || ''));
}

function resultSignalMismatch(signals, resultType) {
  if (signals.length === 0 || signals.includes(resultType)) return false;
  if (resultType === 'status') return false;
  if (resultType === 'information' && signals.includes('information')) return false;
  return true;
}

function templateKey(boardId, roleId) {
  return `${String(boardId || '').trim()}:${String(roleId || '').trim()}`;
}

function getVerifiedComplexRoleTemplate(boardId, roleId) {
  return VERIFIED_COMPLEX_ROLE_TEMPLATES[templateKey(boardId, roleId)] || null;
}

function priorityFor({ resultType, signals, reasons }) {
  let score = 0;
  if (resultType === 'role-change') score += 70;
  if (resultType === 'status') score += 55;
  if (signals.length >= 3) score += 55;
  else if (signals.length > 1) score += 40;
  if (reasons.includes('optional-player-choice')) score += 35;
  if (reasons.includes('delayed-or-persistent-effect')) score += 30;
  if (reasons.includes('dynamic-target-count')) score += 25;
  if (reasons.includes('result-signal-mismatch')) score += 20;
  return {
    level: score >= 100 ? 'P0' : (score >= 55 ? 'P1' : 'P2'),
    score
  };
}

function buildComplexRulingGate({ boardId, role } = {}) {
  const logicProfile = role?.logicProfile || {};
  const ability = String(role?.ability || '');
  const resultType = String(logicProfile.resultType || '');
  const promptKind = String(logicProfile.promptKind || '');
  const signals = abilityEffectSignals(ability);
  const reasons = [];

  if (optionalChoiceModeledAsAutoInfo(ability, logicProfile)) reasons.push('optional-player-choice');
  if (hasDynamicTargetCount(ability) && (PROMPT_COUNTS[promptKind] || 0) > 0) reasons.push('dynamic-target-count');
  if (signals.length > 1) reasons.push('multiple-ability-effects');
  if (resultType === 'status') reasons.push('generic-status-result');
  if (resultType === 'role-change') reasons.push('generic-role-change-result');
  if (resultSignalMismatch(signals, resultType)) reasons.push('result-signal-mismatch');
  if (hasDelayedOrPersistentEffect(ability)) reasons.push('delayed-or-persistent-effect');

  const verifiedTemplate = getVerifiedComplexRoleTemplate(boardId, role?.id);
  const complex = reasons.length > 0;
  const storytellerRequired = complex && !verifiedTemplate;
  const priority = priorityFor({ resultType, signals, reasons });

  return {
    tier: complex
      ? (verifiedTemplate ? 'verified-safe-template' : 'storyteller-required')
      : 'structural-match',
    complex,
    storytellerRequired,
    directConfirmationAllowed: !storytellerRequired,
    reasons,
    descriptionSignals: signals,
    delayedOrPersistent: reasons.includes('delayed-or-persistent-effect'),
    multiEffect: reasons.includes('multiple-ability-effects'),
    statefulResult: ['status', 'role-change'].includes(resultType),
    resultType,
    promptKind,
    riskLevel: logicProfile.riskLevel || 'medium',
    verifiedTemplate,
    priorityLevel: priority.level,
    priorityScore: priority.score
  };
}

function requiresVerifiedComplexRulingTemplate(candidate = {}) {
  return candidate?.complexRulingGate?.storytellerRequired === true
    && candidate?.complexRulingGate?.verifiedTemplate == null;
}

module.exports = {
  PROMPT_COUNTS,
  VERIFIED_COMPLEX_ROLE_TEMPLATES,
  VERIFIED_EDITABLE_TEMPLATE_TYPES,
  abilityEffectSignals,
  buildComplexRulingGate,
  firstSelectionClause,
  hasDelayedOrPersistentEffect,
  hasDynamicTargetCount,
  optionalChoiceModeledAsAutoInfo,
  requiresVerifiedComplexRulingTemplate,
  resultSignalMismatch
};
