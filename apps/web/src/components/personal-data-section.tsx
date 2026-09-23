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
    const isBusy = activity !== 'idle';

    return (
        <section className="panel" aria-labelledby="personal-data-heading">
            <div className="section-heading">
                <p className="section-kicker">{labels.personalDataKicker}</p>
                <h2 id="personal-data-heading">{labels.personalDataTitle}</h2>
            </div>
            <p className="panel-intro">{labels.personalDataIntro}</p>
            <button
                className="button button-secondary"
                type="button"
                // aria-disabled rather than disabled, the choice the pagination
                // button already made. A disabled element leaves the tab order,
                // and the focus fixup rule of the HTML standard then moves
                // focus off it -- onto the body, on the very control the person
                // just activated. Re-enabling does not bring focus back, so
                // exporting would cost a keyboard user their place and send
                // them back to the top of the document. Inert but reachable is
                // what this needs, and the handler carries the refusal.
                aria-disabled={isBusy}
                onClick={isBusy ? undefined : () => void onExport()}
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
