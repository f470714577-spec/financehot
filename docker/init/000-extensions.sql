-- 阶段 01：数据库扩展初始化
-- pgvector 镜像自带 vector；此处显式声明，保证扩展一定存在
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
