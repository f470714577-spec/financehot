import type {
  EventStatus,
  SourceLevel,
  SourceType,
} from '../schema/common';

/**
 * Seed Demo 数据（全部为模拟内容，非真实新闻）。
 * 标题统一加 `[Demo] ` 前缀、来源名加 `（Demo）`，明确不伪装成实时真实数据。
 */

export interface DemoSource {
  name: string;
  type: SourceType;
  country: string;
  language: string;
  homepage: string;
  rssUrl: string | null;
  sourceLevel: SourceLevel;
  credibilityScore: number;
  crawlInterval: number;
}

export const demoSources: DemoSource[] = [
  { name: '彭博社（Demo）', type: 'api', country: 'US', language: 'en', homepage: 'https://demo.bloomberg.example', rssUrl: null, sourceLevel: 'A', credibilityScore: 95, crawlInterval: 15 },
  { name: '路透社（Demo）', type: 'api', country: 'GB', language: 'en', homepage: 'https://demo.reuters.example', rssUrl: null, sourceLevel: 'A', credibilityScore: 96, crawlInterval: 15 },
  { name: '华尔街日报（Demo）', type: 'api', country: 'US', language: 'en', homepage: 'https://demo.wsj.example', rssUrl: null, sourceLevel: 'A', credibilityScore: 94, crawlInterval: 20 },
  { name: '金融时报（Demo）', type: 'rss', country: 'GB', language: 'en', homepage: 'https://demo.ft.example', rssUrl: 'https://demo.ft.example/rss', sourceLevel: 'B', credibilityScore: 88, crawlInterval: 20 },
  { name: '财联社（Demo）', type: 'rss', country: 'CN', language: 'zh', homepage: 'https://demo.cls.example', rssUrl: 'https://demo.cls.example/rss', sourceLevel: 'B', credibilityScore: 84, crawlInterval: 10 },
  { name: '新浪财经（Demo）', type: 'rss', country: 'CN', language: 'zh', homepage: 'https://demo.sina.example', rssUrl: 'https://demo.sina.example/finance/rss', sourceLevel: 'B', credibilityScore: 80, crawlInterval: 15 },
  { name: '东方财富（Demo）', type: 'rss', country: 'CN', language: 'zh', homepage: 'https://demo.eastmoney.example', rssUrl: 'https://demo.eastmoney.example/rss', sourceLevel: 'B', credibilityScore: 78, crawlInterval: 15 },
  { name: '第一财经（Demo）', type: 'rss', country: 'CN', language: 'zh', homepage: 'https://demo.yicai.example', rssUrl: 'https://demo.yicai.example/rss', sourceLevel: 'B', credibilityScore: 82, crawlInterval: 20 },
  { name: '日经新闻（Demo）', type: 'api', country: 'JP', language: 'ja', homepage: 'https://demo.nikkei.example', rssUrl: null, sourceLevel: 'B', credibilityScore: 86, crawlInterval: 30 },
  { name: 'CNBC（Demo）', type: 'rss', country: 'US', language: 'en', homepage: 'https://demo.cnbc.example', rssUrl: 'https://demo.cnbc.example/rss', sourceLevel: 'C', credibilityScore: 75, crawlInterval: 20 },
  { name: 'MarketWatch（Demo）', type: 'rss', country: 'US', language: 'en', homepage: 'https://demo.marketwatch.example', rssUrl: 'https://demo.marketwatch.example/rss', sourceLevel: 'C', credibilityScore: 74, crawlInterval: 30 },
  { name: '英为财情（Demo）', type: 'api', country: 'GB', language: 'zh', homepage: 'https://demo.investing.example', rssUrl: null, sourceLevel: 'C', credibilityScore: 72, crawlInterval: 15 },
  { name: '雅虎财经（Demo）', type: 'web', country: 'US', language: 'en', homepage: 'https://demo.yahoo.example/finance', rssUrl: null, sourceLevel: 'D', credibilityScore: 65, crawlInterval: 60 },
  { name: '雪球（Demo）', type: 'web', country: 'CN', language: 'zh', homepage: 'https://demo.xueqiu.example', rssUrl: null, sourceLevel: 'D', credibilityScore: 62, crawlInterval: 60 },
  { name: '综合财经资讯（Demo）', type: 'web', country: 'CN', language: 'zh', homepage: 'https://demo.aggregator.example', rssUrl: null, sourceLevel: 'E', credibilityScore: 50, crawlInterval: 60 },
];

export interface DemoCategory {
  name: string;
  slug: string;
  parentSlug?: string;
  sortOrder: number;
}

export const demoCategories: DemoCategory[] = [
  { name: '宏观经济', slug: 'macro', sortOrder: 1 },
  { name: '货币政策', slug: 'monetary-policy', sortOrder: 2 },
  { name: '金融市场', slug: 'markets', sortOrder: 3 },
  { name: '公司新闻', slug: 'corporate', sortOrder: 4 },
  { name: '科技', slug: 'tech', sortOrder: 5 },
  { name: '能源', slug: 'energy', sortOrder: 6 },
  { name: '大宗商品', slug: 'commodities', sortOrder: 7 },
  { name: '国际贸易', slug: 'trade', sortOrder: 8 },
];

export interface DemoTag {
  name: string;
  kind: '分类标签' | '事件标签';
}

export const demoTags: DemoTag[] = [
  { name: '美联储', kind: '事件标签' },
  { name: '央行', kind: '事件标签' },
  { name: '降息', kind: '分类标签' },
  { name: 'AI', kind: '分类标签' },
  { name: '芯片', kind: '分类标签' },
  { name: '英伟达', kind: '事件标签' },
  { name: '特斯拉', kind: '事件标签' },
  { name: '油价', kind: '分类标签' },
  { name: '黄金', kind: '分类标签' },
  { name: '港股', kind: '分类标签' },
  { name: '贸易', kind: '分类标签' },
  { name: '关税', kind: '分类标签' },
  { name: '电动车', kind: '分类标签' },
  { name: '苹果', kind: '事件标签' },
  { name: '供应链', kind: '分类标签' },
];

