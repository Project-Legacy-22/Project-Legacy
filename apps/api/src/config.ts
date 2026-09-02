import fs from 'node:fs';
import path from 'node:path';

// The only module allowed to read process.env. Everything else receives typed
// values, so no part of the code has to guess whether a variable was set.

export interface SqlitePersistenceConfig {
    driver: 'sqlite';
    location: string;
}

export interface MysqlPersistenceConfig {
    driver: 'mysql';
    host: string;
    user: string | undefined;
    password: string | undefined;
    database: string | undefined;
}

export type PersistenceConfig = SqlitePersistenceConfig | MysqlPersistenceConfig;

export interface Config {
    port: number;
    staticDir: string;
    persistence: PersistenceConfig;
}

// The *_FILE variants are Docker secrets: the variable holds a path to read,
// not the value itself.
function readSetting(file: string | undefined, value: string | undefined): string | undefined {
    return file ? fs.readFileSync(file, 'utf8') : value;
}

function readPersistence(env: NodeJS.ProcessEnv): PersistenceConfig {
    const host = readSetting(env.MYSQL_HOST_FILE, env.MYSQL_HOST);

    if (host === undefined) {
        return {
            driver: 'sqlite',
            location: env.SQLITE_DB_LOCATION ?? '/etc/todos/todo.db',
        };
    }

    return {
        driver: 'mysql',
        host,
        user: readSetting(env.MYSQL_USER_FILE, env.MYSQL_USER),
        password: readSetting(env.MYSQL_PASSWORD_FILE, env.MYSQL_PASSWORD),
        database: readSetting(env.MYSQL_DB_FILE, env.MYSQL_DB),
    };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    return {
        port: 3000,
        // Vite writes its production bundle next to the compiled API output.
        // During development the web app is served separately by Vite.
        staticDir: path.join(import.meta.dirname, 'static'),
        persistence: readPersistence(env),
    };
}
