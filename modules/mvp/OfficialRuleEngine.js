const { getRuntimeScripts } = require('../ScriptCatalog');
const { getRoleAutomationPolicy, buildRoleExecutionMatrix } = require('./RoleAutomationSafety');
const { buildBoardRoleLogicProfile, canonicalRoleId } = require('./RoleLogicProfile');
const { getRoleRuleContract, buildRuleContractCoverage } = require('./RoleRuleEngine');
const { matchScriptEntriesFromJson } = require('./RoleRegistry');

const SCHEMA_VERSION = 'mvp.official-rule-engine.v1';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function importedEntries(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.entries)) return input.entries;
  if (Array.isArray(input?.item?.entries)) return input.item.entries;
  return [];
}

function promptKindsFromProfile(role) {
  return unique([
    ...(role?.rule?.promptKinds || []),
    role?.automationPolicy?.rule?.promptKinds || []
  ]);
}

function executionClassFor({ role, policy, contract }) {
  if (!role?.rule?.supported) return 'manual-missing-rule';
  if (policy?.implementedMechanism === 'explicit-high-risk-rule-contract' || contract?.highRisk) {
    return 'explicit-contract-storyteller-confirmed';
  }
  if (policy?.implementedMechanism === 'concrete-private-info-projection') {
    return 'private-info-projection';
  }
  if (policy?.implementedMechanism === 'private-grimoire-projection') {
    return 'private-grimoire-projection';
  }
  if (policy?.aiAutoSubmit) return 'ai-test-prompt-candidate';
  if (asArray(policy?.riskCategories).includes('trigger') || asArray(policy?.riskCategories).includes('day-flow')) {
    return 'trigger-candidate';
  }
  return 'passive-or-setup-boundary';
}

function roleReadiness({ role, policy, contract }) {
  const blockers = [...asArray(role?.blockers)];
  if (!role?.rule?.supported) blockers.push('missing-rule-automation-entry');
  if (!policy) blockers.push('missing-automation-safety-policy');
  if (role?.match?.requiresReview) blockers.push('role-match-review-required');
  if (policy?.aiMayMutateStateDirectly) blockers.push('direct-ai-state-mutation-not-allowed');
  if (contract?.highRisk && contract?.storytellerConfirmationRequired !== true) {
    blockers.push('high-risk-contract-missing-storyteller-confirmation');
  }
  const warnings = [];
  if (role?.status === 'review') warnings.push('storyteller-review-required');
  if (role?.match?.requiresReview) warnings.push('import-match-review-required');
  if (policy?.executionModel?.testMode?.needsSyntheticEvent) warnings.push('synthetic-trigger-event-required');

  return {
    status: blockers.length > 0 ? 'NO-GO' : 'GO',
    aiTestReady: blockers.length === 0,
    liveReadyWithStoryteller: blockers.length === 0,
    fullyAutomaticOfficialAdjudication: false,
    blockers: unique(blockers),
    warnings: unique(warnings)
  };
}

function buildOfficialRuleEngineRole(role) {
  const roleId = canonicalRoleId(role.roleId);
  const policy = getRoleAutomationPolicy(roleId);
  const contract = getRoleRuleContract(roleId);
  const readiness = roleReadiness({ role, policy, contract });
  const executionClass = executionClassFor({ role, policy, contract });
  const promptKinds = promptKindsFromProfile(role);

  return {
    schemaVersion: `${SCHEMA_VERSION}.role`,
    roleId,
    sourceRoleId: role.sourceRoleId || roleId,
    name: role.name || roleId,
    nameEn: role.nameEn || roleId,
    team: role.team || role.group || null,
    alignment: role.alignment || 'unknown',
    ability: role.ability || '',
    setup: role.setup === true,
    nightOrder: clone(role.night || { first: { wakes: false, order: null }, other: { wakes: false, order: null } }),
    rule: {
      supported: role.rule.supported === true,
      phases: asArray(role.rule.phases),
      automation: role.rule.automation || null,
      resolution: role.rule.resolution || null,
      promptKinds
    },
    execution: {
      class: executionClass,
      riskLevel: policy?.riskLevel || 'unknown',
      riskCategories: asArray(policy?.riskCategories),
      aiTestPlayerAction: policy?.executionModel?.testMode?.playerInputMode || 'unknown',
      aiStorytellerAction: policy?.executionModel?.testMode?.aiStorytellerMode || 'unknown',
      liveAuthority: policy?.executionModel?.liveMode?.authority || 'storyteller-confirmed',
      playerVisibleOutput: policy?.executionModel?.liveMode?.playerVisibleOutput || 'confirmed-candidate-only',
      directAiStateMutationAllowed: policy?.aiMayMutateStateDirectly === true,
      storytellerConfirmationRequired: policy?.storytellerConfirmationRequired !== false,
      implementedMechanism: policy?.implementedMechanism || 'missing-policy',
      requiredAdjustment: policy?.requiredAdjustment || null
    },
    contract: contract ? {
      officialLogicStatus: contract.officialLogicStatus,
      automationTier: contract.automationTier,
      highRisk: contract.highRisk === true,
      triggers: asArray(contract.triggers),
      aiTestActions: asArray(contract.aiTestActions),
      candidateTypes: asArray(contract.candidateTypes),
      storytellerConfirmationPoints: asArray(contract.storytellerConfirmationPoints),
      playerVisibleBoundary: contract.playerVisibleBoundary || null,
      stateEffects: asArray(contract.stateEffects),
      scoringSignals: asArray(contract.scoringSignals)
    } : null,
    importMatch: role.match || null,
    readiness
  };
}

