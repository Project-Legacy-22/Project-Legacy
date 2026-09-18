import type { SeededMembership } from '../fakes/in-memory-membership-repository.js';

export const PROJECT = '0191f3c2-1111-7000-8000-aaaaaaaaaaaa';
export const OTHER_PROJECT = '0191f3c2-2222-7000-8000-bbbbbbbbbbbb';
export const OWNER = '0191f3c2-aaaa-7000-8000-cccccccccccc';
export const MEMBER = '0191f3c2-bbbb-7000-8000-dddddddddddd';
export const STRANGER = '0191f3c2-cccc-7000-8000-eeeeeeeeeeee';

export function aMembership(overrides: Partial<SeededMembership> = {}): SeededMembership {
    return { projectId: PROJECT, userId: OWNER, email: 'owner@example.com', role: 'owner', ...overrides };
}

export function sharedMemberships(): SeededMembership[] {
    return [
        aMembership(),
        aMembership({ userId: MEMBER, email: 'member@example.com', role: 'member' }),
        aMembership({ projectId: OTHER_PROJECT, userId: MEMBER, email: 'member@example.com' }),
    ];
}
