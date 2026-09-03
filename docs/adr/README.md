# Décisions d'architecture

Une décision structurante par fichier. Un ADR n'est pas un compte rendu : il enregistre le
contexte au moment du choix, les options réellement envisagées, la raison qui a tranché, le
coût accepté, et le signal observable qui le remettrait en cause.

Un ADR est **immuable une fois mergé**. Une décision qui change ne se réécrit pas : on ouvre
un nouvel ADR et on passe l'ancien en `Remplacé par ADR-NNNN`. L'historique des décisions est
un livrable au même titre que le code.

Format : `docs/adr/_template.md`. Numérotation continue, jamais réattribuée.

## Décisions de conception

Comment nous écrivons le code, indépendamment des services dont il dépend.

| ADR | Décision | Statut | Débloque |
|---|---|---|---|
| [0001](0001-perimetre-utilisateur-projets-partages.md) | Un projet est partagé entre plusieurs comptes | Accepté | `EN-09`, `US-11`, `US-16`, le modèle entier |
| [0002](0002-typescript-strict.md) | TypeScript strict sur tout le dépôt | Accepté | `EN-04`, `EN-06` |
| [0003](0003-decoupage-du-backend-par-domaine.md) | Découpage du backend par domaine, en couches à l'intérieur | Accepté | `EN-04` |
| [0006](0006-chaine-front-vite-et-react.md) | Vite pour la chaîne front, React conservé | Accepté | `EN-05` |

L'ADR-0001 a été tranché **contre** la recommandation du backlog, qui proposait le
mono-utilisateur. Il porte la raison qui a emporté la décision et le coût accepté en échange.

## Décisions de plateforme

Les quatre décisions qui engagent un service externe — SGBD, accès aux données, mécanisme
d'événements, stratégie de session — portent les numéros 0004, 0005, 0007 et 0008. Elles
sont traitées par #110, qui complète cet index.

## Ce qui reste à trancher

Ces points n'ont pas d'ADR parce qu'ils n'ont pas de décision. Ils ne bloquent pas le
sprint 1, mais chacun bloque quelque chose plus loin.

| À trancher | Proposition | Bloque | Échéance |
|---|---|---|---|
| Outil de gate qualité | SonarCloud | `EN-17` | sprint 1 |
| Registre d'images | GHCR, déjà lié au dépôt | `EN-08` | sprint 1 |
| Niveau d'accessibilité visé | WCAG 2.1 AA | critères d'acceptation des US front | sprint 1 |
| Langue de l'interface, messages d'erreur compris | une seule, tranchée une fois | toutes les US front | sprint 1 |
| Direction graphique, et qui arbitre | bibliothèque de composants ou CSS maison | toutes les US front | sprint 1 |
