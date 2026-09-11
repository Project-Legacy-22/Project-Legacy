import { labels } from '../labels';
import { ViewState } from './view-state';

// The screen shown while the API is asked whether the caller has a session, and
// when that question could not be answered.
//
// It used to be two bare paragraphs in app.tsx, outside every landmark, with no
// heading and -- on the failure -- no way out but reloading the page. It is the
// worst of the state renderings EN-48 set out to replace, and the least visible:
// it only appears while the API is unreachable, which is exactly when somebody
// needs to be told what to do next.
//
// A <main> and an <h1>, because this is the whole page at that moment: there is
// no other landmark to sit inside, and a page without a level-one heading breaks
// the heading order every other screen keeps. It takes auth-page's centred
// column and the id every other page's skip link points at, rather than a
// near-duplicate rule of its own.
export interface SessionCheckScreenProps {
    state: { status: 'checking' } | { status: 'error'; message: string };
    onRetry: () => void;
}

export function SessionCheckScreen({ state, onRetry }: SessionCheckScreenProps) {
    return (
        <main
            className="auth-page session-check"
            id="main-content"
            aria-labelledby="session-check-heading"
        >
            <h1 id="session-check-heading">{labels.sessionCheckTitle}</h1>
            <ViewState
                state={
                    state.status === 'checking'
                        ? { status: 'loading' }
                        : { status: 'error', message: state.message }
                }
                loadingMessage={labels.checkingSession}
                onRetry={onRetry}
            />
        </main>
    );
}
