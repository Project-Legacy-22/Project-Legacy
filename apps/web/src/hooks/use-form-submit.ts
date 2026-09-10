import { useState } from 'react';

import type { SubmitResult } from './use-session';

// The outcome dance the two small forms of the account section repeat: clear
// the last result, run the submit, show what it answered, and reset the inputs
// on success. Kept here rather than copied into each form so the two cannot
// drift on what "success" does.
export function useFormSubmit(resetInputs: () => void) {
    const [outcome, setOutcome] = useState<SubmitResult | null>(null);

    function run(submit: () => Promise<SubmitResult>): void {
        setOutcome(null);
        void submit().then(result => {
            setOutcome(result);
            if (result.status === 'success') resetInputs();
        });
    }

    return { outcome, run };
}
