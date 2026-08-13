// 环境变量读取（阶段 01 基础版；阶段 02+ 完善校验）
export interface WorkerEnv {
  REDIS_URL?: string;
  DATABASE_URL?: string;
  NODE_ENV?: string;
}

export function loadEnv(): WorkerEnv {
  return {
    REDIS_URL: process.env.REDIS_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
  };
}
