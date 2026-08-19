import { getDaily, parseDailyQuery } from '@financehot/db';
import { getDb } from '@/lib/db';
import { apiSuccess, notFoundError, withApiErrors } from '@/lib/api';

export async function GET(request: Request) {
  return withApiErrors(async () => {
    const report = await getDaily(getDb().db, parseDailyQuery(new URL(request.url).searchParams));
    if (!report) throw notFoundError('日报');
    return apiSuccess(report);
  });
}
