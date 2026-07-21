const { buildRoleCatalog, getRuntimeScripts, getScriptById } = require('../ScriptCatalog');
const {
  buildOfficialNightOrderForRoleIds,
  matchScriptEntriesFromJson,
  normalizeRoleId: normalizeRegistryRoleId
} = require('./RoleRegistry');
const {
  RULES,
  getRule,
  identifyScriptFromJson,
  normalizeRoleId: normalizeAutomationRoleId,
  normalizeScriptId
} = require('./RuleAutomation');
const { getRoleAutomationPolicy } = require('./RoleAutomationSafety');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function canonicalRoleId(value) {
  const registryId = normalizeRegistryRoleId(value);
  const automationId = normalizeAutomationRoleId(value);
  if (getRule(registryId)) return registryId;
  if (getRule(automationId)) return automationId;
  return registryId || automationId || String(value || '').trim() || null;
}

function roleAliases(roleId) {
  return unique([
    roleId,
    normalizeRegistryRoleId(roleId),
    normalizeAutomationRoleId(roleId)
  ]);
}

function roleMatchesId(left, right) {
  const leftAliases = new Set(roleAliases(left));
  return roleAliases(right).some((alias) => leftAliases.has(alias));
}

function findInRoleCatalog(scriptId, roleId) {
  if (!scriptId) return null;
  const catalog = buildRoleCatalog(scriptId);
  for (const [catalogRoleId, role] of catalog.entries()) {
    if (roleMatchesId(catalogRoleId, roleId)) {
      return { ...role, id: catalogRoleId };
    }
  }
  return null;
}

function findInRuntimeScripts(roleId) {
  for (const script of getRuntimeScripts()) {
    const found = findInRoleCatalog(script.id, roleId);
    if (found) return found;
  }
  return null;
}

function findRoleMetadata({ scriptId, roleId }) {
  return findInRoleCatalog(scriptId, roleId) || findInRuntimeScripts(roleId) || {
    id: roleId,
    name: roleId,
    nameEn: roleId,
    type: null,
    group: null,
    team: null,
    alignment: 'unknown',
    ability: '',
    setup: false,
    reminders: [],
    remindersGlobal: [],
    nightOrder: { first: 0, other: 0 }
  };
}

function indexInNightOrder(order, roleId) {
  const index = asArray(order).findIndex((candidate) => roleMatchesId(candidate, roleId));
  return index >= 0 ? index + 1 : null;
}

function promptKinds(rule) {
  return unique([
    rule?.firstNight?.promptKind,
    rule?.otherNight?.promptKind
  ]);
}

function ruleSummary(rule) {
  if (!rule) {
    return {
      supported: false,
      phases: [],
      automation: 'unsupported',
      resolution: null,
      promptKinds: []
    };
  }

  return {
    supported: true,
    phases: asArray(rule.phases),
    automation: rule.automation || null,
    resolution: rule.resolution || null,
    promptKinds: promptKinds(rule)
  };
}

function roleStatus({ rule, policy, match }) {
  if (!rule) return 'manual';
  if (match?.requiresReview) return 'review';
  if (policy?.riskLevel === 'high' || policy?.storytellerConfirmationRequired) return 'review';
  return 'ready';
}

function roleBlockers({ rule, policy, match }) {
  const blockers = [];
  if (!rule) blockers.push('missing-rule-logic');
  if (match?.requiresReview) blockers.push('role-match-review-required');
  if (policy?.aiMayMutateStateDirectly) blockers.push('ai-direct-state-mutation-not-allowed');
  return blockers;
}

