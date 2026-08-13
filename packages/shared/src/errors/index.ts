// 统一错误基类（阶段 01 基础版；阶段 14 完善错误分类与告警）
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code = 'INTERNAL_ERROR',
    public readonly status = 500,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
