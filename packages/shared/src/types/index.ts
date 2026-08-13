// 通用基础类型（业务 DTO 后续阶段按需定义，不提前堆砌）
export type ID = string;

export interface Timestamped {
  created_at: Date;
  updated_at: Date;
}
