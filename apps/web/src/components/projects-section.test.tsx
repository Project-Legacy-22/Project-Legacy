import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AddProjectResult } from '../hooks/use-projects';
import { labels } from '../labels';
import { click, createReactTestRoot, getElement, submitForm } from '../test/react-root';
import type { ReactTestRoot } from '../test/react-root';
import { ProjectsSection } from './projects-section';
import type { ProjectsSectionProps } from './projects-section';

const project = {
    id: '00000000-0000-7000-8000-000000000010',
    name: 'Release planning',
    role: 'owner' as const,
    itemCount: 7,
};

let root: ReactTestRoot;

function props(overrides: Partial<ProjectsSectionProps> = {}): ProjectsSectionProps {
    return {
        projects: [project],
        selectedProjectId: project.id,
        loadState: { status: 'ready' },
        feedback: { status: 'idle' },
        isAdding: false,
        pendingProjectId: null,
        hasNextPage: false,
        paginationState: { status: 'idle', announcement: '' },
        onSelect: vi.fn(),
        onAdd: vi.fn(async (): Promise<AddProjectResult> => ({
            status: 'success',
        })),
        onRemove: vi.fn(async () => true),
        onLoadMore: vi.fn(),
        onRetry: vi.fn(),
        ...overrides,
    };
}

beforeEach(() => {
    document.documentElement.lang = 'en';
    document.title = 'Projects | Legacy 22';
    root = createReactTestRoot();
});

afterEach(async () => {
    await root.unmount();
    vi.unstubAllGlobals();
});

describe('ProjectsSection', () => {
    it('has no automatically detectable WCAG A or AA violation', async () => {
        await root.render(<ProjectsSection {...props()} />);

        const results = await axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
            rules: { 'color-contrast': { enabled: false } },
        });

        expect(results.violations.map((violation) => violation.id)).toEqual([]);
    });

    it('names the project and exact item count before deletion', async () => {
        const confirm = vi.fn((_message: string) => true);
        const onRemove = vi.fn(async () => true);
        vi.stubGlobal('confirm', confirm);
        await root.render(<ProjectsSection {...props({ onRemove })} />);

        await click(getElement<HTMLButtonElement>('.project-remove'));

        expect(confirm).toHaveBeenCalledWith(labels.confirmProjectRemoval(project.name, project.itemCount));
        expect(confirm.mock.calls[0]?.[0]).toContain('7 items');
        expect(onRemove).toHaveBeenCalledWith(project);
    });

    it('keeps deletion unavailable to a member who is not an owner', async () => {
        await root.render(<ProjectsSection {...props({ projects: [{ ...project, role: 'member' }] })} />);

        expect(document.querySelector('.project-remove')).toBeNull();
    });

    it('attaches an empty-name error to the project field and announces it', async () => {
        await root.render(<ProjectsSection {...props()} />);

        await submitForm(getElement<HTMLFormElement>('.project-form'));

        const input = getElement<HTMLInputElement>('#project-name');
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(input.getAttribute('aria-describedby')).toContain('project-name-error');
        expect(getElement('#project-name-error').getAttribute('role')).toBe('alert');
    });
});
