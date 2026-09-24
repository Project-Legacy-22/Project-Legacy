// Runs a delivery pass every thirty seconds for close to six hours (#410).
//
// Why a loop rather than a schedule: GitHub refuses a cron under five minutes,
// and does not keep even that -- on 24 September the scheduled relay ran at
// 21:41, 23:58, 03:39 and 08:44. A job that stays up and asks every thirty
// seconds is the only cadence a hosted runner can hold. The job then starts its
// successor (relay.yml), and the schedule is left as the net that restarts the
// chain if it ever breaks.
//
// Metrics are pushed every ten passes, summed, rather than after each one:
// Grafana Cloud would otherwise receive ten times the series for the same
// information, and the dashboard reads rates over minutes anyway.

import { execFile } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { argv, env, exit, stderr, stdout } from 'node:process';
import { setTimeout as wait } from 'node:timers/promises';
import { promisify } from 'node:util';

const FIELDS = ['published', 'consumed', 'failed'];
const EMPTY = Object.freeze({ published: 0, consumed: 0, failed: 0 });
const PASS_TIMEOUT_MS = 25_000;
const METRIC_VARIABLES = ['GRAFANA_PUSH_URL', 'GRAFANA_PUSH_USER', 'GRAFANA_PUSH_TOKEN'];

// Adds what one pass returned to the running total. A field the pass did not
// return counts as zero rather than poisoning the sum with NaN.
export function addPass(total, pass) {
    return Object.fromEntries(
        FIELDS.map(field => [field, total[field] + (typeof pass[field] === 'number' ? pass[field] : 0)]),
    );
}

// One pass, then the rest of the interval. A pass that fails is reported and
// the loop goes on: the outbox keeps the events, the next pass picks them up.
async function onePass(loop, state) {
    const started = loop.now();
    try {
        state.total = addPass(state.total, await loop.pass());
    } catch (cause) {
        state.failures += 1;
        loop.log(`::warning::delivery pass failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
    state.passes += 1;

    if (state.passes % loop.passesPerPush === 0) await flush(loop, state);

    const left = loop.intervalMs - (loop.now() - started);
    if (left > 0) await loop.sleep(left);
}

async function flush(loop, state) {
    try {
        await loop.pushMetrics(state.total);
    } catch (cause) {
        loop.log(`::warning::metrics push failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
    loop.log(`${state.passes} passes, since last push: ${JSON.stringify(state.total)}`);
    state.total = { ...EMPTY };
}

// Everything it touches is passed in, so a test drives it with a fake clock.
export async function runLoop(loop) {
    const state = { passes: 0, failures: 0, total: { ...EMPTY } };
    const end = loop.now() + loop.durationMs;

    while (loop.now() < end) await onePass(loop, state);
    if (state.passes % loop.passesPerPush !== 0) await flush(loop, state);

    return { passes: state.passes, failures: state.failures };
}

function httpPass(target, secret) {
    return async () => {
        const response = await fetch(`${target}/internal/relay`, {
            method: 'POST',
            headers: { 'x-relay-secret': secret },
            signal: AbortSignal.timeout(PASS_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`the relay answered ${response.status}`);
        return response.json();
    };
}

function metricsPush() {
    const missing = METRIC_VARIABLES.filter(name => !env[name]);
    if (missing.length > 0) {
        stdout.write(`::notice::no metrics push, missing: ${missing.join(' ')}\n`);
        return () => Promise.resolve();
    }
    const run = promisify(execFile);
    return async total => {
        await run(process.execPath, ['scripts/push-metrics.mjs', '--pass', JSON.stringify(total)]);
    };
}

function seconds(name, fallback) {
    const value = Number(env[name] ?? fallback);
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive number of seconds`);
    return value * 1000;
}

// The next job is started only after a full loop: one that stopped at once --
// an unset variable -- would otherwise start the next, which would stop at
// once, and so on as fast as GitHub can queue them.
async function main() {
    const output = env.GITHUB_OUTPUT;
    const say = async relaunch => {
        if (output) await appendFile(output, `relancer=${relaunch}\n`);
    };

    if (!env.TARGET || !env.RELAY_SECRET) {
        stdout.write('::notice::RELAY_URL or RELAY_SECRET absent, nothing to trigger.\n');
        await say(false);
        return;
    }

    const result = await runLoop({
        pass: httpPass(env.TARGET, env.RELAY_SECRET),
        pushMetrics: metricsPush(),
        sleep: ms => wait(ms),
        now: () => Date.now(),
        log: line => stdout.write(`${line}\n`),
        durationMs: seconds('RELAY_LOOP_SECONDS', 20_700),
        intervalMs: seconds('RELAY_INTERVAL_SECONDS', 30),
        passesPerPush: 10,
    });
    stdout.write(`::notice::${result.passes} passes, ${result.failures} failed\n`);
    await say(true);
}

// Compared as URLs: a checkout path with a space is escaped in one and not in
// the other.
if (argv[1] !== undefined && import.meta.url === pathToFileURL(argv[1]).href) {
    try {
        await main();
    } catch (cause) {
        stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
        exit(1);
    }
}
