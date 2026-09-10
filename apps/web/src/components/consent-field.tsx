import { labels } from '../labels';

export interface ConsentFieldProps {
    id: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    error: string | null;
    errorId: string;
    disabled: boolean;
    onOpenPolicy: () => void;
}

// The consent box of US-37. It is never checked for the reader: the state it
// starts in is the state they left it in.
//
// The policy opens from a button rather than a link. Nothing in this
// application navigates -- the screen is chosen by state -- and a link would
// promise an address that does not answer.
export function ConsentField({
    id,
    checked,
    onChange,
    error,
    errorId,
    disabled,
    onOpenPolicy,
}: ConsentFieldProps) {
    return (
        <div className="form-field consent-field">
            <div className="consent-line">
                <input
                    id={id}
                    name="acceptsPrivacyPolicy"
                    type="checkbox"
                    checked={checked}
                    onChange={event => onChange(event.target.checked)}
                    aria-invalid={error !== null}
                    aria-describedby={error === null ? undefined : errorId}
                    disabled={disabled}
                />
                <label htmlFor={id}>{labels.consentLabel}</label>
            </div>

            <button
                type="button"
                className="button button-quiet consent-policy-link"
                onClick={onOpenPolicy}
                disabled={disabled}
            >
                {labels.readPrivacyPolicy}
            </button>

            {/* aria-live in addition to role="alert": the box sits at the end of
                the form, so the message can appear outside the reader's current
                focus and still has to be announced. */}
            {error !== null && (
                <p id={errorId} className="field-error" role="alert" aria-live="assertive">
                    {error}
                </p>
            )}
        </div>
    );
}
