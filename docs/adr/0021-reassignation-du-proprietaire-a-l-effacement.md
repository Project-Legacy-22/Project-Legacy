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

Le même mécanisme touchait une troisième table, trouvée en écrivant le test d'intégration de
cette décision plutôt qu'en relisant le schéma : `project_invitations.invited_by` était lui
aussi `not null` avec `on delete cascade`. Effacer le compte qui a invité quelqu'un supprimait
l'invitation, ce qui supprimait en cascade la notification que la personne invitée avait déjà
reçue (`notifications.invitation_id` référence `project_invitations` en cascade) — y compris
dans un projet que l'effacement laisse par ailleurs intact.

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

Nous retenons **l'option C**, et lui appliquons le même traitement qu'à `items.user_id` :
`project_invitations.invited_by` devient nullable avec `on delete set null` au lieu de
`on delete cascade`. L'invitation et la notification qu'elle a produite survivent à
l'effacement de la personne qui a invité ; seul le lien vers elle est rompu.

Parce que : l'autorisation d'accès à un projet est déjà entièrement portée par
`project_memberships` (confirmé en lisant les politiques RLS existantes, qui ne référencent pas
`items.user_id`) — nullifier ce champ ne retire donc aucun droit à personne ; le critère
« membre le plus ancien » ne demande aucune entrée externe au moment de l'effacement, un geste
qui doit rester immédiat ; et une réassignation explicite, testée, vaut mieux qu'un projet sans
propriétaire découvert plus tard par un comportement qui échoue silencieusement. La même
logique vaut pour `invited_by` : rien n'autorise ou n'affiche quoi que ce soit à partir de ce
champ en dehors de l'adresse montrée à la personne invitée, qui devient simplement absente.

## Conséquences

**Positives**
- Un membre d'un projet partagé ne perd plus son accès à une tâche du seul fait qu'un autre
  membre a effacé son compte.
- Un projet à plusieurs membres garde toujours un propriétaire après l'effacement de l'ancien.
- Une invitation en attente, et la notification qu'elle a produite, ne disparaissent plus parce
  que la personne qui a invité a effacé son compte — tant que le projet lui-même survit.

**Négatives / dette acceptée**
- `items.user_id` et `project_invitations.invited_by` étant nullables, le typage de
  `Item.ownerId` et `PendingInvitation.invitedByEmail` (`string | null`) rend visible, partout où
  ils sont lus, qu'une ligne peut avoir survécu à son auteur. Chaque site déjà présent a été revu
  à l'implémentation ; un site futur qui suppose l'un des deux non nul sans le vérifier est un
  bug, pas une conséquence acceptée de cette décision.
- Une fois l'un ou l'autre champ mis à `null`, aucune trace ne permet de retrouver quel compte
  avait créé la tâche ou envoyé l'invitation : la réassignation comme la rupture du lien sont
  irréversibles par construction.

**Ce que ça impose au reste du projet**
- Toute nouvelle lecture de `items.user_id` ou de `project_invitations.invited_by` (ou de leurs
  équivalents domaine) doit traiter le cas nul comme un état normal, pas une erreur.
- Le critère de réassignation (membre restant le plus ancien, par `project_memberships.created_at`)
  est écrit une seule fois, dans `erase_account` ; il n'est pas dupliqué côté application.

## Comment on saura qu'on s'est trompé

Un projet à plusieurs membres se retrouve sans propriétaire après un effacement, observé en
production ou en intégration ; un accès à une tâche est refusé à un membre légitime à cause
d'un `user_id` devenu nul ; ou une notification d'invitation disparaît pour son destinataire
après l'effacement de la personne qui a invité, alors que le projet survit.

## Références

- `supabase/migrations/20260925090000_preserve_shared_project_items_on_erasure.sql`
- `supabase/migrations/20260925093000_preserve_invitations_on_inviter_erasure.sql`
- `apps/api/test/integration/account-erasure.integration.test.ts`
- `scripts/check-project-invitations.sql`
- `docs/gdpr/registre.md`, sections T-03, T-07 et T-10
