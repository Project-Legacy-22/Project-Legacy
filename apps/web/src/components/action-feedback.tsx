// The result of an action, as this component renders it: a refusal announced at
// once, a success announced quietly, and nothing at all before anything has
// happened.
//
// Declared here rather than imported from one of the screens that report
// through it. The component is what they share, and typing it on one caller's
// module would make every other caller depend on that one for no reason.
export type ActionFeedbackState =
    | { status: 'idle' }
    | { status: 'success'; message: string }
    | { status: 'error'; message: string };

export interface ActionFeedbackProps {
    feedback: ActionFeedbackState;
}

export function ActionFeedback({ feedback }: ActionFeedbackProps) {
    return (
        <>
            {feedback.status === 'error' && (
                <p className="error-message action-error" role="alert">
                    {feedback.message}
                </p>
            )}
            <p className="visually-hidden" aria-live="polite" aria-atomic="true">
                {feedback.status === 'success' ? feedback.message : ''}
            </p>
        </>
    );
}
