import { beforeAll, describe, expect, it, vi } from 'vitest';

import { LastProjectOwner, ProjectMemberNotFound, ProjectNotFound, ProjectOwnerRequired } from '@legacy/core-projects';
import { createSupabaseMembershipRepository } from '@legacy/infra';
import type { Application } from '../../src/composition-root.js';
import { integrationConfig, realApplication, registerAndSignIn } from './support.js';
import type { RealAccount } from './support.js';
import { sharedProject } from './member-removal-support.js';
import { databaseQuery, holdRemoval } from './member-removal-transaction.js';

let app: Application;
let owner: RealAccount;
let member: RealAccount;

beforeAll(async () => {
    app = realApplication();
    owner = await registerAndSignIn(app, 'ConcurrentRemoval2026');
    member = await registerAndSignIn(app, 'ConcurrentRemoval2026');
});

function repository() {
    const config = integrationConfig();
    return createSupabaseMembershipRepository({
        url: config.supabaseUrl, serviceRoleKey: config.supabaseServiceRoleKey,
    });
}

// Wait for the observed database lock, not a timer guessing when request two
// reached Postgres. The first transaction is committed only after this holds.
async function waitForCompetingRemoval(): Promise<void> {
    await vi.waitFor(() => {
        expect(databaseQuery(`select count(*) from pg_stat_activity
            where wait_event_type = 'Lock' and query like '%remove_project_member%'`)).toBe('1');
    }, { timeout: 5_000, interval: 50 });
}

describe('concurrent member removal on real PostgreSQL transactions', () => {
    it('keeps the remaining owner when both owners try to leave', async () => {
        const projectId = await sharedProject(app, { owner, member }, 'owner');
        const first = await holdRemoval({ projectId, callerId: owner.id, memberId: owner.id });
        let outcome: 'commit' | 'rollback' = 'rollback';
        // Record the rejection immediately so a failed assertion cannot leave
        // an unhandled promise while the transaction is being rolled back.
        const second = repository().removeMember({ projectId, callerId: member.id, memberId: member.id })
            .then(() => undefined, (error: unknown) => error);
        try {
            await waitForCompetingRemoval();
            outcome = 'commit';
        } finally {
            await first.finish(outcome);
        }

        expect(await second).toBeInstanceOf(LastProjectOwner);
        expect(await app.useCases.projects.listProjectMembers(projectId, member.id)).toEqual([
            { userId: member.id, email: member.email, role: 'owner' },
        ]);
    });

    it('rechecks the caller after another owner removes their membership', async () => {
        const projectId = await sharedProject(app, { owner, member }, 'owner');
        const first = await holdRemoval({ projectId, callerId: owner.id, memberId: member.id });
        let outcome: 'commit' | 'rollback' = 'rollback';
        const second = repository().removeMember({ projectId, callerId: member.id, memberId: owner.id })
            .then(() => undefined, (error: unknown) => error);
        try {
            await waitForCompetingRemoval();
            outcome = 'commit';
        } finally {
            await first.finish(outcome);
        }

        expect(await second).toBeInstanceOf(ProjectNotFound);
        expect(await app.useCases.projects.listProjectMembers(projectId, owner.id)).toEqual([
            { userId: owner.id, email: owner.email, role: 'owner' },
        ]);
    });

    it('returns typed refusals even when called without the initial use-case check', async () => {
        const projectId = await sharedProject(app, { owner, member });
        const store = repository();

        await expect(store.removeMember({ projectId, callerId: member.id, memberId: owner.id }))
            .rejects.toBeInstanceOf(ProjectOwnerRequired);
        await expect(store.removeMember({ projectId, callerId: owner.id, memberId: owner.id }))
            .rejects.toBeInstanceOf(LastProjectOwner);
        await store.removeMember({ projectId, callerId: owner.id, memberId: member.id });
        await expect(store.removeMember({ projectId, callerId: owner.id, memberId: member.id }))
            .rejects.toBeInstanceOf(ProjectMemberNotFound);

        expect(await app.useCases.projects.listProjectMembers(projectId, owner.id)).toHaveLength(1);
    });
});
