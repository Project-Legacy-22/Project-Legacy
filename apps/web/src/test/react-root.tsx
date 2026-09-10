import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';

export interface ReactTestRoot {
    render: (node: ReactNode) => Promise<void>;
    unmount: () => Promise<void>;
}

export function createReactTestRoot(): ReactTestRoot {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
        configurable: true,
        value: true,
    });

    document.body.replaceChildren();
    const container = document.createElement('div');
    document.body.append(container);
    const root: Root = createRoot(container);

    return {
        async render(node) {
            await act(async () => root.render(node));
        },
        async unmount() {
            await act(async () => root.unmount());
            document.body.replaceChildren();
        },
    };
}

export function getElement<T extends Element>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (element === null) throw new Error(`Expected element ${selector}.`);
    return element;
}

export async function setInputValue(input: HTMLInputElement, value: string): Promise<void> {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (valueSetter === undefined) throw new Error('The input value setter is unavailable.');

    await act(async () => {
        valueSetter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

export async function submitForm(form: HTMLFormElement): Promise<void> {
    await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await Promise.resolve();
    });
}

export async function click(element: HTMLElement): Promise<void> {
    await act(async () => {
        element.click();
        await Promise.resolve();
    });
}

export async function flushTimers(): Promise<void> {
    await act(async () => new Promise(resolve => globalThis.setTimeout(resolve, 0)));
}

// The keyboard.
//
// jsdom does not implement sequential navigation: pressing Tab moves nothing
// there. These four helpers simulate it, and a simulation is not a browser --
// they ignore inert, the shadow DOM, contenteditable and iframes, none of
// which exists in this interface. The day one of them appears, this comment is
// the reminder that these helpers need revisiting.
//
// They live here rather than in @testing-library/user-event: forty lines, and
// the suite already queries the DOM by selector, so a second idiom for half
// the tests would cost more than it brings. The day a Kanban board brings a
// roving tabindex, the question comes back -- and there, the dependency earns
// its place.

const FOCUSABLES = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    '[tabindex]',
].join(',');

export async function pressKey(
    element: HTMLElement,
    key: string,
    init: KeyboardEventInit = {},
): Promise<void> {
    await act(async () => {
        const common = { key, bubbles: true, cancelable: true, ...init };
        element.dispatchEvent(new KeyboardEvent('keydown', common));
        element.dispatchEvent(new KeyboardEvent('keyup', common));
        await Promise.resolve();
    });
}

// What Tab would visit, in document order.
//
// aria-disabled does not remove an element from the tab order, unlike
// disabled: that is the whole point of the choice made on the pagination
// button, which keeps focus instead of losing it by turning inert.
export function tabbables(root: ParentNode = document): HTMLElement[] {
    const candidates = [...root.querySelectorAll<HTMLElement>(FOCUSABLES)];

    const positive = candidates.find(element => Number(element.getAttribute('tabindex')) > 0);
    if (positive !== undefined) {
        // A positive tabindex reorders the path without the DOM showing it.
        // There is none today; the day there is one, these helpers would lie.
        // Failing loudly beats returning an order that is wrong.
        throw new Error(
            `positive tabindex on ${positive.tagName.toLowerCase()}: order cannot be simulated.`,
        );
    }

    return candidates.filter(element => {
        if (element.hasAttribute('disabled')) return false;
        if (element.getAttribute('tabindex') === '-1') return false;
        // An element hidden from view by .visually-hidden stays focusable --
        // the skip link is exactly that -- so it is not filtered out here.
        return true;
    });
}

export async function tab({ shift = false } = {}): Promise<HTMLElement | null> {
    const path = tabbables();
    const current = document.activeElement;
    const start = current instanceof HTMLElement ? path.indexOf(current) : -1;

    // From the body, Tab enters at the first stop and Shift+Tab at the last.
    const next = shift ? (start <= 0 ? path.length : start) - 1 : (start + 1) % path.length;

    const target = path[next] ?? null;
    if (target !== null) await act(async () => target.focus());
    return target;
}

// The accessible name, resolved in the order the accessibility tree resolves
// it: aria-label, then aria-labelledby, then the associated label, then the
// content.
//
// The label matters because a field has no text content: without it, every
// field of a form carries the same empty name and they become
// indistinguishable in a tab order. A test comparing that order would then
// pass even after two fields had been swapped.

// A source names nothing when it is absent, and no more when it is empty: an
// aria-label full of spaces is an oversight, not a name. That is what ?? alone
// did not see, a field then receiving the empty string.
function firstNonEmpty(...sources: (string | null | undefined)[]): string {
    for (const source of sources) {
        const trimmed = source?.trim();
        if (trimmed !== undefined && trimmed !== '') return trimmed;
    }
    return '';
}

// Only form controls carry an associated label, and it is their only name:
// they have no text content.
function associatedLabel(element: HTMLElement): string | null | undefined {
    const isFormControl =
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement;

    return isFormControl ? element.labels?.[0]?.textContent : undefined;
}

export function accessibleName(element: HTMLElement): string {
    const reference = element.getAttribute('aria-labelledby');

    return firstNonEmpty(
        element.getAttribute('aria-label'),
        reference === null ? undefined : document.getElementById(reference)?.textContent,
        associatedLabel(element),
        element.textContent,
        element.getAttribute('name'),
    );
}

// The tab order in a form that reads in a test failure: the accessible name
// rather than the node, which says nothing once printed.
export function focusOrder(root: ParentNode = document): string[] {
    return tabbables(root).map(
        element => `${element.tagName.toLowerCase()}:${accessibleName(element).slice(0, 40)}`,
    );
}
