import { labels } from '../labels';
import { ItemsContent } from './items-content';
import type { ItemsContentProps } from './items-content';

export function ItemsSection(props: ItemsContentProps & { projectName: string }) {
    return (
        <section className="panel" aria-labelledby="items-heading" aria-busy={props.loadState.status === 'loading'}>
            <div className="section-heading section-heading-row">
                <div>
                    <p className="section-kicker">{labels.currentWorkKicker}</p>
                    <h2 id="items-heading" tabIndex={-1}>
                        {labels.itemsInProject(props.projectName)}
                    </h2>
                </div>
                {/* The number is shown, the sentence is read. aria-label on a
                    paragraph is only inconsistently exposed -- it carries no
                    role -- so the count was announced twice or not at all. */}
                <p className="item-count">
                    <span aria-hidden="true">{props.items.length}</span>
                    <span className="visually-hidden">{labels.itemCount(props.items.length)}</span>
                </p>
            </div>
            <ItemsContent {...props} />
        </section>
    );
}
