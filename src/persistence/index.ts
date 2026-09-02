import type { Persistence } from './types.js';

// The concrete driver is still chosen when this module is first loaded: MySQL
// when MYSQL_HOST is set, SQLite otherwise. Dynamic imports keep that lazy, so
// only the selected driver is ever loaded -- sqlite3 pulls in a native binding
// and must not be loaded when MySQL is in use.
//
// Selecting the driver here is dette D-02 of the audit. It stays for now
// because this step keeps behaviour constant; injecting the driver from the
// composition root is the next step of #5.
const db: Persistence = process.env.MYSQL_HOST
    ? (await import('./mysql.js')).default
    : (await import('./sqlite.js')).default;

export default db;
