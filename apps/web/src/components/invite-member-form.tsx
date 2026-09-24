import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { InviteMemberBody } from '@legacy/contracts';

import type { ActionResult } from '../hooks/view-state';
import { labels } from '../labels';

export interface InviteMemberFormProps {
    isInviting: boolean;
    onInvite: (email: string) => Promise<ActionResult>;
}

// Checked with the contract the API applies, so an address the server would
// refuse is refused here first, without a round trip.
function useInviteForm(onInvite: InviteMemberFormProps['onInvite']) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [email, setEmail] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        setEmail(event.target.value);
        if (error !== null) setError(null);
    };

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const candidate = InviteMemberBody.safeParse({ email });
        if (!candidate.success) {
            setError(labels.inviteEmailInvalid);
            inputRef.current?.focus();
            return;
        }

        void onInvite(candidate.data.email).then(result => {
            if (result.status === 'error') setError(result.message);
            else setEmail('');
            inputRef.current?.focus();
        });
    };

    return { inputRef, email, error, handleChange, handleSubmit };
}

export function InviteMemberForm({ isInviting, onInvite }: InviteMemberFormProps) {
    const form = useInviteForm(onInvite);
    const describedBy = form.error === null ? 'invite-email-help' : 'invite-email-help invite-email-error';

    return (
        <form className="project-form" onSubmit={form.handleSubmit} noValidate>
            <div className="form-field">
                <label htmlFor="invite-email">{labels.inviteEmailLabel}</label>
                <p id="invite-email-help" className="field-help">
                    {labels.inviteEmailHelp}
                </p>
                <input
                    ref={form.inputRef}
                    id="invite-email"
                    name="inviteEmail"
                    type="email"
                    autoComplete="off"
                    value={form.email}
                    onChange={form.handleChange}
                    aria-describedby={describedBy}
                    aria-invalid={form.error !== null}
                    disabled={isInviting}
                />
                {form.error !== null && (
                    <p id="invite-email-error" className="field-error" role="alert">
                        {form.error}
                    </p>
                )}
            </div>
            <button className="button button-primary" type="submit" disabled={isInviting}>
                {isInviting ? labels.inviting : labels.invite}
            </button>
        </form>
    );
}
