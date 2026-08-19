import { getNews } from '@financehot/db';
import { getDb } from '@/lib/db';
import { apiSuccess, notFoundError, withApiErrors } from '@/lib/api';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return withApiErrors(async () => {
    const article = await getNews(getDb().db, (await context.params).id);
    if (!article) throw notFoundError('新闻');
    return apiSuccess(article);
  });
}
