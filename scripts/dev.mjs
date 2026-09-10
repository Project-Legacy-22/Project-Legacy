import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// Le worker demarre avec le reste : le flux evenementiel de US-10 n a aucun
// effet visible sans consommateur. Il reste un processus distinct, qu on peut
// arreter seul pour montrer la file grossir.
const children = [start('dev:api'), start('dev:web'), start('dev:worker')];
let isStopping = false;

function start(script) {
    const child = spawn(npmCommand, ['run', script], { stdio: 'inherit' });

    child.once('error', error => {
        console.error(`Unable to start ${script}: ${error.message}`);
        process.exitCode = 1;
        stop('SIGTERM');
    });

    child.once('exit', (code, signal) => {
        if (isStopping) return;
        process.exitCode = code ?? (signal === null ? 0 : 1);
        stop('SIGTERM');
    });

    return child;
}

function stop(signal) {
    if (isStopping) return;
    isStopping = true;

    for (const child of children) {
        if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    }
}

process.once('SIGINT', () => {
    process.exitCode = 130;
    stop('SIGINT');
});

process.once('SIGTERM', () => {
    process.exitCode = 143;
    stop('SIGTERM');
});
