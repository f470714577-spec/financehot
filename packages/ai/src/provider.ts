import type { ZodType } from 'zod';

export type ProviderErrorKind =
  | 'unconfigured'
  | 'authentication'
  | 'rate_limit'
  | 'server'
  | 'timeout'
  | 'network'
  | 'invalid_response'
  | 'invalid_json'
  | 'schema'
  | 'bad_request';

export class LLMProviderError extends Error {
  readonly name = 'LLMProviderError';
  readonly kind: ProviderErrorKind;
  readonly options: { status?: number; retryable?: boolean; cause?: unknown; attempts?: readonly ProviderAttempt[] };

  constructor(
    kind: ProviderErrorKind,
    message: string,
    options: { status?: number; retryable?: boolean; cause?: unknown; attempts?: readonly ProviderAttempt[] } = {},
  ) {
    super(message);
    this.kind = kind;
    this.options = options;
  }

  get status() {
    return this.options.status;
  }

  get retryable() {
    return this.options.retryable ?? ['rate_limit', 'server', 'timeout', 'network'].includes(this.kind);
  }

  get attempts(): readonly ProviderAttempt[] {
    return this.options.attempts ?? [];
  }
}

export interface GenerateTextInput {
  system?: string;
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateTextOutput {
  text: string;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
  attempts: readonly ProviderAttempt[];
}

export interface GenerateJsonInput<T = unknown> extends GenerateTextInput {
  schema: ZodType<T>;
}

export interface GenerateJsonOutput<T> {
  value: T;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
  attempts: readonly ProviderAttempt[];
}

export type ProviderAttemptOutcome = 'success' | 'http_error' | 'invalid_response' | 'invalid_json' | 'schema' | 'timeout' | 'network';

export interface ProviderAttempt {
  providerAttempt: number;
  outcome: ProviderAttemptOutcome;
  httpStatus?: number;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
  usageReported: boolean;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  generateText(input: GenerateTextInput): Promise<GenerateTextOutput>;
  generateJSON<T>(input: GenerateJsonInput<T>): Promise<T>;
  generateJSONWithUsage<T>(input: GenerateJsonInput<T>): Promise<GenerateJsonOutput<T>>;
}

export interface EmbeddingInput {
  text: string;
  model?: string;
}

export interface EmbeddingOutput {
  vector: number[];
  dimensions: number;
  model: string;
  provider: string;
}

export interface EmbeddingProvider {
  readonly name: string;
  embed(input: EmbeddingInput): Promise<EmbeddingOutput>;
}

export type EmbeddingProviderErrorKind =
  | 'unconfigured'
  | 'authentication'
  | 'rate_limit'
  | 'server'
  | 'timeout'
  | 'network'
  | 'invalid_response'
  | 'bad_request';

export interface EmbeddingAttempt {
  providerAttempt: number;
  outcome: 'success' | 'http_error' | 'invalid_response' | 'timeout' | 'network';
  httpStatus?: number;
  model: string;
}

export class EmbeddingProviderError extends Error {
  readonly name = 'EmbeddingProviderError';
  readonly kind: EmbeddingProviderErrorKind;
  readonly options: { status?: number; retryable?: boolean; cause?: unknown; attempts?: readonly EmbeddingAttempt[] };

  constructor(
    kind: EmbeddingProviderErrorKind,
    message: string,
    options: { status?: number; retryable?: boolean; cause?: unknown; attempts?: readonly EmbeddingAttempt[] } = {},
  ) {
    super(message);
    this.kind = kind;
    this.options = options;
  }

  get status() {
    return this.options.status;
  }

  get retryable() {
    return this.options.retryable ?? ['rate_limit', 'server', 'timeout', 'network'].includes(this.kind);
  }

