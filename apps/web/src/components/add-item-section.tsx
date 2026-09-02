import { labels } from '../labels';
import { AddItemForm } from './add-item-form';
import type { AddItemFormProps } from './add-item-form';

export function AddItemSection(props: AddItemFormProps) {
    return (
        <section className="panel" aria-labelledby="add-item-heading">
            <div className="section-heading">
                <p className="section-kicker">{labels.newItemKicker}</p>
                <h2 id="add-item-heading">{labels.addSectionTitle}</h2>
            </div>
            <AddItemForm {...props} />
        </section>
    );
}
