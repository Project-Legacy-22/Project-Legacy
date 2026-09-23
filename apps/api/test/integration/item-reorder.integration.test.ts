import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { json } from '../http-harness.js';
import type { Harness } from '../http-harness.js';
import { realApplication, registerAndSignIn, serveAs } from './support.js';
import type { RealAccount } from './support.js';

interface ListedItem {
    id: string;
    position: string;
    status: string;
    version: number;
}

describe('item reordering on the migrated database', () => {
    let app: ReturnType<typeof realApplication>;
    let member: RealAccount;
    let outsider: RealAccount;
    let asMember: Harness;
    let asOutsider: Harness;

    const itemsPath = () => `/projects/${member.projectId}/items`;

    async function listed(): Promise<ListedItem[]> {
        const response = await asMember.request(itemsPath());
        expect(response.status).toBe(200);
        return ((await response.json()) as { items: ListedItem[] }).items;
    }

    beforeAll(async () => {
        app = realApplication();
        member = await registerAndSignIn(app, 'IntegrationTest2026');
        outsider = await registerAndSignIn(app, 'IntegrationTest2026');
        asMember = await serveAs(app, member.cookie);
        asOutsider = await serveAs(app, outsider.cookie);
    });

    afterAll(async () => {
        await asMember.close();
        await asOutsider.close();
        await app.stop();
    });

    it('persists an adjacent swap and rejects invalid, stale and unauthorized moves', async () => {
        for (const name of ['First', 'Second', 'Third']) {
            const created = await asMember.request(itemsPath(), json('POST', { name }));
            expect(created.status).toBe(200);
        }
        const [first, second, third] = await listed();
        if (first === undefined || second === undefined || third === undefined) throw new Error('Missing tasks');

        const path = `${itemsPath()}/${second.id}/position`;
        const swapped = await asMember.request(path, json('PATCH', {
            position: first.position, version: second.version,
        }));
        expect(swapped.status).toBe(200);
        expect(await swapped.json()).toMatchObject({ position: first.position, status: 'todo', version: 2 });
        expect((await listed()).map((item) => item.id)).toEqual([second.id, first.id, third.id]);

        const stale = await asMember.request(path, json('PATCH', {
            position: third.position, version: second.version,
        }));
        expect(stale.status).toBe(409);
        expect(await stale.json()).toMatchObject({ type: 'item_position_conflict' });

        const invalid = await asMember.request(`${itemsPath()}/${third.id}/position`, json('PATCH', {
            position: first.position, version: third.version,
        }));
        expect(invalid.status).toBe(400);
        expect(await invalid.json()).toMatchObject({ type: 'invalid_item_position' });

        const denied = await asOutsider.request(path, json('PATCH', {
            position: third.position, version: second.version,
        }));
        const missing = await asMember.request(`${itemsPath()}/00000000-0000-7000-8000-000000000099/position`,
            json('PATCH', { position: third.position, version: 1 }));
        expect([denied.status, missing.status]).toEqual([404, 404]);
        expect(await denied.json()).toMatchObject({ type: 'item_not_found' });
        expect(await missing.json()).toMatchObject({ type: 'item_not_found' });
    });
});
