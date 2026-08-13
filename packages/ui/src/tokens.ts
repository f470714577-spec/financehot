// 基础 Design Token（阶段 03 细化完整设计系统）
// 依据架构约定：金融蓝主色、A股涨红跌绿、高影响橙、重大深红
export const tokens = {
  colors: {
    background: '#F7F8FA',
    brand: {
      blue: '#1E5AFA',
    },
    market: {
      up: '#E33E3E',
      down: '#1FA36B',
    },
    severity: {
      high: '#F59E0B',
      critical: '#B91C1C',
    },
  },
  layout: {
    pcMaxWidth: 1440,
    contentWidth: 1000,
  },
} as const;

export type DesignTokens = typeof tokens;
