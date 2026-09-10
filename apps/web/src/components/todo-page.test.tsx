import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { labels } from '../labels';
import type { AddItemResult } from '../hooks/use-items';
import type { AddProjectResult } from '../hooks/use-projects';
import { anItem } from '../test/builders/item-builder';
import { click, createReactTestRoot, flushTimers, getElement } from '../test/react-root';
import type { ReactTestRoot } from '../test/react-root';
import { TodoPage } from './todo-page';
import type { TodoPageProps } from './todo-page';

const firstItem = anItem({ name: 'Check keyboard navigation' });
const project = {
    id: firstItem.projectId,
    name: 'My project',
    role: 'owner' as const,
    itemCount: 1,
};

let testRoot: ReactTestRoot;

function pageProps(overrides: Partial<TodoPageProps> = {}): TodoPageProps {
    return {
        items: [firstItem],
        loadState: { status: 'ready' },
        feedback: { status: 'idle' },
        isAdding: false,
        pendingItemIds: new Set(),
        hasNextPage: true,
        paginationState: { status: 'idle', announcement: '' },
        onAdd: vi.fn(async (): Promise<AddItemResult> => ({ status: 'success' })),
        onMove: vi.fn(async () => true),
        onUpdate: vi.fn(async () => true),
        onRemove: vi.fn(async () => true),
        onLoadMore: vi.fn(),
        onRetry: vi.fn(),
        selectedProject: project,
        projects: {
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
        },
        ...overrides,
    };
}

async function renderPage(overrides: Partial<TodoPageProps> = {}) {
    document.documentElement.lang = 'en';
    document.title = 'Todo list | Legacy 22';
    await testRoot.render(<TodoPage {...pageProps(overrides)} />);
}

beforeEach(() => {
    testRoot = createReactTestRoot();
});

afterEach(async () => {
    await testRoot.unmount();
});

describe('TodoPage accessibility', () => {
    it('has no automatically detectable WCAG A or AA violation', async () => {
        await renderPage();

        const initial = await axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
            // axe documents that this rule cannot produce reliable results in jsdom.
            rules: { 'color-contrast': { enabled: false } },
        });
        await click(getElement<HTMLButtonElement>('.item-edit'));
        const editing = await axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
            rules: { 'color-contrast': { enabled: false } },
        });
        await click(getElement<HTMLButtonElement>('.item-edit-actions .button-secondary'));
        await flushTimers();
        await click(getElement<HTMLButtonElement>('.item-move'));
        const moving = await axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
            rules: { 'color-contrast': { enabled: false } },
        });

        expect(
            [...initial.violations, ...editing.violations, ...moving.violations].map((violation) => ({
                id: violation.id,
                targets: violation.nodes.flatMap((node) => node.target),
            })),
        ).toEqual([]);
    });

    it('links every input help reference to an existing element', async () => {
        await renderPage();

        const input = getElement<HTMLInputElement>('#item-name');
        const referenceIds = input.getAttribute('aria-describedby')?.split(/\s+/u) ?? [];
        expect(referenceIds.length).toBeGreaterThan(0);
        expect(referenceIds.map((id) => document.getElementById(id)?.id)).toEqual(referenceIds);
    });

    it('announces errors and successful actions', async () => {
        await renderPage({
            items: [],
            loadState: { status: 'error', message: labels.loadItemsFailed },
            feedback: { status: 'error', message: labels.updateItemFailed },
        });

        expect(document.querySelectorAll('[role="alert"]')).toHaveLength(2);
        expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
    });

    it('disables creation until the initial list is ready', async () => {
        await renderPage({ items: [], loadState: { status: 'loading' } });

        expect(getElement<HTMLInputElement>('#item-name').disabled).toBe(true);
        expect(getElement<HTMLButtonElement>('.add-form .button-primary').disabled).toBe(true);
        expect(document.querySelector('[role="status"]')?.textContent).toBe(labels.loadingItems);
    });

    it('shows an explicit empty state when the list is ready', async () => {
        await renderPage({
            items: [],
            loadState: { status: 'ready' },
            hasNextPage: false,
        });

        expect(document.querySelector('.empty-message')?.textContent).toBe(labels.emptyItems);
        expect(document.querySelectorAll('.kanban-column')).toHaveLength(3);
    });

    it('moves focus to the list heading before retry removes its button', async () => {
        const onRetry = vi.fn();
        await renderPage({
            items: [],
            loadState: { status: 'error', message: labels.loadItemsFailed },
            onRetry,
        });

        const retry = getElement<HTMLButtonElement>('.error-message button');
        retry.focus();
        await click(retry);

        expect(onRetry).toHaveBeenCalledOnce();
        expect(document.activeElement).toBe(getElement('#items-heading'));
    });

    it('offers an explicit remediation for a legacy item without a name', async () => {
        await renderPage({ items: [{ ...firstItem, name: null }] });

        const toggle = getElement<HTMLButtonElement>('.button-secondary');
        expect(toggle.disabled).toBe(true);
        expect(document.body.textContent).toContain(labels.unnamedItemRemediation);
    });
});
