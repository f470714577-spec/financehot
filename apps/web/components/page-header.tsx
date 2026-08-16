import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section className="mb-7 flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div>
        <div className="mb-2 font-data text-xs font-semibold tracking-[0.12em] text-signal-cyan">
          {eyebrow}
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function DemoNotice() {
  return (
    <div className="mb-6 flex flex-col gap-2 rounded-md border border-signal-amber/25 bg-signal-amber/10 px-4 py-3 text-xs leading-5 text-ink sm:flex-row sm:items-center sm:justify-between">
      <span>
        <strong>Seed 数据版本：</strong>当前页面已从 PostgreSQL 读取数据库中明确标记的模拟财经内容，尚未接入实时采集。
      </span>
      <span className="shrink-0 font-data text-[10px] text-ink-muted">阶段 05 · PostgreSQL API</span>
    </div>
  );
}

export function SectionTitle({
  label,
  title,
  action,
}: {
  label?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        {label && (
          <div className="font-data text-[10px] font-semibold tracking-[0.14em] text-ink-muted">
            {label}
          </div>
        )}
        <h2 className="mt-1 font-display text-xl font-semibold text-ink">{title}</h2>
      </div>
      {action}
    </div>
  );
}
