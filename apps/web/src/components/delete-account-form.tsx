import { useState } from 'react';
import type { FormEvent } from 'react';

import { labels } from '../labels';
import { AuthField } from './auth-field';

export interface DeleteAccountFormProps {
    email: string;
    isDeleting: boolean;
    isDisabled: boolean;
    onDelete: (confirmation: string) => Promise<void>;
}

const FIELD_ID = 'delete-account-confirmation';
const HELP_ID = 'delete-account-confirmation-help';
const ERROR_ID = 'delete-account-confirmation-error';

// The same normalisation the API applies before comparing an address, so the
// form accepts exactly what the server accepts and refuses exactly what it
// refuses. A confirmation the interface rejects but the API would have taken,
// or the reverse, is one rule written twice and agreed on once.
function normalize(candidate: string): string {
    return candidate.trim().toLowerCase();
}

function refusalOf(confirmation: string, email: string): string | null {
    if (normalize(confirmation) === '') return labels.deleteAccountConfirmationRequired;
    if (normalize(confirmation) !== normalize(email)) {
        return labels.deleteAccountConfirmationMismatch;
    }

    return null;
}

function AccountLosses() {
    return (
        <ul className="delete-account-losses">
            <li>{labels.deleteAccountLosesAccount}</li>
            <li>{labels.deleteAccountLosesItems}</li>
            <li>{labels.deleteAccountLosesProjects}</li>
            <li>{labels.deleteAccountLosesNotifications}</li>
        </ul>
    );
}

// Deletion is immediate and irreversible, so the form says what is lost before
// asking for anything, item by item. "Are you sure?" is not a confirmation: it
// asks a person to agree to something the interface never told them.
//
// Retyping the address is what turns a click into a decision. It is checked
// here to spare a pointless round trip and to put the refusal on the field, and
// checked again by the API, which is the only place that can enforce it.
export function DeleteAccountForm({ email, isDeleting, isDisabled, onDelete }: DeleteAccountFormProps) {
    const [confirmation, setConfirmation] = useState('');
    const [refusal, setRefusal] = useState<string | null>(null);
    const isBlocked = isDisabled || isDeleting;

    function submit(event: FormEvent): void {
        event.preventDefault();
        const refused = refusalOf(confirmation, email);

        setRefusal(refused);
        if (refused === null) void onDelete(confirmation);
    }

    return (
        <form className="delete-account" onSubmit={submit} noValidate>
            <h3 id="delete-account-heading">{labels.deleteAccountTitle}</h3>
            <p>{labels.deleteAccountWarning}</p>
            <AccountLosses />
            <p className="delete-account-warning">{labels.deleteAccountNoRecovery}</p>
            <AuthField
                id={FIELD_ID}
                label={labels.deleteAccountConfirmationLabel}
                type="email"
                // Not a sign-in field. Letting the browser fill it would supply
                // the proof of intent this confirmation exists to obtain.
                autoComplete="off"
                value={confirmation}
                onChange={setConfirmation}
                help={{
                    id: HELP_ID,
                    text: labels.deleteAccountConfirmationHelp(email),
                }}
                error={refusal}
                errorId={ERROR_ID}
                disabled={isBlocked}
            />
            <button className="button button-danger" type="submit" disabled={isBlocked}>
                {isDeleting ? labels.deletingAccount : labels.deleteAccount}
            </button>
        </form>
    );
}
