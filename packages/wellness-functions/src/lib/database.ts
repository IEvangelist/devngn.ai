import { getDatabase } from "@netlify/database";

import { ConfigurationError, type RuntimeEnv } from "./config.js";

export type DatabaseRow = Record<string, unknown>;
export type SqlValue = unknown;

export interface Database {
  query<T extends DatabaseRow = DatabaseRow>(
    statement: string,
    values?: readonly SqlValue[],
  ): Promise<readonly T[]>;
  transaction<T>(work: (database: Database) => Promise<T>): Promise<T>;
  close?(): Promise<void>;
}

interface Queryable {
  query<T extends DatabaseRow>(
    statement: string,
    values?: SqlValue[],
  ): Promise<{ rows: T[] }>;
}

interface TransactionClient extends Queryable {
  release(): void;
}

interface TransactionPool extends Queryable {
  connect(): Promise<TransactionClient>;
  end(): Promise<void>;
}

class PooledDatabase implements Database {
  constructor(private readonly pool: TransactionPool) {}

  async query<T extends DatabaseRow = DatabaseRow>(
    statement: string,
    values: readonly SqlValue[] = [],
  ): Promise<readonly T[]> {
    const result = await this.pool.query<T>(statement, Array.from(values));
    return result.rows;
  }

  async transaction<T>(work: (database: Database) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const value = await work(new ClientDatabase(client));
      await client.query("COMMIT");
      return value;
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class ClientDatabase implements Database {
  constructor(private readonly client: TransactionClient) {}

  async query<T extends DatabaseRow = DatabaseRow>(
    statement: string,
    values: readonly SqlValue[] = [],
  ): Promise<readonly T[]> {
    const result = await this.client.query<T>(statement, Array.from(values));
    return result.rows;
  }

  async transaction<T>(work: (database: Database) => Promise<T>): Promise<T> {
    return work(this);
  }
}

export function createNetlifyDatabase(env: RuntimeEnv): Database {
  const connectionString = env.NETLIFY_DB_URL?.trim();
  if (connectionString === undefined || connectionString.length === 0) {
    throw new ConfigurationError("NETLIFY_DB_URL");
  }
  const connection = getDatabase({ connectionString });
  return new PooledDatabase(connection.pool);
}

export async function jsonRow(
  database: Database,
  statement: string,
  values: readonly SqlValue[] = [],
): Promise<unknown | undefined> {
  const rows = await database.query(statement, values);
  return rows[0]?.result;
}

export async function jsonRows(
  database: Database,
  statement: string,
  values: readonly SqlValue[] = [],
): Promise<readonly unknown[]> {
  const rows = await database.query(statement, values);
  return rows.map((row) => row.result);
}
