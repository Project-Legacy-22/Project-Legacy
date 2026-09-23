import { z } from 'zod';
import { ProblemDetails } from '@legacy/contracts';

import { OPERATIONS } from './catalog.js';
import type { Access, Operation } from './catalog.js';

// Builds the OpenAPI 3.1 document from the catalog (#45). OpenAPI 3.1 uses
// JSON Schema 2020-12, which is what zod 4 renders natively: no dependency is
// needed to go from the contracts to the document.

type Json = Record<string, unknown>;

const ERRORS: Readonly<Record<number, string>> = {
    400: 'The request is malformed or a value is invalid',
    401: 'No valid session',
    403: 'Refused for this caller or this resource',
    404: 'Not found, or not visible to the caller',
    409: 'Changed by another request, or a rule of the resource forbids it',
    413: 'The body is over 16 KiB',
    422: 'Understood but not confirmed',
    429: 'Too many attempts; Retry-After gives the seconds to wait',
    500: 'A failure on our side; quote the traceId',
    503: 'A dependency is throttled, too slow or unreachable; Retry-After gives the seconds to wait',
};

// What every route of an access level can answer, whatever it does.
const COMMON_ERRORS: Readonly<Record<Access, readonly number[]>> = {
    public: [400, 413, 500, 503],
    session: [400, 401, 413, 500, 503],
    relay: [403, 500, 503],
};

// A format says the same as the long pattern zod emits beside it, and says it
// in a way a reader and a tool both understand.
function withoutRedundantPatterns(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(withoutRedundantPatterns);
    if (typeof value !== 'object' || value === null) return value;

    const entries = Object.entries(value).filter(([key]) => key !== '$schema');
    const cleaned: Json = Object.fromEntries(entries.map(([key, inner]) => [key, withoutRedundantPatterns(inner)]));
    if ('format' in cleaned && 'pattern' in cleaned) delete cleaned.pattern;
    return cleaned;
}

function schemaOf(schema: z.ZodType, io: 'input' | 'output'): Json {
    return withoutRedundantPatterns(z.toJSONSchema(schema, { io, unrepresentable: 'any' })) as Json;
}

function parametersOf(schema: z.ZodObject | undefined, place: 'path' | 'query'): Json[] {
    if (schema === undefined) return [];
    const rendered = schemaOf(schema, 'input') as { properties?: Json; required?: string[] };
    const required = new Set(rendered.required ?? []);

    return Object.entries(rendered.properties ?? {}).map(([name, property]) => ({
        name,
        in: place,
        required: place === 'path' || required.has(name),
        schema: property,
    }));
}

function successOf(success: Operation['success']): Json {
    if (success.schema !== undefined) {
        return { description: success.description, content: { 'application/json': { schema: schemaOf(success.schema, 'output') } } };
    }
    if (success.contentType !== undefined) {
        return { description: success.description, content: { [success.contentType]: { schema: { type: 'string' } } } };
    }
    return { description: success.description };
}

function responsesOf(operation: Operation): Json {
    const statuses = [...new Set([...COMMON_ERRORS[operation.access], ...(operation.errors ?? [])])].sort((left, right) => left - right);
    const responses: Json = { [String(operation.success.status)]: successOf(operation.success) };
    for (const status of statuses) {
        responses[String(status)] = { $ref: `#/components/responses/Error${String(status)}` };
    }
    return responses;
}

const SECURITY: Readonly<Record<Access, Json[] | undefined>> = {
    public: undefined,
    session: [{ session: [] }],
    relay: [{ relaySecret: [] }],
};

function operationOf(operation: Operation): Json {
    const parameters = [...parametersOf(operation.params, 'path'), ...parametersOf(operation.query, 'query')];
    const security = SECURITY[operation.access];

    return {
        tags: [operation.tag],
        summary: operation.summary,
        operationId: `${operation.method}${operation.path.replaceAll(/[/:-]+(\w)/gu, (_, letter: string) => letter.toUpperCase())}`,
        ...(parameters.length > 0 ? { parameters } : {}),
        ...(operation.body === undefined
            ? {}
            : { requestBody: { required: true, content: { 'application/json': { schema: schemaOf(operation.body, 'input') } } } }),
        responses: responsesOf(operation),
        ...(security === undefined ? {} : { security }),
    };
}

function pathsOf(operations: readonly Operation[]): Json {
    const paths: Record<string, Json> = {};
    for (const operation of operations) {
        const path = operation.path.replaceAll(/:(\w+)/gu, '{$1}');
        paths[path] = { ...paths[path], [operation.method]: operationOf(operation) };
    }
    return paths;
}

function errorResponses(): Json {
    const retryAfter = { 'Retry-After': { description: 'Seconds to wait before asking again', schema: { type: 'integer', minimum: 1 } } };
    return Object.fromEntries(
        Object.entries(ERRORS).map(([status, description]) => [
            `Error${status}`,
            {
                description,
                ...(status === '429' || status === '503' ? { headers: retryAfter } : {}),
                content: { 'application/json': { schema: { $ref: '#/components/schemas/ProblemDetails' } } },
            },
        ]),
    );
}

export function openApiDocument(): Json {
    return {
        openapi: '3.1.0',
        info: {
            title: 'Legacy 22 API',
            version: '1.0.0',
            description:
                'The HTTP API behind the Legacy 22 Kanban application. Every error is a problem document (RFC 7807) carrying a traceId. A session is two httpOnly cookies set by POST /auth/login and renewed on any request that still carries the refresh cookie.',
        },
        tags: ['Auth', 'Account', 'Projects', 'Tasks', 'Notifications', 'Operations'].map(name => ({ name })),
        paths: pathsOf(OPERATIONS),
        components: {
            schemas: { ProblemDetails: schemaOf(ProblemDetails, 'output') },
            responses: errorResponses(),
            securitySchemes: {
                session: { type: 'apiKey', in: 'cookie', name: 'session', description: 'Set by POST /auth/login; httpOnly' },
                relaySecret: { type: 'apiKey', in: 'header', name: 'x-relay-secret', description: 'The RELAY_SECRET of the deployment' },
            },
        },
    };
}

// The document as the file under docs/api holds it, byte for byte.
export function renderOpenApi(): string {
    return `${JSON.stringify(openApiDocument(), null, 2)}\n`;
}
