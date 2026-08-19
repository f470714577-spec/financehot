import { AppError } from '@financehot/shared';
import type { ApiResponse } from '@financehot/shared';

function isZodError(error: unknown): error is { name: 'ZodError'; flatten: () => unknown } {
  return error instanceof Error && error.name === 'ZodError' && 'flatten' in error;
}

export function apiSuccess<T>(data: T, status = 200): Response {
  const body: ApiResponse<T> = { success: true, data, error: null };
  return Response.json(body, { status });
}

export function apiFailure(error: unknown): Response {
  if (isZodError(error)) {
    return Response.json(
      {
        success: false,
        data: null,
        error: { code: 'INVALID_PARAMETERS', message: '请求参数无效', details: error.flatten() },
      },
      { status: 400 },
    );
  }
  if (error instanceof AppError) {
    return Response.json(
      { success: false, data: null, error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } },
      { status: error.status },
    );
  }
  console.error('[FinanceHot API]', error);
  return Response.json(
    { success: false, data: null, error: { code: 'INTERNAL_ERROR', message: '服务暂时不可用' } },
    { status: 500 },
  );
}

export async function withApiErrors(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    return apiFailure(error);
  }
}

export function notFoundError(resource: string): AppError {
  return new AppError(`${resource}不存在`, 'NOT_FOUND', 404);
}
