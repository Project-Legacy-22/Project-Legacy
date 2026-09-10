import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

// A stand-in for GoTrue, served over real HTTP on a free port. The adapter is
// given its address like any other Supabase URL, so nothing in the production
// code changes to make it testable, and the exchange under test is the one
// that actually happens: a request goes out, a status and a body come back.
//
// What is pinned here is the translation, not the provider: which answers are
// ordinary and which are failures. Treating an unknown error as a rejected
// credential would turn an outage into a wall of plausible refusals, and that
// is precisely the mistake no integration suite would catch quickly.
export interface FakeGoTrueResponse {
    status: number;
    body: unknown;
}

export interface FakeGoTrue {
    url: string;
    quand: (route: string, reponse: FakeGoTrueResponse) => void;
    close: () => Promise<void>;
}

export async function fauxFournisseur(): Promise<FakeGoTrue> {
    const reponses = new Map<string, FakeGoTrueResponse>();

    const server = createServer((req, res) => {
        req.resume();
        const chemin = (req.url ?? '').split('?')[0] ?? '';
        const reponse = reponses.get(`${req.method ?? ''} ${chemin}`) ?? {
            status: 404,
            body: { code: 404, error_code: 'not_configured', msg: 'route non configuree' },
        };

        res.writeHead(reponse.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(reponse.body));
    });

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    return {
        url: `http://127.0.0.1:${String(port)}`,
        quand: (route, reponse) => reponses.set(route, reponse),
        close: () =>
            new Promise<void>((resolve, reject) => {
                server.close(error => {
                    if (error) reject(error);
                    else resolve();
                });
            }),
    };
}
