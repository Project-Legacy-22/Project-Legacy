import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ItemDto, ItemsApi, ItemStatus } from './api/items-api';
import { ApiError } from './api/items-api';
import { App } from './app';
import { labels } from './labels';
import { createApi, createAuth, createProjectsApi, itemPage } from './test/app-fixture';
import { anItem } from './test/builders/item-builder';
import {
    click,
    createReactTestRoot,
    flushTimers,
    focusOrder,
    getElement,
    setSelectValue,
    submitForm,
    tab,
    tabbables,
    waitFor,
} from './test/react-root';
import type { ReactTestRoot } from './test/react-root';

// The half of US-14 that #181 could not measure: the audit of the board itself.
//
// The report of docs/features/15-accessibility-audit.md said so in as many
// words -- « The Kanban board and the end-to-end keyboard path are out of
// scope. They are in #182, which waits on the code that does not exist yet. »
// The code exists now, so the measurement belongs here, and repeated rather
// than taken once: a measurement no test repeats is a snapshot.
//
// What is audited is each state the board actually has, because a component
// passes axe in one state and fails in another: three columns filled, a column
// left empty, the move form open, a move in flight, a move refused.

// Held as constants rather than read back from the items: ItemDto.name is
// nullable in the contracts -- a notification outlives the task it points at --
// so the fixture is the only place that knows the name is there.
const TODO_NAME = 'Plan the review';
const DOING_NAME = 'Write the demo';
const DONE_NAME = 'Create the board';

const TODO = anItem({ name: TODO_NAME, status: 'todo', version: 3 });
const DOING = anItem({
    id: '00000000-0000-7000-8000-000000000021',
    name: DOING_NAME,
    status: 'doing',
    version: 2,
});
const DONE = anItem({
    id: '00000000-0000-7000-8000-000000000022',
    name: DONE_NAME,
    status: 'done',
    version: 4,
});

let root: ReactTestRoot;

async function render(api: ItemsApi): Promise<void> {
    await root.render(<App api={api} auth={createAuth()} projects={createProjectsApi()} />);
    await flushTimers();
}

async function renderWith(
    items: readonly ItemDto[],
    overrides: Partial<ItemsApi> = {},
): Promise<void> {
    await render(createApi({ listItems: vi.fn(async () => itemPage(items)), ...overrides }));
}

function moveButton(item: ItemDto): HTMLButtonElement {
    return getElement(`[data-move-item-id="${item.id}"]`);
}

function column(status: ItemStatus): HTMLElement {
    return getElement(`[data-kanban-status="${status}"]`);
}

// The whole document, and the same three tag sets #181 used, so a gap found
// here is comparable with what the report already records.
async function violations(): Promise<readonly axe.Result[]> {
    const results = await axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
        // axe documents that this rule gives no reliable result in jsdom.
        // Contrast is measured from the tokens by styles/contrast.test.ts.
        rules: { 'color-contrast': { enabled: false } },
    });

    return results.violations;
}

function named(found: readonly axe.Result[]): string[] {
    return found.map(violation => `${violation.id}: ${violation.nodes.length} noeud(s)`);
}

beforeEach(() => {
    // Set by hand, as every axe suite of this repository does: jsdom loads no
    // real document, and without them axe reports a page with neither a
    // language nor a title -- a gap of index.html, not of the board.
    document.documentElement.lang = 'en';
    document.title = 'Board | Legacy 22';
    root = createReactTestRoot();
});

afterEach(async () => {
    await root.unmount();
    vi.clearAllMocks();
});

