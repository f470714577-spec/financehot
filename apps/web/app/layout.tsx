import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

const themeScript = `
  try {
    const saved = localStorage.getItem('financehot-theme');
    const dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  } catch {}
`;

export const metadata: Metadata = {
  title: 'FinanceHot｜全球财经情报',
  description: '全球财经情报聚合与 AI 分析平台',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}