export interface DemoCountry {
  nameZh: string;
  nameEn: string;
  code: string;
}

export const demoCountries: DemoCountry[] = [
  { nameZh: '中国', nameEn: 'China', code: 'CN' },
  { nameZh: '美国', nameEn: 'United States', code: 'US' },
  { nameZh: '英国', nameEn: 'United Kingdom', code: 'GB' },
  { nameZh: '日本', nameEn: 'Japan', code: 'JP' },
  { nameZh: '德国', nameEn: 'Germany', code: 'DE' },
  { nameZh: '法国', nameEn: 'France', code: 'FR' },
  { nameZh: '沙特阿拉伯', nameEn: 'Saudi Arabia', code: 'SA' },
  { nameZh: '印度', nameEn: 'India', code: 'IN' },
  { nameZh: '中国香港', nameEn: 'Hong Kong', code: 'HK' },
];

export interface DemoTopic {
  name: string;
  slug: string;
  description: string;
  heatScore: number;
}

export const demoTopics: DemoTopic[] = [
  { name: '美联储政策', slug: 'fed-policy', description: '美联储利率决议与货币政策动向', heatScore: 88 },
  { name: 'AI 芯片', slug: 'ai-chip', description: '人工智能芯片与算力产业链', heatScore: 82 },
  { name: '能源市场', slug: 'energy-market', description: '原油、天然气与能源价格', heatScore: 71 },
  { name: '全球贸易', slug: 'global-trade', description: '主要经济体之间的贸易与关税动态', heatScore: 69 },
  { name: '大宗商品', slug: 'commodities', description: '黄金、工业金属与农产品价格', heatScore: 64 },
  { name: '中国资本市场', slug: 'china-capital', description: 'A股、港股与中国宏观经济', heatScore: 60 },
  { name: '全球央行', slug: 'global-central-banks', description: '主要经济体央行货币政策动向', heatScore: 74 },
  { name: '科技企业', slug: 'tech-corporates', description: '科技巨头产品、财报与供应链动态', heatScore: 76 },
];

export interface DemoArticleSeed {
  sourceIndex: number;
  categorySlug: string;
  tagNames: string[];
  countryCodes: string[];
  titleZh: string;
  summaryZh: string;
  financeScore: number;
  marketImpactScore: number;
  hoursAgo: number;
  featured?: boolean;
}

export interface DemoEventSeed {
  title: string;
  summary: string;
  status: EventStatus;
  topicSlugs: string[];
  articles: DemoArticleSeed[];
  primaryArticleIndex: number;
  firstSeenHoursAgo: number;
}

