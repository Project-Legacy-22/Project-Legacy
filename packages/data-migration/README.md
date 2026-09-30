# @legacy/data-migration

The path of the data between our PostgreSQL and the engines next to it.

This package declares **no dependency**, neither external nor internal. It is intentional: it
serves to recover data on the day the application no longer runs, or no longer runs here. An exit
tool that depends on what it leaves is not an exit tool.

It talks to no database. It reads text and writes text:

- as input, a SQL export produced by `mysqldump` or by `sqlite3 .dump` (#275), or our own
  `supabase db dump`, accounts of `auth.users` included (#282, #426);
- as output, a SQL script that somebody reviews before applying it.

This is the reason why nothing here opens a connection: a script reviewed before it is run is the
only format that leaves a chance to refuse an import that went wrong.

ADR-0017 says why this package exists.
