import type { ItemActionFeedback } from '../hooks/use-items';

export interface ActionFeedbackProps {
    feedback: ItemActionFeedback;
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
