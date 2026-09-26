import { serviceRoleClient, withDeadline } from './adapter.js';
import type { SupabaseSettings } from './adapter.js';
import type { EventBus } from './redis-event-bus.js';

const PROBE_DEADLINE_MS = 3_000;

// A bounded read of a known table checks PostgREST and the database without
// counting the table or returning a row. No account data leaves this adapter.
export function createHealthProbes(
    settings: SupabaseSettings,
    bus: EventBus | undefined,
    readDatabase?: () => Promise<{ error: unknown }>,
) {
    const client = serviceRoleClient(settings);
    const read = readDatabase ?? (() => client.from('users').select('id', { head: true }).limit(1));

    return {
        database: async (): Promise<void> => {
            await withDeadline((async () => {
                const { error } = await read();
                if (error) throw error;
            })(), PROBE_DEADLINE_MS, 'database health');
        },
        broker: async (): Promise<void> => {
            if (bus === undefined) throw new Error('broker not configured');
            await withDeadline(bus.depth(), PROBE_DEADLINE_MS, 'broker health');
        },
    };
}
