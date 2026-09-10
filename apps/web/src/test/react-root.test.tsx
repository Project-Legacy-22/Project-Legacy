import { describe, expect, it, vi } from 'vitest';

import { createReactTestRoot, focusOrder, pressKey, tab, tabbables } from './react-root';

// The harness simulates the keyboard, and the journey tests trust it
// entirely: a mistake here breaks nothing, it makes a test that should be red
// pass. That is why it is tested in turn, against DOM written by hand rather
// than against a product component -- we verify the tool, not what it
// measures.

function mount(html: string): void {
    document.body.replaceChildren();
    const holder = document.createElement('div');
    holder.innerHTML = html;
    document.body.append(holder);
}

describe('accessible name in focusOrder', () => {
    it('names a field by its label, for want of text content', () => {
        mount(`
            <label for="courriel">Email address</label>
            <input id="courriel" name="email" />
        `);

        expect(focusOrder()).toEqual(['input:Email address']);
    });

    it('tells two fields of the same form apart', () => {
        // The reason name resolution exists. Falling back to text content
        // would name both fields the empty string, and a test comparing that
        // order would still pass after someone had swapped the two.
        mount(`
            <label for="mdp">New password</label>
            <input id="mdp" type="password" />
            <label for="confirmation">Confirm password</label>
            <input id="confirmation" type="password" />
        `);

        expect(focusOrder()).toEqual([
            'input:New password',
            'input:Confirm password',
        ]);
    });

    it('prefers aria-label over the associated label', () => {
        mount(`
            <label for="q">Visible label</label>
            <input id="q" aria-label="Explicit name" />
        `);

        expect(focusOrder()).toEqual(['input:Explicit name']);
    });

    it('ignores an empty aria-label instead of taking it for a name', () => {
        // The trap the previous version missed: ?? does not trigger on an
        // empty string, only on null or undefined.
        mount(`
            <label for="r">Visible label</label>
            <input id="r" aria-label="  " />
        `);

        expect(focusOrder()).toEqual(['input:Visible label']);
    });

    it('follows aria-labelledby', () => {
        mount(`
            <span id="titre">Search a task</span>
            <input aria-labelledby="titre" />
        `);

        expect(focusOrder()).toEqual(['input:Search a task']);
    });

    it('falls back to the name attribute when nothing names the field', () => {
        mount('<input name="token" />');

        expect(focusOrder()).toEqual(['input:token']);
    });
});

describe('tabbables', () => {
    it('refuses to return an order a positive tabindex has reordered', () => {
        // Failing loudly beats returning a wrong order: a positive tabindex
        // moves the element without the DOM showing it, so the simulation
        // would lie.
        mount('<button>One</button><button tabindex="2">Two</button>');

        expect(() => tabbables()).toThrow(/positive tabindex/u);
    });

    it('drops disabled elements', () => {
        mount('<button>Active</button><button disabled>Inert</button>');

        expect(focusOrder()).toEqual(['button:Active']);
    });

    it('keeps elements marked aria-disabled', () => {
        // That is the whole point of the choice made on the pagination:
        // aria-disabled announces unavailability without removing the element
        // from the order, so whoever stands on it does not lose focus.
        mount('<button aria-disabled="true">Next page</button>');

        expect(focusOrder()).toEqual(['button:Next page']);
    });

    it('drops elements taken out of the order by a negative tabindex', () => {
        mount('<h1 tabindex="-1">Title</h1><button>Continue</button>');

        expect(focusOrder()).toEqual(['button:Continue']);
    });

    it('keeps an element hidden visually but still reachable', () => {
        // The skip link is exactly that case: invisible on screen, present to
        // the keyboard. Filtering it out would mean never testing it.
        mount('<a href="#main-content" class="visually-hidden">Skip to content</a>');

        expect(focusOrder()).toEqual(['a:Skip to content']);
    });
});

describe('tab', () => {
    it('enters at the first element from the document body', async () => {
        mount('<button>One</button><button>Two</button>');

        expect((await tab())?.textContent).toBe('One');
    });

    it('enters at the last element with Shift', async () => {
        mount('<button>One</button><button>Two</button>');

        expect((await tab({ shift: true }))?.textContent).toBe('Two');
    });

    it('moves forward then back along the same path', async () => {
        mount('<button>One</button><button>Two</button><button>Three</button>');

        await tab();
        expect((await tab())?.textContent).toBe('Two');
        expect((await tab({ shift: true }))?.textContent).toBe('One');
    });

    it('wraps from the last to the first, which a browser does not', async () => {
        // A real browser would leave for its own toolbar. The simulation
        // wraps, which makes journeys easy to write but forbids concluding
        // anything about leaving the page.
        mount('<button>One</button><button>Two</button>');

        await tab();
        await tab();
        expect((await tab())?.textContent).toBe('One');
    });

    it('returns null when nothing is reachable', async () => {
        mount('<p>Nothing to reach</p>');

        expect(await tab()).toBeNull();
    });
});

describe('pressKey', () => {
    it('emits keydown then keyup with the requested key', async () => {
        mount('<button>Submit</button>');
        const button = document.querySelector('button') as HTMLButtonElement;
        const seen: string[] = [];
        button.addEventListener('keydown', event => seen.push(`down:${event.key}`));
        button.addEventListener('keyup', event => seen.push(`up:${event.key}`));

        await pressKey(button, 'Enter');

        expect(seen).toEqual(['down:Enter', 'up:Enter']);
    });

    it('bubbles the event to ancestors', async () => {
        // React attaches its handlers at the root: without bubbling, no
        // keyboard journey of the product would trigger anything at all.
        mount('<div><button>Submit</button></div>');
        const listener = vi.fn();
        document.body.addEventListener('keydown', listener);

        await pressKey(document.querySelector('button') as HTMLButtonElement, 'Escape');

        expect(listener).toHaveBeenCalledOnce();
        document.body.removeEventListener('keydown', listener);
    });

    it('passes the modifiers through', async () => {
        mount('<input />');
        const field = document.querySelector('input') as HTMLInputElement;
        const seen: boolean[] = [];
        field.addEventListener('keydown', event => seen.push(event.shiftKey));

        await pressKey(field, 'Tab', { shiftKey: true });

        expect(seen).toEqual([true]);
    });
});

describe('createReactTestRoot', () => {
    it('empties the document on unmount, so the next test starts clean', async () => {
        const root = createReactTestRoot();
        await root.render(<button>Present</button>);
        expect(document.querySelectorAll('button')).toHaveLength(1);

        await root.unmount();

        expect(document.body.children).toHaveLength(0);
    });
});
