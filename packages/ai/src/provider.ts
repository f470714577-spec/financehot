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
  readonly options: { status?: number; retryable?: boolean; cause?: unknown };

  constructor(
    kind: ProviderErrorKind,
    message: string,
    options: { status?: number; retryable?: boolean; cause?: unknown } = {},
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

function parseUsage(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const usage = value as { prompt_tokens?: unknown; completion_tokens?: unknown };
  const promptTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : undefined;
  const completionTokens = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : undefined;
  return promptTokens === undefined && completionTokens === undefined ? undefined : { promptTokens, completionTokens };
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
    const response = await this.request({
      model,
      messages,
      temperature: input.temperature ?? 0,
      max_tokens: input.maxTokens ?? 1_200,
    });
    const payload = await this.parseResponse(response);
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new LLMProviderError('invalid_response', 'Provider 响应缺少 choices[0].message.content', { retryable: false });
    }
    return {
      text: content,
      model: typeof payload.model === 'string' ? payload.model : model,
      usage: parseUsage(payload.usage),
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
      throw new LLMProviderError('invalid_json', `Provider 返回的 content 不是纯 JSON: ${errorMessage(error)}`, { cause: error, retryable: false });
    }
    const result = input.schema.safeParse(parsed);
    if (!result.success) {
      throw new LLMProviderError('schema', `Provider JSON 未通过 Schema 校验: ${result.error.message}`, { retryable: false, cause: result.error });
    }
    return { value: result.data, model: output.model, usage: output.usage };
  }

  private async request(body: Record<string, unknown>): Promise<ProviderResponse> {
    const url = `${this.config.baseUrl!.replace(/\/$/, '')}/chat/completions`;
    const runtime = globalThis as unknown as RuntimeGlobals;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
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
        if (response.ok) return response;
        const kind = responseStatusKind(response.status);
        const shouldRetry = (kind === 'rate_limit' || kind === 'server') && attempt < this.config.maxRetries;
        if (shouldRetry) {
          await this.sleep(this.config.retryDelayMs * 2 ** attempt);
          continue;
        }
        throw new LLMProviderError(kind, `Provider HTTP ${response.status}`, {
          status: response.status,
          retryable: kind === 'rate_limit' || kind === 'server',
        });
      } catch (error) {
        if (error instanceof LLMProviderError) throw error;
        const timeoutError = error instanceof Error && (error.name === 'AbortError' || error.message.toLowerCase().includes('timeout'));
        const kind: ProviderErrorKind = timeoutError ? 'timeout' : 'network';
        if (attempt < this.config.maxRetries) {
          await this.sleep(this.config.retryDelayMs * 2 ** attempt);
          continue;
        }
        throw new LLMProviderError(kind, `Provider 请求失败: ${errorMessage(error)}`, { cause: error, retryable: true });
      } finally {
        if (timeout !== undefined) runtime.clearTimeout?.(timeout);
      }
    }
    throw new LLMProviderError('network', 'Provider 请求未完成', { retryable: true });
  }

  private async parseResponse(response: ProviderResponse): Promise<OpenAIResponse> {
    try {
      return (await response.json()) as OpenAIResponse;
    } catch (error) {
      throw new LLMProviderError('invalid_response', `Provider HTTP body 不是 JSON: ${errorMessage(error)}`, { cause: error, retryable: false });
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
