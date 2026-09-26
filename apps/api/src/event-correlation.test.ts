import { describe, expect, it } from 'vitest';

import { recordingLogger } from '../../../packages/contracts/test/fakes/recording-logger.js';
import { inMemoryItemRepository } from '../../../packages/core/items/test/fakes/in-memory-item-repository.js';
import { inMemoryInvitationRepository } from '../../../packages/core/projects/test/fakes/in-memory-invitation-repository.js';
import { itemUseCases, projectUseCases } from './composition-root.js';
import { runWithTraceId } from './http/trace.js';
import { inMemoryMembershipRepository } from '../../../packages/core/projects/test/fakes/in-memory-membership-repository.js';
import { inMemoryProjectRepository } from '../../../packages/core/projects/test/fakes/in-memory-project-repository.js';

const PROJECT = '01a090ad-a932-739f-b358-60b7eb289a40';
const OWNER = '00000000-0000-7000-8000-000000000001';
const GUEST = '00000000-0000-7000-8000-000000000002';

describe('event correlation', () => {
    it('links a committed item event to its request, with no task title in the log', async () => {
        const logger = recordingLogger();
        const repository = inMemoryItemRepository([], [{ projectId: PROJECT, userId: OWNER }]);
        const useCases = itemUseCases(repository, async () => {}, logger);

        await runWithTraceId('request-1', () =>
            useCases.addItem({ projectId: PROJECT, ownerId: OWNER, name: 'Private task title' }));

        const recorded = logger.lines.find(line => line.message === 'event recorded');
        expect(recorded?.fields).toEqual({ traceId: 'request-1', eventId: repository.recordedEvents[0]?.id });
        expect(JSON.stringify(logger.lines)).not.toContain('Private task title');
    });

    it('does not log an event when the item write fails', async () => {
        const logger = recordingLogger();
        const repository = inMemoryItemRepository([], [{ projectId: PROJECT, userId: OWNER }]);
        const useCases = itemUseCases({
            ...repository,
            save: async () => { throw new Error('write failed'); },
        }, async () => {}, logger);

        await expect(runWithTraceId('request-2', () =>
            useCases.addItem({ projectId: PROJECT, ownerId: OWNER, name: 'Task' }))).rejects.toThrow('write failed');
        expect(logger.lines.find(line => line.message === 'event recorded')).toBeUndefined();
    });

    it('logs an invitation event only when an invitation was created', async () => {
        const logger = recordingLogger();
        const invitations = inMemoryInvitationRepository(
            [{ id: OWNER, email: 'owner@example.com' }, { id: GUEST, email: 'guest@example.com' }],
            [{ projectId: PROJECT, projectName: 'Launch', userId: OWNER, role: 'owner' }],
        );
        const useCases = projectUseCases({
            projects: inMemoryProjectRepository(),
            memberships: inMemoryMembershipRepository(),
            invitations,
        }, async () => {}, logger);

        await runWithTraceId('request-3', () => useCases.inviteProjectMember({
            projectId: PROJECT, actorId: OWNER, email: 'guest@example.com',
        }));
        await runWithTraceId('request-4', () => useCases.inviteProjectMember({
            projectId: PROJECT, actorId: OWNER, email: 'guest@example.com',
        }));

        expect(logger.lines.filter(line => line.message === 'event recorded').map(line => line.fields))
            .toEqual([{ traceId: 'request-3', eventId: invitations.events[0]?.id }]);
    });
});