export const demoEvents: DemoEventSeed[] = [
  {
    title: '美联储宣布降息25个基点，为年内首次',
    summary: '美联储在最新一次议息会议上宣布将联邦基金利率下调25个基点，符合市场预期，并暗示年内仍有进一步宽松空间。',
    status: 'confirmed',
    topicSlugs: ['fed-policy'],
    primaryArticleIndex: 0,
    firstSeenHoursAgo: 6,
    articles: [
      { sourceIndex: 0, categorySlug: 'monetary-policy', tagNames: ['美联储', '降息'], countryCodes: ['US'], titleZh: '美联储宣布降息25个基点，鲍威尔称通胀已明显回落', summaryZh: '美联储将联邦基金利率目标区间下调25个基点至4.25%-4.50%，主席鲍威尔表示通胀正在向2%目标靠拢。', financeScore: 95, marketImpactScore: 80, hoursAgo: 6, featured: true },
      { sourceIndex: 1, categorySlug: 'monetary-policy', tagNames: ['美联储', '降息'], countryCodes: ['US'], titleZh: '美联储如期降息25个基点，为年内首次宽松', summaryZh: '联邦公开市场委员会以多数票通过降息决议，声明措辞显示对经济前景更加谨慎。', financeScore: 94, marketImpactScore: 78, hoursAgo: 6 },
      { sourceIndex: 2, categorySlug: 'monetary-policy', tagNames: ['美联储', '降息'], countryCodes: ['US'], titleZh: '美联储开启降息周期，市场解读为鸽派信号', summaryZh: '华尔街日报分析认为，本次降息标志着货币政策正式转向，美股三大股指应声走高。', financeScore: 92, marketImpactScore: 76, hoursAgo: 6 },
      { sourceIndex: 9, categorySlug: 'monetary-policy', tagNames: ['美联储', '降息'], countryCodes: ['US'], titleZh: '美联储降息25基点，交易员加大年内二次降息押注', summaryZh: '利率决议公布后，联邦基金期货显示市场对年内再次降息的预期显著升温。', financeScore: 85, marketImpactScore: 72, hoursAgo: 6 },
      { sourceIndex: 10, categorySlug: 'markets', tagNames: ['美联储', '降息'], countryCodes: ['US'], titleZh: '降息落地，美股三大指数收涨，纳指涨1.2%', summaryZh: '受降息提振，风险偏好回暖，科技股领涨，标普500指数再创近期新高。', financeScore: 82, marketImpactScore: 74, hoursAgo: 6 },
      { sourceIndex: 4, categorySlug: 'monetary-policy', tagNames: ['美联储', '降息'], countryCodes: ['US'], titleZh: '美联储降息25个基点，人民币汇率短线走强', summaryZh: '美联储降息落地后，美元指数回落，离岸人民币兑美元一度升值逾200点。', financeScore: 84, marketImpactScore: 68, hoursAgo: 5 },
      { sourceIndex: 5, categorySlug: 'monetary-policy', tagNames: ['美联储', '降息'], countryCodes: ['US', 'CN'], titleZh: '美联储如期降息，A股迎来外部流动性改善窗口', summaryZh: '分析人士指出，美联储开启宽松周期有望缓解人民币贬值压力，为国内政策留出空间。', financeScore: 80, marketImpactScore: 66, hoursAgo: 5 },
    ],
  },
  {
    title: '中国央行宣布下调存款准备金率0.5个百分点',
    summary: '中国人民银行宣布下调金融机构存款准备金率0.5个百分点，释放长期流动性约1万亿元，以支持实体经济。',
    status: 'confirmed',
    topicSlugs: ['china-capital'],
    primaryArticleIndex: 0,
    firstSeenHoursAgo: 12,
    articles: [
      { sourceIndex: 4, categorySlug: 'monetary-policy', tagNames: ['央行', '降息'], countryCodes: ['CN'], titleZh: '央行宣布降准0.5个百分点，释放长期资金约1万亿元', summaryZh: '中国人民银行决定下调金融机构存款准备金率0.5个百分点，加大逆周期调节力度。', financeScore: 93, marketImpactScore: 79, hoursAgo: 12, featured: true },
      { sourceIndex: 5, categorySlug: 'monetary-policy', tagNames: ['央行'], countryCodes: ['CN'], titleZh: '央行全面降准0.5个百分点，支持实体经济发展', summaryZh: '此次降准旨在保持流动性合理充裕，降低社会综合融资成本。', financeScore: 90, marketImpactScore: 75, hoursAgo: 12 },
      { sourceIndex: 6, categorySlug: 'markets', tagNames: ['央行'], countryCodes: ['CN'], titleZh: '降准落地，A股三大指数集体高开', summaryZh: '受降准消息提振，沪深两市早盘高开，银行、地产板块领涨。', financeScore: 84, marketImpactScore: 70, hoursAgo: 12 },
      { sourceIndex: 7, categorySlug: 'monetary-policy', tagNames: ['央行'], countryCodes: ['CN'], titleZh: '央行降准0.5个百分点，专家称货币政策仍有空间', summaryZh: '多位经济学家认为，降准释放稳增长信号，后续LPR有望进一步下调。', financeScore: 82, marketImpactScore: 68, hoursAgo: 11 },
      { sourceIndex: 0, categorySlug: 'monetary-policy', tagNames: ['央行'], countryCodes: ['CN'], titleZh: '中国央行降准50基点，释放万亿级流动性', summaryZh: '彭博社报道，中国央行此次降准幅度超出部分机构预期，人民币汇率基本稳定。', financeScore: 88, marketImpactScore: 73, hoursAgo: 11 },
      { sourceIndex: 13, categorySlug: 'markets', tagNames: ['央行', '港股'], countryCodes: ['CN', 'HK'], titleZh: '降准利好港股，恒指午后涨幅扩大', summaryZh: '港股市场对降准反应积极，恒生指数午后涨幅一度超过2%。', financeScore: 78, marketImpactScore: 62, hoursAgo: 10 },
    ],
  },
  {
    title: '英伟达第二财季营收超预期，数据中心收入创新高',
    summary: '英伟达公布第二财季财报，营收与净利润均超出市场预期，数据中心业务收入同比大幅增长。',
    status: 'confirmed',
    topicSlugs: ['ai-chip'],
    primaryArticleIndex: 0,
    firstSeenHoursAgo: 10,
    articles: [
      { sourceIndex: 0, categorySlug: 'corporate', tagNames: ['AI', '芯片', '英伟达'], countryCodes: ['US'], titleZh: '英伟达Q2营收超预期，数据中心收入同比增长超过100%', summaryZh: '英伟达第二财季营收和每股收益均超分析师预期，AI芯片需求持续强劲。', financeScore: 92, marketImpactScore: 77, hoursAgo: 10, featured: true },
      { sourceIndex: 1, categorySlug: 'corporate', tagNames: ['AI', '英伟达'], countryCodes: ['US'], titleZh: '英伟达财报超预期，盘后股价大涨8%', summaryZh: '财报公布后，英伟达股价盘后交易中大幅上涨，市值逼近历史高点。', financeScore: 90, marketImpactScore: 75, hoursAgo: 10 },
      { sourceIndex: 9, categorySlug: 'tech', tagNames: ['AI', '芯片'], countryCodes: ['US'], titleZh: '英伟达数据中心收入再创新高，AI算力需求不减', summaryZh: '英伟达CEO黄仁勋表示，生成式AI的算力需求仍在加速增长。', financeScore: 86, marketImpactScore: 72, hoursAgo: 10 },
      { sourceIndex: 4, categorySlug: 'tech', tagNames: ['AI', '芯片', '英伟达'], countryCodes: ['US', 'CN'], titleZh: '英伟达业绩超预期，A股AI概念股集体走强', summaryZh: '受英伟达财报提振，A股算力、光模块等AI产业链个股早盘大涨。', financeScore: 83, marketImpactScore: 69, hoursAgo: 9 },
      { sourceIndex: 11, categorySlug: 'tech', tagNames: ['AI', '芯片'], countryCodes: ['US'], titleZh: '英伟达第二财季净利润同比翻番', summaryZh: '英为财情数据显示，英伟达第二财季净利润同比大幅增长，毛利率维持高位。', financeScore: 81, marketImpactScore: 67, hoursAgo: 9 },
      { sourceIndex: 13, categorySlug: 'tech', tagNames: ['AI', '英伟达'], countryCodes: ['US'], titleZh: '英伟达财报解读：AI芯片仍是绝对主线', summaryZh: '雪球用户热议英伟达财报，普遍认为AI算力产业链景气度延续。', financeScore: 70, marketImpactScore: 55, hoursAgo: 8 },
    ],
  },
  {
    title: '国际油价单日大涨逾4%，地缘局势再度紧张',
    summary: '受中东地缘局势紧张及供应担忧影响，国际油价单日大涨逾4%，布伦特原油突破每桶90美元。',
    status: 'developing',
    topicSlugs: ['energy-market', 'commodities'],
    primaryArticleIndex: 0,
    firstSeenHoursAgo: 8,
    articles: [
      { sourceIndex: 1, categorySlug: 'energy', tagNames: ['油价'], countryCodes: ['SA'], titleZh: '国际油价大涨逾4%，布伦特原油重返90美元上方', summaryZh: '中东地缘局势升级引发供应担忧，国际油价大幅走高。', financeScore: 89, marketImpactScore: 74, hoursAgo: 8, featured: true },
      { sourceIndex: 0, categorySlug: 'energy', tagNames: ['油价'], countryCodes: ['SA', 'US'], titleZh: '布伦特原油突破90美元，市场担忧供应中断', summaryZh: '彭博社援引交易员称，地缘风险溢价快速上升推高油价。', financeScore: 87, marketImpactScore: 72, hoursAgo: 8 },
      { sourceIndex: 10, categorySlug: 'commodities', tagNames: ['油价'], countryCodes: ['US'], titleZh: '油价飙升，能源股领涨美股', summaryZh: '原油期货大涨带动能源板块走高，标普能源指数涨幅居前。', financeScore: 79, marketImpactScore: 66, hoursAgo: 7 },
      { sourceIndex: 5, categorySlug: 'energy', tagNames: ['油价'], countryCodes: ['CN'], titleZh: '国际油价大涨，国内成品油或迎上调', summaryZh: '分析人士预计，若油价维持高位，国内成品油价格可能迎来新一轮上调。', financeScore: 75, marketImpactScore: 60, hoursAgo: 7 },
      { sourceIndex: 11, categorySlug: 'energy', tagNames: ['油价'], countryCodes: ['SA'], titleZh: '地缘风险推高油价，OPEC+产量政策受关注', summaryZh: '市场关注OPEC+下一步产量政策，供应端不确定性升温。', financeScore: 76, marketImpactScore: 62, hoursAgo: 6 },
    ],
  },
  {
    title: '日本央行意外加息，日元汇率大幅波动',
    summary: '日本央行意外宣布加息10个基点，日元兑美元汇率短线剧烈波动，日经指数承压下跌。',
    status: 'confirmed',
    topicSlugs: ['global-central-banks'],
    primaryArticleIndex: 0,
    firstSeenHoursAgo: 16,
    articles: [
      { sourceIndex: 8, categorySlug: 'monetary-policy', tagNames: ['央行'], countryCodes: ['JP'], titleZh: '日本央行意外加息10个基点，结束超宽松立场', summaryZh: '日本央行将政策利率上调至0.5%，为近年来罕见，日元应声走强。', financeScore: 88, marketImpactScore: 71, hoursAgo: 16 },
      { sourceIndex: 1, categorySlug: 'monetary-policy', tagNames: ['央行'], countryCodes: ['JP'], titleZh: '日本央行加息，日元兑美元升值逾1%', summaryZh: '路透社报道，日本央行加息决定超出市场预期，日元短线大涨。', financeScore: 85, marketImpactScore: 69, hoursAgo: 16 },
      { sourceIndex: 5, categorySlug: 'markets', tagNames: ['央行'], countryCodes: ['JP', 'CN'], titleZh: '日本央行加息，日经指数大跌，A股影响有限', summaryZh: '日本股市因加息承压下跌，分析师认为对A股影响总体有限。', financeScore: 77, marketImpactScore: 58, hoursAgo: 15 },
      { sourceIndex: 9, categorySlug: 'markets', tagNames: ['央行'], countryCodes: ['JP'], titleZh: '日银加息引发套息交易平仓担忧', summaryZh: '市场担忧日元走强引发套息交易逆转，全球风险资产波动加大。', financeScore: 74, marketImpactScore: 61, hoursAgo: 15 },
    ],
  },
  {
    title: '欧洲央行维持利率不变，释放谨慎信号',
    summary: '欧洲央行宣布维持三大关键利率不变，行长拉加德表示将根据数据决定后续路径，通胀仍具粘性。',
    status: 'confirmed',
    topicSlugs: ['global-central-banks'],
    primaryArticleIndex: 0,
    firstSeenHoursAgo: 20,
    articles: [
      { sourceIndex: 3, categorySlug: 'monetary-policy', tagNames: ['央行'], countryCodes: ['DE', 'FR'], titleZh: '欧洲央行维持利率不变，拉加德称通胀仍具粘性', summaryZh: '欧洲央行连续第二次会议按兵不动，强调将依赖数据决策。', financeScore: 82, marketImpactScore: 64, hoursAgo: 20 },
      { sourceIndex: 1, categorySlug: 'monetary-policy', tagNames: ['央行'], countryCodes: ['DE'], titleZh: '欧央行按兵不动，欧元兑美元窄幅震荡', summaryZh: '利率决议公布后，欧元汇率波动有限，市场等待更多指引。', financeScore: 78, marketImpactScore: 59, hoursAgo: 20 },
      { sourceIndex: 11, categorySlug: 'monetary-policy', tagNames: ['央行'], countryCodes: ['FR'], titleZh: '欧央行维持利率，欧洲股市小幅收涨', summaryZh: '欧洲主要股指在利率决议后小幅走高，市场情绪相对平稳。', financeScore: 72, marketImpactScore: 54, hoursAgo: 19 },
      { sourceIndex: 5, categorySlug: 'monetary-policy', tagNames: ['央行'], countryCodes: ['DE', 'CN'], titleZh: '欧央行按兵不动，对人民币汇率影响有限', summaryZh: '分析指出，欧央行政策对人民币汇率的直接传导较为有限。', financeScore: 68, marketImpactScore: 50, hoursAgo: 19 },
    ],
  },
  {
    title: '特斯拉发布新一代经济型车型，订单量超预期',
    summary: '特斯拉正式发布新一代经济型电动车，售价下探至历史低位，24小时内订单量远超市场预期。',
    status: 'confirmed',
    topicSlugs: ['tech-corporates'],
    primaryArticleIndex: 0,
    firstSeenHoursAgo: 24,
    articles: [
      { sourceIndex: 0, categorySlug: 'corporate', tagNames: ['特斯拉', '电动车'], countryCodes: ['US'], titleZh: '特斯拉发布新一代经济型车型，起售价创新低', summaryZh: '特斯拉新一代经济型电动车正式亮相，定价低于市场预期，订单火爆。', financeScore: 86, marketImpactScore: 70, hoursAgo: 24 },
      { sourceIndex: 9, categorySlug: 'corporate', tagNames: ['特斯拉', '电动车'], countryCodes: ['US'], titleZh: '特斯拉新车订单超预期，股价大涨', summaryZh: '新车发布后特斯拉股价大幅上涨，市场对其销量前景转乐观。', financeScore: 83, marketImpactScore: 68, hoursAgo: 24 },
      { sourceIndex: 4, categorySlug: 'corporate', tagNames: ['特斯拉', '电动车'], countryCodes: ['US', 'CN'], titleZh: '特斯拉低价车型冲击市场，国内新能源车企承压', summaryZh: '特斯拉经济型车型定价下探，或对国内新能源车企形成竞争压力。', financeScore: 80, marketImpactScore: 66, hoursAgo: 23 },
      { sourceIndex: 13, categorySlug: 'corporate', tagNames: ['特斯拉', '电动车'], countryCodes: ['US'], titleZh: '特斯拉新车定价引热议，产业链个股活跃', summaryZh: '市场关注特斯拉新车对供应链的拉动，相关概念股表现活跃。', financeScore: 71, marketImpactScore: 56, hoursAgo: 22 },
    ],
  },
  {
    title: '中美经贸高级别磋商举行，双方同意保持沟通',
    summary: '中美经贸高级别磋商在华盛顿举行，双方就关税、市场准入等问题交换意见，同意继续保持沟通。',
    status: 'developing',
    topicSlugs: ['global-trade'],
    primaryArticleIndex: 0,
    firstSeenHoursAgo: 30,
    articles: [
      { sourceIndex: 1, categorySlug: 'trade', tagNames: ['贸易', '关税'], countryCodes: ['US', 'CN'], titleZh: '中美经贸高级别磋商举行，双方同意保持沟通', summaryZh: '中美经贸团队在华盛顿举行磋商，就经贸问题坦诚交换意见。', financeScore: 90, marketImpactScore: 73, hoursAgo: 30 },
      { sourceIndex: 4, categorySlug: 'trade', tagNames: ['贸易', '关税'], countryCodes: ['CN', 'US'], titleZh: '中美经贸磋商释放积极信号，市场风险偏好回升', summaryZh: '磋商释放缓和信号，人民币汇率与A股同步走强。', financeScore: 84, marketImpactScore: 67, hoursAgo: 29 },
      { sourceIndex: 2, categorySlug: 'trade', tagNames: ['贸易'], countryCodes: ['US', 'CN'], titleZh: '中美经贸磋商举行，关税议题仍是焦点', summaryZh: '华尔街日报报道，双方就关税与市场准入议题进行了深入讨论。', financeScore: 82, marketImpactScore: 65, hoursAgo: 29 },
      { sourceIndex: 5, categorySlug: 'trade', tagNames: ['贸易', '关税'], countryCodes: ['CN', 'US'], titleZh: '中美经贸磋商举行，机构看好阶段性缓和', summaryZh: '多家机构认为，双方保持沟通有助于降低贸易摩擦升级风险。', financeScore: 76, marketImpactScore: 58, hoursAgo: 28 },
    ],
  },
  {
    title: '国际金价创历史新高，避险情绪升温',
    summary: '受全球央行购金与地缘不确定性推动，国际现货黄金价格创下历史新高，突破每盎司3000美元。',
    status: 'confirmed',
    topicSlugs: ['commodities'],
    primaryArticleIndex: 0,
    firstSeenHoursAgo: 40,
    articles: [
      { sourceIndex: 1, categorySlug: 'commodities', tagNames: ['黄金'], countryCodes: ['US'], titleZh: '国际金价创历史新高，现货黄金突破3000美元', summaryZh: '全球央行持续购金叠加避险需求，推动金价刷新历史纪录。', financeScore: 87, marketImpactScore: 69, hoursAgo: 40 },
      { sourceIndex: 10, categorySlug: 'commodities', tagNames: ['黄金'], countryCodes: ['US'], titleZh: '金价创新高，黄金股集体大涨', summaryZh: '金价上涨带动黄金板块走高，相关矿业股涨幅居前。', financeScore: 78, marketImpactScore: 62, hoursAgo: 39 },
      { sourceIndex: 6, categorySlug: 'commodities', tagNames: ['黄金'], countryCodes: ['CN'], titleZh: '金价再创新高，国内金饰价格水涨船高', summaryZh: '国际金价上涨传导至国内，品牌金饰价格再度上调。', financeScore: 74, marketImpactScore: 56, hoursAgo: 38 },
      { sourceIndex: 11, categorySlug: 'commodities', tagNames: ['黄金'], countryCodes: ['US', 'CN'], titleZh: '央行购金需求旺盛，金价上行趋势未改', summaryZh: '分析人士指出，各国央行增持黄金为金价提供中长期支撑。', financeScore: 75, marketImpactScore: 57, hoursAgo: 38 },
    ],
  },
  {
    title: '苹果调整全球供应链布局，加大东南亚产能',
    summary: '苹果公司正加速调整全球供应链布局，将部分产能转移至东南亚，以分散风险并优化成本。',
    status: 'developing',
    topicSlugs: ['tech-corporates'],
    primaryArticleIndex: 0,
    firstSeenHoursAgo: 48,
    articles: [
      { sourceIndex: 0, categorySlug: 'corporate', tagNames: ['苹果', '供应链'], countryCodes: ['US', 'IN'], titleZh: '苹果加速供应链调整，加大东南亚产能布局', summaryZh: '彭博社报道，苹果正将部分产能转移至印度和东南亚以分散风险。', financeScore: 80, marketImpactScore: 64, hoursAgo: 48 },
      { sourceIndex: 4, categorySlug: 'corporate', tagNames: ['苹果', '供应链'], countryCodes: ['US', 'CN'], titleZh: '苹果供应链调整，国内果链公司影响几何', summaryZh: '苹果产能转移引发关注，分析认为国内供应链短期影响有限。', financeScore: 77, marketImpactScore: 60, hoursAgo: 47 },
      { sourceIndex: 9, categorySlug: 'corporate', tagNames: ['苹果', '供应链'], countryCodes: ['US', 'IN'], titleZh: '苹果加大印度产能，产业链重构进行时', summaryZh: '苹果持续加码印度制造，带动当地电子产业链发展。', financeScore: 73, marketImpactScore: 58, hoursAgo: 46 },
      { sourceIndex: 13, categorySlug: 'corporate', tagNames: ['苹果', '供应链'], countryCodes: ['CN', 'US'], titleZh: '苹果供应链迁移，果链概念股分化明显', summaryZh: '市场对苹果供应链迁移反应分化，相关概念股涨跌互现。', financeScore: 66, marketImpactScore: 50, hoursAgo: 45 },
    ],
  },
  {
    title: '港股恒指大幅反弹，收复关键点位',
    summary: '港股市场大幅反弹，恒生指数涨逾2%收复关键点位，科技股与金融股领涨。',
    status: 'confirmed',
    topicSlugs: ['china-capital'],
    primaryArticleIndex: 0,
    firstSeenHoursAgo: 56,
    articles: [
      { sourceIndex: 5, categorySlug: 'markets', tagNames: ['港股'], countryCodes: ['HK', 'CN'], titleZh: '港股恒指涨逾2%，收复关键点位', summaryZh: '港股市场情绪回暖，恒生指数大幅反弹，科技股领涨。', financeScore: 79, marketImpactScore: 63, hoursAgo: 56 },
      { sourceIndex: 4, categorySlug: 'markets', tagNames: ['港股'], countryCodes: ['HK'], titleZh: '南向资金大幅净流入，恒指放量上涨', summaryZh: '南向资金持续流入港股，恒指成交额显著放大。', financeScore: 76, marketImpactScore: 60, hoursAgo: 55 },
      { sourceIndex: 13, categorySlug: 'markets', tagNames: ['港股'], countryCodes: ['HK', 'CN'], titleZh: '港股反弹，科技板块领涨大盘', summaryZh: '港股科技板块表现强势，带动恒生科技指数走高。', financeScore: 70, marketImpactScore: 54, hoursAgo: 54 },
      { sourceIndex: 11, categorySlug: 'markets', tagNames: ['港股'], countryCodes: ['HK'], titleZh: '恒指反弹逾2%，市场情绪明显改善', summaryZh: '在外部流动性预期改善下，港股市场风险偏好回升。', financeScore: 68, marketImpactScore: 52, hoursAgo: 53 },
    ],
  },
  {
    title: '欧盟拟对中国电动车加征关税，中方表示坚决反对',
    summary: '欧盟委员会拟对中国出口的电动车加征关税，中方表示坚决反对，并称将采取必要措施维护合法权益。',
    status: 'developing',
    topicSlugs: ['global-trade'],
    primaryArticleIndex: 0,
    firstSeenHoursAgo: 64,
    articles: [
      { sourceIndex: 1, categorySlug: 'trade', tagNames: ['贸易', '关税', '电动车'], countryCodes: ['CN', 'DE', 'FR'], titleZh: '欧盟拟对中国电动车加征关税，中方坚决反对', summaryZh: '欧盟委员会公布拟加征关税方案，中方表示将采取必要措施维护权益。', financeScore: 88, marketImpactScore: 70, hoursAgo: 64 },
      { sourceIndex: 4, categorySlug: 'trade', tagNames: ['关税', '电动车'], countryCodes: ['CN', 'DE'], titleZh: '欧盟对华电动车关税落地前，中方密集沟通', summaryZh: '中方与欧盟就电动车关税问题密集沟通，寻求通过对话解决分歧。', financeScore: 82, marketImpactScore: 65, hoursAgo: 63 },
      { sourceIndex: 3, categorySlug: 'trade', tagNames: ['贸易', '电动车'], countryCodes: ['DE', 'CN'], titleZh: '欧盟加征电动车关税，欧洲车企态度分化', summaryZh: '欧洲内部对电动车关税政策意见不一，部分车企担忧反制风险。', financeScore: 78, marketImpactScore: 61, hoursAgo: 62 },
      { sourceIndex: 5, categorySlug: 'trade', tagNames: ['关税', '电动车'], countryCodes: ['CN'], titleZh: '欧盟电动车关税影响，国内车企加速出海布局', summaryZh: '面对欧盟关税压力，国内新能源车企加快海外本地化产能布局。', financeScore: 75, marketImpactScore: 59, hoursAgo: 61 },
      { sourceIndex: 13, categorySlug: 'trade', tagNames: ['关税', '电动车'], countryCodes: ['CN', 'DE'], titleZh: '欧盟电动车关税引热议，机构解读影响程度', summaryZh: '机构分析认为，关税短期冲击有限，但需关注后续谈判进展。', financeScore: 67, marketImpactScore: 51, hoursAgo: 60 },
    ],
  },
];

