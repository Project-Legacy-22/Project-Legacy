import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { CreateProjectBody, MAX_PROJECT_NAME_LENGTH } from '@legacy/contracts';

import type { AddProjectResult } from '../hooks/use-projects';
import { labels } from '../labels';

export interface ProjectFormProps {
    isAdding: boolean;
    onAdd: (name: string) => Promise<AddProjectResult>;
}

function useProjectForm(onAdd: ProjectFormProps['onAdd']) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        setName(event.target.value);
        if (error !== null) setError(null);
    };

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const candidate = CreateProjectBody.safeParse({ name });
        if (!candidate.success) {
            setError(
                name.trim().length === 0
                    ? labels.projectNameRequired
                    : labels.projectNameTooLong(MAX_PROJECT_NAME_LENGTH),
            );
            inputRef.current?.focus();
            return;
        }

        void onAdd(candidate.data.name).then((result) => {
            if (result.status === 'error') {
                setError(result.message);
                inputRef.current?.focus();
                return;
            }
            setName('');
            setError(null);
            inputRef.current?.focus();
        });
    };

    return { inputRef, name, error, handleChange, handleSubmit };
}

export function ProjectForm({ isAdding, onAdd }: ProjectFormProps) {
    const form = useProjectForm(onAdd);

    const describedBy = form.error === null ? 'project-name-help' : 'project-name-help project-name-error';

    return (
        <form className="project-form" onSubmit={form.handleSubmit} noValidate>
            <div className="form-field">
                <label htmlFor="project-name">{labels.projectNameLabel}</label>
                <p id="project-name-help" className="field-help">
                    {labels.projectNameHelp(MAX_PROJECT_NAME_LENGTH)}
                </p>
                <input
                    ref={form.inputRef}
                    id="project-name"
                    name="projectName"
                    type="text"
                    autoComplete="off"
                    maxLength={MAX_PROJECT_NAME_LENGTH}
                    value={form.name}
                    onChange={form.handleChange}
                    aria-describedby={describedBy}
                    aria-invalid={form.error !== null}
                    disabled={isAdding}
                />
                {form.error !== null && (
                    <p id="project-name-error" className="field-error" role="alert">
                        {form.error}
                    </p>
                )}
            </div>
            <button className="button button-primary" type="submit" disabled={isAdding}>
                {isAdding ? labels.creatingProject : labels.createProject}
            </button>
        </form>
    );
}
