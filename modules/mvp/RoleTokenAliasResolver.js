const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..', '..');
const ENABLE_ENV = 'BOTC_ENABLE_ROLE_TOKEN_ALIAS_RESOLVER';
const DEFAULT_REGISTRY_PATH = path.join(
  rootDir,
  'data',
  'knowledge',
  'role-token-alias-registry.json'
);

const BLOCKED_ROLE_TOKENS = new Set([
  'poisoned',
  'drunk',
  'sober',
  'healthy',
  'dead',
  'alive',
  'evil',
  'good'
]);

function normalizeRoleToken(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isEnabled(env = process.env) {
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(env[ENABLE_ENV] || '').trim().toLowerCase());
}

function resolveRegistryPath(registryPath) {
  if (!registryPath) return DEFAULT_REGISTRY_PATH;
  return path.isAbsolute(registryPath) ? registryPath : path.resolve(rootDir, registryPath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validateRegistry(registry) {
  const failures = [];
  if (registry?.schemaVersion !== 'botc.role-token-alias-registry.v1') {
    failures.push('unexpected alias registry schemaVersion');
  }
  if (registry?.status !== 'GO') failures.push(`alias registry status is ${registry?.status}`);
  if (registry?.registryState !== 'READY') failures.push(`alias registry state is ${registry?.registryState}`);
  if (registry?.sourcePolicy?.distilledOnly !== true) failures.push('alias registry must be distilled knowledge only');
  if (registry?.sourcePolicy?.rawMediaStoredInProject !== false) failures.push('alias registry must not store raw media in project');
  if (registry?.sourcePolicy?.learningPipelineStoredInProject !== false) failures.push('alias registry must not store learning pipeline in project');
  if (registry?.boundaries?.productionApplyMode !== 'disabled') failures.push('alias registry productionApplyMode must be disabled');
  if (registry?.boundaries?.noVideoDownload !== true) failures.push('alias registry must not include video download');
  if (registry?.boundaries?.noAsrProcessing !== true) failures.push('alias registry must not include ASR processing');
  if (registry?.boundaries?.noLearningMaterialProcessing !== true) failures.push('alias registry must not include learning-material processing');
  if (registry?.boundaries?.projectRuntimeKnowledgeOnly !== true) failures.push('alias registry must be project runtime knowledge only');
  if (registry?.boundaries?.ruleEngineMutated !== false) failures.push('alias registry must not mutate rule engine');
  if (registry?.boundaries?.sourceEventsMutated !== false) failures.push('alias registry must not mutate source events');
  if (registry?.boundaries?.generatedPatch !== false) failures.push('alias registry must not generate patches');
  if (registry?.promotion?.mayPromoteAutomatically !== false) failures.push('alias registry must not promote automatically');
  if (!Array.isArray(registry?.aliases)) failures.push('alias registry aliases must be an array');
  return failures;
}

function normalizeAlias(alias) {
  const aliasToken = normalizeRoleToken(alias?.aliasToken || alias?.displayToken);
  const canonicalRoleId = normalizeRoleToken(alias?.canonicalRoleId);
  if (!aliasToken || !canonicalRoleId || BLOCKED_ROLE_TOKENS.has(aliasToken) || /^\d+$/.test(aliasToken)) {
    return null;
  }
  return {
    aliasId: alias.aliasId || `${alias?.scope?.scriptId || 'unknown'}-${aliasToken}-${canonicalRoleId}`,
    aliasToken,
    displayToken: alias.displayToken || alias.aliasToken || aliasToken,
    canonicalRoleId,
    canonicalRoleName: alias.canonicalRoleName || alias.officialRoleAnchor?.name || canonicalRoleId,
    scope: {
      scriptId: alias.scope?.scriptId || null,
      eventType: alias.scope?.eventType || null
    },
    officialRoleAnchor: alias.officialRoleAnchor || null,
    source: alias.source || null
  };
}

function loadRoleTokenAliasRegistry(options = {}) {
  const enabled = options.enabled ?? isEnabled(options.env || process.env);
  const registryPath = resolveRegistryPath(options.registryPath);
  if (!enabled) {
    return {
      enabled: false,
      state: 'DISABLED',
      registryPath,
      aliases: [],
      failures: []
    };
  }

  if (!fs.existsSync(registryPath)) {
    return {
      enabled: true,
      state: 'NO_GO',
      registryPath,
      aliases: [],
      failures: [`missing alias registry: ${path.relative(rootDir, registryPath)}`]
    };
  }

  let registry;
  try {
    registry = readJson(registryPath);
  } catch (error) {
    return {
      enabled: true,
      state: 'NO_GO',
      registryPath,
      aliases: [],
      failures: [`failed to read alias registry: ${error.message}`]
    };
  }

  const failures = validateRegistry(registry);
  const aliases = failures.length === 0
    ? (registry.aliases || []).map(normalizeAlias).filter(Boolean)
    : [];

  return {
    enabled: true,
    state: failures.length === 0 ? 'READY' : 'NO_GO',
    registryPath,
    aliases,
    failures,
    source: {
      schemaVersion: registry.schemaVersion || null,
      registryState: registry.registryState || null,
      aliasCount: aliases.length,
      generatedAt: registry.generatedAt || null
    }
  };
}

module.exports = {
  BLOCKED_ROLE_TOKENS,
  DEFAULT_REGISTRY_PATH,
  ENABLE_ENV,
  isEnabled,
  loadRoleTokenAliasRegistry,
  normalizeRoleToken
};
