// Qui détient quoi, où, et qui peut y accéder.
//
// Tabulaire, donc pas dans labels.ts : ce fichier porte quatre champs par
// ligne, et les éclater en vingt libellés plats rendrait impossible de vérifier
// qu'une ligne est complète. Les en-têtes et le rendu vivent ici pour la même
// raison -- une colonne dont l'en-tête est ailleurs se renomme à moitié -- et
// labels.ts est par ailleurs à son plafond de lignes.
//
// Chaque ligne est vérifiable. La région de Supabase se lit par
// `supabase projects list`, celle de Vercel est déclarée dans `vercel.json`,
// celle de Grafana dans l'URL de sa source de données Prometheus. Une ligne qui
// ne se vérifie pas n'a rien à faire ici : c'est une politique, pas une
// intention.

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
            'Row-level policies restrict every read to the owner of the row. The team holds a service key that bypasses them, used only by this application, never by a person.',
    },
    {
        name: 'Vercel',
        holds: 'Every request and its response pass through, so the body of what you send and receive transits there. Logs keep method, path, status and duration.',
        where: 'Paris (region cdg1, declared in vercel.json).',
        access: 'The three team members who administer the project.',
    },
    {
        name: 'Grafana Cloud',
        holds:
            'Technical measurements only: counters and durations by route and status code. No address, no account, no task, no IP address, as a value or as a label.',
        where: 'Germany (region prod-eu-west-2).',
        access: 'The team members who administer the monitoring.',
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
