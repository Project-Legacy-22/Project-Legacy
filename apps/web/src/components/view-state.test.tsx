import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { labels } from '../labels';
import { click, createReactTestRoot, getElement } from '../test/react-root';
import type { ReactTestRoot } from '../test/react-root';
import { ViewState } from './view-state';
import type { ViewStateProps } from './view-state';

// The four views of this application went through these three states in four
// different ways. What they must all do now is decided here, so a change to one
// of them cannot quietly apply to only one screen.

let root: ReactTestRoot;

function props(overrides: Partial<ViewStateProps> = {}): ViewStateProps {
    return {
        state: { status: 'ready' },
        loadingMessage: labels.loadingItems,
        onRetry: vi.fn(),
        children: <p className="the-data">two items</p>,
        ...overrides,
    };
}

const fillable = {
    isEmpty: true,
    message: labels.emptyItems,
    action: { label: labels.addItem, onAction: vi.fn() },
};

async function axeViolations(): Promise<readonly { id: string }[]> {
    const results = await axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
        // axe documents that this rule cannot produce reliable results in jsdom.
        rules: { 'color-contrast': { enabled: false } },
    });

    return results.violations;
}

beforeEach(() => {
    document.documentElement.lang = 'en';
    document.title = 'Items | Legacy 22';
    root = createReactTestRoot();
});

afterEach(async () => {
    await root.unmount();
});

describe('ViewState', () => {
    it('announces what is loading politely, and shows nothing else yet', async () => {
        await root.render(
            <ViewState {...props({ state: { status: 'loading' }, empty: fillable })} />,
        );

        // role="status" is a polite live region: it announces without
        // interrupting, and it does not move the focus.
        expect(getElement<HTMLElement>('[role="status"]').textContent).toBe(labels.loadingItems);
        expect(document.querySelector('.empty-message')).toBeNull();
        expect(document.querySelector('.the-data')).toBeNull();
    });

    it('keeps the data on screen while it is refreshed', async () => {
        await root.render(<ViewState {...props({ state: { status: 'loading' } })} />);

        // A refresh must not blank what somebody is reading, and it must still
        // say that something is happening.
        expect(getElement<HTMLElement>('[role="status"]')).not.toBeNull();
        expect(getElement<HTMLElement>('.the-data')).not.toBeNull();
    });

    it('says what is missing and offers what fills it', async () => {
        const onAction = vi.fn();
        await root.render(
            <ViewState
                {...props({ empty: { ...fillable, action: { label: labels.addItem, onAction } } })}
            />,
        );

        const empty = getElement<HTMLElement>('.empty-message');
        expect(empty.querySelector('p')?.textContent).toBe(labels.emptyItems);

        await click(getElement<HTMLButtonElement>('.empty-message button'));
        expect(onAction).toHaveBeenCalledTimes(1);
    });

    it('offers no action when nothing on the screen can fill the view', async () => {
        await root.render(
            <ViewState
                {...props({
                    empty: {
                        isEmpty: true,
                        message: labels.emptyNotifications,
                        unfillable: 'Notifications arrive from task events, not from this screen.',
                    },
                })}
            />,
        );

        expect(document.querySelector('.empty-message button')).toBeNull();
    });

    it('keeps a scaffold that is not data, and hides a list that is', async () => {
        await root.render(<ViewState {...props({ empty: fillable })} />);
        expect(document.querySelector('.the-data')).toBeNull();

        await root.unmount();
        root = createReactTestRoot();

        // The Kanban board keeps its three columns when it holds no task: the
        // columns are the workflow, not the data.
        await root.render(<ViewState {...props({ empty: fillable, keepsChildrenWhenEmpty: true })} />);
        expect(getElement<HTMLElement>('.the-data')).not.toBeNull();
    });

    it('reports a failure as an alert and gives a way back', async () => {
        const onRetry = vi.fn();
        await root.render(
            <ViewState
                {...props({ state: { status: 'error', message: 'Unable to load the items.' }, onRetry })}
            />,
        );

        const alert = getElement<HTMLElement>('[role="alert"]');
        expect(alert.querySelector('p')?.textContent).toBe('Unable to load the items.');
        expect(document.querySelector('.the-data')).toBeNull();

        await click(getElement<HTMLButtonElement>('[role="alert"] button'));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('carries no technical detail into the message it shows', async () => {
        await root.render(
            <ViewState
                {...props({
                    state: { status: 'error', message: 'Unable to load the items.' },
                })}
            />,
        );

        // The message is whatever the caller passed, and the component adds
        // nothing to it: no status code, no stack, no request identifier. What
        // the caller passes is the sentence its own api module wrote.
        const alert = getElement<HTMLElement>('[role="alert"]');
        expect(alert.textContent).toBe(`Unable to load the items.${labels.retry}`);
    });

    it('has no automatically detectable WCAG A or AA violation in any of the three states', async () => {
        await root.render(
            <ViewState {...props({ state: { status: 'loading' }, empty: fillable })} />,
        );
        expect(await axeViolations()).toEqual([]);

        await root.render(<ViewState {...props({ empty: fillable })} />);
        expect(await axeViolations()).toEqual([]);

        await root.render(
            <ViewState {...props({ state: { status: 'error', message: 'Unable to load.' } })} />,
        );
        expect(await axeViolations()).toEqual([]);
    });
});
