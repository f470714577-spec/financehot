import { CrawlerError } from './errors';
import type { SafeFetcher } from './safe-fetcher';

interface RobotsRule {
  allow: boolean;
  pattern: string;
}

function ruleRegex(pattern: string): RegExp {
  const end = pattern.endsWith('$');
  const source = pattern
    .replace(/\$$/, '')
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}${end ? '$' : ''}`);
}

export class RobotsPolicy {
  private constructor(private readonly rules: RobotsRule[]) {}

  static parse(text: string, userAgent: string): RobotsPolicy {
    const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
    let current: { agents: string[]; rules: RobotsRule[] } | undefined;
    for (const line of text.split(/\r?\n/)) {
      const clean = line.split('#', 1)[0].trim();
      if (!clean) {
        current = undefined;
        continue;
      }
      const separator = clean.indexOf(':');
      if (separator < 0) continue;
      const directive = clean.slice(0, separator).trim().toLowerCase();
      const value = clean.slice(separator + 1).trim();
      if (directive === 'user-agent') {
        if (!current || current.rules.length > 0) {
          current = { agents: [], rules: [] };
          groups.push(current);
        }
        current.agents.push(value.toLowerCase());
      } else if ((directive === 'allow' || directive === 'disallow') && current && value) {
        current.rules.push({ allow: directive === 'allow', pattern: value });
      }
    }
    const token = userAgent.toLowerCase().split(/[ /]/, 1)[0];
    const specific = groups.filter((group) => group.agents.some((agent) => agent === token || agent === userAgent.toLowerCase()));
    const wildcard = groups.filter((group) => group.agents.includes('*'));
    const selected = specific.length ? specific : wildcard;
    return new RobotsPolicy(selected.flatMap((group) => group.rules));
  }

  isAllowed(path: string): boolean {
    const matches = this.rules
      .filter((rule) => ruleRegex(rule.pattern).test(path))
      .sort((left, right) => right.pattern.replace(/\$$/, '').length - left.pattern.replace(/\$$/, '').length);
    return matches[0]?.allow ?? true;
  }
}

export async function assertRobotsAllowed(fetcher: SafeFetcher, targetUrl: string, userAgent: string, sourceId?: string): Promise<void> {
  const target = new URL(targetUrl);
  const robotsUrl = new URL('/robots.txt', target.origin).toString();
  let response;
  try {
    response = await fetcher.fetchText(robotsUrl, {
      sourceId,
      headers: { accept: 'text/plain' },
      allowedContentTypes: new RegExp('^(text/plain|application/octet-stream)$'),
      allowedStatuses: new Set([404, 410]),
      maxAttempts: 1,
    });
  } catch (error) {
    if (error instanceof CrawlerError && (error.status === 404 || error.status === 410)) return;
    throw new CrawlerError('robots.txt 无法安全核验，已拒绝 Web 抓取', 'robots', false, undefined, robotsUrl, error);
  }
  if (response.status === 404 || response.status === 410) return;
  if (response.status === 401 || response.status === 403) {
    throw new CrawlerError('robots.txt 拒绝访问，已拒绝 Web 抓取', 'robots', false, response.status, robotsUrl);
  }
  const policy = RobotsPolicy.parse(response.body, userAgent);
  const path = `${target.pathname || '/'}${target.search}`;
  if (!policy.isAllowed(path)) {
    throw new CrawlerError('robots.txt 禁止该 URL', 'robots', false, response.status, targetUrl);
  }
}
