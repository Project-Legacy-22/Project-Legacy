# Architecture

État au 11 septembre 2026. Ce document décrit ce que le dépôt contient, pas une cible : chaque
affirmation est vérifiable en lisant les chemins cités.

## Découpage

Un monorepo npm workspaces, découpé par domaine et non par couche technique — c'est la décision de
l'ADR-0003, prise parce qu'un découpage horizontal reproduisait le couplage du code repris.

```
apps/
  api/        le serveur Express, la composition, les routes HTTP
  web/        l'interface React servie par Vite
  worker/     le consommateur d'événements, dans son propre processus
packages/
  contracts/  les schémas partagés entre l'API et l'interface, et le catalogue d'événements
  core/
    auth/         comptes, sessions, réinitialisation, données personnelles
    items/        tâches, statuts Kanban, priorités
    projects/     projets et appartenances
    notifications/ notifications
  infra/      les adaptateurs : Supabase, Redis, HIBP, le journal
```

Chaque domaine de `core/` a la même forme interne :

```
domain/       les types et les règles, qui n'importent rien
application/  les cas d'usage, qui dépendent des ports
ports/        les interfaces que l'infrastructure implémente
```

## La règle de dépendance

`domain/` n'importe rien — ni un autre domaine, ni un port, ni une bibliothèque. `application/`
n'atteint l'extérieur qu'à travers `ports/`. `infra/` implémente les ports et ne connaît aucun cas
d'usage. Rien, dans `core/`, ne connaît Express, React ou Supabase.

Cette règle est vérifiée par `scripts/check-layers.mjs`, branché sur `npm run typecheck`. Un script
et non le graphe de paquets, pour une raison mesurée : npm workspaces remonte chaque dépendance
dans le `node_modules` racine, donc un fichier de `packages/core` résout `express` alors que son
`package.json` ne le déclare pas, et TypeScript compile sans rien dire. La frontière de paquet
documente l'intention ; elle ne l'applique pas.

## Le flux d'une requête

`GET /projects/:projectId/items` traverse cinq étages, dans cet ordre :

1. **Express** — `apps/api/src/http/server.ts`. En-têtes de sécurité, CORS, limite de corps,
   journal, fichiers statiques.
2. **Session** — `apps/api/src/http/session.ts`. Le cookie `session` est lu, l'identité demandée au
   fournisseur, et renouvelée avec le cookie `refresh` si le jeton a expiré. Sans session, la
   requête s'arrête ici avec un `401` en `problem+json`.
3. **Route** — `apps/api/src/http/routes/items.ts`. La requête est validée à la frontière par un
   schéma de `contracts`, jamais après.
4. **Cas d'usage** — `packages/core/items/src/application/`. Il décide, et n'atteint la base qu'à
   travers son port.
5. **Adaptateur** — `packages/infra/src/item-store.ts`. Il traduit vers PostgREST, et les
   politiques de sécurité au niveau ligne de Supabase filtrent par propriétaire.

La composition assemble les cinq : `apps/api/src/composition-root.ts` est le seul endroit où un
cas d'usage rencontre un adaptateur.

## Le flux événementiel

Une seule famille d'événements aujourd'hui, `item.created`, en deux versions (`docs/events/catalog.md`).

```
créer une tâche
  └─ create_item_with_event  (une transaction : la tâche et son événement)
       ├─ public.items
       └─ public.outbox                     le fait est écrit, personne n'est encore prévenu
            └─ relais  ──publie──▶  Redis   packages/infra/src/outbox-relay.ts
                                      └─ consommateur  packages/infra/src/event-consumer.ts
                                           ├─ public.processed_events   absorbe un rejeu
                                           └─ public.notifications
```

La garantie est l'outbox, ratifiée par l'ADR-0013 : l'événement et le fait partagent une
transaction, donc un événement publié correspond toujours à quelque chose qui s'est produit. La
livraison est au moins une fois, et `processed_events` rend un rejeu sans effet.

Le relais tourne différemment selon la cible, et c'est la seule différence entre elles :

| Cible | Ce qui fait tourner le relais |
|---|---|
| Processus local, image Docker | un intervalle, ouvert par `start()` |
| Fonction serverless | l'écriture elle-même (`apps/api/src/after-write.ts`), plus un appel planifié sur `POST /internal/relay` toutes les cinq minutes |

Le consommateur vit dans `apps/worker` quand un processus long existe. Sur la cible serverless, la
même fonction de consommation est appelée par la passe de livraison, sans second processus.

## Ce qui garde tout ça honnête

| Contrôle | Ce qu'il empêche |
|---|---|
| `scripts/check-layers.mjs` | un import qui traverse une frontière de couche |
| `test/test-levels.test.ts` | un fichier de test que plus aucun niveau n'exécute |
| `test/sql-function-owners.test.ts` | deux migrations qui redéfinissent la même fonction sans se voir |
| `apps/api/src/http/vercel-rewrites.test.ts` | une route servie par l'application mais injoignable une fois déployée |
| `apps/web/src/styles/contrast.test.ts` | une couleur hors palette, ou un contraste sous le seuil |
| `apps/web/src/styles/parse.test.ts` | une feuille de style que le build refuserait |
| `test/coverage-exclusions.test.ts` | deux listes d'exclusion de couverture qui divergent |

Chacun a été écrit après un défaut réel ; les issues correspondantes le racontent.

## Références

- ADR-0003 (découpage par domaine), ADR-0007 et ADR-0013 (événements), ADR-0004 et ADR-0005 (base)
- `docs/events/catalog.md`, `docs/testing-levels.md`
