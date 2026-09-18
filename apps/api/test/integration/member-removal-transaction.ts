import { execFileSync, spawn } from 'node:child_process';

import { ProjectMemberIdParams } from '@legacy/contracts';
import type { MemberRemoval } from '@legacy/core-projects';
import { integrationConfig } from './support.js';

// Use the installed client directly: PATH can include writable directories.
// Linux CI uses the system package; macOS uses the Docker Desktop bundle.
const dockerExecutable = process.platform === 'darwin'
    ? '/Applications/Docker.app/Contents/Resources/bin/docker'
    : '/usr/bin/docker';

// Match the tested API port rather than taking the first running database:
// developers may keep their own local stack beside an isolated test stack.
export function testedDatabase(): string {
    const api = new URL(integrationConfig().supabaseUrl);
    if (!['localhost', '127.0.0.1'].includes(api.hostname) || api.port === '') {
        throw new Error('Concurrency tests require a local Supabase stack');
    }
    const gateway = execFileSync(dockerExecutable, [
        'ps', '--filter', `publish=${api.port}`, '--format', '{{.Names}}',
    ], { encoding: 'utf8' }).trim();
    if (!/^supabase_kong_[a-zA-Z0-9_-]+$/u.test(gateway)) {
        throw new Error('Cannot uniquely identify the tested local Supabase stack');
    }
    return gateway.replace('supabase_kong_', 'supabase_db_');
}

export function databaseQuery(query: string): string {
    return execFileSync(dockerExecutable, [
        'exec', testedDatabase(), 'psql', '-U', 'postgres', '-XqAt',
        '-v', 'ON_ERROR_STOP=1', '-c', query,
    ], { encoding: 'utf8' }).trim();
}

export async function holdRemoval(removal: MemberRemoval) {
    const { projectId, userId: callerId } = ProjectMemberIdParams.parse({
        projectId: removal.projectId, userId: removal.callerId,
    });
    const { userId: memberId } = ProjectMemberIdParams.parse({
        projectId, userId: removal.memberId,
    });
    const child = spawn(dockerExecutable, [
        'exec', '-i', testedDatabase(), 'psql', '-U', 'postgres', '-XqAt', '-v', 'ON_ERROR_STOP=1',
    ]);
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    const closed = new Promise<number | null>(resolve => child.once('close', resolve));
    const ready = new Promise<void>((resolve, reject) => {
        let stdout = '';
        child.once('error', reject);
        child.once('close', () => reject(new Error(`Holding transaction closed early: ${stderr}`)));
        child.stdout.on('data', (chunk: Buffer) => {
            stdout += chunk.toString();
            if (stdout.includes('held:removed')) resolve();
        });
    });
    // The idle timeout bounds even a failed test. The UUIDs above are validated
    // fixture identifiers, never request input interpolated into production SQL.
    child.stdin.write(`set idle_in_transaction_session_timeout = '10s';
        begin;
        select 'held:' || public.remove_project_member('${projectId}', '${callerId}', '${memberId}');
    `);
    await ready;
    return {
        async finish(outcome: 'commit' | 'rollback'): Promise<void> {
            child.stdin.end(`${outcome};\n`);
            const code = await closed;
            if (code !== 0) throw new Error(`Holding transaction failed: ${stderr}`);
        },
    };
}
