const DEFAULT_AI_SETTINGS = {
  provider: 'disabled',
  baseUrl: 'https://api.openai.com/v1',
  model: '',
  apiKey: '',
  timeoutMs: 12000,
  maxTokens: 220,
  temperature: 0.2,
  thinking: '',
  reasoningSplit: '',
  useMaxCompletionTokens: '',
  enabled: false
};

require('../ProjectEnv').loadProjectEnv();

const runtimeSettings = {
  ...DEFAULT_AI_SETTINGS,
  source: 'runtime-default',
  updatedAt: null,
  keyUpdatedAt: null
};

function normalizeProvider(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'none' || raw === 'off') return 'disabled';
  if (raw === 'openai') return 'openai-compatible';
  if (raw === 'openai-compatible' || raw === 'disabled') return raw;
  return raw;
}

function trimTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function parseNumber(value, fallback, { min, max }) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function maskSecret(value) {
  const raw = String(value || '');
  if (!raw) return null;
  if (raw.length <= 4) return '****';
  return `****${raw.slice(-4)}`;
}

function readEnvSettings(env = process.env) {
  const provider = normalizeProvider(env.BOTC_AI_PROVIDER || env.AI_PROVIDER);
  const enabled = provider !== 'disabled';
  return {
    provider,
    baseUrl: trimTrailingSlash(env.BOTC_AI_BASE_URL || env.OPENAI_BASE_URL || DEFAULT_AI_SETTINGS.baseUrl),
    model: String(env.BOTC_AI_MODEL || env.OPENAI_MODEL || '').trim(),
    apiKey: String(env.BOTC_AI_API_KEY || env.OPENAI_API_KEY || ''),
    timeoutMs: parseNumber(env.BOTC_AI_TIMEOUT_MS, DEFAULT_AI_SETTINGS.timeoutMs, { min: 1000, max: 120000 }),
    maxTokens: parseNumber(env.BOTC_AI_MAX_TOKENS, DEFAULT_AI_SETTINGS.maxTokens, { min: 1, max: 4000 }),
    temperature: parseNumber(env.BOTC_AI_TEMPERATURE, DEFAULT_AI_SETTINGS.temperature, { min: 0, max: 2 }),
    thinking: String(env.BOTC_AI_THINKING || '').trim(),
    reasoningSplit: String(env.BOTC_AI_REASONING_SPLIT || '').trim(),
    useMaxCompletionTokens: String(env.BOTC_AI_USE_MAX_COMPLETION_TOKENS || '').trim(),
    enabled,
    source: 'environment',
    updatedAt: null,
    keyUpdatedAt: null
  };
}

function getEffectiveAiSettings(env = process.env) {
  const envSettings = readEnvSettings(env);
  const source = runtimeSettings.updatedAt ? 'runtime' : envSettings.source;
  const base = runtimeSettings.updatedAt ? runtimeSettings : envSettings;
  const provider = normalizeProvider(base.provider);
  const enabled = base.enabled === true && provider !== 'disabled';
  return {
    provider,
    baseUrl: trimTrailingSlash(base.baseUrl || DEFAULT_AI_SETTINGS.baseUrl),
    model: String(base.model || '').trim(),
    apiKey: String(base.apiKey || ''),
    timeoutMs: parseNumber(base.timeoutMs, DEFAULT_AI_SETTINGS.timeoutMs, { min: 1000, max: 120000 }),
    maxTokens: parseNumber(base.maxTokens, DEFAULT_AI_SETTINGS.maxTokens, { min: 1, max: 4000 }),
    temperature: parseNumber(base.temperature, DEFAULT_AI_SETTINGS.temperature, { min: 0, max: 2 }),
    thinking: String(base.thinking || '').trim(),
    reasoningSplit: String(base.reasoningSplit || '').trim(),
    useMaxCompletionTokens: String(base.useMaxCompletionTokens || '').trim(),
    enabled,
    source,
    updatedAt: base.updatedAt || null,
    keyUpdatedAt: base.keyUpdatedAt || null,
    envHasKey: Boolean(envSettings.apiKey)
  };
}

function getAiSettingsEnv(env = process.env) {
  const settings = getEffectiveAiSettings(env);
  return {
    BOTC_AI_PROVIDER: settings.enabled ? settings.provider : 'disabled',
    BOTC_AI_BASE_URL: settings.baseUrl,
    BOTC_AI_MODEL: settings.model,
    BOTC_AI_API_KEY: settings.apiKey,
    BOTC_AI_TIMEOUT_MS: String(settings.timeoutMs),
    BOTC_AI_MAX_TOKENS: String(settings.maxTokens),
    BOTC_AI_TEMPERATURE: String(settings.temperature),
    BOTC_AI_THINKING: settings.thinking,
    BOTC_AI_REASONING_SPLIT: settings.reasoningSplit,
    BOTC_AI_USE_MAX_COMPLETION_TOKENS: settings.useMaxCompletionTokens
  };
}

