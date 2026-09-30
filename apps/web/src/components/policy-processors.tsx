// Who holds what, where, and who can access it.
//
// Tabular, so not in labels.ts: this file carries four fields per row, and splitting them into
// twenty flat labels would make it impossible to check that a row is complete. The headers and the
// rendering live here for the same reason -- a column whose header is elsewhere gets half renamed
// -- and labels.ts is at its line ceiling anyway.
//
// Every row can be checked. The Supabase region is read with `supabase projects list`, the Vercel
// one is declared in `vercel.json`, the Grafana one in the URL of its Prometheus data source, the
// event queue one in the Storage tab of the Vercel project. A row that cannot be checked has no
// place here: it is a policy, not an intention.
//
// Access is the same everywhere, and it is a fact to write rather than to round off: the six
// developers of the team have the same access to every tool. There is no separation of roles on
// infrastructure access. Announcing narrower access than there is would mislead the reader in the
// direction that matters.

export interface Processor {
    name: string;
    holds: string;
    where: string;
    access: string;
}

export const PROCESSORS: readonly Processor[] = [
    {
        name: 'Supabase',
        holds: 'Your address, your password hash, your projects, your tasks and your notifications.',
        where: 'Ireland (AWS eu-west-1).',
        access:
            'Row-level policies restrict every read to the owner of the row. A service key bypasses them; it is used by this application and never by a person. The six developers of the team can all reach the dashboard.',
    },
    {
        name: 'Vercel',
        holds: 'Every request and its response pass through, so the body of what you send and receive transits there. Logs keep method, path, status and duration.',
        where: 'Paris (region cdg1, declared in vercel.json).',
        access: 'The six developers of the team, with no distinction between them.',
    },
    {
        name: 'Event queue (Upstash for Redis, provisioned with the Vercel project)',
        holds:
            'Two identifiers per task you create: the task and its owner. No address, no task name, no content. They are removed as soon as the notification is written.',
        where: 'European Union. Operated by Upstash, Inc., a United States company.',
        access: 'The six developers of the team, with no distinction between them.',
    },
    {
        name: 'Grafana Cloud',
        holds:
            'Technical measurements only: counters and durations by route and status code. No address, no account, no task, no IP address, as a value or as a label.',
        where: 'Germany (region prod-eu-west-2).',
        access: 'The six developers of the team, with no distinction between them.',
    },
    {
        name: 'Have I Been Pwned',
        holds:
            'Five characters of a hash, when you choose a password. It identifies nobody, and nothing is stored on either side.',
        where: 'The provider network, operated from Australia.',
        access: 'Nobody: the exchange leaves no record to access.',
    },
];

const EN_TETES = {
    name: 'Provider',
    holds: 'What it holds',
    where: 'Where',
    access: 'Who can access it',
} as const;

export function ProcessorsTable() {
    return (
        <div className="policy-processors-scroll">
            <table className="policy-processors">
                <thead>
                    <tr>
                        <th scope="col">{EN_TETES.name}</th>
                        <th scope="col">{EN_TETES.holds}</th>
                        <th scope="col">{EN_TETES.where}</th>
                        <th scope="col">{EN_TETES.access}</th>
                    </tr>
                </thead>
                <tbody>
                    {PROCESSORS.map(processor => (
                        <tr key={processor.name}>
                            <th scope="row">{processor.name}</th>
                            <td>{processor.holds}</td>
                            <td>{processor.where}</td>
                            <td>{processor.access}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