function buildRoleLogicProfileForRole({ roleId, sourceRoleId = null, scriptId = null, sourceMatch = null, nightOrder = null }) {
  const canonicalId = canonicalRoleId(roleId);
  const rule = getRule(canonicalId);
  const policy = getRoleAutomationPolicy(canonicalId);
  const metadata = findRoleMetadata({ scriptId, roleId: canonicalId });
  const firstOrder = indexInNightOrder(nightOrder?.first, canonicalId) || Number(metadata.nightOrder?.first || 0) || null;
  const otherOrder = indexInNightOrder(nightOrder?.other, canonicalId) || Number(metadata.nightOrder?.other || 0) || null;

  return {
    roleId: canonicalId,
    sourceRoleId: sourceRoleId || roleId,
    name: metadata.name || metadata.nameEn || canonicalId,
    nameEn: metadata.nameEn || metadata.name || canonicalId,
    team: metadata.team || metadata.type || metadata.group || null,
    group: metadata.group || metadata.type || null,
    alignment: metadata.alignment || 'unknown',
    ability: metadata.ability || '',
    setup: Boolean(metadata.setup),
    reminders: asArray(metadata.reminders),
    remindersGlobal: asArray(metadata.remindersGlobal),
    night: {
      first: {
        wakes: firstOrder !== null || Boolean(rule?.firstNight),
        order: firstOrder
      },
      other: {
        wakes: otherOrder !== null || Boolean(rule?.otherNight),
        order: otherOrder
      }
    },
    rule: ruleSummary(rule),
    automationPolicy: policy,
    runtime: {
      aiAutoSubmit: policy.aiAutoSubmit,
      aiMayMutateStateDirectly: policy.aiMayMutateStateDirectly,
      storytellerConfirmationRequired: policy.storytellerConfirmationRequired,
      implementedMechanism: policy.implementedMechanism,
      requiredAdjustment: policy.requiredAdjustment
    },
    match: sourceMatch
      ? {
          confidence: sourceMatch.confidence,
          requiresReview: sourceMatch.requiresReview === true,
          warnings: asArray(sourceMatch.warnings),
          score: sourceMatch.score || 0,
          matchedBy: asArray(sourceMatch.matchedBy)
        }
      : {
          confidence: 'catalog',
          requiresReview: false,
          warnings: [],
          score: 100,
          matchedBy: ['script-catalog']
        },
    status: roleStatus({ rule, policy, match: sourceMatch }),
    blockers: roleBlockers({ rule, policy, match: sourceMatch })
  };
}

function scriptRoleIds(scriptId) {
  const catalog = buildRoleCatalog(scriptId);
  return [...catalog.keys()];
}

function filteredNightOrderForRoles(nightOrder, roleIds) {
  return {
    first: asArray(nightOrder?.first).filter((roleId) => roleIds.some((candidate) => roleMatchesId(candidate, roleId))),
    other: asArray(nightOrder?.other).filter((roleId) => roleIds.some((candidate) => roleMatchesId(candidate, roleId)))
  };
}

function nightOrderForBoard({ scriptId, roleIds }) {
  const officialOrder = buildOfficialNightOrderForRoleIds(roleIds);
  if (officialOrder.first.length > 0 || officialOrder.other.length > 0) return officialOrder;
  const script = scriptId ? getScriptById(scriptId) : null;
  if (script?.nightOrder) {
    const filtered = filteredNightOrderForRoles(script.nightOrder, roleIds);
    if (filtered.first.length > 0 || filtered.other.length > 0) return filtered;
  }
  return buildOfficialNightOrderForRoleIds(roleIds);
}

function summarizeRoles(roles) {
  const coverage = roles.reduce((acc, role) => {
    acc.total += 1;
    acc[role.status] = (acc[role.status] || 0) + 1;
    if (role.rule.supported) acc.supported += 1;
    else acc.unsupported += 1;
    if (role.automationPolicy.riskLevel === 'high') acc.highRisk += 1;
    if (role.runtime.aiAutoSubmit) acc.aiAutoSubmit += 1;
    if (role.runtime.aiMayMutateStateDirectly) acc.directAiStateMutationRoles.push(role.roleId);
    if (role.runtime.storytellerConfirmationRequired) acc.storytellerConfirmationRequired += 1;
    return acc;
  }, {
    total: 0,
    ready: 0,
    review: 0,
    manual: 0,
    supported: 0,
    unsupported: 0,
    highRisk: 0,
    aiAutoSubmit: 0,
    storytellerConfirmationRequired: 0,
    directAiStateMutationRoles: []
  });

  coverage.directAiStateMutationRoles = unique(coverage.directAiStateMutationRoles);
  return coverage;
}

