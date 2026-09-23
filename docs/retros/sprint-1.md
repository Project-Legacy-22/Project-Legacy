# Sprint 1 — Rétrospective

- **Sprint** : 1, du 1er au 4 septembre 2026
- **Équipe** : Arthur Dos Santos, Arthur Gasmi, Arthur Guyetand, Aurélien Pochart, Seïf Soltane, Victor Briez
- **Scrum Master** : Aurélien Pochart · **Product Owner** : Victor Briez

Aucune rétrospective n'a été consignée en séance. Celle-ci est rédigée le 24 septembre 2026 à
partir des traces du sprint : [planning](../plannings/sprint-1.md), [daily](../dailies/sprint-1.md),
[revue](../reviews/sprint-1.md), [réunion de lancement](../decisions/2026-09-02-reunion-de-lancement.md)
et historique des pull requests. Elle est à relire et à compléter en équipe.

## Ce qui a bien marché

- Toutes les issues prévues ont été terminées, et chacun des six membres a livré sa part dès ce
  premier sprint.
- Les fondations ont été posées tôt, comme le sujet le demande : architecture en couches, front
  Vite, base versionnée, intégration continue, quality gate, authentification et premier flux
  événementiel.
- La réunion de lancement a tranché les décisions structurantes en une séance ; elles sont devenues
  des ADR.
- Des cérémonies courtes : dix à quinze minutes par daily.

## Ce qui a coincé

- Les technologies n'ont été arrêtées que le 2 septembre : le sprint n'a réellement démarré que le 3.
- Des chaînes de dépendances : l'authentification attendait la base, les tâches attendaient
  l'authentification. Plusieurs personnes ont attendu en même temps le même élément.
- Le dépôt de l'école ne permettait ni d'imposer les pull requests ni de protéger `main` : il a
  fallu travailler sur un dépôt miroir.
- 34 pull requests fusionnées dès le premier sprint : un rythme soutenu, que la relecture a dû
  suivre.
- Deux points de la réunion de lancement, la qualité et l'interface, sont restés sans décision
  consignée.

## Actions, et ce qu'il en est advenu

| Action | Suite constatée |
|---|---|
| Découper les user stories en sous-issues API puis interface | adopté au planning du sprint 2, qui l'a appliqué systématiquement |
| Trancher les points restés ouverts | ADR-0009 (SonarCloud), ADR-0011 (langue), ADR-0014 (WCAG 2.1 AA), ADR-0015 (GHCR) |
| Exiger une approbation avant fusion sur `dev` | protection de branche en place : une approbation et la vérification SonarCloud exigées |
