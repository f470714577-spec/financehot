import { listHotEvents, parseHotQuery } from '@financehot/db';
import { getDb } from '@/lib/db';
import { apiSuccess, withApiErrors } from '@/lib/api';

export async function GET(request: Request) {
  return withApiErrors(async () => {
    const query = parseHotQuery(new URL(request.url).searchParams);
    return apiSuccess(await listHotEvents(getDb().db, query));
  });
}
