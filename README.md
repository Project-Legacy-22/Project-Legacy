# Legacy 22

Legacy 22 reprend l'application TodoList de `docker/getting-started-app` pour la faire évoluer
vers une application Kanban maintenable. Le dépôt utilise TypeScript et des workspaces npm.

## Commandes

| Commande | Ce qu'elle fait |
|---|---|
| `npm run lint` | analyse statique sur tout le dépôt, `apps/web` compris |
| `npm run typecheck` | types de la production et des tests, workspace web, puis contrôle des frontières de couches |
| `npm test` | tous les tests, Node et front, avec un rapport de couverture unique dans `coverage/` |
| `npm run dev` | API et serveur Vite en développement |
| `npm run build` | build de production, front écrit dans `apps/api/dist/static` |

## Prérequis

- Node.js 20.19, ou Node.js 22.12 et versions ultérieures
- npm avec prise en charge des workspaces

## Organisation

```text
apps/
├── api/                 API Express et composition de l'application
└── web/                 Interface React construite avec Vite
packages/
├── contracts/           Schémas et types partagés aux frontières
├── core/items/          Domaine et cas d'usage des éléments
└── infra/               Adaptateurs de persistance et journalisation
```

Le front utilise les contrats de `packages/contracts` pour valider les réponses de l'API.
Il ne dépend pas directement des modules du domaine ou de l'infrastructure.

## Installation

Installer exactement les dépendances du lockfile :

```bash
npm ci
```

## Développement

Démarrer l'API et le serveur Vite avec une base SQLite locale :

```bash
SQLITE_DB_LOCATION=./todo.db npm run dev
```

- Front avec rechargement à chaud : http://localhost:5173
- API : http://localhost:3000
- Les requêtes `/items` du front sont transmises à l'API par le proxy Vite.

`SQLITE_DB_LOCATION` est nécessaire en local pour éviter le chemin utilisé par l'image de
production. Le fichier `todo.db` créé par cette commande ne doit pas être versionné.

## Build de production

Construire l'API, les packages et le front :

```bash
npm run build
```

Vite écrit le bundle optimisé dans `apps/api/dist/static`. L'API Express sert ensuite le
front et les routes HTTP sur le même port :

```bash
SQLITE_DB_LOCATION=./todo.db npm start
```

L'application est alors disponible sur http://localhost:3000.

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
