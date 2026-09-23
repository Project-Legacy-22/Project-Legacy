# Réunion de lancement — 2 septembre 2026

Objectif fixé : sortir de la réunion avec les décisions qui conditionnent la Definition of Ready.
Tant qu'elles n'étaient pas actées, aucune user story de développement ne pouvait démarrer.

Pour chaque point, une recommandation argumentée servait de départ, à valider ou à rejeter.
Chaque décision structurante devait ensuite devenir un ADR ([docs/adr/](../adr/README.md)).

Règle de tenue : on tranche, on note la raison en une phrase, on passe ; un point qui déborde est
reporté avec une date.

## Décisions

| # | Sujet | Recommandation apportée | Décision retenue |
|---|---|---|---|
| 1 | Product Owner | une seule personne, qui arbitre le périmètre | Victor Briez |
| 1 | Rotation du Scrum Master | exigée par le sujet | sprint 1 : Aurélien Pochart ; sprint 2 : Arthur Gasmi ; sprint 3 : Arthur Guyetand |
| 1 | Revues et daily | échéances de sprint les 4, 11 et 25 septembre | revue du sprint 1 le vendredi 4 septembre à 14 h 30 ; daily à 16 h |
| 2 | Périmètre utilisateur | mono-utilisateur, le partage en Would have | **projets partagés** |
| 3.1 | Typage du backend | TypeScript strict | TypeScript |
| 3.2 | Découpage du backend | par domaine, en couches à l'intérieur | par domaine, en couches à l'intérieur |
| 4.1 | SGBD | PostgreSQL | **Supabase** (PostgreSQL hébergé) |
| 4.2 | Accès aux données | query builder ou ORM léger, migrations versionnées | le query builder de Supabase |
| 5 | Chaîne de build du front | Vite, React conservé | Vite, React conservé |
| 6 | Mécanisme d'événements | bus en mémoire avec table outbox | **broker externe, Redis** |
| 7 | Sessions et authentification | jeton d'accès court et jeton de renouvellement révocable, en cookie httpOnly | **Supabase** (Supabase Auth) |
| 8 | Quality gate, couverture, registre d'images | SonarCloud bloquant ; 70 % sur le nouveau code ; GHCR | aucune décision consignée en séance |
| 9 | Accessibilité, langue, direction graphique | WCAG 2.1 AA ; une seule langue ; bibliothèque ou CSS maison | aucune décision consignée en séance |

En gras, les points où la décision s'écarte de la recommandation apportée. Les ADR du dépôt en
donnent la justification.

## Points hors ordre du jour, tranchés quand même

| Sujet | Décision |
|---|---|
| Canal de notification | les deux : dans l'application et par e-mail |
| Responsable de traitement RGPD et contact | Seïf Soltane |
| Durées de conservation des données | indéfiniment, sauf demande de l'utilisateur et dans le cadre du RGPD |
| Cible de déploiement | Vercel |
| Scénario et jeu de données de démonstration | à voir plus tard |

## Après la réunion

Suites prévues en séance :

1. Écrire un ADR par décision structurante, mergé avant que l'item qu'il débloque démarre.
2. Compléter `docs/team.md` : rôles, rotation, calendrier.
3. Affiner `.github/CODEOWNERS` avec l'ownership par module.
4. Activer l'assignation tournante des relectures sur l'équipe.
5. Repasser les items du sprint 1 en Ready une fois leurs décisions levées.
6. Prendre les premières issues dans l'ordre des dépendances : EN-03 et EN-04 en parallèle, puis
   EN-05, EN-09, EN-06.