export const demoStandaloneArticles: DemoArticleSeed[] = [
  { sourceIndex: 0, categorySlug: 'macro', tagNames: ['美联储'], countryCodes: ['US'], titleZh: '美国6月非农就业新增超预期，失业率维持低位', summaryZh: '美国劳工部数据显示6月非农就业人数超出市场预期，劳动力市场仍具韧性。', financeScore: 80, marketImpactScore: 65, hoursAgo: 3 },
  { sourceIndex: 4, categorySlug: 'macro', tagNames: ['央行'], countryCodes: ['CN'], titleZh: '中国7月CPI同比温和上涨，PPI降幅收窄', summaryZh: '国家统计局数据显示7月居民消费价格指数温和上涨，工业生产者出厂价格降幅收窄。', financeScore: 76, marketImpactScore: 58, hoursAgo: 5 },
  { sourceIndex: 1, categorySlug: 'tech', tagNames: ['AI'], countryCodes: ['US'], titleZh: '微软宣布加大AI基础设施投资，金额创纪录', summaryZh: '微软表示将大幅追加AI数据中心投资，以满足持续增长的算力需求。', financeScore: 82, marketImpactScore: 66, hoursAgo: 7 },
  { sourceIndex: 9, categorySlug: 'corporate', tagNames: ['AI'], countryCodes: ['US'], titleZh: '亚马逊财报超预期，云计算业务加速增长', summaryZh: '亚马逊最新财报显示营收与利润均超预期，AWS云计算业务增长加速。', financeScore: 79, marketImpactScore: 63, hoursAgo: 9 },
  { sourceIndex: 3, categorySlug: 'energy', tagNames: ['油价'], countryCodes: ['DE'], titleZh: '欧洲天然气价格持续回落，库存处于高位', summaryZh: '欧洲天然气库存充足叠加需求疲软，天然气价格延续回落态势。', financeScore: 68, marketImpactScore: 52, hoursAgo: 11 },
  { sourceIndex: 11, categorySlug: 'commodities', tagNames: ['芯片'], countryCodes: ['US'], titleZh: '铜价创近期新高，供应担忧升温', summaryZh: '全球铜库存下降叠加供应扰动，伦敦金属交易所铜价创出近期新高。', financeScore: 72, marketImpactScore: 56, hoursAgo: 13 },
  { sourceIndex: 10, categorySlug: 'markets', tagNames: ['美联储'], countryCodes: ['US'], titleZh: '比特币价格剧烈波动，市场情绪谨慎', summaryZh: '比特币价格短线大幅波动，投资者对监管与流动性前景保持谨慎。', financeScore: 65, marketImpactScore: 50, hoursAgo: 15 },
  { sourceIndex: 5, categorySlug: 'markets', tagNames: ['央行'], countryCodes: ['CN'], titleZh: '人民币汇率稳中有升，结汇需求回暖', summaryZh: '人民币兑美元中间价小幅调升，市场结汇需求出现回暖迹象。', financeScore: 70, marketImpactScore: 54, hoursAgo: 17 },
  { sourceIndex: 2, categorySlug: 'markets', tagNames: ['美联储'], countryCodes: ['US'], titleZh: '美债收益率曲线趋陡，长端利率上行', summaryZh: '美国国债收益率曲线趋陡，长期国债收益率升至近期高位。', financeScore: 74, marketImpactScore: 60, hoursAgo: 19 },
  { sourceIndex: 6, categorySlug: 'corporate', tagNames: ['电动车'], countryCodes: ['CN'], titleZh: '中国新能源汽车7月销量同比增长，渗透率再创新高', summaryZh: '7月新能源汽车销量同比大幅增长，市场渗透率持续提升。', financeScore: 73, marketImpactScore: 57, hoursAgo: 21 },
  { sourceIndex: 0, categorySlug: 'tech', tagNames: ['芯片', '供应链'], countryCodes: ['US', 'CN'], titleZh: '全球半导体供应紧张，汽车与消费电子承压', summaryZh: '全球半导体产能紧张，部分汽车与消费电子厂商面临交付压力。', financeScore: 77, marketImpactScore: 61, hoursAgo: 23 },
  { sourceIndex: 1, categorySlug: 'macro', tagNames: ['央行'], countryCodes: ['IN'], titleZh: '印度经济增速保持强劲，制造业扩张', summaryZh: '印度最新经济数据显示制造业保持扩张，经济增速维持高位。', financeScore: 69, marketImpactScore: 53, hoursAgo: 25 },
  { sourceIndex: 8, categorySlug: 'markets', tagNames: ['央行'], countryCodes: ['JP'], titleZh: '日经指数创34年新高，外资持续流入', summaryZh: '日本股市延续强势，日经225指数创下34年来新高。', financeScore: 75, marketImpactScore: 59, hoursAgo: 27 },
  { sourceIndex: 3, categorySlug: 'macro', tagNames: ['央行'], countryCodes: ['DE'], titleZh: '德国制造业PMI回升，但仍处于荣枯线下方', summaryZh: '德国制造业采购经理人指数回升，但仍在荣枯线下方运行。', financeScore: 67, marketImpactScore: 51, hoursAgo: 29 },
  { sourceIndex: 12, categorySlug: 'energy', tagNames: ['油价'], countryCodes: ['SA'], titleZh: '沙特维持自愿减产，原油供应趋紧', summaryZh: '沙特宣布维持自愿减产措施，全球原油供应维持偏紧格局。', financeScore: 71, marketImpactScore: 55, hoursAgo: 31 },
  { sourceIndex: 0, categorySlug: 'tech', tagNames: ['苹果', '供应链'], countryCodes: ['US'], titleZh: '苹果发布新款设备，供应链迎来备货高峰', summaryZh: '苹果发布新款设备，供应链厂商进入备货高峰，相关订单增加。', financeScore: 74, marketImpactScore: 58, hoursAgo: 33 },
  { sourceIndex: 4, categorySlug: 'corporate', tagNames: ['AI'], countryCodes: ['CN'], titleZh: '阿里巴巴财报超预期，AI相关业务增长明显', summaryZh: '阿里巴巴最新财报显示核心业务稳健，AI相关收入增长明显。', financeScore: 76, marketImpactScore: 60, hoursAgo: 35 },
  { sourceIndex: 7, categorySlug: 'corporate', tagNames: ['AI'], countryCodes: ['CN'], titleZh: '腾讯业绩稳健，游戏与广告业务回暖', summaryZh: '腾讯最新业绩稳健，游戏与广告业务出现回暖迹象。', financeScore: 75, marketImpactScore: 59, hoursAgo: 37 },
  { sourceIndex: 9, categorySlug: 'markets', tagNames: ['美联储'], countryCodes: ['US'], titleZh: '美元指数走弱，非美货币普遍走强', summaryZh: '美元指数延续弱势，欧元、日元等主要非美货币普遍走强。', financeScore: 72, marketImpactScore: 56, hoursAgo: 39 },
  { sourceIndex: 6, categorySlug: 'macro', tagNames: ['央行'], countryCodes: ['CN'], titleZh: '多地优化房地产政策，市场预期边际改善', summaryZh: '多个城市优化房地产调控政策，市场对行业企稳预期边际改善。', financeScore: 73, marketImpactScore: 57, hoursAgo: 41 },
  { sourceIndex: 11, categorySlug: 'tech', tagNames: ['芯片'], countryCodes: ['US', 'CN'], titleZh: '全球半导体设备销售创纪录，扩产潮延续', summaryZh: '全球半导体设备销售额创下历史纪录，行业扩产潮仍在延续。', financeScore: 75, marketImpactScore: 59, hoursAgo: 43 },
  { sourceIndex: 2, categorySlug: 'trade', tagNames: ['贸易', '供应链'], countryCodes: ['CN', 'US'], titleZh: '全球海运价格大涨，供应链成本上升', summaryZh: '受运力紧张影响，全球主要航线运价大幅上涨，供应链成本上升。', financeScore: 70, marketImpactScore: 54, hoursAgo: 45 },
  { sourceIndex: 12, categorySlug: 'commodities', tagNames: ['电动车'], countryCodes: ['CN'], titleZh: '碳酸锂价格反弹，新能源产业链情绪回暖', summaryZh: '碳酸锂价格出现反弹，新能源产业链市场情绪有所回暖。', financeScore: 66, marketImpactScore: 50, hoursAgo: 47 },
  { sourceIndex: 3, categorySlug: 'macro', tagNames: ['央行'], countryCodes: ['FR', 'DE'], titleZh: '欧元区通胀回落，市场对降息预期升温', summaryZh: '欧元区通胀数据回落，市场对欧洲央行启动降息的预期升温。', financeScore: 77, marketImpactScore: 61, hoursAgo: 49 },
  { sourceIndex: 1, categorySlug: 'monetary-policy', tagNames: ['美联储', '降息'], countryCodes: ['US'], titleZh: '美联储官员释放鸽派信号，市场关注降息节奏', summaryZh: '多位美联储官员释放鸽派信号，市场密切关注后续降息节奏。', financeScore: 78, marketImpactScore: 62, hoursAgo: 51 },
];

