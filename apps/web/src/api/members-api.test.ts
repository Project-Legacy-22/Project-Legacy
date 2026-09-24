import { afterEach, describe, expect, it, vi } from 'vitest';

import { membersApi } from './members-api';
import { labels } from '../labels';

const PROJECT = '0191f3c2-1111-7000-8000-aaaaaaaaaaaa';
const USER = '0191f3c2-aaaa-7000-8000-000000000002';
const INVITATION = '0191f3c2-bbbb-7000-8000-000000000001';

function response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function problem(type: string, status: number, detail: string): Response {
    return response({ type, title: type, status, detail, instance: '/projects', traceId: 'trace-1' }, status);
}

function stubFetch(answer: () => Response) {
    const fetchMock = vi.fn<typeof fetch>(async () => answer());
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

function lastRequest(fetchMock: ReturnType<typeof stubFetch>) {
    const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
    return { url, method: init?.method, body: init?.body };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('membersApi.listMembers', () => {
    it('returns the members of the project', async () => {
        const member = { userId: USER, email: 'guest@example.com', role: 'member' };
        const fetchMock = stubFetch(() => response({ members: [member] }));

        await expect(membersApi.listMembers(PROJECT, new AbortController().signal)).resolves.toEqual([member]);
        expect(lastRequest(fetchMock).url).toBe(`/projects/${PROJECT}/members`);
    });

    it('reports a list that breaks the contract as a 502', async () => {
        stubFetch(() => response({ members: [{ userId: 'nope' }] }));

        await expect(membersApi.listMembers(PROJECT, new AbortController().signal)).rejects.toMatchObject({
            status: 502,
            message: labels.invalidMemberList,
        });
    });
});

describe('membersApi.invite', () => {
    it('posts the address and returns what happened', async () => {
        const fetchMock = stubFetch(() => response({ outcome: 'already_invited' }));

        await expect(membersApi.invite(PROJECT, 'guest@example.com')).resolves.toBe('already_invited');
        expect(lastRequest(fetchMock)).toEqual({
            url: `/projects/${PROJECT}/invitations`,
            method: 'POST',
            body: JSON.stringify({ email: 'guest@example.com' }),
        });
    });

    it('carries the refusal the API wrote for the owner', async () => {
        const detail = 'No account uses this email address. Check it for a typo.';
        stubFetch(() => problem('account_not_found', 404, detail));

        await expect(membersApi.invite(PROJECT, 'nobody@example.com')).rejects.toMatchObject({
            status: 404,
            message: detail,
        });
    });
});

describe('membersApi.removeMember and answerInvitation', () => {
    it('deletes the membership', async () => {
        const fetchMock = stubFetch(() => new Response(null, { status: 204 }));

        await membersApi.removeMember(PROJECT, USER);

        expect(lastRequest(fetchMock)).toMatchObject({ url: `/projects/${PROJECT}/members/${USER}`, method: 'DELETE' });
    });

    it('accepts and declines on their own routes', async () => {
        const fetchMock = stubFetch(() => new Response(null, { status: 204 }));

        await membersApi.answerInvitation(INVITATION, true);
        expect(lastRequest(fetchMock)).toMatchObject({ url: `/projects/invitations/${INVITATION}/accept`, method: 'POST' });
        await membersApi.answerInvitation(INVITATION, false);
        expect(lastRequest(fetchMock).url).toBe(`/projects/invitations/${INVITATION}/decline`);
    });

    it('rejects an answer the API refused', async () => {
        const detail = 'This invitation has already been answered.';
        stubFetch(() => problem('invitation_already_answered', 409, detail));

        await expect(membersApi.answerInvitation(INVITATION, true)).rejects.toMatchObject({ status: 409, message: detail });
    });
});
