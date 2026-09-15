// Reads what the deployment exposes and pushes it to Grafana Cloud.
//
// Why this exists: Vercel runs no process between two requests, so nothing
// there scrapes anything, and Grafana Cloud cannot reach a protected endpoint
// on its own. Something outside has to pull and push -- the same reason
// relay.yml exists for the outbox.
//
// Why it is written here rather than delegated to Prometheus or Alloy in a
// container: `remote_write` is a protobuf message compressed with snappy, and
// both are small enough to produce directly. That keeps the workflow to one
// command with no image to pull, and -- the deciding reason -- it can be run
// by hand against the real endpoint, which is how it was verified before being
// committed.
//
// What it does not do: invent a series. It pushes what the endpoint returns,
// and nothing else. No label can identify a person (ADR-0016), which is what
// makes Grafana Labs a recipient of no personal data.

import { argv, env, exit, stderr, stdout } from 'node:process';

const USAGE = `npm run metrics:push [-- --pass '<json>']

Reads TARGET/internal/metrics with RELAY_SECRET and pushes it to
GRAFANA_PUSH_URL with GRAFANA_PUSH_USER and GRAFANA_PUSH_TOKEN.

  --pass <json>  the result of a delivery pass, pushed as gauges
  --dry-run      read and parse, print what would be pushed, send nothing
  --self-test    push one series named legacy22_push_check, read nothing

Every value comes from the environment; nothing is hard-coded.`;

// ---------------------------------------------------------------- protobuf

function varint(bytes, value) {
    let rest = value;
    while (rest > 0x7f) {
        bytes.push((rest & 0x7f) | 0x80);
        rest = Math.floor(rest / 128);
    }
    bytes.push(rest);
}

function delimited(bytes, tag, payload) {
    bytes.push(tag);
    varint(bytes, payload.length);
    for (const byte of payload) bytes.push(byte);
}

function text(value) {
    return [...Buffer.from(value, 'utf8')];
}

// message Label { string name = 1; string value = 2; }
function label(name, value) {
    const bytes = [];
    delimited(bytes, 0x0a, text(name));
    delimited(bytes, 0x12, text(value));
    return bytes;
}

// message Sample { double value = 1; int64 timestamp = 2; }
function sample(value, timestampMs) {
    const bytes = [0x09];
    const eight = Buffer.alloc(8);
    eight.writeDoubleLE(value);
    for (const byte of eight) bytes.push(byte);
    bytes.push(0x10);
    varint(bytes, timestampMs);
    return bytes;
}

// message TimeSeries { repeated Label labels = 1; repeated Sample samples = 2; }
function timeSeries(series, timestampMs) {
    const bytes = [];
    for (const [name, value] of Object.entries(series.labels)) {
        delimited(bytes, 0x0a, label(name, value));
    }
    delimited(bytes, 0x12, sample(series.value, timestampMs));
    return bytes;
}

// message WriteRequest { repeated TimeSeries timeseries = 1; }
export function writeRequest(all, timestampMs) {
    const bytes = [];
    for (const series of all) delimited(bytes, 0x0a, timeSeries(series, timestampMs));
    return Buffer.from(bytes);
}

// ------------------------------------------------------------------ snappy

// A snappy block made of one literal run, which the format calls an
// uncompressed literal: the varint length of the original, then a tag saying
// « what follows is N bytes of literal », then those bytes. Valid for any
// decoder, and it spares this file a compressor it would have to be trusted on.
//
// The four-byte form of the tag (63 << 2) covers every size we will ever send,
// so there is one branch instead of four.
export function snappy(data) {
    const header = [];
    varint(header, data.length);

    const tag = Buffer.alloc(5);
    tag.writeUInt8(63 << 2, 0);
    tag.writeUInt32LE(data.length - 1, 1);

    return Buffer.concat([Buffer.from(header), tag, data]);
}

// --------------------------------------------------------------- exposition

// The Prometheus text format, reduced to what our own endpoint emits: comment
// lines, then `name{label="value",...} number` or `name number`. A line it
// cannot read is refused rather than skipped -- a metric silently dropped is
// worse than a push that fails and says so.
const LINE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+(-?[\d.eE+]+|NaN|\+Inf|-Inf)$/u;
const PAIR = /^([a-zA-Z_][a-zA-Z0-9_]*)="(.*)"$/u;

// A value Prometheus writes but remote_write has no room for. Skipped rather
// than refused: an absent histogram bound is not a malformed line.
const UNSENDABLE = new Set(['NaN', '+Inf', '-Inf']);

