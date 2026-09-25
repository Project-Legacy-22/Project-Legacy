# ADR-0021 — Réassignation du propriétaire d'un projet partagé à l'effacement de son compte

- **Statut** : Accepté
- **Date** : 2026-09-25
- **Décideurs** : équipe
- **Issue liée** : #425

## Contexte

`erase_account` supprimait déjà, avant cette décision, toute ligne nommant le compte effacé :
appartenances, événements en file, puis le compte lui-même. Les tâches d'un projet partagé
suivaient le même sort que le compte qui les avait créées : `items.user_id` était `not null`
avec `on delete cascade`, si bien qu'effacer son propre compte effaçait aussi les tâches créées
dans un projet partagé avec d'autres membres, alors que ces membres y avaient encore accès la
minute précédente.

Un projet dont le compte effacé était l'unique propriétaire pose une deuxième question, distincte
de la première : `project_memberships` n'impose aucune contrainte sur le nombre de propriétaires
ni sur leur permanence. Sans règle explicite, un tel projet resterait sans propriétaire après
l'effacement, alors qu'il compte encore des membres.

## Options considérées

### Option A — ne rien changer, documenter la perte comme une limite connue
- Avantages : aucun code à écrire.
- Inconvénients : un membre perd son propre travail sur simple décision d'un autre compte ; la
  politique de confidentialité (US-37) promet la conservation des données des autres personnes,
  que cette perte contredit directement.

### Option B — transférer le compte effacé à un compte système anonyme
- Avantages : `user_id` reste `not null`, aucune migration de contrainte.
- Inconvénients : un compte système qui n'existe dans aucun flux d'authentification est une
  fiction à maintenir partout où `user_id` est lu comme un compte réel (notifications,
  autorisation) ; introduit une exception à documenter sans bénéfice mesurable sur la première.

### Option C — `user_id` nullable avec `on delete set null`, et réassignation du membre le plus
ancien comme propriétaire quand le compte effacé était le seul
- Avantages : la tâche reste, avec un lien vers son créateur rompu par construction plutôt que
  simulé ; un projet à plusieurs membres ne se retrouve jamais sans propriétaire ; la règle de
  réassignation est déterministe et ne demande aucune saisie au moment de l'effacement.
- Inconvénients : `user_id` devient nullable, ce qui déplace la charge de la non-nullité vers
  chaque lecture qui en dépendait implicitement (repéré et corrigé site par site à l'implémentation :
  `Item.ownerId`, `itemCreated`).

## Décision

Nous retenons **l'option C**.

Parce que : l'autorisation d'accès à un projet est déjà entièrement portée par
`project_memberships` (confirmé en lisant les politiques RLS existantes, qui ne référencent pas
`items.user_id`) — nullifier ce champ ne retire donc aucun droit à personne ; le critère
« membre le plus ancien » ne demande aucune entrée externe au moment de l'effacement, un geste
qui doit rester immédiat ; et une réassignation explicite, testée, vaut mieux qu'un projet sans
propriétaire découvert plus tard par un comportement qui échoue silencieusement.

## Conséquences

**Positives**
- Un membre d'un projet partagé ne perd plus son accès à une tâche du seul fait qu'un autre
  membre a effacé son compte.
- Un projet à plusieurs membres garde toujours un propriétaire après l'effacement de l'ancien.

**Négatives / dette acceptée**
- `items.user_id` étant nullable, le typage de `Item.ownerId` (`string | null`) rend visible,
  partout où il est lu, qu'une tâche peut avoir survécu à son créateur. Chaque site déjà présent
  a été revu à l'implémentation ; un site futur qui suppose `ownerId` non nul sans le vérifier est
  un bug, pas une conséquence acceptée de cette décision.
- Une fois `user_id` mis à `null`, aucune trace ne permet de retrouver quel compte avait créé la
  tâche : la réassignation comme la rupture du lien sont irréversibles par construction.

**Ce que ça impose au reste du projet**
- Toute nouvelle lecture de `items.user_id` (ou de `Item.ownerId` côté domaine) doit traiter le
  cas nul comme un état normal, pas une erreur.
- Le critère de réassignation (membre restant le plus ancien, par `project_memberships.created_at`)
  est écrit une seule fois, dans `erase_account` ; il n'est pas dupliqué côté application.

## Comment on saura qu'on s'est trompé

Un projet à plusieurs membres se retrouve sans propriétaire après un effacement, observé en
production ou en intégration ; ou un accès à une tâche est refusé à un membre légitime à cause
d'un `user_id` devenu nul.

## Références

- `supabase/migrations/20260925090000_preserve_shared_project_items_on_erasure.sql`
- `apps/api/test/integration/account-erasure.integration.test.ts`
- `docs/gdpr/registre.md`, sections T-03 et T-07
