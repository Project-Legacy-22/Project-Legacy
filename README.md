# Legacy 22

Legacy 22 reprend l'application TodoList de `docker/getting-started-app` et en fait une
application Kanban maintenable : comptes et sessions, projets partagés entre membres, tâches
avec statut, priorité et échéance, tableau Kanban utilisable au clavier, écran d'accueil de ce
qui demande de l'attention, notifications produites par un flux événementiel, export et
suppression des données personnelles.

**Ce qu'elle n'est pas** : ni un outil de gestion de projet complet (pas de sous-tâches, de
commentaires, de pièces jointes, de colonnes personnalisées ni de temps réel), ni une
application mobile. Ces sujets sont documentés comme hors périmètre dans le backlog, pas
improvisés.

## Où elle tourne

| Cible | Adresse | Ce qu'elle sert |
|---|---|---|
| Production | <https://project-legacy-web-legacy-9eee.vercel.app> | la branche `main`, front et API sur la même origine |
| Prévisualisations | une adresse par pull request et pour `dev`, dans les contrôles de la PR | le code de la branche, sur la même base que la production |
| Image Docker | `ghcr.io/project-legacy-22/project-legacy` | chaque livraison sur `main`, pour une exécution hors Vercel |
| Poste de développement | <http://localhost:5173> | après `npm run up`, avec une base et un broker locaux |

La production ne sert pas le worker : sur Vercel, la passe de livraison des événements est
déclenchée par l'écriture elle-même et par un appel toutes les trente secondes
(`docs/ci.md`, ADR-0020). Elle ne contient aucun compte de démonstration : ceux-ci n'existent que sur la
pile locale.

## Documentation

| Sujet | Où |
|---|---|
| Architecture, couches, flux d'une requête et flux événementiel | [docs/architecture.md](docs/architecture.md) |
| Décisions et leurs raisons | [docs/adr/](docs/adr/README.md) |
| Catalogue des événements | [docs/events/catalog.md](docs/events/catalog.md) |
| Intégration continue, livraison, déploiement | [docs/ci.md](docs/ci.md) |
| Chaque fonctionnalité livrée, ses règles et ses cas d'erreur | [docs/features/](docs/features/README.md) |
| Niveaux de tests | [docs/testing-levels.md](docs/testing-levels.md) |
| Registre des traitements RGPD | [docs/gdpr/registre.md](docs/gdpr/registre.md) |
| Sauvegarde, restauration et sortie de Supabase | [docs/backup-and-exit.md](docs/backup-and-exit.md) |
| Reprise des données de l'ancienne application | [docs/data-migration.md](docs/data-migration.md) |

## Commandes

| Commande | Ce qu'elle fait |
|---|---|
| `npm run up` | démarre tout : broker, base de données, API, front et worker |
| `npm run down` | arrête le broker et la base de données |
| `npm run dev` | API et serveur Vite, en lisant `.env` |
| `npm run dev:api`, `npm run dev:web`, `npm run dev:worker` | un seul étage, par exemple le worker pendant une démonstration |
| `npm run lint` | analyse statique sur tout le dépôt, `apps/web` compris |
| `npm run typecheck` | types de la production et des tests, workspace web, puis contrôle des frontières de couches |
| `npm test` | tests unitaires, HTTP et du front, avec un rapport de couverture unique dans `coverage/` |
| `npm run test:unit`, `npm run test:http`, `npm run test:dom` | un seul niveau de la suite ci-dessus |
| `npm run test:integration` | tests contre la pile Supabase locale et le broker, qui doivent tourner |
| `npm run test:migration` | reprise et sortie des données, rejouées sur trois moteurs en conteneurs |
| `npm run build` | build de production, front écrit dans `apps/api/dist/static` |
| `npm start`, `npm run start:worker` | le build de production de l'API, du worker |
| `npm run db:start` | pile Supabase locale et application des migrations |
| `npm run db:reset` | rejoue les migrations depuis une base vide, puis le jeu de démonstration |
| `npm run db:types` | régénère les types TypeScript du schéma |
| `npm run db:lint` | contrôles statiques sur le schéma |
| `npm run backup` | sauvegarde du projet hébergé lié, voir [docs/backup-and-exit.md](docs/backup-and-exit.md) |
| `npm run data:export`, `npm run data:import` | sortie et reprise des données, voir [docs/data-migration.md](docs/data-migration.md) |

