/**
 * Standard API response shape — MASTER_SPEC §5.1
 * Semua API route HARUS return shape ini.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: ApiError;
}

export interface ApiError {
  /** Machine-readable code: VALIDATION_ERROR, AUTH_ERROR, NOT_FOUND, dll */
  code: string;
  /** User-friendly message dalam Bahasa Indonesia */
  message: string;
  /** Field yang error (untuk validation) */
  field?: string;
  /** Detail errors untuk multiple validation failures */
  details?: string[];
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

/** Helper untuk build success response */
export function ok<T>(data: T, message?: string): ApiResponse<T> {
  return { success: true, data, message };
}

/** Helper untuk build error response */
export function fail(error: ApiError): ApiResponse<never> {
  return { success: false, error };
}
