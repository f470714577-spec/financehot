// 基础日志（阶段 01 简单版；阶段 14 引入结构化日志与分级）
function log(level: string, msg: string, extra?: unknown) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`;
  if (extra !== undefined) {
    console.log(line, extra);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (msg: string, extra?: unknown) => log('INFO', msg, extra),
  warn: (msg: string, extra?: unknown) => log('WARN', msg, extra),
  error: (msg: string, extra?: unknown) => log('ERROR', msg, extra),
};
