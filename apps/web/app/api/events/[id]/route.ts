import { getEvent } from '@financehot/db';
import { getDb } from '@/lib/db';
import { apiSuccess, notFoundError, withApiErrors } from '@/lib/api';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return withApiErrors(async () => {
    const event = await getEvent(getDb().db, (await context.params).id);
    if (!event) throw notFoundError('事件');
    return apiSuccess(event);
  });
}