function buildBoardRoleLogicProfile(input = {}) {
  const inputScriptId = normalizeScriptId(input.scriptId || input.currentScript || input.id);
  const looksLikeImport = asArray(input.entries).length > 0 || asArray(input.item?.entries).length > 0;
  const explicitRoleIds = asArray(input.roleIds).map(canonicalRoleId);
  const scriptMatch = looksLikeImport ? identifyScriptFromJson(input) : {
    scriptId: inputScriptId,
    confidence: inputScriptId ? 'explicit' : 'none',
    warnings: []
  };
  const scriptId = scriptMatch.scriptId || inputScriptId || null;
  const script = scriptId ? getScriptById(scriptId) : null;

  let roleIds = [];
  let roleMatches = [];
  if (looksLikeImport) {
    const matchSummary = matchScriptEntriesFromJson(input);
    roleMatches = matchSummary.matches;
    roleIds = unique(matchSummary.matches
      .filter((match) => match.roleId)
      .map((match) => canonicalRoleId(match.roleId)));
  } else if (explicitRoleIds.length > 0) {
    roleIds = explicitRoleIds;
  } else if (scriptId) {
    roleIds = scriptRoleIds(scriptId).map(canonicalRoleId);
  } else {
    roleIds = explicitRoleIds;
  }
  roleIds = unique(roleIds);

  const nightOrder = nightOrderForBoard({ scriptId, roleIds });
  const matchByRoleId = new Map();
  for (const match of roleMatches) {
    if (!match.roleId) continue;
    const key = canonicalRoleId(match.roleId);
    if (!matchByRoleId.has(key)) matchByRoleId.set(key, match);
  }

  const roles = roleIds
    .map((roleId) => buildRoleLogicProfileForRole({
      roleId,
      sourceRoleId: matchByRoleId.get(roleId)?.sourceId || roleId,
      scriptId,
      sourceMatch: matchByRoleId.get(roleId) || null,
      nightOrder
    }))
    .sort((left, right) => {
      const leftFirst = left.night.first.order || 999;
      const rightFirst = right.night.first.order || 999;
      if (leftFirst !== rightFirst) return leftFirst - rightFirst;
      return left.roleId.localeCompare(right.roleId);
    });

  const matchWarnings = roleMatches.flatMap((match) => asArray(match.warnings).map((warning) => `${match.sourceId || match.index}:${warning}`));
  const unsupportedRoleIds = roles.filter((role) => !role.rule.supported).map((role) => role.roleId);
  const reviewRoleIds = roles.filter((role) => role.status === 'review').map((role) => role.roleId);
  const failures = [];
  if (unsupportedRoleIds.length > 0) failures.push(`unsupported-role-logic:${unsupportedRoleIds.join(',')}`);
  if (roles.some((role) => role.runtime.aiMayMutateStateDirectly)) failures.push('ai-direct-state-mutation-policy-found');

  return {
    status: failures.length === 0 && matchWarnings.length === 0 ? 'GO' : 'REVIEW',
    scriptId,
    scriptName: script?.name || null,
    scriptConfidence: scriptMatch.confidence,
    roleCount: roles.length,
    nightOrder: clone(nightOrder),
    coverage: summarizeRoles(roles),
    roleIds: roles.map((role) => role.roleId),
    reviewRoleIds,
    unsupportedRoleIds,
    roles,
    warnings: unique([...(scriptMatch.warnings || []), ...matchWarnings]),
    failures
  };
}

module.exports = {
  buildBoardRoleLogicProfile,
  buildRoleLogicProfileForRole,
  canonicalRoleId,
  roleMatchesId
};
