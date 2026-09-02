import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';

export interface ReactTestRoot {
    render(node: ReactNode): Promise<void>;
    unmount(): Promise<void>;
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
