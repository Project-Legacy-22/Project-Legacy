import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Kanban motion', () => {
    it('disables interface transitions when reduced motion is preferred', () => {
        const foundation = readFileSync(join(import.meta.dirname, 'foundation.css'), 'utf8');
        const items = readFileSync(join(import.meta.dirname, 'items.css'), 'utf8');

        expect(items).toContain('transition:');
        expect(foundation).toMatch(
            /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition-duration: 0\.01ms !important;/u,
        );
    });
});