function labelsOf(name, labelPart) {
    const labels = { __name__: name };

    for (const pair of labelPart.slice(1, -1).split(',')) {
        const entry = PAIR.exec(pair.trim());
        if (entry !== null) labels[entry[1] ?? ''] = entry[2] ?? '';
    }

    return labels;
}

function readLine(clean) {
    const match = LINE.exec(clean);
    if (match === null) throw new Error(`cannot read the exposition line: ${clean}`);

    const [, name, labelPart, raw] = match;
    if (UNSENDABLE.has(raw ?? '')) return undefined;

    return { labels: labelsOf(name ?? '', labelPart ?? ''), value: Number(raw) };
}

export function parseExposition(body) {
    const series = [];

    for (const line of body.split('\n')) {
        const clean = line.trim();
        if (clean === '' || clean.startsWith('#')) continue;

        const one = readLine(clean);
        if (one !== undefined) series.push(one);
    }

    return series;
}

// ------------------------------------------------------------- what we push

// Always present, and that is its whole purpose.
//
// A counter carrying labels emits nothing until a request has been observed,
// and on a serverless target the instance answering /internal/metrics has
// usually just started -- it has observed none. The first real run of this
// pusher therefore found « no series, nothing to push », and Grafana stayed
// empty while every part of the chain worked.
//
// This series depends on no observation. It says the deployment answered and
// the push reached Grafana, which is the one thing a dashboard must be able to
// show before anything else.
export function liveness() {
    return [{ labels: { __name__: 'legacy22_up' }, value: 1 }];
}

// The numbers a delivery pass returns, as gauges.
//
// These are the only measurements of this system that are clean on a
// serverless target: instantaneous values, so no reset to absorb and no wrong
// sum between instances. They are also the ones that say something -- an
// outbox that stops draining is visible here and nowhere else, which is the
// gain ADR-0016 announced.
export function passGauges(raw) {
    if (raw === undefined) return [];

    let pass;
    try {
        pass = JSON.parse(raw);
    } catch {
        throw new Error(`--pass is not JSON: ${raw.slice(0, 120)}`);
    }

    return ['published', 'consumed', 'failed']
        .filter(field => typeof pass[field] === 'number')
        .map(field => ({
            labels: { __name__: `legacy22_outbox_${field}` },
            value: pass[field],
        }));
}

// ------------------------------------------------------------------ the run

function required(name) {
    const value = env[name];
    if (value === undefined || value === '') throw new Error(`${name} is missing`);
    return value;
}

async function readExposition() {
    const target = required('TARGET').replace(/\/$/u, '');
    const response = await fetch(`${target}/internal/metrics`, {
        headers: { 'x-relay-secret': required('RELAY_SECRET') },
    });

    if (!response.ok) {
        throw new Error(`${target}/internal/metrics answered ${response.status}`);
    }

    return parseExposition(await response.text());
}

async function push(series) {
    const body = snappy(writeRequest(series, Date.now()));
    const credentials = `${required('GRAFANA_PUSH_USER')}:${required('GRAFANA_PUSH_TOKEN')}`;

    const response = await fetch(required('GRAFANA_PUSH_URL'), {
        method: 'POST',
        headers: {
            authorization: `Basic ${Buffer.from(credentials).toString('base64')}`,
            'content-type': 'application/x-protobuf',
            'content-encoding': 'snappy',
            'x-prometheus-remote-write-version': '0.1.0',
        },
        body,
    });

    if (!response.ok) {
        const said = (await response.text()).slice(0, 300);
        throw new Error(`the push answered ${response.status}: ${said}`);
    }

    return body.length;
}

async function run(args) {
    if (args.includes('--self-test')) {
        const sent = await push([
            { labels: { __name__: 'legacy22_push_check', source: 'push-metrics' }, value: 1 },
        ]);
        stdout.write(`self-test pushed, ${sent} bytes.\n`);
        return;
    }

    const at = args.indexOf('--pass');
    const series = [
        ...liveness(),
        ...passGauges(at === -1 ? undefined : args[at + 1]),
        ...(await readExposition()),
    ];
    const names = [...new Set(series.map(one => one.labels['__name__']))];

    if (args.includes('--dry-run')) {
        stdout.write(`${series.length} series, ${names.length} names: ${names.join(', ')}\n`);
        return;
    }

    const sent = await push(series);
    stdout.write(`${series.length} series pushed, ${sent} bytes: ${names.join(', ')}\n`);
}

// Only when invoked as a command. The three functions above are exported so a
// test can round-trip them, and importing this file must then not fire a push.
if (import.meta.url === `file://${argv[1]}`) {
    try {
        await run(argv.slice(2));
    } catch (cause) {
        stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n\n${USAGE}\n`);
        exit(1);
    }
}
