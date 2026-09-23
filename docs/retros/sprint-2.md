# Sprint 2 — Rétrospective

- **Sprint** : 2, du 7 au 11 septembre 2026
- **Équipe** : Arthur Dos Santos, Arthur Gasmi, Arthur Guyetand, Aurélien Pochart, Seïf Soltane, Victor Briez
- **Scrum Master** : Arthur Gasmi · **Product Owner** : Victor Briez

Aucune rétrospective n'a été consignée en séance. Celle-ci est rédigée le 24 septembre 2026 à
partir des traces du sprint : [planning](../plannings/sprint-2.md), [dailies](../dailies/sprint-2.md),
[revue](../reviews/sprint-2.md) et historique des pull requests. Elle est à relire et à compléter en
équipe.

## Ce qui a bien marché

- Les 16 items engagés, 63 points, ont tous été livrés, Must d'abord comme décidé au planning.
- Chacun des six membres a porté des user stories du cœur fonctionnel : tâches, projets, Kanban,
  compte, notifications, données personnelles, accessibilité, sécurité.
- Le découpage en sous-issues a gardé les pull requests sous 400 lignes, donc relisables.
- Le Product Owner a jugé le plan respecté et les délais tenus.

## Ce qui a coincé

- Cinq items sans porteur au planning, dont deux Must : ils ont été répartis en cours de sprint.
- Les relectures et les merges sont devenus le goulot : au daily du 10 septembre, la moitié de
  l'équipe attendait un merge ou une relecture, et des conflits sont apparus sur les fichiers
  partagés.
- Beaucoup de pull requests simultanées : 64 fusionnées sur la semaine.
- 20 bugs découverts pendant le sprint : tous corrigés, mais autant de travail non prévu au
  planning.
- La production servait encore le code du 11 septembre ; le relais d'événements n'y tournait pas
  tant que la livraison suivante n'était pas faite.

## Actions, et ce qu'il en est advenu

| Action | Suite constatée |
|---|---|
| Classer un bug découvert à part, sans remplacer silencieusement un engagement | décidé au planning du sprint 3 |
| Livrer régulièrement vers `main` | livraison du 15 septembre ; le relais tourne en production depuis |
| Répondre aux points de vigilance de la soutenance intermédiaire | ADR-0016 et ADR-0017, sauvegarde et restauration éprouvées, migration de données dans les deux sens ; voir la [revue de la soutenance](../reviews/soutenance-intermediaire.md) |
