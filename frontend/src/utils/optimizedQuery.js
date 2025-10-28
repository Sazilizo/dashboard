import api from "../api/client";
import { cachedFetch, generateCacheKey, invalidateCache, LONG_TTL } from "./requestCache";

/**
 * Optimized Supabase query wrapper with automatic caching and deduplication
 */
export class OptimizedQuery {
  constructor(table) {
    this.table = table;
    this.queryBuilder = api.from(table);
    this.selectClause = "*";
    this.filters = [];
    this.orderClause = null;
    this.limitValue = null;
    this.rangeValues = null;
    this.singleValue = false;
    this.cacheTTL = 30000; // Default 30s
  }

  select(columns = "*") {
    this.selectClause = columns;
    this.queryBuilder = this.queryBuilder.select(columns);
    return this;
  }

  eq(column, value) {
    this.filters.push({ type: "eq", column, value });
    this.queryBuilder = this.queryBuilder.eq(column, value);
    return this;
  }

  in(column, values) {
    this.filters.push({ type: "in", column, values });
    this.queryBuilder = this.queryBuilder.in(column, values);
    return this;
  }

  order(column, options) {
    this.orderClause = { column, options };
    this.queryBuilder = this.queryBuilder.order(column, options);
    return this;
  }

  limit(count) {
    this.limitValue = count;
    this.queryBuilder = this.queryBuilder.limit(count);
    return this;
  }

  range(from, to) {
    this.rangeValues = { from, to };
    this.queryBuilder = this.queryBuilder.range(from, to);
    return this;
  }

  single() {
    this.singleValue = true;
    return this;
  }

  maybeSingle() {
    this.singleValue = true;
    return this;
  }

  /**
   * Set custom cache TTL
   */
  cache(ttl) {
    this.cacheTTL = ttl;
    return this;
  }

  /**
   * Execute query with caching
   */
  async execute() {
    const cacheKey = generateCacheKey(this.table, this.selectClause, {
      filters: this.filters,
      order: this.orderClause,
      limit: this.limitValue,
      range: this.rangeValues,
      single: this.singleValue,
    });

    return cachedFetch(
      cacheKey,
      async () => {
        let query = this.queryBuilder;
        
        if (this.singleValue) {
          const { data, error } = await query.maybeSingle();
          if (error) throw error;
          return data;
        }

        const { data, error } = await query;
        if (error) throw error;
        return data;
      },
      this.cacheTTL
    );
  }
}

/**
 * Create optimized query
 */
export function optimizedQuery(table) {
  return new OptimizedQuery(table);
}

/**
 * Batch queries - execute multiple queries in parallel but deduplicated
 */
export async function batchQueries(queries) {
  return Promise.all(queries.map(q => q.execute()));
}

/**
 * Invalidate cache when data changes
 */
export function invalidateTableCache(table) {
  invalidateCache(table);
}

export default optimizedQuery;
