// A promise a test resolves when it chooses.
//
// It exists for the states that are only observable while a request is in
// flight: a fake that resolves immediately has already finished by the time the
// click is awaited, so 'loading' can never be seen. Two suites needed that, and
// the second was about to copy the first.
export interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
}

export function deferred<T>(): Deferred<T> {
    let resolve: Deferred<T>['resolve'] = () => {
        throw new Error('Deferred promise was not initialized.');
    };
    const promise = new Promise<T>(promiseResolve => {
        resolve = promiseResolve;
    });

    return { promise, resolve };
}
