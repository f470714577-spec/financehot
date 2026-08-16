// FinanceHot 设计令牌：以全球市场终端的秩序感承载中文财经阅读。
export const tokens = {
  colors: {
    light: {
      canvas: '#F4F6F8',
      surface: '#FFFFFF',
      surfaceMuted: '#E9EDF2',
      ink: '#111820',
      inkMuted: '#607080',
      line: '#D7DEE6',
    },
    dark: {
      canvas: '#091017',
      surface: '#111A23',
      surfaceMuted: '#172431',
      ink: '#F2F6F8',
      inkMuted: '#93A4B5',
      line: '#253543',
    },
    signal: {
      blue: '#1769E0',
      cyan: '#00A7A7',
      amber: '#D88909',
    },
    market: {
      up: '#D92D20',
      down: '#16875A',
      neutral: '#6B7785',
    },
    severity: {
      high: '#D88909',
      critical: '#A72121',
    },
  },
  typography: {
    display: 'Microsoft YaHei, PingFang SC, sans-serif',
    body: 'Inter, Noto Sans SC, Microsoft YaHei, sans-serif',
    data: 'Bahnschrift, DIN Alternate, IBM Plex Mono, monospace',
    scale: {
      xs: '0.75rem',
      sm: '0.8125rem',
      base: '0.9375rem',
      lg: '1.125rem',
      xl: '1.5rem',
      title: '2rem',
    },
  },
  space: {
    1: '0.25rem',
    2: '0.5rem',
    3: '0.75rem',
    4: '1rem',
    6: '1.5rem',
    8: '2rem',
  },
  radius: {
    sm: '0.375rem',
    md: '0.625rem',
    lg: '0.875rem',
  },
  shadow: {
    raised: '0 10px 30px rgb(15 23 42 / 0.08)',
  },
  layout: {
    sidebar: 240,
    pcMaxWidth: 1600,
    contentWidth: 1180,
  },
} as const;

export type DesignTokens = typeof tokens;
