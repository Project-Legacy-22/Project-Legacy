import { describe, expect, it } from 'vitest';

import { inMemoryProjectRepository } from '../../test/fakes/in-memory-project-repository.js';
import type { InMemoryProjectRepository } from '../../test/fakes/in-memory-project-repository.js';
import { InvalidProjectName, MAX_PROJECT_NAME_LENGTH, ProjectNotFound } from '../domain/project.js';
import { makeAddProject } from './add-project.js';
import { makeListProjects } from './list-projects.js';
import { makeRemoveProject } from './remove-project.js';
import { makeRenameProject } from './rename-project.js';

const ACCOUNT_ID = 'account-1';
const OTHER_ACCOUNT_ID = 'account-2';
const PROJECT_ID = 'project-1';
const OTHER_PROJECT_ID = 'project-2';

describe('projects', () => {
    it('creates a project with an owner membership', async () => {
        const repository = inMemoryProjectRepository();
        const addProject = makeAddProject({ repository, newId: () => PROJECT_ID });

        await expect(addProject(' Product launch ', ACCOUNT_ID)).resolves.toEqual({
            id: PROJECT_ID,
            name: 'Product launch',
            role: 'owner',
            itemCount: 0,
        });
        expect(repository.memberships).toContainEqual({
            projectId: PROJECT_ID,
            userId: ACCOUNT_ID,
            role: 'owner',
        });
    });

    it('rejects an empty project name before persistence', async () => {
        const repository = inMemoryProjectRepository();
        const addProject = makeAddProject({ repository, newId: () => PROJECT_ID });

        await expect(addProject('   ', ACCOUNT_ID)).rejects.toBeInstanceOf(InvalidProjectName);
        expect(repository.projects.size).toBe(0);
    });

    it('lists only projects where the caller is a member', async () => {
        const mine = {
            id: PROJECT_ID,
            name: 'Mine',
            role: 'owner' as const,
            itemCount: 2,
        };
        const theirs = {
            id: OTHER_PROJECT_ID,
            name: 'Theirs',
            role: 'owner' as const,
            itemCount: 1,
        };
        const repository = inMemoryProjectRepository(
            [mine, theirs],
            [
                { projectId: PROJECT_ID, userId: ACCOUNT_ID, role: 'owner' },
                {
                    projectId: OTHER_PROJECT_ID,
                    userId: OTHER_ACCOUNT_ID,
                    role: 'owner',
                },
            ],
        );

        const page = await makeListProjects(repository)(ACCOUNT_ID, {
            limit: 20,
            cursor: undefined,
        });

        expect(page.projects).toEqual([mine]);
    });

    it('removes a project only for its owner', async () => {
        const project = {
            id: PROJECT_ID,
            name: 'Mine',
            role: 'owner' as const,
            itemCount: 2,
        };
        const repository = inMemoryProjectRepository(
            [project],
            [
                { projectId: PROJECT_ID, userId: ACCOUNT_ID, role: 'owner' },
                { projectId: PROJECT_ID, userId: OTHER_ACCOUNT_ID, role: 'member' },
            ],
        );

        await expect(makeRemoveProject(repository)(PROJECT_ID, OTHER_ACCOUNT_ID)).rejects.toBeInstanceOf(
            ProjectNotFound,
        );
        expect(repository.projects.has(PROJECT_ID)).toBe(true);

        await makeRemoveProject(repository)(PROJECT_ID, ACCOUNT_ID);
        expect(repository.projects.has(PROJECT_ID)).toBe(false);
    });

    describe('renameProject', () => {
        function sharedProject(): InMemoryProjectRepository {
            return inMemoryProjectRepository(
                [{ id: PROJECT_ID, name: 'Mine', role: 'owner', itemCount: 2 }],
                [
                    { projectId: PROJECT_ID, userId: ACCOUNT_ID, role: 'owner' },
                    { projectId: PROJECT_ID, userId: OTHER_ACCOUNT_ID, role: 'member' },
                ],
            );
        }

        it('renames a project for its owner, trimming the name', async () => {
            const repository = sharedProject();

            const renamed = await makeRenameProject(repository)({
                projectId: PROJECT_ID,
                ownerId: ACCOUNT_ID,
                name: '  Roadmap  ',
            });

            expect(renamed).toEqual({ id: PROJECT_ID, name: 'Roadmap', role: 'owner', itemCount: 2 });
            expect(repository.projects.get(PROJECT_ID)?.name).toBe('Roadmap');
        });

        it('answers a member like an unknown project and keeps the name', async () => {
            const repository = sharedProject();

            const renaming = makeRenameProject(repository)({
                projectId: PROJECT_ID,
                ownerId: OTHER_ACCOUNT_ID,
                name: 'Taken over',
            });

            await expect(renaming).rejects.toBeInstanceOf(ProjectNotFound);
            expect(repository.projects.get(PROJECT_ID)?.name).toBe('Mine');
        });

        it('refuses an unknown project', async () => {
            const repository = sharedProject();

            const renaming = makeRenameProject(repository)({
                projectId: OTHER_PROJECT_ID,
                ownerId: ACCOUNT_ID,
                name: 'Roadmap',
            });

            await expect(renaming).rejects.toBeInstanceOf(ProjectNotFound);
        });

        it.each([
            ['empty', '   '],
            ['too long', 'x'.repeat(MAX_PROJECT_NAME_LENGTH + 1)],
        ])('refuses an %s name before persistence', async (_case, name) => {
            const repository = sharedProject();

            const renaming = makeRenameProject(repository)({ projectId: PROJECT_ID, ownerId: ACCOUNT_ID, name });

            await expect(renaming).rejects.toBeInstanceOf(InvalidProjectName);
            expect(repository.projects.get(PROJECT_ID)?.name).toBe('Mine');
        });
    });
});
