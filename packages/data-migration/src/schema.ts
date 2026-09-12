// Our schema, described once.
//
// The authority is supabase/migrations: this file must follow it, and a test at
// the integration level compares the two against information_schema so a
// column added by a migration cannot quietly stay out of an export.
//
// What is described here is the structure a target database needs in order to
// hold our data and keep refusing what our database refuses: types,
// nullability, keys, foreign keys, uniqueness. What is deliberately left out:
//
// - the value checks (a name between 1 and 255 characters, a role among two, a
//   positive version). `char_length` is not spelled the same in SQLite, and
//   half-translating a constraint is worse than naming the gap;
// - the row-level security policies, which have no equivalent outside
//   PostgreSQL. On another engine, authorisation is entirely application code;
// - the triggers and functions, GoTrue and the `auth` schema. The ADR-0017
//   calls these the cost of leaving.

export type ColumnKind = 'uuid' | 'text' | 'timestamp' | 'date' | 'json' | 'integer';

export interface Enumeration {
    // The type name PostgreSQL uses today. A target that keeps our data keeps
    // our names too, so it is declared rather than derived from the column.
    type: string;
    // PostgreSQL holds the values in the type, MySQL inline at the column,
    // SQLite in a check: the three ways of refusing the same row.
    values: readonly string[];
}

export interface Column {
    name: string;
    kind: ColumnKind;
    nullable: boolean;
    enumeration?: Enumeration;
}

export interface Reference {
    column: string;
    table: string;
    target: string;
}

export interface Table {
    name: string;
    columns: readonly Column[];
    primaryKey: readonly string[];
    references: readonly Reference[];
    unique: readonly (readonly string[])[];
}

function uuid(name: string, nullable = false): Column {
    return { name, kind: 'uuid', nullable };
}

function text(name: string, nullable = false): Column {
    return { name, kind: 'text', nullable };
}

function timestamp(name: string, nullable = false): Column {
    return { name, kind: 'timestamp', nullable };
}

// In the order rows must be inserted: every reference points at a table that
// appears before it. `renderSchema` and the data export both rely on it, and
// `test/schema-order.test.ts` refuses an order that breaks the rule.
export const TABLES: readonly Table[] = [
    {
        name: 'users',
        columns: [
            uuid('id'),
            text('email'),
            timestamp('created_at'),
            timestamp('updated_at'),
            text('policy_version', true),
            timestamp('policy_accepted_at', true),
        ],
        primaryKey: ['id'],
        references: [],
        unique: [['email']],
    },
    {
        name: 'projects',
        columns: [uuid('id'), text('name'), timestamp('created_at'), timestamp('updated_at')],
        primaryKey: ['id'],
        references: [],
        unique: [],
    },
    {
        name: 'project_memberships',
        columns: [uuid('project_id'), uuid('user_id'), text('role'), timestamp('created_at')],
        primaryKey: ['project_id', 'user_id'],
        references: [
            { column: 'project_id', table: 'projects', target: 'id' },
            { column: 'user_id', table: 'users', target: 'id' },
        ],
        unique: [],
    },
    {
        name: 'items',
        // In the order the database declares them, which a test compares with
        // information_schema: the model is a copy, and a copy that drifts in
        // any way is a copy one stops trusting.
        columns: [
            uuid('id'),
            uuid('user_id'),
            text('name'),
            timestamp('created_at'),
            timestamp('updated_at'),
            uuid('project_id'),
            {
                name: 'status',
                kind: 'text',
                nullable: false,
                enumeration: { type: 'item_status', values: ['todo', 'doing', 'done'] },
            },
            { name: 'version', kind: 'integer', nullable: false },
            {
                name: 'priority',
                kind: 'text',
                nullable: false,
                enumeration: { type: 'item_priority', values: ['low', 'normal', 'high'] },
            },
            { name: 'due_date', kind: 'date', nullable: true },
        ],
        primaryKey: ['id'],
        references: [
            { column: 'user_id', table: 'users', target: 'id' },
            { column: 'project_id', table: 'projects', target: 'id' },
        ],
        unique: [],
    },
    {
        name: 'outbox',
        columns: [
            uuid('id'),
            text('name'),
            timestamp('occurred_at'),
            { name: 'payload', kind: 'json', nullable: false },
            timestamp('published_at', true),
            timestamp('created_at'),
        ],
        primaryKey: ['id'],
        references: [],
        unique: [],
    },
    {
        name: 'processed_events',
        columns: [uuid('event_id'), timestamp('processed_at')],
        primaryKey: ['event_id'],
        references: [],
        unique: [],
    },
    {
        name: 'notifications',
        columns: [
            uuid('id'),
            uuid('user_id'),
            uuid('item_id'),
            uuid('event_id'),
            timestamp('read_at', true),
            timestamp('created_at'),
            timestamp('updated_at'),
        ],
        primaryKey: ['id'],
        references: [
            { column: 'user_id', table: 'users', target: 'id' },
            { column: 'item_id', table: 'items', target: 'id' },
            { column: 'event_id', table: 'processed_events', target: 'event_id' },
        ],
        // One notification per event, not per delivery: the rule that makes a
        // redelivery harmless, so it travels with the data.
        unique: [['event_id']],
    },
];

export function tableNamed(name: string): Table | undefined {
    return TABLES.find(table => table.name === name);
}
