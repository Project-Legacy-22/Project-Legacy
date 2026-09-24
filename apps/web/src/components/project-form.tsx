import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { CreateProjectBody, MAX_PROJECT_NAME_LENGTH } from '@legacy/contracts';

import { parseEmailList } from '../email-list';
import type { AddProjectResult } from '../hooks/use-projects';
import { labels } from '../labels';
import { listRefusal } from './invite-member-form';

export interface ProjectFormProps {
    isAdding: boolean;
    onAdd: (name: string, invitees: readonly string[]) => Promise<AddProjectResult>;
}

function nameRefusal(name: string): string | null {
    if (CreateProjectBody.safeParse({ name }).success) return null;
    return name.trim().length === 0 ? labels.projectNameRequired : labels.projectNameTooLong(MAX_PROJECT_NAME_LENGTH);
}

// The invitation field is optional: empty, the project is created alone.
function inviteesRefusal(invitees: string): string | null {
    return invitees.trim() === '' ? null : listRefusal(invitees);
}

function useProjectFields() {
    const [name, setName] = useState('');
    const [invitees, setInvitees] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [inviteesError, setInviteesError] = useState<string | null>(null);

    return {
        name,
        invitees,
        error,
        inviteesError,
        setError,
        setInviteesError,
        handleChange: (event: ChangeEvent<HTMLInputElement>) => {
            setName(event.target.value);
            setError(null);
        },
        handleInviteesChange: (event: ChangeEvent<HTMLInputElement>) => {
            setInvitees(event.target.value);
            setInviteesError(null);
        },
        reset: () => {
            setName('');
            setInvitees('');
        },
    };
}

function useProjectForm(onAdd: ProjectFormProps['onAdd']) {
    const inputRef = useRef<HTMLInputElement>(null);
    const inviteesRef = useRef<HTMLInputElement>(null);
    const fields = useProjectFields();

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const refusals = { name: nameRefusal(fields.name), invitees: inviteesRefusal(fields.invitees) };
        fields.setError(refusals.name);
        fields.setInviteesError(refusals.invitees);
        if (refusals.name !== null || refusals.invitees !== null) {
            (refusals.name === null ? inviteesRef : inputRef).current?.focus();
            return;
        }

        void onAdd(fields.name.trim(), parseEmailList(fields.invitees).addresses).then(result => {
            if (result.status === 'error') fields.setError(result.message);
            else fields.reset();
            inputRef.current?.focus();
        });
    };

    return { inputRef, inviteesRef, ...fields, handleSubmit };
}

type ProjectFormState = ReturnType<typeof useProjectForm>;

function InviteesField({ form, isAdding }: { form: ProjectFormState; isAdding: boolean }) {
    const describedBy = form.inviteesError === null ? 'project-invitees-help' : 'project-invitees-help project-invitees-error';

    return (
        <div className="form-field">
            <label htmlFor="project-invitees">{labels.projectInviteesLabel}</label>
            <p id="project-invitees-help" className="field-help">
                {labels.projectInviteesHelp}
            </p>
            <input
                ref={form.inviteesRef}
                id="project-invitees"
                name="projectInvitees"
                type="email"
                multiple
                autoComplete="off"
                value={form.invitees}
                onChange={form.handleInviteesChange}
                aria-describedby={describedBy}
                aria-invalid={form.inviteesError !== null}
                disabled={isAdding}
            />
            {form.inviteesError !== null && (
                <p id="project-invitees-error" className="field-error" role="alert">
                    {form.inviteesError}
                </p>
            )}
        </div>
    );
}

function NameField({ form, isAdding }: { form: ProjectFormState; isAdding: boolean }) {
    const describedBy = form.error === null ? 'project-name-help' : 'project-name-help project-name-error';

    return (
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
    );
}

export function ProjectForm({ isAdding, onAdd }: ProjectFormProps) {
    const form = useProjectForm(onAdd);

    return (
        <form className="project-form" onSubmit={form.handleSubmit} noValidate>
            <NameField form={form} isAdding={isAdding} />
            <InviteesField form={form} isAdding={isAdding} />
            <button className="button button-primary" type="submit" disabled={isAdding}>
                {isAdding ? labels.creatingProject : labels.createProject}
            </button>
        </form>
    );
}