## Prérequis

| Outil | Version | Où c'est fixé |
|---|---|---|
| Node.js | 22.12.0 recommandé ; `^20.19.0` ou `>=22.12.0` acceptés | `.nvmrc`, champ `engines` de `package.json` |
| npm | celui livré avec Node, 10 ou plus : les workspaces et `npm ci` en dépendent | |
| Docker | un moteur démarré, avec `docker compose` (v2) | la base locale et le broker tournent en conteneurs |

Le CLI Supabase n'est pas à installer : c'est une dépendance de développement (`supabase` dans
`package.json`), appelée par `npx supabase` depuis les scripts. Avec `nvm`, `nvm use` lit
`.nvmrc`.

## Organisation

```text
api/                     Point d'entrée de la fonction Vercel, qui sert l'application Express
apps/
├── api/                 API Express et composition de l'application
├── web/                 Interface React construite avec Vite
└── worker/              Consommateur d'événements, processus distinct
packages/
├── contracts/           Schémas zod et types partagés aux frontières
├── core/auth/           Domaine et cas d'usage de l'authentification
├── core/items/          Domaine et cas d'usage des tâches
├── core/projects/       Domaine et cas d'usage des projets et de leurs membres
├── core/notifications/  Domaine et cas d'usage des notifications
├── data-migration/      Reprise et sortie des données, sans dépendance
└── infra/               Adaptateurs : Supabase, Redis, identité, métriques, journalisation
supabase/                Migrations versionnées, configuration locale, jeu de démonstration
test/                    Tests transverses : niveaux, migrations, registre des fonctions SQL
docs/                    Architecture, ADR, fonctionnalités, CI, RGPD
```

Le front utilise les contrats de `packages/contracts` pour valider les réponses de l'API.
Il ne dépend pas directement des modules du domaine ou de l'infrastructure.

## Démarrer

Deux commandes depuis un dépôt fraîchement cloné, dont une seule à répéter ensuite :

```bash
npm ci        # installe exactement les dépendances du lockfile
npm run up    # démarre le broker, la base de données, l'API et le front
```

`npm run up` enchaîne le broker déclaré dans `compose.yaml`, la pile Supabase locale et ses
migrations, puis l'API et le serveur Vite. Il transmet à l'application les coordonnées
imprimées par le CLI Supabase : aucun fichier à copier, aucune valeur à renseigner à la main.

- Front avec rechargement à chaud : http://localhost:5173
- API : http://localhost:3000
- Studio Supabase : http://localhost:54323
- Les requêtes `/auth`, `/projects` et `/notifications` du front sont transmises à l'API par le proxy Vite.

`Ctrl+C` arrête l'API et le front. Le broker et la base restent debout, avec leurs données ;
`npm run down` les arrête. Relancer `npm run up` repart de l'état laissé la fois précédente.

Si Docker ne tourne pas, la commande s'arrête en le disant plutôt que d'échouer plus loin sur
une erreur de connexion.

## Variables d'environnement

`.env.example` est la référence : il liste toutes les variables lues, sans aucune valeur
réelle. `apps/api/src/config.ts` est le seul module qui lit l'environnement ; tout le reste
reçoit des valeurs typées. Ajouter une variable ailleurs créerait une seconde source de
configuration, que le fichier d'exemple cesserait de décrire.

