import { getTopic } from '@financehot/db';
import { getDb } from '@/lib/db';
import { apiSuccess, notFoundError, withApiErrors } from '@/lib/api';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return withApiErrors(async () => {
    const topic = await getTopic(getDb().db, (await context.params).id);
    if (!topic) throw notFoundError('主题');
    return apiSuccess(topic);
  });
}