function getRedactedAiSettings(env = process.env) {
  const settings = getEffectiveAiSettings(env);
  const missing = [];
  if (settings.enabled) {
    if (!['openai-compatible'].includes(settings.provider)) missing.push('supported-provider');
    if (!settings.model) missing.push('model');
    if (!settings.apiKey) missing.push('api-key');
  }
  return {
    enabled: settings.enabled,
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.model || 'disabled',
    apiKeyConfigured: Boolean(settings.apiKey),
    apiKeyMasked: maskSecret(settings.apiKey),
    timeoutMs: settings.timeoutMs,
    maxTokens: settings.maxTokens,
    temperature: settings.temperature,
    thinking: settings.thinking || null,
    reasoningSplit: settings.reasoningSplit || null,
    useMaxCompletionTokens: settings.useMaxCompletionTokens || null,
    source: settings.source,
    updatedAt: settings.updatedAt,
    keyUpdatedAt: settings.keyUpdatedAt,
    validation: {
      status: missing.length ? 'needs-config' : 'ready',
      missing
    },
    runtimeBoundary: {
      realModelCallsAllowedByThisEndpoint: false,
      serverSideSecretsOnly: true,
      playerVisible: false
    }
  };
}

function applyRuntimeAiSettings(input = {}, now = new Date().toISOString()) {
  const previousKey = runtimeSettings.updatedAt
    ? (runtimeSettings.apiKey || '')
    : (readEnvSettings().apiKey || '');
  const hasApiKeyField = Object.prototype.hasOwnProperty.call(input, 'apiKey');
  const nextProvider = normalizeProvider(input.provider || runtimeSettings.provider);
  const nextEnabled = input.enabled === true && nextProvider !== 'disabled';
  const nextApiKey = hasApiKeyField ? String(input.apiKey || '') : previousKey;

  runtimeSettings.provider = nextEnabled ? nextProvider : 'disabled';
  runtimeSettings.enabled = nextEnabled;
  runtimeSettings.baseUrl = trimTrailingSlash(input.baseUrl || runtimeSettings.baseUrl || DEFAULT_AI_SETTINGS.baseUrl);
  runtimeSettings.model = String(input.model || runtimeSettings.model || '').trim();
  runtimeSettings.apiKey = nextApiKey;
  runtimeSettings.timeoutMs = parseNumber(input.timeoutMs, runtimeSettings.timeoutMs, { min: 1000, max: 120000 });
  runtimeSettings.maxTokens = parseNumber(input.maxTokens, runtimeSettings.maxTokens, { min: 1, max: 4000 });
  runtimeSettings.temperature = parseNumber(input.temperature, runtimeSettings.temperature, { min: 0, max: 2 });
  runtimeSettings.thinking = String(input.thinking || runtimeSettings.thinking || '').trim();
  runtimeSettings.reasoningSplit = String(input.reasoningSplit || runtimeSettings.reasoningSplit || '').trim();
  runtimeSettings.useMaxCompletionTokens = String(input.useMaxCompletionTokens || runtimeSettings.useMaxCompletionTokens || '').trim();
  runtimeSettings.source = 'runtime';
  runtimeSettings.updatedAt = now;
  if (hasApiKeyField && nextApiKey !== previousKey) runtimeSettings.keyUpdatedAt = now;
  return getRedactedAiSettings();
}

function resetRuntimeAiSettings() {
  Object.assign(runtimeSettings, {
    ...DEFAULT_AI_SETTINGS,
    source: 'runtime-default',
    updatedAt: null,
    keyUpdatedAt: null
  });
}

function runMockAiSettingsCheck(env = process.env) {
  const settings = getRedactedAiSettings(env);
  const failures = [];
  if (settings.enabled && settings.provider !== 'openai-compatible') failures.push('unsupported-provider');
  if (settings.enabled && !settings.model) failures.push('missing-model');
  if (settings.enabled && !settings.apiKeyConfigured) failures.push('missing-api-key');
  return {
    status: failures.length ? 'NO_GO' : 'GO',
    mode: 'mock-config-check',
    modelCalled: false,
    failures,
    settings,
    runtimeBoundary: {
      noExternalRequest: true,
      noCost: true,
      noPlayerSecretExposure: true,
      storytellerConfirmationStillRequired: true
    }
  };
}

module.exports = {
  applyRuntimeAiSettings,
  getAiSettingsEnv,
  getEffectiveAiSettings,
  getRedactedAiSettings,
  maskSecret,
  readEnvSettings,
  resetRuntimeAiSettings,
  runMockAiSettingsCheck
};