| Variable | Origine | Rôle, et ce qui se passe si elle manque |
|---|---|---|
| `SUPABASE_URL` | `supabase status -o env` en local, tableau de bord Supabase sinon | point d'entrée de la base. Requise : l'API refuse de démarrer en la nommant |
| `SUPABASE_SERVICE_ROLE_KEY` | idem | clé de service, ne quitte jamais le serveur. Requise |
| `SUPABASE_ANON_KEY` | idem | clé publique utilisée par l'authentification. Requise |
| `REDIS_URL` | `compose.yaml` en local, Upstash sur Vercel | broker des événements. Requise pour qui relaie ou consomme : `start()` de l'API la réclame, le worker refuse de charger sans elle. Un déploiement qui ne fait que servir du HTTP peut s'en passer |
| `RELAY_SECRET` | à générer, 32 caractères au moins | secret de `POST /internal/relay`, `/internal/metrics` et `/internal/state`. Absente, ces routes n'existent pas |
| `WEB_ORIGIN` | l'adresse du front | seule origine admise pour un appel cross-origin. `http://localhost:5173` par défaut |
| `TRUST_PROXY` | `1` derrière un proxy, comme sur Vercel | nombre de proxys dont l'adresse transmise est crue, clé du limiteur de débit. `0` par défaut |
| `NODE_ENV` | `production` en production | pose `Secure` sur les cookies de session. `development` par défaut |
| `LOG_LEVEL` | | niveau pino parmi `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`. `info` par défaut ; une valeur inconnue empêche le démarrage |
| `REDIS_PORT` | | port hôte du broker local, `6379` par défaut |
| `WORKER_BLOCK_SECONDS` | | attente bloquante du worker entre deux lectures, `5` par défaut |
| `SUPABASE_AUTH_SMTP_PASS` | fournisseur d'e-mails | lu par `supabase/config.toml` seulement pour pousser la configuration d'envoi d'e-mails ; inutile en local, où le capteur de courrier suffit |

`VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_REF` et `VERCEL_ENV` sont posées par Vercel et
nomment la version qui répond dans les métriques ; rien ne les exige ailleurs.

Une variable requise absente arrête l'API au démarrage avec un message qui la nomme, plutôt
que de la laisser échouer à la première requête.

Les valeurs de la pile locale s'obtiennent avec `npm run db:start`, ou à tout moment avec
`supabase status -o env`. `npm run up` les lit et les transmet lui-même.

Un poste qui fait déjà tourner un Redis sur le port par défaut ne peut pas le publier une
seconde fois. Dans ce cas, choisir un autre port sans rien modifier dans le dépôt :

```bash
REDIS_PORT=6380 npm run up
```

Copier `.env.example` en `.env` n'est utile que pour lancer `npm run dev` ou `npm start`
seuls, sans passer par `npm run up`.

### Aucun secret dans le dépôt

Les valeurs de production viennent du tableau de bord Supabase et ne sont jamais versionnées.
`.env` et ses variantes sont exclus par le `.gitignore`, à l'exception de `.env.example`.

Aucun scan de secrets automatique ne tourne en intégration continue : celui qui existait a été
retiré parce qu'il échouait en permanence sur des valeurs de test, et un contrôle toujours rouge
n'informe plus personne. La règle ne change pas pour autant : un secret dans une pull request la
fait refuser en relecture, et une valeur publiée par erreur est révoquée, pas seulement retirée,
puisque l'historique la garde.

## Base de données

Le schéma résulte de migrations versionnées dans `supabase/migrations/`, jamais d'un
`CREATE TABLE` au démarrage. Les conventions de nommage et d'en-tête sont dans
[`supabase/README.md`](supabase/README.md).

```bash
npm run db:start     # démarre la pile Supabase locale (Docker) et applique les migrations
npm run db:reset     # rejoue toutes les migrations depuis une base vide, puis supabase/seed.sql
npm run db:types     # régénère packages/infra/src/database.types.ts après une migration
npm run db:lint      # contrôles statiques sur le schéma
```

### Données de démonstration

`supabase/seed.sql` charge un jeu de démonstration à chaque `npm run db:reset`, et au premier
`npm run db:start` d'une pile neuve. Il crée deux comptes, trois projets, des tâches réparties
sur les trois colonnes avec priorités et échéances (dont une en retard et une à échéance du
jour de chargement) et une notification non lue. Les échéances sont calculées à partir du jour
où le jeu est chargé : rejouer `npm run db:reset` avant une démonstration les remet à jour.

