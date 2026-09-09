import type { SubmitResult } from '../hooks/use-session';

// The outcome line shared by the auth-adjacent forms. An error interrupts
// (role="alert"); a success is announced without interrupting (role="status").
export function FormOutcome({ outcome }: { outcome: SubmitResult | null }) {
    if (outcome === null || outcome.message === undefined) return null;

    return outcome.status === 'error' ? (
        <p className="form-error" role="alert">
            {outcome.message}
        </p>
    ) : (
        <p className="form-success" role="status">
            {outcome.message}
        </p>
    );
}
