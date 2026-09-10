import { labels } from '../labels';
import type { PersonalDataActivity, PersonalDataFeedback } from '../hooks/use-personal-data';
import { ActionFeedback } from './action-feedback';
import { DeleteAccountForm } from './delete-account-form';

export interface PersonalDataSectionProps {
    email: string;
    activity: PersonalDataActivity;
    feedback: PersonalDataFeedback;
    onExport: () => Promise<void>;
    onDelete: (confirmation: string) => Promise<void>;
}

// Where a person exercises the two rights of US-13. Both live on the screen
// they already use rather than behind a settings page nobody opens: a right
// that is hard to find is a right that is not offered.
//
// The download comes first, and the deletion warning points back at it. Someone
// who wants their data gone usually wants a copy of it first, and that is the
// order the section has to suggest.
export function PersonalDataSection({
    email,
    activity,
    feedback,
    onExport,
    onDelete,
}: PersonalDataSectionProps) {
    const isExporting = activity === 'exporting';

    return (
        <section className="panel" aria-labelledby="personal-data-heading">
            <div className="section-heading">
                <p className="section-kicker">{labels.personalDataKicker}</p>
                <h2 id="personal-data-heading">{labels.personalDataTitle}</h2>
            </div>
            <p className="intro">{labels.personalDataIntro}</p>
            <button
                className="button button-secondary"
                type="button"
                onClick={() => void onExport()}
                disabled={activity !== 'idle'}
            >
                {isExporting ? labels.exportingData : labels.exportData}
            </button>
            <DeleteAccountForm
                email={email}
                isDeleting={activity === 'deleting'}
                isDisabled={isExporting}
                onDelete={onDelete}
            />
            <ActionFeedback feedback={feedback} />
        </section>
    );
}
