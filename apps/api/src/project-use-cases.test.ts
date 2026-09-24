import { describe, expect, it, vi } from 'vitest';

import { recordingLogger } from '../../../packages/contracts/test/fakes/recording-logger.js';
import { inMemoryInvitationRepository } from '../../../packages/core/projects/test/fakes/in-memory-invitation-repository.js';
import { inMemoryMembershipRepository } from '../../../packages/core/projects/test/fakes/in-memory-membership-repository.js';
import { inMemoryProjectRepository } from '../../../packages/core/projects/test/fakes/in-memory-project-repository.js';
import { projectUseCases } from './composition-root.js';

const PROJECT = '01a090ad-a932-739f-b358-60b7eb289a40';
const OWNER = '00000000-0000-7000-8000-000000000001';
const GUEST = '00000000-0000-7000-8000-000000000002';

// #410: an invitation writes an event like a task creation does, and a
// serverless deployment has no process to relay it. Without a pass after the
// write, the invitation waited for the scheduled sweep, which GitHub ran hours
// apart.
function assembled(deliver: () => Promise<unknown>) {
    const invitations = inMemoryInvitationRepository(
        [
            { id: OWNER, email: 'owner@example.com' },
            { id: GUEST, email: 'guest@example.com' },
        ],
        [{ projectId: PROJECT, projectName: 'Launch', userId: OWNER, role: 'owner' }],
    );
    const adapters = { projects: inMemoryProjectRepository(), memberships: inMemoryMembershipRepository(), invitations };
    return projectUseCases(adapters, deliver, recordingLogger());
}

describe('the project use cases', () => {
    it('deliver once an invitation is written', async () => {
        const deliver = vi.fn(async () => undefined);

        await assembled(deliver).inviteProjectMember({ projectId: PROJECT, actorId: OWNER, email: 'guest@example.com' });

        expect(deliver).toHaveBeenCalledTimes(1);
    });

    it('keep the invitation when the delivery fails, leaving it to the sweep', async () => {
        const deliver = vi.fn(async () => {
            throw new Error('broker down');
        });

        await expect(
            assembled(deliver).inviteProjectMember({ projectId: PROJECT, actorId: OWNER, email: 'guest@example.com' }),
        ).resolves.toBe('invited');
    });

    it('do not deliver on a read', async () => {
        const deliver = vi.fn(async () => undefined);

        await assembled(deliver).listInvitations(GUEST);

        expect(deliver).not.toHaveBeenCalled();
    });
});
