/**
 * Generic paging envelope returned by list endpoints (posts, comments, ...).
 * Corresponds to Domain.Responses.PagedResult&lt;T&gt;.
 */
export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
}
