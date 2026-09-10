import { labels } from '../labels';
import type { AuthMode } from './auth-form';

// Which of the three screens the authentication page is showing. It lives here
// because the heading is the only thing that reads it as a whole: the forms
// below take the one mode that concerns them.
export type Screen = AuthMode | 'requestReset';

export interface AuthHeadingProps {
    screen: Screen;
    // Why this screen is showing again, when there is a reason: a session that
    // ended while the page was in use (US-27). Undefined on a first visit,
    // where there is nothing to explain.
    notice: string | undefined;
}

function title(screen: Screen): string {
    if (screen === 'register') return labels.registerTitle;
    if (screen === 'requestReset') return labels.requestResetTitle;
    return labels.signInTitle;
}

function intro(screen: Screen): string {
    if (screen === 'register') return labels.registerIntro;
    if (screen === 'requestReset') return labels.requestResetIntro;
    return labels.signInIntro;
}

// The title of the screen, the reason it is showing when there is one, and the
// sentence that introduces it. Kept together because the three are read in that
// order and only make sense in it.
export function AuthHeading({ screen, notice }: AuthHeadingProps) {
    return (
        <>
            <h1>{title(screen)}</h1>
            {/* role="alert" : la personne etait en train de travailler et se
                retrouve ici. La raison doit etre annoncee, pas attendre qu on
                aille la chercher. */}
            {notice !== undefined && (
                <p className="auth-notice" role="alert">
                    {notice}
                </p>
            )}
            <p className="auth-intro">{intro(screen)}</p>
        </>
    );
}
