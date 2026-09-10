import type { usePersonalData } from '../hooks/use-personal-data';
import type { SubmitResult } from '../hooks/use-session';
import { CredentialsSection } from './credentials-section';
import { PersonalDataSection } from './personal-data-section';

// The subset of useCredentials the signed-in screen needs. Kept structural so
// App can hand the hook's return straight through; the extra confirmEmailChange
// on it is harmless here.
export interface CredentialsControls {
    isSubmitting: boolean;
    changeEmail: (newEmail: string) => Promise<SubmitResult>;
    changePassword: (currentPassword: string, newPassword: string) => Promise<SubmitResult>;
}

export interface AccountSectionsProps {
    email: string;
    credentials: CredentialsControls;
    personalData: ReturnType<typeof usePersonalData>;
}

// The account settings that live below the item list: credentials (US-36) then
// the personal-data rights (US-13), in that order because a credential change
// is routine and an erasure is the last resort. Extracted so SignedInApp stays
// a list of what is mounted.
export function AccountSections({ email, credentials, personalData }: AccountSectionsProps) {
    return (
        <>
            <CredentialsSection
                isSubmitting={credentials.isSubmitting}
                onChangeEmail={credentials.changeEmail}
                onChangePassword={credentials.changePassword}
            />
            <PersonalDataSection
                email={email}
                activity={personalData.activity}
                feedback={personalData.feedback}
                onExport={personalData.exportPersonalData}
                onDelete={personalData.deleteAccount}
            />
        </>
    );
}