  get attempts(): readonly EmbeddingAttempt[] {
    return this.options.attempts ?? [];
  }
}

export interface EmbeddingConfig {
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  embeddingVersion: string;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

export interface EmbeddingProviderDependencies {
  fetchFn?: FetchFn;
  sleep?: (delayMs: number) => Promise<void>;
}

export interface LLMConfig {
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  inputCostPer1k?: number;
  outputCostPer1k?: number;
}

export interface LLMProviderDependencies {
  fetchFn?: FetchFn;
  sleep?: (delayMs: number) => Promise<void>;
}

export interface ProviderResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

interface ProviderRequestResult {
  response: ProviderResponse;
  attempts: ProviderAttempt[];
  currentAttempt: ProviderAttempt;
}

export interface ProviderRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: unknown;
}

export type FetchFn = (url: string, init?: ProviderRequestInit) => Promise<ProviderResponse>;

interface RuntimeAbortController {
  readonly signal: unknown;
  abort(): void;
}

interface RuntimeGlobals {
  process?: { env?: Record<string, string | undefined> };
  fetch?: FetchFn;
  AbortController?: new () => RuntimeAbortController;
  setTimeout?: (handler: () => void, delayMs: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function nonNegativeNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function loadLLMConfig(env?: Record<string, string | undefined>): LLMConfig {
  const runtime = globalThis as unknown as RuntimeGlobals;
  const actualEnv = env ?? runtime.process?.env ?? {};
  return {
    provider: actualEnv.LLM_PROVIDER?.trim() || undefined,
    baseUrl: actualEnv.LLM_BASE_URL?.trim() || undefined,
    model: actualEnv.LLM_MODEL?.trim() || undefined,
    apiKey: actualEnv.LLM_API_KEY?.trim() || undefined,
    timeoutMs: positiveInteger(actualEnv.LLM_TIMEOUT_MS, 20_000) || 20_000,
    maxRetries: Math.min(5, positiveInteger(actualEnv.LLM_MAX_RETRIES, 2)),
    retryDelayMs: positiveInteger(actualEnv.LLM_RETRY_DELAY_MS, 250),
    inputCostPer1k: nonNegativeNumber(actualEnv.LLM_INPUT_COST_PER_1K),
    outputCostPer1k: nonNegativeNumber(actualEnv.LLM_OUTPUT_COST_PER_1K),
  };
}

export function isLLMConfigured(config: LLMConfig): boolean {
  return Boolean(config.provider && config.baseUrl && config.model && config.apiKey);
}

export function providerStatus(config: LLMConfig): 'configured' | 'unconfigured' {
  return isLLMConfigured(config) ? 'configured' : 'unconfigured';
}

export function estimateCost(
  usage: { promptTokens?: number; completionTokens?: number } | undefined,
  config: Pick<LLMConfig, 'inputCostPer1k' | 'outputCostPer1k'>,
): number | undefined {
  if (!usage || config.inputCostPer1k === undefined || config.outputCostPer1k === undefined) return undefined;
  if (usage.promptTokens === undefined || usage.completionTokens === undefined) return undefined;
  return (usage.promptTokens / 1_000) * config.inputCostPer1k + (usage.completionTokens / 1_000) * config.outputCostPer1k;
}

function defaultSleep(delayMs: number) {
  const runtime = globalThis as unknown as RuntimeGlobals;
  return new Promise<void>((resolve) => {
    if (runtime.setTimeout) runtime.setTimeout(resolve, delayMs);
    else resolve();
  });
}

function responseStatusKind(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) return 'authentication';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  return 'bad_request';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface OpenAIResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
  model?: unknown;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
}

function parseUsage(value: unknown): { usage?: { promptTokens?: number; completionTokens?: number }; reported: boolean } {
  const reported = Boolean(value && typeof value === 'object');
  if (!reported) return { reported: false };
  const usage = value as { prompt_tokens?: unknown; completion_tokens?: unknown };
  const promptTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : undefined;
  const completionTokens = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : undefined;
  return {
    usage: promptTokens === undefined && completionTokens === undefined ? undefined : { promptTokens, completionTokens },
    reported,
  };
}

function copyAttempts(attempts: readonly ProviderAttempt[]): ProviderAttempt[] {
  return attempts.map((attempt) => ({
    ...attempt,
    usage: attempt.usage ? { ...attempt.usage } : undefined,
  }));
}

function setAttemptUsage(attempt: ProviderAttempt, value: unknown) {
  const parsed = parseUsage(value);
  attempt.usage = parsed.usage;
  attempt.usageReported = parsed.reported;
}

export class UnconfiguredLLMProvider implements LLMProvider {
  readonly name = 'unconfigured';
  readonly model: string;

