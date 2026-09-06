import { Pool } from 'pg';

/**
 * A plain `pg` Pool, not the API's Prisma client — deliberate (see
 * docs/coding-engine.md §3): this service is a separate deployable unit with
 * its own DB connection, ideally authenticated as the dedicated
 * least-privileged `execution_service` Postgres role (docs/security.md §4),
 * never sharing the API's Prisma client/connection or its broader grants.
 */
export function createPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl });
}
