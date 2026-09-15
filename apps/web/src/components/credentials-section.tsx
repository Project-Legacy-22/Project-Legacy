import { labels } from '../labels';
import type { SubmitResult } from '../hooks/use-session';
import { ChangeEmailForm } from './change-email-form';
import { ChangePasswordForm } from './change-password-form';

export interface CredentialsSectionProps {
    isSubmitting: boolean;
    onChangeEmail: (newEmail: string) => Promise<SubmitResult>;
    onChangePassword: (currentPassword: string, newPassword: string) => Promise<SubmitResult>;
}

// Where a signed-in person corrects their email address or changes their
// password (US-36). On the screen they already use, like the personal-data
// section: a setting behind a page nobody opens is a setting nobody changes.
//
// It sits above that section because a credential change is the routine case
// and an erasure is the last resort.
export function CredentialsSection({
    isSubmitting,
    onChangeEmail,
    onChangePassword,
}: CredentialsSectionProps) {
    return (
        <section className="panel" aria-labelledby="credentials-heading">
            <div className="section-heading">
                <p className="section-kicker">{labels.credentialsKicker}</p>
                <h2 id="credentials-heading">{labels.credentialsTitle}</h2>
            </div>
            <p className="intro">{labels.credentialsIntro}</p>
            <ChangeEmailForm isSubmitting={isSubmitting} onSubmit={onChangeEmail} />
            <ChangePasswordForm isSubmitting={isSubmitting} onSubmit={onChangePassword} />
        </section>
    );
}