  constructor(config: LLMConfig) {
    this.model = config.model ?? 'unconfigured';
  }

  async generateText(_input: GenerateTextInput): Promise<GenerateTextOutput> {
    throw new LLMProviderError('unconfigured', 'LLM Provider 未配置：需要 LLM_PROVIDER、LLM_BASE_URL、LLM_MODEL、LLM_API_KEY', { retryable: false });
  }

  async generateJSON<T>(_input: GenerateJsonInput<T>): Promise<T> {
    return this.generateJSONWithUsage(_input).then((result) => result.value);
  }

  async generateJSONWithUsage<T>(_input: GenerateJsonInput<T>): Promise<GenerateJsonOutput<T>> {
    return this.generateText(_input).then(() => undefined as never);
  }
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  readonly model: string;
  private readonly config: LLMConfig;
  private readonly fetchFn: FetchFn;
  private readonly sleep: (delayMs: number) => Promise<void>;

  constructor(config: LLMConfig, dependencies: LLMProviderDependencies = {}) {
    this.config = config;
    if (!isLLMConfigured(config)) {
      throw new LLMProviderError('unconfigured', 'OpenAI-compatible Provider 配置不完整', { retryable: false });
    }
    this.name = config.provider!;
    this.model = config.model!;
    const runtimeFetch = (globalThis as unknown as RuntimeGlobals).fetch;
    if (!dependencies.fetchFn && !runtimeFetch) {
      throw new LLMProviderError('network', '当前运行时缺少 fetch，无法调用 Provider', { retryable: false });
    }
    this.fetchFn = dependencies.fetchFn ?? runtimeFetch!;
    this.sleep = dependencies.sleep ?? defaultSleep;
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    const model = input.model ?? this.model;
    const messages = [
      ...(input.system ? [{ role: 'system', content: input.system }] : []),
      { role: 'user', content: input.prompt },
    ];
    const call = await this.request({
      model,
      messages,
      temperature: input.temperature ?? 0,
      max_tokens: input.maxTokens ?? 1_200,
    });
    let payload: OpenAIResponse;
    try {
      payload = (await call.response.json()) as OpenAIResponse;
    } catch (error) {
      call.currentAttempt.outcome = 'invalid_response';
      throw new LLMProviderError('invalid_response', `Provider HTTP body 不是 JSON: ${errorMessage(error)}`, {
        cause: error,
        retryable: false,
        attempts: copyAttempts(call.attempts),
      });
    }
    if (!payload || typeof payload !== 'object') {
      call.currentAttempt.outcome = 'invalid_response';
      throw new LLMProviderError('invalid_response', 'Provider 响应不是对象', {
        retryable: false,
        attempts: copyAttempts(call.attempts),
      });
    }
    setAttemptUsage(call.currentAttempt, payload?.usage);
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      call.currentAttempt.outcome = 'invalid_response';
      throw new LLMProviderError('invalid_response', 'Provider 响应缺少 choices[0].message.content', {
        retryable: false,
        attempts: copyAttempts(call.attempts),
      });
    }
    return {
      text: content,
      model: typeof payload.model === 'string' ? payload.model : model,
      usage: call.currentAttempt.usage,
      attempts: copyAttempts(call.attempts),
    };
  }

  async generateJSON<T>(input: GenerateJsonInput<T>): Promise<T> {
    return this.generateJSONWithUsage(input).then((result) => result.value);
  }

