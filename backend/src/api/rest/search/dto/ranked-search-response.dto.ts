// Ranked Search Response DTOs
// These DTOs define the shape of the response returned by the search endpoint.
// They are introduced without modifying existing controller or service code.

/**
 * Represents a single search result with relevance ranking information.
 */
export interface RankedSearchResult {
  /** Unique identifier of the matched entity (e.g., raffle id) */
  id: string;
  /** Relevance score computed by the search engine */
  score: number;
  /** List of fields that contributed to the match */
  matchedFields: string[];
  /** Optional highlighted snippets for each matched field */
  highlights?: Record<string, string>;
}

/**
 * Facet aggregation for a particular field.
 */
export interface Facet {
  /** Name of the facet field */
  name: string;
  /** Count of each distinct value within the facet */
  counts: Record<string, number>;
}

/**
 * Pagination metadata returned alongside search results.
 */
export interface PaginationMeta {
  /** Cursor for cursor‑based pagination (optional) */
  cursor?: string;
  /** Page number for offset pagination (optional) */
  page?: number;
  /** Number of items per page */
  pageSize: number;
  /** Total number of matching documents */
  total: number;
}

/**
 * Full response structure for ranked search results.
 */
export interface RankedSearchResponse {
  /** Array of ranked search results */
  results: RankedSearchResult[];
  /** Optional facet aggregations */
  facets?: Facet[];
  /** Pagination information */
  pagination: PaginationMeta;
  /** Echoes the enforced query limit for client awareness */
  queryLimit: number;
}
