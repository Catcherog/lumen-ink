/**
 * Minimal ambient declaration for the `pg` package.
 *
 * The CloudBase adapter loads `pg` dynamically via `import('pg')` so that
 * local dev / test environments do not need the package installed. This
 * declaration allows TypeScript to type-check the dynamic import without
 * requiring `pg` as a dev dependency.
 *
 * Only the surface used by cloudbase.ts is declared. The real `pg` types
 * are available via `@types/pg` when full type safety is needed.
 */
declare module 'pg' {
  export interface QueryResult<T = unknown> {
    rows: T[];
    rowCount: number;
    command: string;
    oid: number;
    fields: unknown[];
  }

  export class Pool {
    constructor(config?: unknown);
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
    query<T = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  export interface PoolClient {
    query<T = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
    release(): void;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }
}
