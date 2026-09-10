import { Buffer } from 'node:buffer';

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export interface KeysetPosition {
    createdAt: string;
    id: string;
}

export function encodeKeysetCursor(position: KeysetPosition): string {
    return Buffer.from(`${position.createdAt} ${position.id}`, 'utf8').toString('base64url');
}

export function decodeKeysetCursor(cursor: string, invalidCursor: () => Error): KeysetPosition {
    const [createdAt, id, ...extra] = Buffer.from(cursor, 'base64url').toString('utf8').split(' ');
    const hasValidInstant = createdAt !== undefined && ISO_INSTANT_PATTERN.test(createdAt);
    const hasValidId = id !== undefined && UUID_PATTERN.test(id);

    if (!hasValidInstant || !hasValidId || extra.length > 0) throw invalidCursor();
    return { createdAt, id };
}
