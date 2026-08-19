import { Skeleton } from '@financehot/ui';

export function PageLoading() {
  return (
    <div
      className="mx-auto max-w-[1180px] px-4 pb-24 pt-7 sm:px-6 lg:pb-12"
      aria-label="页面加载中"
    >
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-4 h-10 w-72" />
      <Skeleton className="mt-3 h-5 w-full max-w-2xl" />
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <Skeleton className="h-52" />
        <Skeleton className="h-52" />
      </div>
      <Skeleton className="mt-6 h-80" />
    </div>
  );
}
