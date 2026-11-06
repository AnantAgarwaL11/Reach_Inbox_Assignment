import { Response } from 'express';
import { ApiResponse, PaginationMeta } from '../types';

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: PaginationMeta
): void {
  const body: ApiResponse<T> = { success: true, data };
  if (meta) body.meta = meta;
  res.status(statusCode).json(body);
}

export function sendError(res: Response, message: string, statusCode = 400): void {
  const body: ApiResponse<never> = { success: false, error: message };
  res.status(statusCode).json(body);
}

export function paginationMeta(page: number, pageSize: number, total: number): PaginationMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}
