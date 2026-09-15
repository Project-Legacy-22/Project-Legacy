import { describe, expect, it } from 'vitest';

import { inMemoryMembershipRepository } from '../../test/fakes/in-memory-membership-repository.js';
import type { SeededMembership } from '../../test/fakes/in-memory-membership-repository.js';
import { ProjectNotFound } from '../domain/project.js';
import { makeListProjectMembers } from './list-project-members.js';

// The rule this use case exists for is not « return the rows » -- it is who is
// allowed to, and what the refusal says. project_memberships carries no policy
// for reading other people's rows, so the adapter can read anything and the
// decision lives here.

const PROJET = '0191f3c2-1111-7000-8000-aaaaaaaaaaaa';
const AUTRE_PROJET = '0191f3c2-2222-7000-8000-bbbbbbbbbbbb';
const ADA = '0191f3c2-aaaa-7000-8000-cccccccccccc';
const ALAN = '0191f3c2-bbbb-7000-8000-dddddddddddd';
const ETRANGER = '0191f3c2-cccc-7000-8000-eeeeeeeeeeee';

const MEMBRES: SeededMembership[] = [
    { projectId: PROJET, userId: ADA, email: 'ada@example.com', role: 'owner' },
    { projectId: PROJET, userId: ALAN, email: 'alan@example.com', role: 'member' },
    { projectId: AUTRE_PROJET, userId: ETRANGER, email: 'autre@example.com', role: 'owner' },
];

function listing(seed: readonly SeededMembership[] = MEMBRES) {
    return makeListProjectMembers(inMemoryMembershipRepository(seed));
}

describe('listing the members of a project', () => {
    it('gives a member the whole list, with the role of each', async () => {
        await expect(listing()(PROJET, ALAN)).resolves.toEqual([
            { userId: ADA, email: 'ada@example.com', role: 'owner' },
            { userId: ALAN, email: 'alan@example.com', role: 'member' },
        ]);
    });

    it('includes the caller rather than everyone but them', async () => {
        const members = await listing()(PROJET, ADA);

        expect(members.map(member => member.userId)).toContain(ADA);
    });

    // The decision worth guarding. A 403 would confirm the project exists to
    // anyone guessing identifiers; a 404 says the same thing whether the
    // project is absent or merely none of the caller's business.
    it('answers a stranger like a project that does not exist', async () => {
        await expect(listing()(PROJET, ETRANGER)).rejects.toThrow(ProjectNotFound);
    });

    it('answers the same way for a project nobody has', async () => {
        await expect(listing()('0191f3c2-9999-7000-8000-ffffffffffff', ADA)).rejects.toThrow(
            ProjectNotFound,
        );
    });

    // Membership of another project is not membership of this one. Without the
    // projectId in the check, a single membership anywhere would open
    // everything.
    it('does not let a membership of one project read another', async () => {
        await expect(listing()(AUTRE_PROJET, ADA)).rejects.toThrow(ProjectNotFound);
    });
});