  async generateJSONWithUsage<T>(input: GenerateJsonInput<T>): Promise<GenerateJsonOutput<T>> {
    const output = await this.generateText(input);
    let parsed: unknown;
    try {
      parsed = JSON.parse(output.text) as unknown;
    } catch (error) {
      const attempts = copyAttempts(output.attempts);
      const current = attempts.at(-1);
      if (current) current.outcome = 'invalid_json';
      throw new LLMProviderError('invalid_json', `Provider 返回的 content 不是纯 JSON: ${errorMessage(error)}`, {
        cause: error,
        retryable: false,
        attempts,
      });
    }
    const result = input.schema.safeParse(parsed);
    if (!result.success) {
      const attempts = copyAttempts(output.attempts);
      const current = attempts.at(-1);
      if (current) current.outcome = 'schema';
      throw new LLMProviderError('schema', `Provider JSON 未通过 Schema 校验: ${result.error.message}`, {
        retryable: false,
        cause: result.error,
        attempts,
      });
    }
    return { value: result.data, model: output.model, usage: output.usage, attempts: output.attempts };
  }

  private async request(body: Record<string, unknown>): Promise<ProviderRequestResult> {
    const url = `${this.config.baseUrl!.replace(/\/$/, '')}/chat/completions`;
    const runtime = globalThis as unknown as RuntimeGlobals;
    const attempts: ProviderAttempt[] = [];
    const model = String(body.model ?? this.model);
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      const currentAttempt: ProviderAttempt = {
        providerAttempt: attempt + 1,
        outcome: 'network',
        model,
        usageReported: false,
      };
      attempts.push(currentAttempt);
      const controller = runtime.AbortController ? new runtime.AbortController() : undefined;
      const timeout = runtime.setTimeout && controller
        ? runtime.setTimeout(() => controller.abort(), this.config.timeoutMs)
        : undefined;
      try {
        const response = await this.fetchFn(url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.config.apiKey!}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller?.signal,
        });
        currentAttempt.httpStatus = response.status;
        if (response.ok) {
          currentAttempt.outcome = 'success';
          return { response, attempts, currentAttempt };
        }
        const kind = responseStatusKind(response.status);
        currentAttempt.outcome = 'http_error';
        await this.captureUsage(response, currentAttempt);
        const shouldRetry = (kind === 'rate_limit' || kind === 'server') && attempt < this.config.maxRetries;
        if (shouldRetry) {
          await this.sleep(this.config.retryDelayMs * 2 ** attempt);
          continue;
        }
        throw new LLMProviderError(kind, `Provider HTTP ${response.status}`, {
          status: response.status,
          retryable: kind === 'rate_limit' || kind === 'server',
          attempts: copyAttempts(attempts),
        });
      } catch (error) {
        if (error instanceof LLMProviderError) throw error;
        const timeoutError = error instanceof Error && (error.name === 'AbortError' || error.message.toLowerCase().includes('timeout'));
        const kind: ProviderErrorKind = timeoutError ? 'timeout' : 'network';
        currentAttempt.outcome = kind;
        if (attempt < this.config.maxRetries) {
          await this.sleep(this.config.retryDelayMs * 2 ** attempt);
          continue;
        }
        throw new LLMProviderError(kind, `Provider 请求失败: ${errorMessage(error)}`, {
          cause: error,
          retryable: true,
          attempts: copyAttempts(attempts),
        });
      } finally {
        if (timeout !== undefined) runtime.clearTimeout?.(timeout);
      }
    }
    throw new LLMProviderError('network', 'Provider 请求未完成', { retryable: true, attempts: copyAttempts(attempts) });
  }

  private async captureUsage(response: ProviderResponse, attempt: ProviderAttempt): Promise<void> {
    try {
      const payload = (await response.json()) as OpenAIResponse;
      setAttemptUsage(attempt, payload?.usage);
    } catch {
      // HTTP 错误正文只用于尽力提取 usage，不把正文写入审计记录。
    }
  }
}

export function createLLMProvider(config: LLMConfig = loadLLMConfig(), dependencies?: LLMProviderDependencies): LLMProvider {
  if (!isLLMConfigured(config)) return new UnconfiguredLLMProvider(config);
  if (config.provider !== 'openai-compatible') {
    throw new LLMProviderError('bad_request', `不支持的 LLM_PROVIDER: ${config.provider}`, { retryable: false });
  }
  return new OpenAICompatibleProvider(config, dependencies);
}

