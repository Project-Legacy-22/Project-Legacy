import { createClient } from '@supabase/supabase-js';

import type { Application } from '../../src/composition-root.js';
import { integrationConfig } from './support.js';
import type { RealAccount } from './support.js';
import type { Database } from '../../../../packages/infra/src/database.types.js';

export function membershipClient(accessToken?: string | null) {
    const config = integrationConfig();
    return createClient<Database>(
        config.supabaseUrl,
        accessToken === undefined ? config.supabaseServiceRoleKey : config.supabaseAnonKey,
        {
            auth: { persistSession: false, autoRefreshToken: false },
            ...(accessToken === undefined || accessToken === null ? {} : {
                global: { headers: { Authorization: `Bearer ${accessToken}` } },
            }),
        },
    );
}

export async function sharedProject(
    app: Application,
    accounts: { owner: RealAccount; member: RealAccount },
    role: 'owner' | 'member' = 'member',
): Promise<string> {
    const project = await app.useCases.projects.addProject('Removal integration test', accounts.owner.id);
    const { error } = await membershipClient().from('project_memberships').insert({
        project_id: project.id,
        user_id: accounts.member.id,
        role,
    });
    if (error !== null) throw new Error('Cannot prepare a shared project', { cause: error });
    return project.id;
}
