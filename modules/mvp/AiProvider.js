const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = 'https://api.openai.com/v1';
require('../ProjectEnv').loadProjectEnv();

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function normalizeProviderName(value) {
  return String(value || 'disabled').trim().toLowerCase();
}

function createAiProviderConfig(env = process.env) {
  const provider = normalizeProviderName(env.BOTC_AI_PROVIDER || env.AI_PROVIDER);
  if (!provider || provider === 'disabled' || provider === 'none' || provider === 'off') {
    return {
      enabled: false,
      provider: 'none',
      model: 'disabled',
      reason: 'disabled'
    };
  }

  if (!['openai-compatible', 'openai'].includes(provider)) {
    return {
      enabled: false,
      provider,
      model: 'disabled',
      reason: 'unsupported-provider'
    };
  }

  const apiKey = env.BOTC_AI_API_KEY || env.OPENAI_API_KEY || '';
  const model = env.BOTC_AI_MODEL || env.OPENAI_MODEL || '';
  if (!apiKey) {
    return {
      enabled: false,
      provider: provider === 'openai' ? 'openai-compatible' : provider,
      model: model || 'disabled',
      reason: 'missing-api-key'
    };
  }
  if (!model) {
    return {
      enabled: false,
      provider: provider === 'openai' ? 'openai-compatible' : provider,
      model: 'disabled',
      reason: 'missing-model'
    };
  }

  return {
    enabled: true,
    provider: 'openai-compatible',
    baseUrl: trimTrailingSlash(env.BOTC_AI_BASE_URL || env.OPENAI_BASE_URL || DEFAULT_OPENAI_COMPATIBLE_BASE_URL),
    apiKey,
    model,
    timeoutMs: Number(env.BOTC_AI_TIMEOUT_MS || 12000),
    maxTokens: Number(env.BOTC_AI_MAX_TOKENS || 220),
    temperature: Number(env.BOTC_AI_TEMPERATURE || 0.2),
    thinking: normalizeThinkingMode(env.BOTC_AI_THINKING, model),
    reasoningSplit: parseBoolean(env.BOTC_AI_REASONING_SPLIT, isMiniMaxM3(model)),
    preferMaxCompletionTokens: parseBoolean(env.BOTC_AI_USE_MAX_COMPLETION_TOKENS, isMiniMaxM3(model))
  };
}

function isMiniMaxM3(model) {
  return String(model || '').trim().toLowerCase() === 'minimax-m3';
}

function normalizeThinkingMode(value, model) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'adaptive' || raw === 'disabled') return raw;
  if (raw === 'none' || raw === 'off' || raw === 'false') return 'disabled';
  return isMiniMaxM3(model) ? 'disabled' : null;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const raw = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function buildChatCompletionBody(config, candidate) {
  const body = {
    model: config.model,
    messages: buildCandidateMessages(candidate),
    temperature: config.temperature,
    response_format: { type: 'json_object' }
  };

  if (config.preferMaxCompletionTokens) body.max_completion_tokens = config.maxTokens;
  else body.max_tokens = config.maxTokens;

  if (config.thinking) body.thinking = { type: config.thinking };
  if (config.reasoningSplit) body.reasoning_split = true;

  return body;
}

function buildRedactedCandidateContext(candidate) {
  return {
    candidateId: candidate.candidateId,
    scriptId: candidate.ruleEvidence?.scriptId || 'trouble-brewing',
    roleId: candidate.roleId,
    roleIdAtPrompt: candidate.roleIdAtPrompt,
    seat: candidate.seat,
    candidateKind: candidate.candidateKind,
    status: candidate.status,
    visibleResultDraft: candidate.visibleResultDraft
      ? {
          messageType: candidate.visibleResultDraft.messageType,
          hasText: typeof candidate.visibleResultDraft.text === 'string',
          text: candidate.visibleResultDraft.text
        }
      : null,
    stateChangeDraft: candidate.stateChangeDraft
      ? {
          type: candidate.stateChangeDraft.type,
          targetSeat: candidate.stateChangeDraft.targetSeat,
          patchCount: Array.isArray(candidate.stateChangeDraft.patches) ? candidate.stateChangeDraft.patches.length : 0
        }
      : null,
    warnings: Array.isArray(candidate.warnings)
      ? candidate.warnings.map((warning) => ({
          code: warning.code,
          severity: warning.severity,
          text: warning.text
        }))
      : [],
    ruleEvidence: {
      sourcePolicy: candidate.ruleEvidence?.sourcePolicy || null,
      ruleEngineVersion: candidate.ruleEvidence?.ruleEngineVersion || null,
      officialRoleIds: candidate.ruleEvidence?.officialRoleIds || []
    },
    storytellerDiaryDraft: candidate.diaryDraft?.storytellerText || null
  };
}