| Compte | Mot de passe | Contenu |
|---|---|---|
| `camille.demo@example.com` | `DemoLegacy2026` | deux projets, une notification non lue |
| `hugo.demo@example.com` | `DemoLegacy2026` | un projet |

Ces comptes n'existent que sur la pile locale. Le fichier refuse de s'exécuter sur toute base
qui n'utilise pas le secret JWT publié par le CLI Supabase pour le développement local : une
base hébergée ne reçoit jamais ce jeu, même par `supabase db reset --linked`. Les adresses
sont sur `example.com` et les noms sont inventés.

## Démarrer les étages séparément

`npm run up` couvre le cas courant. Les commandes ci-dessous servent quand on veut agir sur
un seul étage, par exemple relancer l'application sans toucher à la base.

```bash
docker compose up -d     # le broker seul
npm run db:start         # la base et ses migrations
npm run dev              # l'API et le front, en lisant .env
```

L'API refuse de démarrer si `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` ou
`SUPABASE_ANON_KEY` manque, en nommant la variable absente.

## Authentification

Les sessions et les mots de passe sont gérés par Supabase Auth ([ADR-0008](docs/adr/0008-strategie-de-session-supabase-auth.md)).

| Route | Effet |
|---|---|
| `POST /auth/register` | Crée un compte. Répond toujours `201`, sans corps ni session |
| `POST /auth/login` | Ouvre une session : deux cookies `httpOnly`, jeton d'accès et jeton de renouvellement |
| `GET /auth/me` | Renvoie le compte de la session en cours, ou `401` |
| `POST /auth/logout` | Ferme la session et efface les cookies |
| `POST /auth/password/forgot`, `POST /auth/password/reset` | Réinitialisation du mot de passe par lien |
| `PUT /auth/me/password`, `PUT /auth/me/email`, `POST /auth/me/email/confirm` | Changement du mot de passe et de l'adresse |

Une session expirée est renouvelée sur la requête qui la présente, tant que le cookie de
renouvellement est valide ([docs/features/28-session-lifetime.md](docs/features/28-session-lifetime.md)).

Toutes les routes `/projects` exigent une session valide. Les éléments sont accessibles sous
le projet auquel ils appartiennent.

## Documentation de l'API

Chaque route, ses paramètres, ses corps, ses réponses et ses codes d'erreur sont décrits au
format OpenAPI 3.1, générés depuis les schémas de validation de `packages/contracts` :

- consultable à <https://project-legacy-22.github.io/Project-Legacy/api/>, publiée à chaque
  intégration sur `dev` ;
- versionnée dans [docs/api/openapi.json](docs/api/openapi.json), régénérée par
  `npm run docs:api`. Un écart entre ce fichier et le code fait échouer les tests, donc la pull
  request.

## Projets et éléments

Chaque compte reçoit un projet par défaut à son inscription. Il peut créer d'autres projets,
consulter ceux dont il est membre et supprimer ceux dont il est propriétaire. Une suppression
de projet est confirmée dans l'interface avec son nom et le nombre d'éléments qui seront
effacés, puis supprime ces éléments par cascade.

Les routes d'éléments sont imbriquées sous `/projects/:projectId/items`. L'accès dépend de
l'appartenance au projet, pas du compte qui a créé l'élément : tous les membres voient et
modifient les mêmes éléments. Un non-membre reçoit le même `404` que pour un projet ou un
élément inexistant, en lecture comme en écriture.

`GET /projects` et `GET /projects/:projectId/items` sont paginés. `limit` vaut 20 par défaut,
est borné à 100, et `cursor` reprend la réponse précédente ; hors de ces bornes, `400`. Le
curseur est opaque et désigne la dernière ligne servie plutôt qu'un décalage, pour qu'une
création concurrente ne fasse ni sauter ni répéter une ligne.

