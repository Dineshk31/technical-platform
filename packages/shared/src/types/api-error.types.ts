/**
 * The one error envelope shape every endpoint returns, per docs/api-specification.md.
 */
export interface ApiErrorDetail {
  field?: string;
  issue: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
  };
}
