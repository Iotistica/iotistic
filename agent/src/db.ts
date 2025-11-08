import type { Knex } from 'knex';
import { knex } from 'knex';
import path from 'path';
import * as fs from 'fs';

type DBTransactionCallback = (trx: Knex.Transaction) => void;

export type Transaction = Knex.Transaction;

// Database path - will be created in the current directory or use env variable
const databasePath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'device.sqlite');

// Ensure the data directory exists
const dataDir = path.dirname(databasePath);
if (!fs.existsSync(dataDir)) {
	fs.mkdirSync(dataDir, { recursive: true });
}

const db = knex({
	client: 'sqlite3',
	connection: {
		filename: databasePath,
	},
	useNullAsDefault: true,
});

/**
 * Initialize the database and run migrations
 * Should be called once at application startup
 */
export const initialized = async (): Promise<void> => {
	try {
		// Release any stale migration locks
		await db('knex_migrations_lock').update({ is_locked: 0 });
	} catch {
		// Table doesn't exist yet, ignore
	}
	
	// Run all pending migrations
	await db.migrate.latest({
		directory: path.join(__dirname, 'migrations'),
	});
	
	console.log('Database initialized at:', databasePath);
};

/**
 * Get a query builder for a specific model/table
 */
export function models(modelName: string): Knex.QueryBuilder {
	return db(modelName);
}

/**
 * Upsert (update or insert) a model
 * If a record matching the id exists, update it; otherwise insert it
 */
export async function upsertModel(
	modelName: string,
	obj: any,
	id: Record<string, unknown>,
	trx?: Knex.Transaction,
): Promise<any> {
	const k = trx || db;

	const numUpdated = await k(modelName).update(obj).where(id);
	if (numUpdated === 0) {
		return k(modelName).insert(obj);
	}
}

/**
 * Execute a callback within a database transaction
 */
export function transaction(
	cb: DBTransactionCallback,
): Promise<Knex.Transaction> {
	return db.transaction(cb);
}

/**
 * Direct access to the knex instance for advanced queries
 */
export function getKnex(): Knex {
	return db;
}

/**
 * Gracefully close the database connection
 */
export async function close(): Promise<void> {
	await db.destroy();
}

export default db;
