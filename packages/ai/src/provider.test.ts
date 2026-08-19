// @ts-expect-error Node 原生 TypeScript 测试需要显式扩展名。
import { EmbeddingProviderError, LLMProviderError, OpenAICompatibleEmbeddingProvider, OpenAICompatibleProvider, createEmbeddingProvider, createLLMProvider, estimateCost, loadEmbeddingConfig, providerStatus, type EmbeddingConfig, type LLMConfig, type ProviderRequestInit, type ProviderResponse } from './provider.ts';
// @ts-expect-error Node 原生 TypeScript 测试需要显式扩展名。
import { financialFilterSchema } from './schemas.ts';

function config(overrides: Partial<LLMConfig> = {}): LLMConfig {
  return {
    provider: 'openai-compatible',
    baseUrl: 'http://provider-one/v1',
    model: 'model-one',
    apiKey: 'test-key',
    timeoutMs: 20,
    maxRetries: 2,
    retryDelayMs: 0,
    ...overrides,
  };
}

function response(body: unknown, status = 200): ProviderResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function successBody(content = '{"isFinancial":true,"score":0.9,"reason":"contains market data"}') {
  return {
    model: 'model-one',
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 13, completion_tokens: 7 },
  };
}

function embeddingConfig(overrides: Partial<EmbeddingConfig> = {}): EmbeddingConfig {
  return {
    provider: 'openai-compatible',
    baseUrl: 'http://embedding-provider/v1',
    model: 'embedding-model',
    apiKey: 'embedding-key',
    embeddingVersion: 'v1',
    timeoutMs: 20,
    maxRetries: 2,
    retryDelayMs: 0,
    ...overrides,
  };
}

function embeddingResponse(vector: unknown, status = 200, dimensions?: number): ProviderResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return {
        model: 'embedding-model',
        ...(dimensions === undefined ? {} : { dimensions }),
        data: [{ index: 0, embedding: vector }],
      };
    },
  };
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function assertRejects(
  promise: Promise<unknown>,
  predicate: (error: unknown) => boolean,
  message: string,
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    if (predicate(error)) return;
    throw new Error(`${message}: rejected with an unexpected error`);
  }
  throw new Error(`${message}: expected rejection`);
}

type TestCase = { name: string; run: () => Promise<void> };

