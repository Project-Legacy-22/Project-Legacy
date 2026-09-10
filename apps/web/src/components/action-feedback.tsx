import type { Feedback } from '../hooks/view-state';

// The result of an action, as this component renders it: a refusal announced at
// once, a success announced quietly, and nothing at all before anything has
// happened.
//
// Its own reason for not living on a caller's module is what sends it to the
// shared one: no screen owns this shape.
export type ActionFeedbackState = Feedback;

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
