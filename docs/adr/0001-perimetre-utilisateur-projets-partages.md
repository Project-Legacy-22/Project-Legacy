# ADR-0001 — Un projet est partagé entre plusieurs comptes

- **Statut** : Accepté
- **Date** : 2026-09-02
- **Décideurs** : équipe complète, réunion de lancement. Product Owner : Victor Briez
- **Issue liée** : #2

## Contexte

Le code hérité n'a aucune notion d'utilisateur : `todo_items` ne porte pas de propriétaire
(dette `DET-28`). Tout modèle de données part donc de zéro sur ce point.

C'est la décision la plus structurante du projet. Elle détermine le schéma, le modèle
d'autorisation, et le coût de chaque User Story qui manipule de la donnée. Elle devait être
prise avant `EN-09`, qui est sur le chemin critique de presque tout le reste.

Contraintes : six personnes, trois sprints, une revue intermédiaire qui évalue notamment un
workflow événementiel démontrable.

## Options considérées

### Option A — Mono-utilisateur
- Avantages : chaque ressource porte un propriétaire, l'autorisation se résume à « est-ce le
  mien ? ». Schéma simple, tests d'autorisation simples, une seule branche par cas.
- Inconvénients : un tableau Kanban que personne d'autre ne voit rend la démonstration
  événementielle creuse — une notification dont on est soi-même le seul destinataire ne
  prouve pas le découplage.
- Coût : le plus faible. C'était la recommandation du backlog (`D-20`).

### Option B — Projets partagés
- Avantages : le partage est ce qui rend un outil de gestion de projet crédible, et ce qui
  donne un destinataire réel aux événements de `US-10`.
- Inconvénients : table d'appartenance, rôles, invitations. L'autorisation devient un sujet
  à part entière, vérifiée par ressource et par rôle.
- Coût : doublement du nombre de cas de test sur chaque US manipulant de la donnée.

## Décision

Nous retenons **l'option B — projets partagés**, contre la recommandation du backlog.

Parce que :

1. L'architecture événementielle est un point noté et démontré en revue. Avec un seul
   utilisateur par projet, il n'y a personne à notifier : la démonstration se réduit à un
   effet de bord sur soi-même.
2. Le surcoût est concentré en un seul endroit — le modèle et la couche d'autorisation — et
   payé une fois, par `EN-09` et `US-11`. Il ne se disperse pas dans les autres items.
3. Le partage était classé `Would have` dans le backlog. L'ajouter après coup aurait imposé
   une migration du modèle en sprint 2 ou 3, c'est-à-dire le scénario le plus coûteux.

## Conséquences

**Positives**
- Les événements de `US-10` et `US-18` ont un destinataire réel, donc une démonstration
  observable.
- L'appartenance s'exprime directement en politique RLS PostgreSQL (voir ADR-0004), au plus
  près de la donnée plutôt que dispersée dans les routes.
- `US-16` cesse d'être une évolution hypothétique : elle devient un cas nominal testé.

**Négatives / dette acceptée**
- Chaque US manipulant de la donnée porte au moins deux cas de test au lieu d'un : membre et
  non-membre. C'est un coût récurrent, pas ponctuel.
- L'autorisation est la faille la plus fréquente de ce type d'application. On accepte de
  prendre ce risque tôt, en échange de tests systématiques.
- `EN-09` s'alourdit alors qu'il est déjà sur le chemin critique.

**Ce que ça impose au reste du projet**
- `EN-09` modélise `projects` et l'appartenance avec rôle **avant** toute US de tâche.
- Toute route vérifie l'appartenance de l'utilisateur courant au projet, jamais la seule
  propriété de la ressource.
- Un test d'accès refusé est un critère d'acceptation de chaque US de données, pas une US
  distincte qu'on écrirait à la fin.

## Comment on saura qu'on s'est trompé

Si à la revue du sprint 2 les US de tâches ne sont pas livrées et que la couche
d'autorisation consomme encore du temps, on gèle le partage à un rôle unique : membre, sans
rôles multiples ni invitations. Le schéma le permet sans migration, seule la surface de test
diminue. On ne revient pas au mono-utilisateur, qui imposerait une seconde refonte.

## Références

- `docs/backlog.md`, décision `D-20`
- `docs/audit-legacy.md`, dette `DET-28` (livrée par `SP-00`, PR #107)
- `EN-09`, `US-11`, `US-16`
