# Sprint 3 — Rétrospective

- **Sprint** : 3, du 17 au 25 septembre 2026
- **Équipe** : Arthur Dos Santos, Arthur Gasmi, Arthur Guyetand, Aurélien Pochart, Seïf Soltane, Victor Briez
- **Scrum Master** : Arthur Guyetand · **Product Owner** : Victor Briez

Préparée le 24 septembre 2026 à partir des traces du sprint ([planning](../plannings/sprint-3.md),
[daily](../dailies/sprint-3.md), [revue](../reviews/sprint-3.md), historique des pull requests),
pour la rétrospective du 25 septembre. Les constats et les actions sont à valider et à compléter en
séance ; les porteurs proposés ci-dessous le sont à raison d'une action par membre.

## Ce qui a bien marché

- Tous les éléments classés Must sont livrés : la documentation d'API, le README et le scénario de
  démonstration ont fermé les trois derniers le 24 septembre.
- Les Should et Could engagés ont avancé ensemble : écran d'accueil, recherche et filtres, jeu de
  données de démonstration, réordonnancement dans une colonne, retrait d'un membre, parcours
  clavier et audits d'accessibilité.
- Le flux événementiel s'est étendu au-delà des tâches : l'ajout d'un membre produit maintenant sa
  propre notification.
- Les retours de la soutenance intermédiaire ont tous reçu une réponse documentée.
- Chacun des six membres a une contribution fusionnée sur `dev` pendant le sprint.

## Ce qui a coincé

- Le planning est resté provisoire : trois charges non renseignées et plusieurs issues non
  estimées au démarrage.
- La user story de partage d'un projet n'est pas terminée ; l'attribution d'une tâche, qui en
  dépend, n'a pas pu commencer.
- Les relectures ont été plus longues qu'aux sprints précédents, en particulier pour les pull
  requests empilées, qui attendaient celle du dessous. Des branches ouvertes en parallèle se sont
  heurtées sur des fichiers partagés, et les conflits ont été résolus en fin de sprint.
- Le 23 septembre, des migrations fusionnées n'avaient pas été appliquées à la base hébergée : la
  liste des tâches répondait 500 sur les prévisualisations. Corrigé le jour même, puis automatisé
  (#385 ; ajustement #392 en relecture).
- Aucune livraison vers `main` depuis le 15 septembre : la production n'a pas encore les
  fonctionnalités du sprint.
- Un seul daily consigné pendant le sprint.

## Actions proposées

| Action | Porteur proposé | Échéance |
|---|---|---|
| Livrer `dev` vers `main` et vérifier l'image, la release et le déploiement | Arthur Dos Santos | avant la démonstration |
| Statuer sur le partage de projet et l'attribution de tâche : terminer ou reporter explicitement | Victor Briez | revue du 25 septembre |
| Tenir la revue et la rétrospective du 25 septembre et en consigner le compte rendu | Arthur Guyetand | 25 septembre |
| Rendre `tk verify` vert en corrigeant le faux positif du scan de traces (#371) | Aurélien Pochart | avant la démonstration |
| Relire le README sur une machine vierge, comme le demande #46 | Arthur Gasmi | avant la démonstration |
| Répéter la démonstration, chronomètre en main, et éprouver le plan de repli | Seïf Soltane | avant la démonstration |
