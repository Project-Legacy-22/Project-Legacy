import { labels } from '../labels';

export function PageHeader() {
    return (
        <header className="site-header">
            <div className="header-content">
                <p className="eyebrow">{labels.productName}</p>
                <h1>{labels.pageTitle}</h1>
                <p className="intro">{labels.pageIntro}</p>
            </div>
        </header>
    );
}
