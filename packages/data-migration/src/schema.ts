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

// `now` is the only default that is not a literal, and the three engines
// spell it differently. The identifier generators the database carries --
// `uuid_generate_v7()` on four IDs and items.position -- are deliberately absent: they are a
// function of ours, and a target supplies its own identifiers or receives
// them with the data, which is what our exports do.
export type Default = 'now' | { literal: string | number };

export interface Column {
    name: string;
    kind: ColumnKind;
    nullable: boolean;
    enumeration?: Enumeration;
    // Part of the structure, not a detail: our import script leaves priority,
    // version and the dates to the schema, so a target without them would
    // refuse the very rows we send it. Measured against information_schema.
    default?: Default;
}

export interface Reference {
    column: string;
    table: string;
    target: string;
    // Cascade unless said otherwise. A task's creator (#425) and an
    // invitation's author are set null instead: the row outlives the account.
    onDelete?: 'set null';
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

// The written-at and changed-at pair every table of ours carries, both
// defaulting to the moment of the write.
function stamped(name: string): Column {
    return { name, kind: 'timestamp', nullable: false, default: 'now' };
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
            stamped('created_at'),
            stamped('updated_at'),
            text('policy_version', true),
            timestamp('policy_accepted_at', true),
        ],
        primaryKey: ['id'],
        references: [],
        unique: [['email']],
    },
    {
        name: 'projects',
        columns: [uuid('id'), text('name'), stamped('created_at'), stamped('updated_at')],
        primaryKey: ['id'],
        references: [],
        unique: [],
    },
    {
        name: 'project_memberships',
        columns: [uuid('project_id'), uuid('user_id'), text('role'), stamped('created_at')],
        primaryKey: ['project_id', 'user_id'],
        references: [
            { column: 'project_id', table: 'projects', target: 'id' },
            { column: 'user_id', table: 'users', target: 'id' },
        ],
        unique: [],
    },
    {
        // #401. Before notifications, which reference it. The single pending
        // invitation per person and project is a partial index, and the status
        // values are a check: both stay in PostgreSQL, like the other checks.
        name: 'project_invitations',
        columns: [
            uuid('id'),
            uuid('project_id'),
            uuid('invitee_id'),
            // Nullable since #425: an invitation outlives the account that sent
            // it, the link to it broken rather than the row removed.
            uuid('invited_by', true),
            // No default, in the database either: MySQL refuses one on a TEXT
            // column, and the function that invites writes `pending` itself.
            text('status'),
            stamped('created_at'),
            timestamp('answered_at', true),
        ],
        primaryKey: ['id'],
        references: [
            { column: 'project_id', table: 'projects', target: 'id' },
            { column: 'invitee_id', table: 'users', target: 'id' },
            { column: 'invited_by', table: 'users', target: 'id', onDelete: 'set null' },
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
            // Nullable since #425: a shared project's tasks outlive their
            // creator's account, the link to it broken rather than the row
            // removed.
            uuid('user_id', true),
            text('name'),
            stamped('created_at'),
            stamped('updated_at'),
            uuid('project_id'),
            {
                name: 'status',
                kind: 'text',
                nullable: false,
                enumeration: { type: 'item_status', values: ['todo', 'doing', 'done'] },
                default: { literal: 'todo' },
            },
            { name: 'version', kind: 'integer', nullable: false, default: { literal: 1 } },
            {
                name: 'priority',
                kind: 'text',
                nullable: false,
                enumeration: { type: 'item_priority', values: ['low', 'normal', 'high'] },
                default: { literal: 'normal' },
            },
            { name: 'due_date', kind: 'date', nullable: true },
            // Exported and imported as data. The source generates this UUID
            // when a direct insert omits it; target engines receive the value.
            uuid('position'),
        ],
        primaryKey: ['id'],
        references: [
            { column: 'user_id', table: 'users', target: 'id', onDelete: 'set null' },
            { column: 'project_id', table: 'projects', target: 'id' },
        ],
        unique: [['position']],
    },
    {
        // Who each task is assigned to (#419). Our keys point at the task in
        // its project and at the membership, so only a member is assigned and
        // leaving the project removes the row. The targets get plain keys to
        // the task, the project and the account: the membership rule stays
        // ours, like the policies and checks that do not cross either.
        name: 'item_assignees',
        columns: [uuid('item_id'), uuid('project_id'), uuid('user_id')],
        primaryKey: ['item_id', 'user_id'],
        references: [
            { column: 'item_id', table: 'items', target: 'id' },
            { column: 'project_id', table: 'projects', target: 'id' },
            { column: 'user_id', table: 'users', target: 'id' },
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
            stamped('created_at'),
        ],
        primaryKey: ['id'],
        references: [],
        unique: [],
    },
    {
        name: 'processed_events',
        columns: [uuid('event_id'), stamped('processed_at')],
        primaryKey: ['event_id'],
        references: [],
        unique: [],
    },
    {
        name: 'notifications',
        columns: [
            uuid('id'),
            uuid('user_id'),
            // Nullable since notifications can name a project.
            uuid('item_id', true),
            uuid('event_id'),
            timestamp('read_at', true),
            stamped('created_at'),
            stamped('updated_at'),
            // Last, and not by taste: PostgreSQL adds a column at the end of the table, and the
            // model test compares the order as well as the names. Placing them in the middle, where
            // they read best, makes the comparison against information_schema fail.
            //
            // `kind` and `project_id` are linked: the kind decides whether the row names a task or
            // a project, and a `check` refuses a row that would name neither. This value check
            // stays in PostgreSQL, like the others.
            text('kind'),
            uuid('project_id', true),
            // #401: an invitation notification designates the invitation, so that the person
            // answers from the notification.
            uuid('invitation_id', true),
        ],
        primaryKey: ['id'],
        references: [
            { column: 'user_id', table: 'users', target: 'id' },
            { column: 'item_id', table: 'items', target: 'id' },
            { column: 'project_id', table: 'projects', target: 'id' },
            { column: 'invitation_id', table: 'project_invitations', target: 'id' },
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
