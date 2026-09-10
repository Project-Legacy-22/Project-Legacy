import { describe, expect, it } from 'vitest';

import { inMemoryProjectRepository } from '../../test/fakes/in-memory-project-repository.js';
import { InvalidProjectName, ProjectNotFound } from '../domain/project.js';
import { makeAddProject } from './add-project.js';
import { makeListProjects } from './list-projects.js';
import { makeRemoveProject } from './remove-project.js';

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
});
