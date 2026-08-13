import type { ZodType } from 'zod';

// AI Provider 抽象接口骨架。
// 阶段 01 仅定义接口，不实现真实调用；阶段 08 实现具体 Provider 与 Structured Output。

export interface GenerateTextInput {
  system?: string;
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateTextOutput {
  text: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
}

export interface GenerateJsonInput<T = unknown> extends GenerateTextInput {
  schema: ZodType<T>;
}

export interface LLMProvider {
  readonly name: string;
  generateText(input: GenerateTextInput): Promise<GenerateTextOutput>;
  generateJSON<T>(input: GenerateJsonInput<T>): Promise<T>;
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
