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

Les quatre décisions qui engagent un service externe. Ce sont celles dont le coût de sortie
doit être écrit, et dont les affirmations techniques sont sourcées plutôt que supposées.

| ADR | Décision | Statut | Débloque |
|---|---|---|---|
| [0004](0004-supabase-comme-sgbd.md) | Supabase comme SGBD, pile locale en développement et en CI | Accepté | `EN-03`, `EN-09`, `EN-30` |
| [0005](0005-acces-aux-donnees-et-migrations.md) | Accès par le client Supabase, schéma versionné en migrations | Accepté | `EN-09` |
| [0007](0007-mecanisme-d-evenements-broker-redis.md) | Redis comme broker d'événements | Accepté | `US-10`, `US-18`, `EN-35` |
| [0008](0008-strategie-de-session-supabase-auth.md) | Sessions et authentification par Supabase Auth | Accepté | `US-11`, `US-27`, `US-47`, `US-13` |
| [0009](0009-sonarcloud-comme-outil-de-quality-gate.md) | SonarCloud comme outil de quality gate, seuils du gate intégré | Accepté | `EN-17` |

L'ADR-0007 a lui aussi été tranché **contre** la recommandation du backlog, qui proposait un
bus in-process. Les huit décisions bloquantes (`D-03` à `D-20`) sont désormais couvertes.

L'ADR-0009 tranche `D-11` (seuil de couverture) sur une valeur différente de la proposition du
backlog (80 % au lieu de 70 %), imposée par le plan gratuit de SonarCloud plutôt que choisie :
la raison est dans l'ADR, pas ici.

## Ce qui reste à trancher

Ces points n'ont pas d'ADR parce qu'ils n'ont pas de décision. Ils ne bloquent pas le
sprint 1, mais chacun bloque quelque chose plus loin.

| À trancher | Proposition | Bloque | Échéance |
|---|---|---|---|
| Garantie de livraison des événements : outbox conservée ou perte assumée | outbox conservée, Redis comme transport | `EN-35`, et donc `US-10` | planning du sprint 2, **avant le premier producteur** |
| Effet visible démontrant le flux événementiel | « créer une tâche produit une notification visible » | la démonstration de revue | planning du sprint 2 |
| Registre d'images | GHCR, déjà lié au dépôt | `EN-08` | sprint 1 |
| Niveau d'accessibilité visé | WCAG 2.1 AA | critères d'acceptation des US front | sprint 1 |
| Langue de l'interface, messages d'erreur compris | une seule, tranchée une fois | toutes les US front | sprint 1 |
| Direction graphique, et qui arbitre | bibliothèque de composants ou CSS maison | toutes les US front | sprint 1 |

Le premier point de ce tableau est le seul qui soit une conséquence directe d'une décision
prise : l'ADR-0007 a retenu un broker sans statuer sur ce qui garantit qu'un événement publié
corresponde à un fait réellement écrit. Il est daté et rattaché à `EN-35`.
