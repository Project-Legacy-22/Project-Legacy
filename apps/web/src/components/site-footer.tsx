import { labels } from '../labels';

export interface SiteFooterProps {
    onOpenPolicy: () => void;
}

// Carries the privacy policy link, which US-37 requires to be reachable from
// the footer as well as from the registration form: somebody who already has an
// account must be able to reread what they agreed to.
export function SiteFooter({ onOpenPolicy }: SiteFooterProps) {
    return (
        <footer className="site-footer">
            <button type="button" className="button button-quiet" onClick={onOpenPolicy}>
                {labels.privacyPolicy}
            </button>
        </footer>
    );
}
