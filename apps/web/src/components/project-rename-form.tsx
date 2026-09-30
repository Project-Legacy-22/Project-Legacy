import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { MAX_PROJECT_NAME_LENGTH } from '@legacy/contracts';

import type { ProjectDto } from '../api/projects-api';
import type { AddProjectResult } from '../hooks/use-projects';
import { labels } from '../labels';
import { projectNameRefusal } from './project-form';

export interface ProjectRenameFormProps {
    project: ProjectDto;
    isPending: boolean;
    onRename: (project: ProjectDto, name: string) => Promise<AddProjectResult>;
    onClose: () => void;
}

export function renameFormId(projectId: string): string {
    return `project-rename-${projectId}`;
}

function useRenameForm({ project, isPending, onRename, onClose }: ProjectRenameFormProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [name, setName] = useState(project.name);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const refuse = (message: string) => {
        setError(message);
        inputRef.current?.focus();
    };

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        // The submit button stays focusable while a request runs: a second
        // press is ignored here rather than by making the button inert.
        if (isPending) return;
        const refusal = projectNameRefusal(name);
        if (refusal !== null) return refuse(refusal);
        if (name.trim() === project.name) return onClose();

        void onRename(project, name.trim()).then((result) => {
            if (result.status === 'error') refuse(result.message);
            else onClose();
        });
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onClose();
    };

    return { inputRef, name, error, setName, setError, handleSubmit, handleKeyDown };
}

export function ProjectRenameForm(props: ProjectRenameFormProps) {
    const form = useRenameForm(props);
    const id = renameFormId(props.project.id);
    const errorId = `${id}-error`;

    return (
        <form id={id} className="project-rename-form" onSubmit={form.handleSubmit} onKeyDown={form.handleKeyDown} noValidate>
            <label htmlFor={`${id}-name`}>{labels.projectRenameLabel(props.project.name)}</label>
            <input
                ref={form.inputRef}
                id={`${id}-name`}
                type="text"
                autoComplete="off"
                maxLength={MAX_PROJECT_NAME_LENGTH}
                value={form.name}
                onChange={(event) => {
                    form.setName(event.target.value);
                    form.setError(null);
                }}
                aria-invalid={form.error !== null}
                aria-describedby={form.error === null ? undefined : errorId}
            />
            {form.error !== null && (
                <p id={errorId} className="field-error" role="alert">
                    {form.error}
                </p>
            )}
            <div className="project-rename-actions">
                <button className="button button-primary" type="submit" aria-disabled={props.isPending}>
                    {props.isPending ? labels.savingProjectName : labels.saveProjectName}
                </button>
                <button className="button button-secondary" type="button" onClick={props.onClose}>
                    {labels.cancelRename}
                </button>
            </div>
        </form>
    );
}
