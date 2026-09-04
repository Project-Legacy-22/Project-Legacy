# Legacy 22

Legacy 22 reprend l'application TodoList de `docker/getting-started-app` pour la faire évoluer
vers une application Kanban maintenable. Le dépôt utilise TypeScript et des workspaces npm.

## Commandes

| Commande | Ce qu'elle fait |
|---|---|
| `npm run up` | démarre tout : broker, base de données, API et front |
| `npm run down` | arrête le broker et la base de données |
| `npm run lint` | analyse statique sur tout le dépôt, `apps/web` compris |
| `npm run typecheck` | types de la production et des tests, workspace web, puis contrôle des frontières de couches |
| `npm test` | tous les tests, Node et front, avec un rapport de couverture unique dans `coverage/` |
| `npm run dev` | API et serveur Vite en développement |
| `npm run build` | build de production, front écrit dans `apps/api/dist/static` |
| `npm run db:start` | pile Supabase locale et application des migrations |
| `npm run db:reset` | rejoue les migrations depuis une base vide |
| `npm run db:types` | régénère les types TypeScript du schéma |

## Prérequis

- Node.js 20.19, ou Node.js 22.12 et versions ultérieures
- npm avec prise en charge des workspaces
- Docker, en cours d'exécution : il fait tourner la base de données et le broker

## Organisation

```text
apps/
├── api/                 API Express et composition de l'application
└── web/                 Interface React construite avec Vite
packages/
├── contracts/           Schémas et types partagés aux frontières
├── core/auth/           Domaine et cas d'usage de l'authentification
├── core/items/          Domaine et cas d'usage des éléments
└── infra/               Adaptateurs de persistance, d'identité et journalisation
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
- Les requêtes `/items` du front sont transmises à l'API par le proxy Vite.

`Ctrl+C` arrête l'API et le front. Le broker et la base restent debout, avec leurs données ;
`npm run down` les arrête. Relancer `npm run up` repart de l'état laissé la fois précédente.

Si Docker ne tourne pas, la commande s'arrête en le disant plutôt que d'échouer plus loin sur
une erreur de connexion.

## Variables d'environnement

`.env.example` est la référence : il liste toutes les variables lues, sans aucune valeur
réelle. `apps/api/src/config.ts` est le seul module qui lit l'environnement ; tout le reste
reçoit des valeurs typées. Ajouter une variable ailleurs créerait une seconde source de
configuration, que le fichier d'exemple cesserait de décrire.

| Variable | Rôle |
|---|---|
| `SUPABASE_URL` | point d'entrée de la base. Requise : l'API refuse de démarrer sans elle |
| `SUPABASE_SERVICE_ROLE_KEY` | clé de service utilisée par l'API. Requise |
| `REDIS_URL` | broker déclaré dans `compose.yaml` |
| `REDIS_PORT` | port hôte du broker, `6379` par défaut |
| `LOG_LEVEL` | niveau pino parmi `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`. `info` par défaut ; une valeur inconnue empêche le démarrage |

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

La CI exécute gitleaks sur le code **et sur l'historique** à chaque pull request : un secret
retiré par un commit ultérieur reste lisible dans les commits précédents, donc scanner le
seul état courant laisserait passer le cas qui compte. Le job échoue si une correspondance
est trouvée, sans recopier la valeur dans le journal d'exécution.

Les exceptions sont dans `.gitleaks.toml`, chacune avec sa justification. Y ajouter une
entrée n'est pas une façon de faire passer un scan : si la valeur est un vrai secret, elle
doit être révoquée, pas mise sur liste blanche.

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
L'API expose trois routes :

| Route | Effet |
|---|---|
| `POST /auth/register` | Crée un compte. Répond toujours `201`, sans corps ni session |
| `POST /auth/login` | Ouvre une session et pose le jeton dans un cookie `httpOnly` |
| `GET /auth/me` | Renvoie le compte de la session en cours, ou `401` |

Toutes les routes `/items` exigent une session valide et attribuent les éléments créés au
compte de l'appelant.

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

Le registre est privé : `docker login ghcr.io` avec un jeton personnel disposant du droit
`read:packages` est nécessaire avant le `pull`.

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
| `npm test` | Exécute les tests du front, dont le contrôle axe |
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
