import { PRIVACY_POLICY_VERSION } from '@legacy/contracts';

import { labels } from '../labels';
import { ProcessorsTable } from './policy-processors';

export interface PrivacyPolicyPageProps {
    onBack: () => void;
}

// The published policy. Its substance restates docs/gdpr/registre.md, which is
// the record the team keeps: a purpose, a duration or a recipient changes there
// first, and PRIVACY_POLICY_VERSION is bumped so accounts keep a trace of what
// they actually agreed to.
//
// It is reachable without an account, from the registration form and from the
// footer, which US-37 asks for: the reader has to be able to consult it before
// deciding, not after.
export function PrivacyPolicyPage({ onBack }: PrivacyPolicyPageProps) {
    return (
        <main className="policy-page" id="main-content">
            <h1>{labels.privacyPolicyTitle}</h1>
            <p className="policy-version">{labels.privacyPolicyVersion(PRIVACY_POLICY_VERSION)}</p>

            <h2>{labels.policyControllerTitle}</h2>
            <p>
                {labels.policyControllerBody}{' '}
                <a href="mailto:seif.soltane@epitech.eu">seif.soltane@epitech.eu</a>
            </p>

            <h2>{labels.policyWhatTitle}</h2>
            <p>{labels.policyWhatIntro}</p>
            <ul>
                <li>{labels.policyWhatAccount}</li>
                <li>{labels.policyWhatItems}</li>
                <li>{labels.policyWhatNotifications}</li>
                <li>{labels.policyWhatLogs}</li>
            </ul>

            <h2>{labels.policyWhyTitle}</h2>
            <p>{labels.policyWhyBody}</p>

            <h2>{labels.policyHowLongTitle}</h2>
            <ul>
                <li>{labels.policyHowLongAccount}</li>
                <li>{labels.policyHowLongItems}</li>
                <li>{labels.policyHowLongNotifications}</li>
                <li>{labels.policyHowLongLogs}</li>
            </ul>

            <h2>{labels.policyRecipientsTitle}</h2>
            <p>{labels.policyRecipientsIntro}</p>
            <ProcessorsTable />
            <p>{labels.policyJurisdiction}</p>

            <h2>{labels.policyRightsTitle}</h2>
            <p>{labels.policyRightsBody}</p>

            <button type="button" className="button button-secondary" onClick={onBack}>
                {labels.policyBack}
            </button>
        </main>
    );
}