describe('the Kanban board against WCAG 2.1 AA', () => {
    it('passes with the three columns filled', async () => {
        await renderWith([TODO, DOING, DONE]);

        expect(named(await violations())).toEqual([]);
    });

    // An empty column is not the filled one with fewer rows: it replaces the
    // list with a sentence, so the tree it produces is a different one.
    it('passes with two columns left empty', async () => {
        await renderWith([TODO]);

        expect(column('doing').textContent).toContain(labels.emptyColumn('doing'));
        expect(named(await violations())).toEqual([]);
    });

    it('passes with the move form open', async () => {
        await renderWith([TODO, DOING, DONE]);
        await click(moveButton(TODO));

        expect(document.querySelector('.move-item-form')).not.toBeNull();
        expect(named(await violations())).toEqual([]);
    });

    // aria-busy is set on the column while a move is in flight. A busy region
    // is a state of the tree like any other, and one axe checks.
    it('passes while a move is in flight', async () => {
        let release = (): void => undefined;
        const moveItem = vi.fn<ItemsApi['moveItem']>(
            async () =>
                new Promise(resolve => {
                    release = () => resolve({ ...TODO, status: 'doing', version: 4 });
                }),
        );
        await renderWith([TODO, DOING, DONE], { moveItem });

        await click(moveButton(TODO));
        await setSelectValue(getElement<HTMLSelectElement>('.move-item-form select'), 'doing');
        await submitForm(getElement<HTMLFormElement>('.move-item-form'));
        await waitFor(() => column('todo').getAttribute('aria-busy') === 'true');

        expect(named(await violations())).toEqual([]);

        release();
        await flushTimers();
    });

    it('passes when a move was refused', async () => {
        const moveItem = vi.fn<ItemsApi['moveItem']>(async () => {
            throw new ApiError(409, 'conflict');
        });
        await renderWith([TODO, DOING, DONE], { moveItem });

        await click(moveButton(TODO));
        await setSelectValue(getElement<HTMLSelectElement>('.move-item-form select'), 'doing');
        await submitForm(getElement<HTMLFormElement>('.move-item-form'));
        await flushTimers();

        expect(named(await violations())).toEqual([]);
    });
});

describe('the tab order across the board', () => {
    // Left to right, column by column, which is the order the columns are read
    // in. A column that reordered its own stops would put the move button of
    // one task before the name of another.
    it('visits each task of a column before moving to the next column', async () => {
        await renderWith([TODO, DOING, DONE]);

        const order = focusOrder(getElement('.kanban-board'));
        const rank = (name: string): number => order.findIndex(stop => stop.includes(name));

        expect(rank(TODO_NAME)).toBeGreaterThan(-1);
        expect(rank(TODO_NAME)).toBeLessThan(rank(DOING_NAME));
        expect(rank(DOING_NAME)).toBeLessThan(rank(DONE_NAME));
    });

    // An empty column has no stop of its own, so Tab must step over it rather
    // than land on the sentence that stands in for the list.
    it('steps over an empty column instead of stopping in it', async () => {
        await renderWith([TODO]);

        const stops = tabbables(getElement('.kanban-board'));
        const empty = column('done');

        expect(stops.some(stop => empty.contains(stop))).toBe(false);
        expect(stops.length).toBeGreaterThan(0);
    });

    // The behaviour useFocusedMove exists for: the task moves to another
    // column, so the button that was focused is unmounted and remounted
    // elsewhere. Without it, focus falls back to the body and a keyboard user
    // starts the board again from the top.
    it('keeps focus on the moved task after it changed column', async () => {
        const moved = { ...TODO, status: 'doing' as const, version: 4 };
        const moveItem = vi.fn<ItemsApi['moveItem']>(async () => moved);
        await renderWith([TODO, DOING, DONE], { moveItem });

        await click(moveButton(TODO));
        await setSelectValue(getElement<HTMLSelectElement>('.move-item-form select'), 'doing');
        await submitForm(getElement<HTMLFormElement>('.move-item-form'));
        await flushTimers();

        expect(column('doing').textContent).toContain(TODO_NAME);
        expect(document.activeElement).toBe(moveButton(TODO));
    });

    it('reaches the board from the keyboard alone, without a pointer', async () => {
        await renderWith([TODO, DOING, DONE]);

        const target = moveButton(TODO);
        let stop = await tab();
        for (let steps = 0; steps < 60 && stop !== target; steps += 1) stop = await tab();

        expect(stop).toBe(target);
    });
});
