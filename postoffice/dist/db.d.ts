import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
export declare function initializeDatabase(): Pool;
export declare function getPool(): Pool;
export declare function query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
export declare function getClient(): Promise<PoolClient>;
export declare function closeDatabase(): Promise<void>;
export declare function testConnection(): Promise<boolean>;
//# sourceMappingURL=db.d.ts.map