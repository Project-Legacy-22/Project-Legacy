export interface AuthFieldHelp {
    id: string;
    text: string;
}

export interface AuthFieldProps {
    id: string;
    label: string;
    type: 'email' | 'password';
    autoComplete: string;
    value: string;
    onChange: (value: string) => void;
    // The rule to respect, stated before anything is typed. Referenced by
    // aria-describedby so it is read out with the field rather than sitting
    // beside it unannounced.
    help?: AuthFieldHelp | undefined;
    error: string | null;
    errorId: string;
    disabled: boolean;
}

// A labelled field whose help and error are both tied to the input. Written
// once and used by both fields: the accessible wiring is easy to get subtly
// wrong, and repeating it is how one copy ends up without it.
export function AuthField({
    id,
    label,
    type,
    autoComplete,
    value,
    onChange,
    help,
    error,
    errorId,
    disabled,
}: AuthFieldProps) {
    const describedBy = [help?.id, error === null ? null : errorId]
        .filter(candidate => candidate !== undefined && candidate !== null)
        .join(' ');

    return (
        <div className="form-field">
            <label htmlFor={id}>{label}</label>
            {help !== undefined && (
                <p id={help.id} className="field-help">
                    {help.text}
                </p>
            )}
            <input
                id={id}
                name={type}
                type={type}
                autoComplete={autoComplete}
                value={value}
                onChange={event => onChange(event.target.value)}
                aria-invalid={error !== null}
                aria-describedby={describedBy === '' ? undefined : describedBy}
                disabled={disabled}
            />
            {error !== null && (
                <p id={errorId} className="field-error" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}
