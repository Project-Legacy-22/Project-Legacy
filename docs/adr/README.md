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
| [0011](0011-anglais-pour-le-code-et-l-interface.md) | Anglais pour le code et l'interface, français pour la documentation | Accepté | la migration de nommage, toutes les revues |
| [0012](0012-pas-de-formateur-automatique.md) | Pas de formateur automatique pour l'instant | Accepté | la mise en forme, qui reste tenue par la relecture |
| [0013](0013-garantie-de-livraison-des-evenements.md) | L'outbox est la garantie, et la notification est l'effet démontrable | Accepté | tout producteur d'événement, toute cible de déploiement |
| [0014](0014-niveau-d-accessibilite-wcag-21-aa.md) | WCAG 2.1 AA comme niveau visé | Accepté | les critères d'acceptation de toutes les US front |
| [0015](0015-ghcr-comme-registre-d-images.md) | GHCR comme registre d'images | Accepté | la publication d'image et les releases |

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
| [0010](0010-canal-de-recuperation-de-compte-par-e-mail.md) | Récupération de compte par e-mail, via Supabase Auth | Accepté | `US-28` |

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
| Direction graphique, et qui arbitre | bibliothèque de composants ou CSS maison | toutes les US front | sprint 3 |

Les quatre autres points de ce tableau ont été ratifiés le 11 septembre 2026 : la garantie de
livraison et l'effet démontrable par l'ADR-0013, le niveau d'accessibilité par l'ADR-0014, le
registre d'images par l'ADR-0015. Ils étaient tranchés dans le code depuis des semaines sans
qu'aucun ADR ne l'enregistre, ce qui est ce que #228 corrige.