Une tâche possède un statut `todo`, `doing` ou `done`. Le déplacement utilise la version
renvoyée avec la tâche ; une version périmée reçoit `409` et ne remplace pas l'état stocké.
Elle porte aussi une priorité `low`, `normal` ou `high`, normale par défaut, et une échéance
calendaire facultative. Les listes placent les priorités hautes en premier, puis les échéances
les plus proches ; l'identifiant départage les tâches équivalentes de façon reproductible.

Deux comportements sont volontaires et ne doivent pas être « corrigés » :

- la création de compte répond de la même façon que l'adresse soit libre ou déjà prise, et
  n'ouvre jamais de session. Toute différence de statut, de corps ou d'en-tête révélerait
  quelles adresses ont un compte ;
- l'échec de connexion ne distingue pas un mot de passe faux d'une adresse inconnue.

La politique de mot de passe est appliquée deux fois, dans le domaine et par la
configuration du fournisseur : douze caractères mêlant minuscules, majuscules et chiffres,
bornés à 72 octets, la limite au-delà de laquelle bcrypt tronque en silence. Elle est
exportée par `packages/contracts` sous le nom `PASSWORD_POLICY`, pour que l'interface puisse
l'énoncer avant la saisie.

La vérification contre une liste de mots de passe compromis n'existe pas dans la
configuration locale : c'est un réglage du tableau de bord Supabase, à activer sur le projet
hébergé.

Les tentatives de création de compte et de connexion partagent une limite de dix par
tranche de cinq minutes et par adresse d'appel. Les en-têtes de sécurité et la restriction
CORS relèvent d'`EN-29`.

## Données personnelles

Deux routes portent les droits de portabilité et d'effacement (`US-13`). Elles agissent sur
le compte de la session et n'acceptent aucun identifiant : une route qui en prendrait un
serait une route qu'on peut pointer vers quelqu'un d'autre.

| Route | Effet |
|---|---|
| `GET /auth/me/export` | Sert en JSON le compte, ses projets, appartenances, éléments et notifications |
| `DELETE /auth/me` | Supprime le compte, sans délai, après confirmation |

Les notifications et les traces du flux d'événements ne sont pas gardées indéfiniment : une purge
quotidienne applique les durées du registre des traitements (`US-39`). Son déclencheur, sa
fréquence et l'endroit où lire son résultat sont dans [docs/ci.md](docs/ci.md#purge-de-conservation).

L'export est assemblé à la demande et servi tel quel : rien n'est écrit sur disque, donc
aucune copie ne subsiste à protéger ni à purger. Une tâche supprimée est effacée physiquement
et ne figure donc plus dans les données détenues ni dans l'export.

La suppression exige que le corps de la requête reprenne l'adresse du compte
(`{ "confirmation": "..." }`), faute de quoi elle répond `422`. Elle efface physiquement les
lignes concernées en une seule transaction. Elle retire les appartenances, supprime les
projets dont le compte est le dernier membre et conserve les projets partagés. Elle supprime
ensuite les identifiants chez le fournisseur, ce qui révoque toutes les sessions. L'ordre est
délibéré : une tentative interrompue entre les deux étapes peut être relancée, l'inverse
laisserait des données derrière un compte inaccessible. Il n'y a ni délai de grâce ni retour
en arrière.

Détail complet dans [docs/features/14-export-and-delete-account.md](docs/features/14-export-and-delete-account.md).
Le regroupement par projet est décrit dans
[docs/features/17-projects.md](docs/features/17-projects.md).
Le retrait d'un membre, qui conserve son compte et les tâches du projet, est décrit dans
[docs/features/354-remove-project-member.md](docs/features/354-remove-project-member.md).

Le tableau Kanban et ses déplacements accessibles sont décrits dans
[docs/features/16-kanban-move.md](docs/features/16-kanban-move.md).
La modification, la complétion et la suppression des tâches sont décrites dans
[docs/features/32-edit-complete-delete-task.md](docs/features/32-edit-complete-delete-task.md).

## Build de production

Construire l'API, les packages et le front :

```bash
npm run build
```

Vite écrit le bundle optimisé dans `apps/api/dist/static`. L'API Express sert ensuite le
front et les routes HTTP sur le même port. Avec la pile locale démarrée et `.env` en place :