function summarizeGeneratedRoles(roles) {
  return roles.reduce((acc, role) => {
    acc.total += 1;
    acc.byExecutionClass[role.execution.class] = (acc.byExecutionClass[role.execution.class] || 0) + 1;
    acc.byRiskLevel[role.execution.riskLevel] = (acc.byRiskLevel[role.execution.riskLevel] || 0) + 1;
    if (role.rule.supported) acc.supported += 1;
    else acc.unsupported += 1;
    if (role.contract?.highRisk) acc.highRisk += 1;
    if (role.execution.storytellerConfirmationRequired) acc.storytellerConfirmationRequired += 1;
    if (role.execution.directAiStateMutationAllowed) acc.directAiStateMutationRoleIds.push(role.roleId);
    if (role.readiness.aiTestReady) acc.aiTestReady += 1;
    if (role.readiness.status !== 'GO') acc.noGoRoleIds.push(role.roleId);
    for (const blocker of role.readiness.blockers) {
      acc.blockers[blocker] = (acc.blockers[blocker] || 0) + 1;
    }
    return acc;
  }, {
    total: 0,
    supported: 0,
    unsupported: 0,
    highRisk: 0,
    storytellerConfirmationRequired: 0,
    aiTestReady: 0,
    byExecutionClass: {},
    byRiskLevel: {},
    directAiStateMutationRoleIds: [],
    noGoRoleIds: [],
    blockers: {}
  });
}

function analyzeImportMatches(input) {
  const entries = importedEntries(input);
  if (entries.length === 0) {
    return {
      entryCount: 0,
      matchedCount: 0,
      reviewRequiredCount: 0,
      unmatchedCount: 0,
      unmatchedSourceIds: [],
      reviewSourceIds: []
    };
  }
  const summary = matchScriptEntriesFromJson(input);
  return {
    entryCount: entries.length,
    matchedCount: summary.matches.filter((match) => match.roleId).length,
    reviewRequiredCount: summary.reviewRequired.length,
    unmatchedCount: summary.unmatched.length,
    unmatchedSourceIds: summary.unmatched.map((match) => match.sourceId || `entry-${match.index}`),
    reviewSourceIds: summary.reviewRequired.map((match) => match.sourceId || `entry-${match.index}`)
  };
}

function buildOfficialRuleEngine(input = {}) {
  const profile = buildBoardRoleLogicProfile(input);
  const roles = profile.roles.map(buildOfficialRuleEngineRole);
  const summary = summarizeGeneratedRoles(roles);
  const contractCoverage = buildRuleContractCoverage(profile.roleIds);
  const executionMatrix = buildRoleExecutionMatrix();
  const importCoverage = analyzeImportMatches(input);
  const failures = [];

  if (summary.unsupported > 0) failures.push(`unsupported-role-logic:${roles.filter((role) => !role.rule.supported).map((role) => role.roleId).join(',')}`);
  if (summary.directAiStateMutationRoleIds.length > 0) failures.push(`direct-ai-state-mutation:${summary.directAiStateMutationRoleIds.join(',')}`);
  if (contractCoverage.highRiskMissingContractRoleIds.length > 0) {
    failures.push(`high-risk-contract-missing:${contractCoverage.highRiskMissingContractRoleIds.join(',')}`);
  }
  if (importCoverage.unmatchedCount > 0) failures.push(`import-unmatched:${importCoverage.unmatchedSourceIds.join(',')}`);
  if (importCoverage.reviewRequiredCount > 0) failures.push(`import-review-required:${importCoverage.reviewSourceIds.join(',')}`);
  if (executionMatrix.status !== 'GO') failures.push('global-role-execution-matrix-not-go');

  return {
    schemaVersion: SCHEMA_VERSION,
    status: failures.length === 0 ? 'GO' : 'NO-GO',
    generatedAt: new Date().toISOString(),
    scriptId: profile.scriptId,
    scriptName: profile.scriptName,
    scriptConfidence: profile.scriptConfidence,
    roleCount: roles.length,
    readiness: {
      aiTestReady: failures.length === 0,
      liveReadyWithStoryteller: failures.length === 0,
      fullyAutomaticOfficialAdjudication: false,
      liveAuthority: 'storyteller-confirmed',
      boundary: 'AI can generate prompts, candidates, private projections, and test submissions. It must not directly mutate authoritative live game state without storyteller confirmation.'
    },
    nightOrder: clone(profile.nightOrder),
    summary,
    importCoverage,
    contractCoverage,
    globalExecutionMatrix: {
      status: executionMatrix.status,
      totals: executionMatrix.totals
    },
    roles,
    warnings: unique(profile.warnings),
    failures: unique(failures)
  };
}

function buildRuntimeOfficialRuleEngines() {
  return getRuntimeScripts().map((script) => buildOfficialRuleEngine({ scriptId: script.id }));
}

module.exports = {
  SCHEMA_VERSION,
  buildOfficialRuleEngine,
  buildOfficialRuleEngineRole,
  buildRuntimeOfficialRuleEngines,
  summarizeGeneratedRoles
};