function buildCandidateMessages(candidate) {
  const context = buildRedactedCandidateContext(candidate);
  return [
    {
      role: 'system',
      content: [
        '你是《血染钟楼：暗流涌动》的说书人辅助审阅器。',
        '只能给说书人生成候选措辞和风险提示。',
        '不要写 event log，不要修改状态，不要指示绕过说书人确认。',
        '只返回 JSON：{"copySuggestion":"...","riskSummary":"..."}。'
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'review-candidate-resolution',
        outputContract: {
          copySuggestion: '给说书人的简短确认措辞，不直接发给玩家',
          riskSummary: '需要说书人注意的规则/泄露风险'
        },
        redactedCandidate: context
      })
    }
  ];
}

function extractJsonObject(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    const first = value.indexOf('{');
    const last = value.lastIndexOf('}');
    if (first === -1 || last === -1 || last <= first) return null;
    try {
      return JSON.parse(value.slice(first, last + 1));
    } catch {
      return null;
    }
  }
}

function makeUnavailableResult(config, reason) {
  return {
    status: 'unavailable',
    mode: 'provider',
    output: null,
    failureReason: reason || config.reason || 'provider-unavailable',
    providerMetadata: {
      provider: config.provider || 'none',
      model: config.model || 'disabled',
      requestId: null
    },
    usage: {
      promptTokens: 0,
      completionTokens: 0
    },
    runtimeBoundary: {
      providerIntegration: config.provider !== 'none',
      modelCalled: false,
      serverSideSecretsOnly: true
    }
  };
}

async function callOpenAiCompatibleCandidate({ config, candidate, fetchImpl = globalThis.fetch }) {
  if (!config?.enabled) return makeUnavailableResult(config || {}, config?.reason || 'disabled');
  if (typeof fetchImpl !== 'function') return makeUnavailableResult(config, 'fetch-unavailable');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 12000);
  try {
    const response = await fetchImpl(`${trimTrailingSlash(config.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildChatCompletionBody(config, candidate)),
      signal: controller.signal
    });

    const requestId = response.headers?.get?.('x-request-id') || response.headers?.get?.('openai-request-id') || null;
    const bodyText = await response.text();
    if (!response.ok) {
      return {
        ...makeUnavailableResult(config, `http-${response.status}`),
        providerMetadata: {
          provider: config.provider,
          model: config.model,
          requestId
        },
        runtimeBoundary: {
          providerIntegration: true,
          modelCalled: true,
          serverSideSecretsOnly: true
        }
      };
    }

    let body;
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = null;
    }
    const content = body?.choices?.[0]?.message?.content || '';
    const parsed = extractJsonObject(content);
    if (!parsed) {
      return {
        ...makeUnavailableResult(config, 'invalid-json-output'),
        providerMetadata: {
          provider: config.provider,
          model: body?.model || config.model,
          requestId: requestId || body?.request_id || body?.id || null
        },
        usage: {
          promptTokens: Number(body?.usage?.prompt_tokens || 0),
          completionTokens: Number(body?.usage?.completion_tokens || 0)
        },
        runtimeBoundary: {
          providerIntegration: true,
          modelCalled: true,
          serverSideSecretsOnly: true
        }
      };
    }

    return {
      status: 'accepted',
      mode: 'provider',
      output: parsed,
      failureReason: null,
      providerMetadata: {
        provider: config.provider,
        model: body?.model || config.model,
        requestId: requestId || body?.request_id || body?.id || null
      },
      usage: {
        promptTokens: Number(body?.usage?.prompt_tokens || 0),
        completionTokens: Number(body?.usage?.completion_tokens || 0)
      },
      runtimeBoundary: {
        providerIntegration: true,
        modelCalled: true,
        serverSideSecretsOnly: true
      }
    };
  } catch (error) {
    return {
      ...makeUnavailableResult(config, error?.name === 'AbortError' ? 'timeout' : 'provider-call-failed'),
      runtimeBoundary: {
        providerIntegration: true,
        modelCalled: false,
        serverSideSecretsOnly: true
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

function createAiProviderFromEnv(env = process.env, options = {}) {
  const config = createAiProviderConfig(env);
  return {
    config: {
      enabled: config.enabled,
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl || null,
      reason: config.reason || null
    },
    async callCandidateAi(candidate) {
      return callOpenAiCompatibleCandidate({
        config,
        candidate,
        fetchImpl: options.fetchImpl || globalThis.fetch
      });
    }
  };
}

module.exports = {
  buildCandidateMessages,
  buildRedactedCandidateContext,
  buildChatCompletionBody,
  callOpenAiCompatibleCandidate,
  createAiProviderConfig,
  createAiProviderFromEnv,
  extractJsonObject
};