```bash
npm start
```

L'application est alors disponible sur http://localhost:3000.

## Exécuter l'image publiée

Chaque livraison sur `main` publie une image sur GitHub Container Registry. Elle contient
l'API et le front construit, servis sur le même port : il n'y a rien d'autre à déployer.

```bash
# Le tag sha-<court> remonte au commit exact qui a produit l'image.
docker pull ghcr.io/project-legacy-22/project-legacy:latest

docker run --rm -p 3000:3000 \
  -e SUPABASE_URL=https://<projet>.supabase.co \
  -e SUPABASE_SERVICE_ROLE_KEY=<clé service role> \
  -e SUPABASE_ANON_KEY=<clé publique> \
  -e NODE_ENV=production \
  ghcr.io/project-legacy-22/project-legacy:latest
```

Le `pull` demande d'être authentifié auprès de GHCR : `docker login ghcr.io` avec un jeton
personnel disposant du droit `read:packages`.

### Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `SUPABASE_URL` | URL du projet Supabase | aucun, obligatoire |
| `SUPABASE_SERVICE_ROLE_KEY` | clé service role du projet, ne quitte jamais le serveur | aucun, obligatoire |
| `SUPABASE_ANON_KEY` | clé publique, utilisée par l'authentification | aucun, obligatoire |
| `NODE_ENV` | `production` marque le cookie de session `Secure` | `development` |
| `LOG_LEVEL` | niveau de journalisation | `info` |

Les valeurs de développement sont celles de la pile locale, publiées par `npm run db:start`
et reprises dans `.env.example`. Les valeurs de production viennent du tableau de bord
Supabase et ne sont jamais versionnées. Le durcissement de la configuration et le scan de
secrets sont l'objet d'`EN-30`.

L'image tourne sous un utilisateur sans privilège et ne contient ni dépendances de
développement, ni sources TypeScript, ni fichier d'environnement.

## Déploiement Vercel

`vercel.json` porte la configuration de build du front. Vercel installe à la racine du dépôt et
bâtit le seul espace de travail `@legacy/web` :

| Réglage | Valeur | Pourquoi |
|---|---|---|
| `installCommand` | `npm ci --include=dev` | `typescript` n'est déclaré qu'à la racine : installer depuis `apps/web` ne l'installe pas. Et `--include=dev` est indispensable parce que `NODE_ENV=production`, nécessaire à l'exécution pour que le cookie porte `Secure`, est aussi visible au build et fait sauter les `devDependencies` à npm. |
| `buildCommand` | `npm run build` | la commande de la racine, celle que la CI exécute. Elle lance `tsc --build` avant Vite : sans cette étape, `@legacy/contracts` n'est pas compilé et le front ne trouve pas ses types. |
| `outputDirectory` | `apps/api/dist/static` | Vite y écrit déjà, l'API sert ce répertoire en production |
| `ignoreCommand` | diff entre le dernier commit déployé et la tête, sur `api`, `apps`, `packages`, le verrou et ce fichier | une poussée qui ne touche que l'API ne déclenche pas de build. La comparaison part de `VERCEL_GIT_PREVIOUS_SHA` et non de `HEAD^`, sans quoi une poussée de plusieurs commits n'examinerait que le dernier. Sans cette variable, le build a lieu. Un redéploiement du même commit bâtit aussi : les deux identifiants sont alors égaux, et un changement de variable d'environnement ne touche pas Git. La commande ne sort qu'en 0 ou 1, les seuls codes que Vercel interprète : tout autre code est traité comme un échec de build. |

**Réglages du projet Vercel**, à poser dans le tableau de bord et non ici : *Root Directory* à
la racine du dépôt, et *Production Branch* sur `main`. Les aperçus se déclenchent alors sur
`dev` et sur chaque pull request, la production sur `main` uniquement.

### L'API sur le même déploiement

