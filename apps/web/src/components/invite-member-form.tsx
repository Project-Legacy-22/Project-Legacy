import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { MAX_INVITATIONS_AT_ONCE, parseEmailList } from '../email-list';
import type { InviteResult } from '../hooks/use-project-members';
import { labels } from '../labels';

export interface InviteMemberFormProps {
    isInviting: boolean;
    onInvite: (addresses: readonly string[]) => Promise<InviteResult>;
}

// One or more addresses (#420), checked with the contract the API applies, so
// an address the server would refuse is refused here first, without a round
// trip.
export function listRefusal(text: string): string | null {
    const list = parseEmailList(text);
    if (list.invalid.length > 0) return labels.notEmailAddresses(list.invalid);
    if (list.addresses.length === 0) return labels.inviteEmailInvalid;
    if (list.addresses.length > MAX_INVITATIONS_AT_ONCE) return labels.tooManyInvitations(MAX_INVITATIONS_AT_ONCE);
    return null;
}

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
        const refusal = listRefusal(email);
        if (refusal !== null) {
            setError(refusal);
            inputRef.current?.focus();
            return;
        }

        void onInvite(parseEmailList(email).addresses).then(result => {
            if (result.status === 'success') setEmail('');
            if (result.status === 'partial') setEmail(result.remaining.join(', '));
            setError(result.status === 'success' ? null : result.message);
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
                <label htmlFor="invite-email">{labels.inviteEmailsLabel}</label>
                <p id="invite-email-help" className="field-help">
                    {labels.inviteEmailsHelp}
                </p>
                <input
                    ref={form.inputRef}
                    id="invite-email"
                    name="inviteEmail"
                    type="email"
                    multiple
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
