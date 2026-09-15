import { execFileSync } from 'node:child_process';

// Talking to the three engines of the `migration` profile, and only to them.
//
// Everything goes through `docker compose exec`, so this suite needs no client
// installed on the machine and no free port: what it proves here is what it
// proves in the pipeline. `docker compose --profile migration up -d --wait`
// is the only prerequisite, and `npm run test:migration` does it.

export type Service = 'migration-postgres' | 'migration-mysql' | 'migration-sqlite';

function exec(service: Service, command: readonly string[], input = ''): string {
    return execFileSync('docker', ['compose', 'exec', '-T', service, ...command], {
        input,
        encoding: 'utf8',
        // The engines say what they refuse on stderr; a failure throws with it
        // attached, and a success is not worth reading.
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120_000,
    });
}

const POSTGRES = ['env', 'PGPASSWORD=migration', 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'];
const MYSQL = ['mysql', '-uroot', '-pmigration'];

export function postgresRun(database: string, sql: string): string {
    return exec('migration-postgres', [...POSTGRES, '-q', '-d', database], sql);
}

export function postgresAsk(database: string, query: string): string {
    return exec('migration-postgres', [...POSTGRES, '-At', '-d', database, '-c', query]).trim();
}

// Outside any database, for the two statements a database creation needs.
export function postgresAdmin(sql: string): string {
    return exec('migration-postgres', [...POSTGRES, '-q', '-d', 'postgres', '-c', sql]);
}

export function postgresDump(database: string): string {
    return exec('migration-postgres', [
        'env',
        'PGPASSWORD=migration',
        'pg_dump',
        '-U',
        'postgres',
        '-d',
        database,
        '--data-only',
        '--schema=public',
        // The shape `supabase db dump` writes, and the one the procedure of
        // docs/data-migration.md tells an operator to produce.
        '--column-inserts',
    ]);
}

export function mysqlRun(database: string, sql: string): string {
    return exec('migration-mysql', [...MYSQL, database], sql);
}

export function mysqlAsk(database: string, query: string): string {
    return exec('migration-mysql', [...MYSQL, '-N', '-B', database, '-e', query]).trim();
}

export function mysqlAdmin(sql: string): string {
    return exec('migration-mysql', [...MYSQL, '-e', sql]);
}

export function mysqlDump(database: string, table: string): string {
    return exec('migration-mysql', [
        'mysqldump',
        '-uroot',
        '-pmigration',
        '--no-tablespaces',
        '--skip-add-locks',
        database,
        table,
    ]);
}

const DATABASE_FILE = '/tmp/legacy22.db';

export function sqliteReset(): void {
    exec('migration-sqlite', ['rm', '-f', DATABASE_FILE]);
}

export function sqliteRun(sql: string): string {
    return exec('migration-sqlite', ['sqlite3', DATABASE_FILE], sql);
}

export function sqliteAsk(query: string): string {
    return exec('migration-sqlite', ['sqlite3', DATABASE_FILE, query]).trim();
}