`api/index.ts` exporte l'application Express, et `vercel.json` y réécrit `/auth`, `/projects`,
`/notifications` et `/internal` ; `/reset-password` et `/confirm-email-change`, liens reçus par
e-mail, servent la page du front.
Le navigateur ne voit donc qu'une seule origine, ce qui est la condition pour que le cookie de
session `httpOnly` fonctionne — `apps/web/vite.config.ts` explique pourquoi une API sur une
autre origine le mettrait hors d'atteinte.

La fonction consomme la sortie de build (`apps/api/dist`) plutôt que les sources : le typage
vient des déclarations générées, et le point d'entrée de déploiement consomme un artefact
plutôt que de recompiler.

Elle n'appelle pas `application.start()`. Ce contrôle de santé sert à un processus long qui
doit refuser de démarrer mal configuré ; une fonction n'a pas ce cycle de vie, et `supabase-js`
ne tient aucune connexion à ouvrir.

**Ce que cela n'héberge pas** : aucun processus long ne survit en sans-serveur, donc ni le
worker ni l'intervalle du relais. La passe de livraison y est appelée par l'écriture elle-même
et par le workflow `relais`, toutes les trente secondes, sur `POST /internal/relay` ; la même
passe publie puis consomme ([docs/architecture.md](docs/architecture.md), section « Le flux
événementiel »). L'image publiée sur GHCR reste le livrable de l'exécution en conteneur.

### Variables à poser sur Vercel

L'API refuse de démarrer si l'une manque, en la nommant. Elles pointent un projet Supabase
hébergé, distinct de la pile locale.

| Variable | Origine |
|---|---|
| `SUPABASE_URL` | tableau de bord du projet hébergé |
| `SUPABASE_SERVICE_ROLE_KEY` | idem, à ne jamais exposer au navigateur |
| `SUPABASE_ANON_KEY` | idem |
| `NODE_ENV` | `production`, pour que le cookie de session porte `Secure` |
| `TRUST_PROXY` | `1` : Vercel est un proxy, et le limiteur de débit doit lire l'adresse qu'il transmet |
| `RELAY_SECRET` | le même que le secret `RELAY_SECRET` du dépôt, que présente le workflow `relais` |
| `REDIS_URL` | posée par l'intégration Upstash du projet Vercel |

Une migration mergée doit atteindre le projet hébergé avant le code qui s'en sert : les
prévisualisations et la production partagent cette base. `supabase link` puis
`supabase db push` l'appliquent, et le workflow `migrations` (#385) le fait après chaque
intégration verte sur `dev`. Une migration doit donc rester additive : la production tourne
encore le code de la dernière livraison quand elle la reçoit.

## Contrôles locaux

```bash
npm run typecheck
npm test
npm run build
```

| Commande | Rôle |
|---|---|
| `npm run dev` | Démarre l'API et Vite |
| `npm run dev:api` | Démarre uniquement l'API en mode surveillance |
| `npm run dev:web` | Démarre uniquement Vite |
| `npm run db:start` | Démarre la pile Supabase locale et applique les migrations |
| `npm run db:reset` | Reconstruit la base locale depuis les migrations et `supabase/seed.sql` |
| `npm run db:types` | Régénère `packages/infra/src/database.types.ts` |
| `npm run db:lint` | Contrôles statiques sur le schéma |
| `npm run typecheck` | Vérifie TypeScript et les frontières entre modules |
| `npm test` | Exécute les tests unitaires, HTTP et du front, dont le contrôle axe |
| `npm run build` | Produit le build complet de production |
| `npm start` | Démarre le build de production |

## Accessibilité du front

Le socle du front vise WCAG 2.1 niveau AA :

- structure sémantique avec un titre principal et des régions identifiées ;
- navigation au clavier et focus visible ;
- champs associés à leurs libellés, aides et erreurs ;
- retours d'action annoncés aux technologies d'assistance ;
- contrastes de texte et de composants contrôlés ;
- réduction des animations avec `prefers-reduced-motion` ;
- contrôle axe exécuté avec les tests.

Une vérification manuelle au clavier et sur les formats mobiles complète le contrôle
automatique avant chaque demande de review.
