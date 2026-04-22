export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data?: T;
  errors?: ApiValidationIssue[];
}

export interface ApiValidationIssue {
  path?: string;
  message: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}
