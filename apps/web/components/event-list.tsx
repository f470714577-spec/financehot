import Link from 'next/link';
import { EventCard } from '@financehot/ui';
import type { EventSummary } from '@financehot/shared';

function formatDate(value: string | null): string {
  return value ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '时间未知';
}

export function EventList({ events, limit }: { events: EventSummary[]; limit?: number }) {
  const visibleEvents = limit ? events.slice(0, limit) : events;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {visibleEvents.map((event) => (
        <Link
          key={event.id}
          href={`/event/${event.id}`}
          className="block transition-transform hover:-translate-y-0.5"
        >
          <EventCard
            title={event.title}
            summary={event.summary ?? '暂无事件摘要'}
            heat={event.heatScore ?? 0}
            finance={event.financeScore ?? 0}
            status={event.status}
            sources={event.sourceCount}
            updatedAt={formatDate(event.lastSeenAt)}
          />
        </Link>
      ))}
    </div>
  );
}
