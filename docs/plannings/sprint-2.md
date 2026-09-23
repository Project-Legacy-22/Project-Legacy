# Sprint 2 — Planning

- **Date** : lundi 7 septembre 2026
- **Sprint** : 2, du 7 au 11 septembre 2026
- **Présents** : Arthur Dos Santos, Arthur Gasmi, Arthur Guyetand, Aurélien Pochart, Seïf Soltane, Victor Briez
- **Scrum Master** : Arthur Gasmi · **Product Owner** : Victor Briez

## Bilan du sprint précédent

- Points complétés contre points prévus : toutes les issues prévues ont été faites.
- Non terminé : rien.

## Objectif

Livrer le cœur fonctionnel du Kanban : gestion complète d'une tâche, regroupement par projet,
déplacement entre colonnes, et le parcours de compte au-delà de la simple connexion.

## User stories retenues

| ID | User story | Points | Assigné à |
|---|---|---|---|
| US-31 | Modifier, terminer et supprimer une tâche | 3 | Arthur Guyetand |
| US-16 | Regrouper mes tâches par projet | 5 | à assigner |
| US-15 | Déplacer une tâche entre les colonnes du Kanban | 8 | Arthur Guyetand |
| US-47 | Me déconnecter | 2 | Aurélien Pochart |
| US-36 | Modifier mon e-mail et mon mot de passe | 3 | Victor Briez |
| US-37 | Politique de confidentialité et consentement | 3 | à assigner |
| US-13 | Exporter et supprimer mes données personnelles | 5 | Arthur Gasmi |
| US-27 | Session persistante et expiration propre | 3 | Arthur Gasmi |
| US-19 | Priorité et échéance sur une tâche | 3 | Arthur Guyetand |
| US-18 | Être notifié des événements qui me concernent | 5 | Aurélien Pochart |
| US-28 | Réinitialiser mon mot de passe oublié | 5 | Victor Briez |
| US-14 | Conformité d'accessibilité et remédiation | 5 | à assigner |
| EN-48 | États de chargement, vide et erreur cohérents | 3 | à assigner |
| EN-29 | Durcissement de la sécurité de l'API | 3 | Victor Briez |
| EN-25 | Tests d'intégration de l'API, autorisation incluse | 5 | Aurélien Pochart |
| EN-38 | Registre des traitements et minimisation | 2 | à assigner |

Total des points engagés : 63 points de backlog. Les 29 points de Must (US-31, US-16, US-15,
US-47, US-36, US-37, US-13) sont le plancher : ils passent avant tout Should.

## Risques identifiés

- US-15 vaut 8 points et est bloquée par US-16, qui n'a pas encore de porteur.
- Cinq items du sprint sont encore sans assigné, dont deux Must.
- Deux pull requests Dependabot en attente.

## Décisions

- Le sprint s'engage sur les 16 items Ready du backlog du sprint 2, dans l'ordre du tableau, Must
  d'abord.
- Les cinq items sans assigné sont répartis à un daily proche, selon l'avancement général.
- Découpage systématique en sous-issues API puis interface, comme sur US-11 et US-12 au sprint 1 :
  le format a bien fonctionné et garde les pull requests sous 400 lignes.
- Rythme inchangé, mais le daily passe à 14 h 30. Revue du sprint le vendredi 11 septembre à
  14 h 30.
