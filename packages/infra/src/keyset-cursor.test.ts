import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import { decodeKeysetCursor, encodeKeysetCursor } from './keyset-cursor.js';

const POSITION = {
    createdAt: '2026-09-08T14:30:00.123456+00:00',
    id: '00000000-0000-7000-8000-000000000010',
};

describe('keyset cursor', () => {
    it('round-trips a database timestamp and UUID', () => {
        expect(decodeKeysetCursor(encodeKeysetCursor(POSITION), () => new Error('invalid'))).toEqual(POSITION);
    });

    it('rejects a cursor whose identifier contains filter syntax', () => {
        const cursor = Buffer.from(`${POSITION.createdAt} ${POSITION.id},or(id.eq.other)`, 'utf8').toString('base64url');

        expect(() => decodeKeysetCursor(cursor, () => new Error('invalid'))).toThrow('invalid');
    });

    it('rejects a cursor whose timestamp is not an ISO instant', () => {
        const cursor = Buffer.from(`yesterday ${POSITION.id}`, 'utf8').toString('base64url');

        expect(() => decodeKeysetCursor(cursor, () => new Error('invalid'))).toThrow('invalid');
    });
});