const cases: TestCase[] = [
  {
    name: 'OpenAI-compatible Provider 成功解析纯 JSON、usage 和请求配置',
    async run() {
      const requests: Array<{ url: string; init?: ProviderRequestInit }> = [];
      const provider = new OpenAICompatibleProvider(config(), {
        fetchFn: async (url, init) => {
          requests.push({ url: String(url), init });
          return response(successBody());
        },
      });
      const output = await provider.generateJSONWithUsage({
        prompt: 'article data',
        schema: financialFilterSchema,
      });
      assertEqual(output.value.isFinancial, true, 'isFinancial');
      assertDeepEqual(output.usage, { promptTokens: 13, completionTokens: 7 }, 'usage');
      assertEqual(requests[0].url, 'http://provider-one/v1/chat/completions', 'request URL');
      assertEqual((requests[0].init?.headers as Record<string, string>).authorization, 'Bearer test-key', 'authorization');
      assertEqual(JSON.parse(String(requests[0].init?.body)).model, 'model-one', 'request model');
    },
  },
  {
    name: '未配置 Provider 明确报告 unconfigured 且不发请求',
    async run() {
      const provider = createLLMProvider(config({ baseUrl: undefined, apiKey: undefined }));
      assertEqual(providerStatus(config({ baseUrl: undefined })), 'unconfigured', 'provider status');
      await assertRejects(
        provider.generateText({ prompt: 'test' }),
        (error) => error instanceof LLMProviderError && error.kind === 'unconfigured' && error.retryable === false,
        'unconfigured provider',
      );
    },
  },
  {
    name: '401 不重试并分类为 authentication',
    async run() {
      let calls = 0;
      const provider = new OpenAICompatibleProvider(config(), {
        fetchFn: async () => {
          calls += 1;
          return response({ error: 'unauthorized' }, 401);
        },
      });
      await assertRejects(
        provider.generateText({ prompt: 'test' }),
        (error) => error instanceof LLMProviderError && error.kind === 'authentication',
        '401 classification',
      );
      assertEqual(calls, 1, '401 calls');
    },
  },
  {
    name: '429/5xx 只做有限重试，恢复后返回成功',
    async run() {
      let calls = 0;
      const sleeps: number[] = [];
      const provider = new OpenAICompatibleProvider(config(), {
        fetchFn: async () => {
          calls += 1;
          return calls < 3 ? response({}, calls === 1 ? 429 : 503) : response(successBody());
        },
        sleep: async (delay) => { sleeps.push(delay); },
      });
      const result = await provider.generateText({ prompt: 'test' });
      assertEqual(result.text, '{"isFinancial":true,"score":0.9,"reason":"contains market data"}', 'retry result');
      assertEqual(calls, 3, 'retry calls');
      assertDeepEqual(sleeps, [0, 0], 'retry sleeps');
    },
  },
  {
    name: '重试耗尽与超时都分类且不会无限请求',
    async run() {
      let serverCalls = 0;
      const serverProvider = new OpenAICompatibleProvider(config(), {
        fetchFn: async () => {
          serverCalls += 1;
          return response({}, 500);
        },
      });
      await assertRejects(
        serverProvider.generateText({ prompt: 'test' }),
        (error) => error instanceof LLMProviderError && error.kind === 'server',
        'server retry exhaustion',
      );
      assertEqual(serverCalls, 3, 'server calls');

      let timeoutCalls = 0;
      const timeoutProvider = new OpenAICompatibleProvider(config({ maxRetries: 1 }), {
        fetchFn: async () => {
          timeoutCalls += 1;
          const timeoutError = new Error('timed out');
          timeoutError.name = 'AbortError';
          throw timeoutError;
        },
      });
      await assertRejects(
        timeoutProvider.generateText({ prompt: 'test' }),
        (error) => error instanceof LLMProviderError && error.kind === 'timeout',
        'timeout classification',
      );
      assertEqual(timeoutCalls, 2, 'timeout calls');
    },
  },
  {
    name: '非法 JSON 和 Schema 不符均拒绝，不从 Markdown 猜结果',
    async run() {
      const fence = String.fromCharCode(96).repeat(3);
      const markdownProvider = new OpenAICompatibleProvider(config(), {
        fetchFn: async () => response(successBody([fence + 'json', '{"isFinancial":true,"score":0.9,"reason":"x"}', fence].join('\n'))),
      });
      await assertRejects(
        markdownProvider.generateJSON({ prompt: 'test', schema: financialFilterSchema }),
        (error) => error instanceof LLMProviderError && error.kind === 'invalid_json',
        'markdown rejection',
      );

      const schemaProvider = new OpenAICompatibleProvider(config(), {
        fetchFn: async () => response(successBody('{"isFinancial":"yes","score":9,"reason":"x"}')),
      });
      await assertRejects(
        schemaProvider.generateJSON({ prompt: 'test', schema: financialFilterSchema }),
        (error) => error instanceof LLMProviderError && error.kind === 'schema',
        'schema rejection',
      );
    },
  },
  {
    name: 'usage 成本在价格未知时留空，配置替换只改变 Provider 目标',
    async run() {
      assertEqual(estimateCost({ promptTokens: 100, completionTokens: 50 }, config()), undefined, 'unknown cost');
      assertEqual(estimateCost({ promptTokens: 100, completionTokens: 50 }, config({ inputCostPer1k: 1, outputCostPer1k: 2 })), 0.2, 'known cost');
      let target = '';
      const provider = createLLMProvider(config({ baseUrl: 'http://provider-two/v1', model: 'model-two' }), {
        fetchFn: async (url) => {
          target = String(url);
          return response(successBody());
        },
      });
      await provider.generateText({ prompt: 'test' });
      assertEqual(provider.name, 'openai-compatible', 'provider name');
      assertEqual(provider.model, 'model-two', 'provider model');
      assertEqual(target, 'http://provider-two/v1/chat/completions', 'replacement target');
    },
  },
  {
    name: '429→503→成功为每个 Provider attempt 保留有序审计记录',
    async run() {
      let calls = 0;
      const provider = new OpenAICompatibleProvider(config({ maxRetries: 2 }), {
        fetchFn: async () => {
          calls += 1;
          if (calls === 1) return response({ usage: { prompt_tokens: 3, completion_tokens: 1 } }, 429);
          if (calls === 2) return response({ usage: { prompt_tokens: 4, completion_tokens: 2 } }, 503);
          return response(successBody());
        },
      });
      const output = await provider.generateJSONWithUsage({ prompt: 'test', schema: financialFilterSchema });
      assertEqual(calls, 3, 'provider calls');
      assertDeepEqual(output.attempts.map((attempt) => ({
        providerAttempt: attempt.providerAttempt,
        outcome: attempt.outcome,
        httpStatus: attempt.httpStatus,
        model: attempt.model,
        usage: attempt.usage,
        usageReported: attempt.usageReported,
      })), [
        { providerAttempt: 1, outcome: 'http_error', httpStatus: 429, model: 'model-one', usage: { promptTokens: 3, completionTokens: 1 }, usageReported: true },
        { providerAttempt: 2, outcome: 'http_error', httpStatus: 503, model: 'model-one', usage: { promptTokens: 4, completionTokens: 2 }, usageReported: true },
        { providerAttempt: 3, outcome: 'success', httpStatus: 200, model: 'model-one', usage: { promptTokens: 13, completionTokens: 7 }, usageReported: true },
      ], 'attempt audit');
    },
  },
  {
    name: '非法 JSON 和 Schema 失败保留响应 usage 与结果类型',
    async run() {
      const invalidJsonProvider = new OpenAICompatibleProvider(config(), {
        fetchFn: async () => response(successBody('not-json')),
      });
      await assertRejects(
        invalidJsonProvider.generateJSON({ prompt: 'test', schema: financialFilterSchema }),
        (error) => error instanceof LLMProviderError
          && error.kind === 'invalid_json'
          && error.attempts.length === 1
          && error.attempts[0].outcome === 'invalid_json'
          && error.attempts[0].usageReported
          && JSON.stringify(error.attempts[0].usage) === JSON.stringify({ promptTokens: 13, completionTokens: 7 }),
        'invalid JSON audit',
      );

      const schemaProvider = new OpenAICompatibleProvider(config(), {
        fetchFn: async () => response(successBody('{"isFinancial":"yes","score":9,"reason":"x"}')),
      });
      await assertRejects(
        schemaProvider.generateJSON({ prompt: 'test', schema: financialFilterSchema }),
        (error) => error instanceof LLMProviderError
          && error.kind === 'schema'
          && error.attempts.length === 1
          && error.attempts[0].outcome === 'schema'
          && error.attempts[0].usageReported
          && JSON.stringify(error.attempts[0].usage) === JSON.stringify({ promptTokens: 13, completionTokens: 7 }),
        'schema audit',
      );
    },
  },
  {
    name: 'timeout 和 500 耗尽重试时每次请求都有无 usage 审计记录',
    async run() {
      const serverProvider = new OpenAICompatibleProvider(config({ maxRetries: 2 }), {
        fetchFn: async () => response({}, 500),
      });
      await assertRejects(
        serverProvider.generateText({ prompt: 'test' }),
        (error) => error instanceof LLMProviderError
          && error.kind === 'server'
          && error.attempts.length === 3
          && error.attempts.every((attempt, index) => attempt.providerAttempt === index + 1
            && attempt.outcome === 'http_error'
            && attempt.httpStatus === 500
            && attempt.usageReported === false
            && attempt.usage === undefined),
        'server audit',
      );

      const timeoutProvider = new OpenAICompatibleProvider(config({ maxRetries: 2 }), {
        fetchFn: async () => {
          const timeoutError = new Error('timed out');
          timeoutError.name = 'AbortError';
          throw timeoutError;
        },
      });
      await assertRejects(
        timeoutProvider.generateText({ prompt: 'test' }),
        (error) => error instanceof LLMProviderError
          && error.kind === 'timeout'
          && error.attempts.length === 3
          && error.attempts.every((attempt, index) => attempt.providerAttempt === index + 1
            && attempt.outcome === 'timeout'
            && attempt.httpStatus === undefined
            && attempt.usageReported === false
            && attempt.usage === undefined),
        'timeout audit',
      );
    },
  },
  {
    name: 'Embedding Provider 成功解析向量、维度和请求配置',
    async run() {
      const requests: Array<{ url: string; init?: ProviderRequestInit }> = [];
      const provider = new OpenAICompatibleEmbeddingProvider(embeddingConfig(), {
        fetchFn: async (url, init) => {
          requests.push({ url: String(url), init });
          return embeddingResponse([0.5, -0.25, 0.125], 200, 3);
        },
      });
      const output = await provider.embed({ text: '规范化标题\n规范化摘要' });
      assertDeepEqual(output.vector, [0.5, -0.25, 0.125], 'embedding vector');
      assertEqual(output.dimensions, 3, 'embedding dimensions');
      assertEqual(output.provider, 'openai-compatible', 'embedding provider');
      assertEqual(output.model, 'embedding-model', 'embedding model');
      assertEqual(requests[0].url, 'http://embedding-provider/v1/embeddings', 'embedding URL');
      const body = JSON.parse(String(requests[0].init?.body));
      assertEqual(body.input, '规范化标题\n规范化摘要', 'embedding input');
      assertEqual(body.model, 'embedding-model', 'embedding request model');
    },
  },
  {
    name: 'Embedding Provider 拒绝空向量、非有限数和返回维度不一致',
    async run() {
      const emptyProvider = new OpenAICompatibleEmbeddingProvider(embeddingConfig(), { fetchFn: async () => embeddingResponse([]) });
      await assertRejects(emptyProvider.embed({ text: 'empty' }), (error) => error instanceof EmbeddingProviderError && error.kind === 'invalid_response', 'empty vector');

      const nonFiniteProvider = new OpenAICompatibleEmbeddingProvider(embeddingConfig(), { fetchFn: async () => embeddingResponse([0.1, Number.NaN]) });
      await assertRejects(nonFiniteProvider.embed({ text: 'nan' }), (error) => error instanceof EmbeddingProviderError && error.kind === 'invalid_response', 'non-finite vector');

      const mismatchedProvider = new OpenAICompatibleEmbeddingProvider(embeddingConfig(), { fetchFn: async () => embeddingResponse([0.1, 0.2], 200, 3) });
      await assertRejects(mismatchedProvider.embed({ text: 'dimensions' }), (error) => error instanceof EmbeddingProviderError && error.kind === 'invalid_response', 'dimension mismatch');
    },
  },
  {
    name: 'Embedding 配置缺失返回 unconfigured 且零请求',
    async run() {
      let calls = 0;
      const provider = createEmbeddingProvider(embeddingConfig({ baseUrl: undefined, apiKey: undefined }), {
        fetchFn: async () => {
          calls += 1;
          return embeddingResponse([1]);
        },
      });
      assertEqual(provider.name, 'unconfigured', 'embedding provider status');
      await assertRejects(provider.embed({ text: 'no request' }), (error) => error instanceof EmbeddingProviderError && error.kind === 'unconfigured' && error.retryable === false, 'unconfigured embedding');
      assertEqual(calls, 0, 'unconfigured request count');
      const loaded = loadEmbeddingConfig({ EMBEDDING_PROVIDER: '', EMBEDDING_BASE_URL: '', EMBEDDING_MODEL: '', EMBEDDING_API_KEY: '' });
      assertEqual(loaded.embeddingVersion, 'v1', 'default embedding version');
    },
  },
  {
    name: 'Embedding 401 不重试并分类为 authentication',
    async run() {
      let calls = 0;
      const provider = new OpenAICompatibleEmbeddingProvider(embeddingConfig(), {
        fetchFn: async () => {
          calls += 1;
          return embeddingResponse({ error: 'unauthorized' }, 401);
        },
      });
      await assertRejects(provider.embed({ text: 'auth' }), (error) => error instanceof EmbeddingProviderError && error.kind === 'authentication', 'embedding 401');
      assertEqual(calls, 1, 'embedding 401 calls');
    },
  },
  {
    name: 'Embedding 429/5xx 只做有限重试并在恢复后成功',
    async run() {
      let calls = 0;
      const provider = new OpenAICompatibleEmbeddingProvider(embeddingConfig(), {
        fetchFn: async () => {
          calls += 1;
          return calls < 3 ? embeddingResponse({ error: 'retry' }, calls === 1 ? 429 : 503) : embeddingResponse([0.3, 0.4]);
        },
      });
      const output = await provider.embed({ text: 'retry' });
      assertEqual(output.dimensions, 2, 'embedding retry dimensions');
      assertEqual(calls, 3, 'embedding retry calls');
    },
  },
  {
    name: 'Embedding 超时和网络错误分类且有限重试',
    async run() {
      let timeoutCalls = 0;
      const timeoutProvider = new OpenAICompatibleEmbeddingProvider(embeddingConfig({ maxRetries: 1 }), {
        fetchFn: async () => {
          timeoutCalls += 1;
          const error = new Error('timed out');
          error.name = 'AbortError';
          throw error;
        },
      });
      await assertRejects(timeoutProvider.embed({ text: 'timeout' }), (error) => error instanceof EmbeddingProviderError && error.kind === 'timeout', 'embedding timeout');
      assertEqual(timeoutCalls, 2, 'embedding timeout calls');

      let networkCalls = 0;
      const networkProvider = new OpenAICompatibleEmbeddingProvider(embeddingConfig({ maxRetries: 1 }), {
        fetchFn: async () => {
          networkCalls += 1;
          throw new Error('connection reset');
        },
      });
      await assertRejects(networkProvider.embed({ text: 'network' }), (error) => error instanceof EmbeddingProviderError && error.kind === 'network', 'embedding network');
      assertEqual(networkCalls, 2, 'embedding network calls');
    },
  },
  {
    name: 'Embedding 非法响应分类且不把 NaN 或 Infinity 写入输出',
    async run() {
      const malformedProvider = new OpenAICompatibleEmbeddingProvider(embeddingConfig(), {
        fetchFn: async () => ({ ok: true, status: 200, async json() { return { data: [{ embedding: ['0.1'] }] }; } }),
      });
      await assertRejects(malformedProvider.embed({ text: 'malformed' }), (error) => error instanceof EmbeddingProviderError && error.kind === 'invalid_response', 'malformed embedding');

      const infinityProvider = new OpenAICompatibleEmbeddingProvider(embeddingConfig(), { fetchFn: async () => embeddingResponse([Number.POSITIVE_INFINITY]) });
      await assertRejects(infinityProvider.embed({ text: 'infinity' }), (error) => error instanceof EmbeddingProviderError && error.kind === 'invalid_response', 'infinite embedding');
    },
  },
];

const runtime = globalThis as unknown as { console?: { log(message: string): void } };
for (const testCase of cases) {
  try {
    await testCase.run();
    runtime.console?.log(`✔ ${testCase.name}`);
  } catch (error) {
    runtime.console?.log(`✖ ${testCase.name}`);
    throw error;
  }
}
runtime.console?.log(`ℹ tests ${cases.length}`);
runtime.console?.log(`ℹ pass ${cases.length}`);
runtime.console?.log('ℹ fail 0');
runtime.console?.log('ℹ skip 0');
runtime.console?.log('ℹ todo 0');
