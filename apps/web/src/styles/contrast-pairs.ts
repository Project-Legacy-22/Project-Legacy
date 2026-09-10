// The colour pairs the interface actually uses, and the threshold each one
// has to hold.
//
// This is a specification, not a test: it lives next to tokens.css so that a
// review sees the colour and its requirement in the same diff.
// contrast.test.ts reads it and does the arithmetic.
//
// WCAG 2.1 AA demande 4.5:1 pour le texte et 3:1 pour ce qui porte du sens sans
// etre du texte -- une bordure de champ, un indicateur d'etat.

export interface ContrastPair {
    foreground: string;
    background: string;
    requirement: 'text' | 'ui';
    // Ou le couple apparait, pour qu'un echec designe un ecran et non un jeton.
    where: string;
}

export const CONTRAST_PAIRS: readonly ContrastPair[] = [
    // Texte sur la page
    { foreground: '--text-body', background: '--surface-page', requirement: 'text', where: 'page body' },

    // Texte sur un panneau blanc
    { foreground: '--text-body', background: '--surface-card', requirement: 'text', where: 'running text of panels' },
    { foreground: '--text-secondary', background: '--surface-card', requirement: 'text', where: 'secondary text' },
    { foreground: '--text-muted', background: '--surface-card', requirement: 'text', where: 'field hint' },
    { foreground: '--text-danger', background: '--surface-card', requirement: 'text', where: 'field error, danger button' },
    { foreground: '--text-brand', background: '--surface-card', requirement: 'text', where: 'secondary button' },
    { foreground: '--text-brand-muted', background: '--surface-card', requirement: 'text', where: 'brand label in the layout' },

    // Texte sur l'en-tete sombre
    { foreground: '--text-on-brand', background: '--surface-brand', requirement: 'text', where: 'header title' },
    { foreground: '--text-on-brand-soft', background: '--surface-brand', requirement: 'text', where: 'header eyebrow' },
    { foreground: '--text-on-brand-muted', background: '--surface-brand', requirement: 'text', where: 'header introduction' },

    // Texte sur les surfaces d'etat
    { foreground: '--text-secondary', background: '--surface-muted', requirement: 'text', where: 'loading and empty-state messages' },
    { foreground: '--text-secondary', background: '--surface-item-done', requirement: 'text', where: 'row of a finished task' },
    { foreground: '--text-danger-strong', background: '--surface-danger-soft', requirement: 'text', where: 'error box' },
    { foreground: '--text-brand', background: '--surface-brand-soft', requirement: 'text', where: 'secondary button hovered, auth screen' },
    { foreground: '--text-brand-badge', background: '--surface-brand-softer', requirement: 'text', where: 'task counter' },

    // Projects keep their title and count readable on hovered and selected rows.
    { foreground: '--text-body', background: '--surface-brand-soft', requirement: 'text', where: 'hovered and selected project title' },
    { foreground: '--text-muted', background: '--surface-brand-soft', requirement: 'text', where: 'hovered and selected project count' },

    // Texte sur une action pleine
    { foreground: '--text-on-brand', background: '--action-primary', requirement: 'text', where: 'primary button' },
    { foreground: '--text-on-brand', background: '--action-primary-hover', requirement: 'text', where: 'primary button hovered' },
    { foreground: '--text-on-brand', background: '--text-body', requirement: 'text', where: 'skip link' },

    // Composants : ce qui porte du sens sans etre du texte
    { foreground: '--border-input', background: '--surface-card', requirement: 'ui', where: 'field border at rest' },
    { foreground: '--border-input-hover', background: '--surface-card', requirement: 'ui', where: 'field border hovered' },
    { foreground: '--border-invalid', background: '--surface-card', requirement: 'ui', where: 'field in error' },
    { foreground: '--border-brand', background: '--surface-card', requirement: 'ui', where: 'outline of the secondary button' },
    { foreground: '--border-danger', background: '--surface-card', requirement: 'ui', where: 'outline of the danger button' },
    { foreground: '--action-primary', background: '--surface-card', requirement: 'ui', where: 'border of a task in progress' },
    { foreground: '--action-primary', background: '--surface-brand-soft', requirement: 'ui', where: 'selected project border and indicator' },
];

// The tokens no pair verifies, and why. Each entry is a decision, not an
// oversight: the test refuses a token absent from both lists.
export const EXEMPT: readonly { token: string; reason: string }[] = [
    {
        token: '--border-panel',
        reason: "Decorative outline of a panel. The panel already stands out by its white surface against the page background, and its content carries the meaning. WCAG 1.4.11 does not cover a purely decorative outline.",
    },
    {
        token: '--border-muted',
        reason: "Dashed stroke around a status message. The message is text, verified at 4.5:1; the stroke carries no information on its own.",
    },
    {
        token: '--border-danger-soft',
        reason: "Outline of the error box. The meaning is carried by the text at 8.7:1 and by role alert, not by the colour of the stroke.",
    },
    {
        token: '--border-badge',
        reason: "Outline of the task counter, whose text is verified. Removing the stroke would remove no information.",
    },
    {
        token: '--border-rule',
        reason: "Rule separating two sections. Purely decorative: the separation is also carried by the headings.",
    },
    {
        token: '--border-item-done',
        reason: "Border of a finished task. The state is also spelled out in the row and rendered as struck-through text, so it is never signalled by colour alone.",
    },
    {
        token: '--surface-page',
        reason: "Page background, verified as a background in the text pairs rather than as a foreground.",
    },
];

// Surfaces sur lesquelles l'indicateur de focus doit rester visible.
export const FOCUS_SURFACES: readonly string[] = [
    '--surface-page',
    '--surface-card',
    '--surface-brand',
    '--action-primary',
    '--surface-brand-soft',
];
