// Les couples de couleurs reellement utilises par l'interface, et le seuil que
// chacun doit tenir.
//
// C'est une specification, pas un test : elle vit a cote de tokens.css pour
// qu'une relecture voie la couleur et son exigence dans le meme diff.
// contrast.test.ts la lit et calcule.
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
    { foreground: '--text-body', background: '--surface-page', requirement: 'text', where: 'corps de page' },

    // Texte sur un panneau blanc
    { foreground: '--text-body', background: '--surface-card', requirement: 'text', where: 'texte courant des panneaux' },
    { foreground: '--text-secondary', background: '--surface-card', requirement: 'text', where: 'texte secondaire' },
    { foreground: '--text-muted', background: '--surface-card', requirement: 'text', where: 'aide de champ' },
    { foreground: '--text-danger', background: '--surface-card', requirement: 'text', where: 'erreur de champ, bouton danger' },
    { foreground: '--text-brand', background: '--surface-card', requirement: 'text', where: 'bouton secondaire' },
    { foreground: '--text-brand-muted', background: '--surface-card', requirement: 'text', where: 'libelle de marque dans la mise en page' },

    // Texte sur l'en-tete sombre
    { foreground: '--text-on-brand', background: '--surface-brand', requirement: 'text', where: 'titre de l en-tete' },
    { foreground: '--text-on-brand-soft', background: '--surface-brand', requirement: 'text', where: 'surtitre de l en-tete' },
    { foreground: '--text-on-brand-muted', background: '--surface-brand', requirement: 'text', where: 'introduction de l en-tete' },

    // Texte sur les surfaces d'etat
    { foreground: '--text-secondary', background: '--surface-muted', requirement: 'text', where: 'messages de chargement et d etat vide' },
    { foreground: '--text-secondary', background: '--surface-item-done', requirement: 'text', where: 'ligne d une tache terminee' },
    { foreground: '--text-danger-strong', background: '--surface-danger-soft', requirement: 'text', where: 'encadre d erreur' },
    { foreground: '--text-brand', background: '--surface-brand-soft', requirement: 'text', where: 'bouton secondaire survole, ecran d authentification' },
    { foreground: '--text-brand-badge', background: '--surface-brand-softer', requirement: 'text', where: 'compteur de taches' },

    // Texte sur une action pleine
    { foreground: '--text-on-brand', background: '--action-primary', requirement: 'text', where: 'bouton principal' },
    { foreground: '--text-on-brand', background: '--action-primary-hover', requirement: 'text', where: 'bouton principal survole' },
    { foreground: '--text-on-brand', background: '--text-body', requirement: 'text', where: 'lien d evitement' },

    // Composants : ce qui porte du sens sans etre du texte
    { foreground: '--border-input', background: '--surface-card', requirement: 'ui', where: 'bordure de champ au repos' },
    { foreground: '--border-input-hover', background: '--surface-card', requirement: 'ui', where: 'bordure de champ survole' },
    { foreground: '--border-invalid', background: '--surface-card', requirement: 'ui', where: 'champ en erreur' },
    { foreground: '--border-brand', background: '--surface-card', requirement: 'ui', where: 'contour du bouton secondaire' },
    { foreground: '--border-danger', background: '--surface-card', requirement: 'ui', where: 'contour du bouton danger' },
    { foreground: '--action-primary', background: '--surface-card', requirement: 'ui', where: 'liseré d une tache en cours' },
];

// Les jetons qu'aucun couple ne verifie, et pourquoi. Chaque entree est une
// decision, pas un oubli : le test refuse un jeton absent des deux listes.
export const EXEMPT: readonly { token: string; reason: string }[] = [
    {
        token: '--border-panel',
        reason: "Contour decoratif d un panneau. Le panneau se distingue deja par sa surface blanche sur le fond de page, et son contenu porte le sens. WCAG 1.4.11 ne couvre pas un contour purement decoratif.",
    },
    {
        token: '--border-muted',
        reason: "Trait discontinu autour d un message d etat. Le message est du texte, verifie a 4.5:1 ; le trait ne porte aucune information a lui seul.",
    },
    {
        token: '--border-danger-soft',
        reason: "Contour de l encadre d erreur. Le sens est porte par le texte a 8.7:1 et par le role alert, pas par la couleur du trait.",
    },
    {
        token: '--border-badge',
        reason: "Contour du compteur de taches, dont le texte est verifie. Retirer le trait ne retirerait aucune information.",
    },
    {
        token: '--border-rule',
        reason: "Filet de separation entre deux sections. Purement decoratif : la separation est aussi portee par les titres.",
    },
    {
        token: '--border-item-done',
        reason: "Liseré d une tache terminee. L etat est aussi ecrit en toutes lettres dans la ligne et rendu par un texte barre, donc jamais signale par la seule couleur.",
    },
    {
        token: '--surface-page',
        reason: "Fond de page, verifie comme arriere-plan dans les couples de texte plutot que comme premier plan.",
    },
];

// Surfaces sur lesquelles l'indicateur de focus doit rester visible.
export const FOCUS_SURFACES: readonly string[] = [
    '--surface-page',
    '--surface-card',
    '--surface-brand',
    '--action-primary',
];
