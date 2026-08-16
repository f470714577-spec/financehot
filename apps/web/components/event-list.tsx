import Link from 'next/link';
import { EventCard } from '@financehot/ui';
import type { DemoEventView } from '@/lib/demo-data';

export function EventList({ events, limit }: { events: DemoEventView[]; limit?: number }) {
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
            summary={event.summary}
            heat={event.heat}
            finance={event.finance}
            status={event.status}
            sources={event.sources}
            updatedAt={event.updatedAt}
          />
        </Link>
      ))}
    </div>
  );
}
