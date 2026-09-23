import { useEffect, useState } from 'react';

// Delays reflecting a fast-changing value (the search field) so a request is
// not fired on every keystroke. The value itself updates immediately; only
// what this hook returns lags behind.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(timer);
    }, [value, delayMs]);

    return debounced;
}
