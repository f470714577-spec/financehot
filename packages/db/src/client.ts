import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

/**
 * 创建 PostgreSQL 连接池与 Drizzle 客户端。
 * 阶段 01 仅建立连接基础设施；Schema 在阶段 02 定义后注入。
 */
export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString, max: 10 });
  const db = drizzle(pool);
  return { pool, db };
}

export type Db = ReturnType<typeof createDb>;