export function loadEmbeddingConfig(env?: Record<string, string | undefined>): EmbeddingConfig {
  const runtime = globalThis as unknown as RuntimeGlobals;
  const actualEnv = env ?? runtime.process?.env ?? {};
  return {
    provider: actualEnv.EMBEDDING_PROVIDER?.trim() || undefined,
    baseUrl: actualEnv.EMBEDDING_BASE_URL?.trim() || undefined,
    model: actualEnv.EMBEDDING_MODEL?.trim() || undefined,
    apiKey: actualEnv.EMBEDDING_API_KEY?.trim() || undefined,
    embeddingVersion: actualEnv.EMBEDDING_VERSION?.trim() || 'v1',
    timeoutMs: positiveInteger(actualEnv.EMBEDDING_TIMEOUT_MS, 20_000) || 20_000,
    maxRetries: Math.min(5, positiveInteger(actualEnv.EMBEDDING_MAX_RETRIES, 2)),
    retryDelayMs: positiveInteger(actualEnv.EMBEDDING_RETRY_DELAY_MS, 250),
  };
}

export function isEmbeddingConfigured(config: EmbeddingConfig): boolean {
  return Boolean(config.provider && config.baseUrl && config.model && config.apiKey);
}

export class UnconfiguredEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'unconfigured';

  async embed(_input: EmbeddingInput): Promise<EmbeddingOutput> {
    throw new EmbeddingProviderError(
      'unconfigured',
      'Embedding Provider 未配置：需要 EMBEDDING_PROVIDER、EMBEDDING_BASE_URL、EMBEDDING_MODEL、EMBEDDING_API_KEY',
      { retryable: false },
    );
  }
}

function embeddingStatusKind(status: number): EmbeddingProviderErrorKind {
  if (status === 401 || status === 403) return 'authentication';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  return 'bad_request';
}

function copyEmbeddingAttempts(attempts: readonly EmbeddingAttempt[]): EmbeddingAttempt[] {
  return attempts.map((attempt) => ({ ...attempt }));
}

interface EmbeddingResponse {
  data?: Array<{ embedding?: unknown }>;
  model?: unknown;
  dimensions?: unknown;
}

