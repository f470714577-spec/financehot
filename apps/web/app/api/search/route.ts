import { listNews, parseSearchQuery } from '@financehot/db';
import { getDb } from '@/lib/db';
import { apiSuccess, withApiErrors } from '@/lib/api';

export async function GET(request: Request) {
  return withApiErrors(async () => {
    const query = parseSearchQuery(new URL(request.url).searchParams);
    return apiSuccess(await listNews(getDb().db, query));
  });
}
