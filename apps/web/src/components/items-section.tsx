import { labels } from '../labels';
import { ItemsContent } from './items-content';
import type { ItemsContentProps } from './items-content';

export function ItemsSection(props: ItemsContentProps) {
    return (
        <section
            className="panel"
            aria-labelledby="items-heading"
            aria-busy={props.loadState.status === 'loading'}
        >
            <div className="section-heading section-heading-row">
                <div>
                    <p className="section-kicker">{labels.currentWorkKicker}</p>
                    <h2 id="items-heading" tabIndex={-1}>
                        {labels.itemsTitle}
                    </h2>
                </div>
                <p className="item-count" aria-label={labels.itemCount(props.items.length)}>
                    {props.items.length}
                </p>
            </div>
            <ItemsContent {...props} />
        </section>
    );
}