export class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly name: string;
  private readonly config: EmbeddingConfig;
  private readonly fetchFn: FetchFn;
  private readonly sleep: (delayMs: number) => Promise<void>;

  constructor(config: EmbeddingConfig, dependencies: EmbeddingProviderDependencies = {}) {
    this.config = config;
    if (!isEmbeddingConfigured(config)) {
      throw new EmbeddingProviderError('unconfigured', 'OpenAI-compatible Embedding Provider 配置不完整', { retryable: false });
    }
    this.name = config.provider!;
    const runtimeFetch = (globalThis as unknown as RuntimeGlobals).fetch;
    if (!dependencies.fetchFn && !runtimeFetch) {
      throw new EmbeddingProviderError('network', '当前运行时缺少 fetch，无法调用 Embedding Provider', { retryable: false });
    }
    this.fetchFn = dependencies.fetchFn ?? runtimeFetch!;
    this.sleep = dependencies.sleep ?? defaultSleep;
  }

  async embed(input: EmbeddingInput): Promise<EmbeddingOutput> {
    if (!input.text.trim()) {
      throw new EmbeddingProviderError('bad_request', 'Embedding 输入文本不能为空', { retryable: false });
    }
    const model = input.model ?? this.config.model!;
    const attempts: EmbeddingAttempt[] = [];
    const runtime = globalThis as unknown as RuntimeGlobals;
    const url = `${this.config.baseUrl!.replace(/\/$/, '')}/embeddings`;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      const currentAttempt: EmbeddingAttempt = {
        providerAttempt: attempt + 1,
        outcome: 'network',
        model,
      };
      attempts.push(currentAttempt);
      const controller = runtime.AbortController ? new runtime.AbortController() : undefined;
      const timeout = runtime.setTimeout && controller
        ? runtime.setTimeout(() => controller.abort(), this.config.timeoutMs)
        : undefined;
      try {
        const response = await this.fetchFn(url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.config.apiKey!}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ input: input.text, model }),
          signal: controller?.signal,
        });
        currentAttempt.httpStatus = response.status;
        if (!response.ok) {
          const kind = embeddingStatusKind(response.status);
          currentAttempt.outcome = 'http_error';
          const shouldRetry = (kind === 'rate_limit' || kind === 'server') && attempt < this.config.maxRetries;
          if (shouldRetry) {
            await this.sleep(this.config.retryDelayMs * 2 ** attempt);
            continue;
          }
          throw new EmbeddingProviderError(kind, `Embedding Provider HTTP ${response.status}`, {
            status: response.status,
            retryable: kind === 'rate_limit' || kind === 'server',
            attempts: copyEmbeddingAttempts(attempts),
          });
        }
        let payload: EmbeddingResponse;
        try {
          payload = (await response.json()) as EmbeddingResponse;
        } catch (error) {
          currentAttempt.outcome = 'invalid_response';
          throw new EmbeddingProviderError('invalid_response', `Embedding Provider HTTP body 不是 JSON: ${errorMessage(error)}`, {
            cause: error,
            retryable: false,
            attempts: copyEmbeddingAttempts(attempts),
          });
        }
        const vector = payload && typeof payload === 'object' && Array.isArray(payload.data) && payload.data.length === 1
          ? payload.data[0]?.embedding
          : undefined;
        const validVector = Array.isArray(vector)
          && vector.length > 0
          && vector.every((value) => typeof value === 'number' && Number.isFinite(value));
        const responseDimensions = payload && typeof payload === 'object' ? payload.dimensions : undefined;
        const vectorLength = Array.isArray(vector) ? vector.length : undefined;
        const validDimensions = responseDimensions === undefined
          || (typeof responseDimensions === 'number' && Number.isInteger(responseDimensions) && responseDimensions === vectorLength);
        if (!validVector || !validDimensions) {
          currentAttempt.outcome = 'invalid_response';
          throw new EmbeddingProviderError('invalid_response', 'Embedding Provider 返回空向量、非有限数或维度不一致', {
            retryable: false,
            attempts: copyEmbeddingAttempts(attempts),
          });
        }
        currentAttempt.outcome = 'success';
        return {
          vector: [...vector] as number[],
          dimensions: vector.length,
          model: typeof payload.model === 'string' && payload.model ? payload.model : model,
          provider: this.name,
        };
      } catch (error) {
        if (error instanceof EmbeddingProviderError) throw error;
        const timeoutError = error instanceof Error && (error.name === 'AbortError' || error.message.toLowerCase().includes('timeout'));
        const kind: EmbeddingProviderErrorKind = timeoutError ? 'timeout' : 'network';
        currentAttempt.outcome = kind;
        if (attempt < this.config.maxRetries) {
          await this.sleep(this.config.retryDelayMs * 2 ** attempt);
          continue;
        }
        throw new EmbeddingProviderError(kind, `Embedding Provider 请求失败: ${errorMessage(error)}`, {
          cause: error,
          retryable: true,
          attempts: copyEmbeddingAttempts(attempts),
        });
      } finally {
        if (timeout !== undefined) runtime.clearTimeout?.(timeout);
      }
    }
    throw new EmbeddingProviderError('network', 'Embedding Provider 请求未完成', { retryable: true, attempts: copyEmbeddingAttempts(attempts) });
  }
}

export function createEmbeddingProvider(
  config: EmbeddingConfig = loadEmbeddingConfig(),
  dependencies?: EmbeddingProviderDependencies,
): EmbeddingProvider {
  if (!isEmbeddingConfigured(config)) return new UnconfiguredEmbeddingProvider();
  if (config.provider !== 'openai-compatible') {
    throw new EmbeddingProviderError('bad_request', `不支持的 EMBEDDING_PROVIDER: ${config.provider}`, { retryable: false });
  }
  return new OpenAICompatibleEmbeddingProvider(config, dependencies);
}
