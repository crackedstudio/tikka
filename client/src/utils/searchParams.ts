import type { SearchFilters } from "../types/types";

export function parseSearchParams(params: URLSearchParams): SearchFilters {
    const filters: SearchFilters = {};

    const q = params.get("q");
    if (q?.trim()) filters.q = q.trim();

    const status = params.get("status");
    if (status) filters.status = status;

    const min_price = params.get("min_price");
    if (min_price && !isNaN(Number(min_price)) && Number(min_price) >= 0) {
        filters.min_price = min_price;
    }

    const max_price = params.get("max_price");
    if (max_price && !isNaN(Number(max_price)) && Number(max_price) >= 0) {
        filters.max_price = max_price;
    }

    const creator = params.get("creator");
    if (creator?.trim()) filters.creator = creator.trim();

    const sort = params.get("sort");
    if (sort) filters.sort = sort;

    return filters;
}

export function serializeSearchParams(filters: SearchFilters): URLSearchParams {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.status) params.set("status", filters.status);
    if (filters.min_price) params.set("min_price", filters.min_price);
    if (filters.max_price) params.set("max_price", filters.max_price);
    if (filters.creator) params.set("creator", filters.creator);
    if (filters.sort) params.set("sort", filters.sort);
    return params;
}