export interface DemoDailyReport {
  date: string;
  timezone: string;
  model: string;
  promptVersion: string;
  content: Record<string, unknown>;
}

export const demoDailyReport: DemoDailyReport = {
  date: '2026-08-13',
  timezone: 'Asia/Shanghai',
  model: 'demo-model',
  promptVersion: 'demo-v1',
  content: {
    summary: '[Demo] 今日全球财经要点：美联储开启降息周期，中国央行降准释放万亿流动性，国际油价与金价同步走高。',
    topItems: [
      { title: '美联储宣布降息25个基点', score: 95 },
      { title: '中国央行降准0.5个百分点', score: 93 },
      { title: '英伟达Q2营收超预期', score: 92 },
      { title: '国际油价单日大涨逾4%', score: 89 },
    ],
    sections: [
      { name: '全球宏观', items: ['美联储降息25个基点', '中国央行降准0.5个百分点', '日本央行意外加息'] },
      { name: '公司与科技', items: ['英伟达Q2营收超预期', '特斯拉发布经济型车型', '苹果调整供应链布局'] },
      { name: '大宗商品', items: ['国际油价大涨', '国际金价创历史新高'] },
      { name: '贸易', items: ['中美经贸磋商举行', '欧盟拟对华电动车加征关税'] },
    ],
  },
};
