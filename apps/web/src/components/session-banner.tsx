import type { SubmitResult } from '../hooks/use-session';
import { labels } from '../labels';

export interface SessionBannerProps {
    email: string;
    unread: number;
    isSigningOut: boolean;
    onSignOut: () => Promise<SubmitResult>;
}

// The signed-in view's top banner: who is signed in, whether the event flow
// has anything unread for them, and the one way to leave.
export function SessionBanner({ email, unread, isSigningOut, onSignOut }: SessionBannerProps) {
    return (
        <div className="session-banner">
            <p>
                {labels.signedInAs(email)}
                {/* role="status" : le compte change tout seul, quand le worker a
                    traite l evenement. L annoncer sans interrompre la lecture est
                    exactement ce pour quoi ce role existe. */}
                <span className="notification-badge" role="status">
                    {labels.unreadNotifications(unread)}
                </span>
            </p>
            <button
                type="button"
                className="button button-quiet"
                onClick={() => void onSignOut()}
                disabled={isSigningOut}
            >
                {isSigningOut ? labels.signingOut : labels.signOut}
            </button>
        </div>
    );
}
