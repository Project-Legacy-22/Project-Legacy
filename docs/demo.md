# Démonstration finale

Le déroulé de la revue finale, étape par étape : ce qu'on montre, ce que chaque étape doit
prouver, qui la présente et combien de temps elle prend (#47). Il couvre chaque point de la grille
d'évaluation du sujet (§9) et dit, pour chacun, quelle étape y répond.

**Durée visée : 20 minutes**, questions non comprises. Le sujet ne fixe pas la durée de la revue :
c'est une hypothèse à confirmer auprès de l'encadrement, et le minutage se resserre si elle est plus
courte (les étapes 7 et 9 se fondent alors dans les autres).

## Préparation

La veille :

- [ ] `npm ci && npm run up` sur la machine qui présente ; puis `npm run db:reset`, qui recharge le
      jeu de démonstration avec des échéances calculées depuis le jour même (une tâche en retard,
      une pour aujourd'hui).
- [ ] La production répond : <https://project-legacy-web-legacy-9eee.vercel.app>, connexion avec
      un compte d'équipe.
- [ ] La dernière exécution de `ci` sur `dev` est verte, la dernière livraison a publié son image
      et sa release, le workflow `relais` est vert.
- [ ] Le tableau Grafana « Legacy 22 — flux et service » affiche des mesures des dernières heures.
- [ ] Une pull request de démonstration est ouverte et **non approuvée**, pour l'étape 6.
- [ ] Les comptes rendus de revue et de rétrospective de chaque sprint sont écrits dans
      `docs/reviews/sprint-N.md` et `docs/retros/sprint-N.md`, actions assignées comprises. Au
      24 septembre 2026, aucun n'est dans le dépôt : l'étape 8 n'a rien à montrer tant qu'ils
      manquent, et seule l'équipe peut les écrire.

Le jour même, dans cet ordre, trois terminaux et un navigateur :

```bash
# terminal 1 : broker et base
docker compose up -d && npm run db:start
# terminal 2 : API et front
npm run dev:api & npm run dev:web
# terminal 3 : le worker seul, pour pouvoir l'arrêter à l'étape 3
npm run dev:worker
```

Onglets ouverts à l'avance : l'application locale (<http://localhost:5173>), la production, le
dépôt (pull requests, onglet Actions), le board du Project, SonarCloud, le site Pages (couverture
et documentation d'API), Grafana.

Comptes du jeu de démonstration, qui n'existent que sur la pile locale : `camille.demo@example.com`
et `hugo.demo@example.com`, mot de passe `DemoLegacy2026`.

## Le déroulé

| # | Durée | Étape | Ce qu'on montre | Ce que ça prouve |
|---|---|---|---|---|
| 1 | 1 min | D'où l'on part | `docs/audit-legacy.md` : l'application reprise, sa dette mesurée, point par point | l'existant a été compris avant d'être changé |
| 2 | 4 min | Le produit, par priorité | connexion en tant que Camille ; écran d'accueil (tâche en retard, tâche du jour, priorité haute) ; ouverture d'une tâche depuis l'accueil ; création d'une tâche avec priorité et échéance ; déplacement dans le Kanban **au clavier** ; réordonnancement dans une colonne ; membres d'un projet | les Must puis les Should livrés, et l'accessibilité tenue |
| 3 | 3 min | Le flux événementiel de bout en bout | `Ctrl+C` dans le terminal 3 ; création d'une tâche ; `docker compose exec redis redis-cli LLEN legacy22:events` monte ; relance de `npm run dev:worker` ; la file se vide et la notification apparaît dans l'interface ; `docs/events/catalog.md` | l'outbox transactionnelle, le courtier, la consommation idempotente ; un événement n'est jamais perdu quand le consommateur tombe |
| 4 | 2 min | RGPD | export JSON du compte ; suppression du compte d'Hugo après confirmation par l'adresse ; `docs/gdpr/registre.md` | portabilité, effacement réel, registre tenu |
| 5 | 3 min | Qualité et tests | les jobs de `ci` sur une pull request ; le quality gate SonarCloud ; le rapport de couverture sur Pages ; la documentation d'API générée ; `docs/testing-levels.md` | une pyramide de tests réelle, une couverture mesurée, une API décrite sans lire le code |
| 6 | 2 min | Ce qui bloque une pull request | la PR non approuvée : bouton de merge bloqué (une approbation et SonarCloud exigés sur `dev`) ; une approbation annulée par un nouveau push ; `git push origin HEAD:dev` refusé par le hook `pre-push` ; le workflow `guard-branches` ; `tk verify` et ses seize contrôles | le processus n'est pas déclaratif : un contournement est refusé ou tracé |
| 7 | 2 min | Livraison | `tk release` : la PR `dev` vers `main`, le merge commit ; l'image GHCR taguée `sha-<court>` avec son attestation ; la release ; le déploiement Vercel ; le workflow `migrations` | CI/CD complet, artefacts traçables jusqu'au commit |
| 8 | 2 min | Organisation agile | le board et ses vues (sprint courant, bloqué, hors périmètre) ; MoSCoW et milestones ; les Would documentés et non développés ; les comptes rendus `docs/reviews/` et `docs/retros/` | Scrum pratiqué, priorisation assumée, traces laissées |
| 9 | 1 min | Architecture et décisions | `docs/architecture.md` (couches, flux d'une requête) ; l'index des ADR ; le tableau Grafana | des choix explicites, justifiables, et un système observable |

Total : 20 minutes.

## Correspondance avec la grille d'évaluation

| Point de la grille (sujet §9) | Étapes |
|---|---|
| Couverture fonctionnelle selon les priorités | 2, 3, 4 |
| Qualité du code et couverture de tests | 5, 9 |
| CI/CD | 5, 6, 7 |
| Historique Git et pratique des pull requests | 6, 7 |
| Organisation agile et rétrospective d'équipe | 8 |
| Qualité et maintenabilité d'ensemble | 1, 5, 9 |
| Rappel de la revue intermédiaire : architecture, flux événementiel, backlog, conventions Git, quality gate, parcours d'une US | 9, 3, 8, 6, 5, 2 et 7 |

## Plan de repli

Chaque dépendance qui ne nous appartient pas a son alternative, préparée la veille.

| Si ceci manque | On montre à la place |
|---|---|
| Vercel ou la production | la pile locale, qui porte tout le parcours ; le dernier déploiement dans l'historique Vercel |
| Le projet Supabase hébergé | la pile locale (`npm run db:start`), qui est un Supabase complet |
| Upstash | le Redis local de `compose.yaml`, qui est celui de l'étape 3 de toute façon |
| GitHub | `git log --graph` en local ; les pages de PR et d'Actions enregistrées la veille en PDF |
| SonarCloud ou Grafana | une capture de la veille, datée ; le rapport de couverture local (`coverage/index.html`) |
| Le réseau entier | la pile locale seule ; les captures et PDF de la veille pour le reste |

La pile locale ne dépend que de Docker : elle est le socle de repli de toutes les autres lignes.

## Qui présente quoi

Proposition fondée sur ce que chacun a porté, d'après les revues de sprint : deux interventions par
membre, **à valider en réunion d'équipe**. La répartition finale se reporte ici, nommément, avant
la répétition.

| Étape | Présente | Répond aux questions sur |
|---|---|---|
| 1 | Arthur Dos Santos | l'audit de l'existant, la fondation |
| 2, connexion et session | Arthur Gasmi | comptes, session persistante et expiration |
| 2, accueil et recherche | Victor Briez | écran d'accueil, recherche et filtres |
| 2, Kanban et membres | Arthur Guyetand | tâches, Kanban, réordonnancement, membres |
| 3 | Seïf Soltane | flux événementiel, idempotence |
| 4 | Arthur Gasmi | export et suppression des données, RGPD |
| 5 | Aurélien Pochart | tests, accessibilité |
| 6 | Aurélien Pochart | quality gate, protections d'une pull request |
| 7 | Arthur Dos Santos | intégration continue, livraison |
| 8 | Victor Briez et Arthur Guyetand | backlog et priorisation ; board et rétrospective |
| 9 | Seïf Soltane | architecture, ADR, hébergement des données |

## Répétition

- [ ] Répétée de bout en bout, chronomètre en main : date, durée mesurée, ce qui a débordé.
- [ ] Le plan de repli essayé au moins pour la ligne « le réseau entier ».

Tant que ces deux cases ne sont pas cochées et datées, la démonstration n'est pas prête.
