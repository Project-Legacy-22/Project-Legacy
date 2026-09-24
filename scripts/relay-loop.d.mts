// Types of what test/relay-loop.test.ts imports from relay-loop.mjs.

export interface PassResult {
    published: number;
    consumed: number;
    failed: number;
}

export interface Loop {
    pass: () => Promise<Partial<PassResult>>;
    pushMetrics: (total: PassResult) => Promise<void>;
    sleep: (ms: number) => Promise<void>;
    now: () => number;
    log: (line: string) => void;
    durationMs: number;
    intervalMs: number;
    passesPerPush: number;
}

export function addPass(total: PassResult, pass: Partial<PassResult>): PassResult;
export function runLoop(loop: Loop): Promise<{ passes: number; failures: number }>;
