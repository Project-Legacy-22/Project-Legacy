# Tests d'intégration

Contre le système réellement assemblé : Postgres, PostgREST, GoTrue, migrations
appliquées. Aucune doublure ici — `packages/core/*/test/` et
`apps/api/src/http/routes/*.test.ts` couvrent déjà le comportement applicatif
contre des fakes, plus vite et sans dépendance externe ; ce dossier couvre ce
qu'une doublure ne peut pas prouver : que les pièces marchent une fois reliées
pour de vrai.

## Fichiers

- `support.ts` — compose une vraie `Application` (`composition-root.ts`),
  inscrit et connecte de vrais comptes par l'authentification réelle.
- `items.integration.test.ts` — l'API HTTP réelle : CRUD, isolation entre
  comptes, telle que l'application elle-même l'applique (rôle de service,
  filtrage `user_id` en couche applicative).
- `row-level-security.integration.test.ts` — les politiques RLS elles-mêmes,
  atteintes directement via PostgREST avec la clé publique et le jeton d'un
  vrai compte, sans passer par l'API ni par le rôle de service. C'est la seule
  suite qui exerce réellement ce que
  `supabase/migrations/20260904103000_authentication_and_row_level_security.sql`
  pose : le filet de sécurité si le rôle de service fuit ou si un client
  interroge PostgREST directement.

## Lancer

```bash
npm run db:start        # pile Supabase locale, migrations appliquees
npm run test:integration
```

Suite exclue de `npm test` : elle a besoin de la pile locale, que tout le
monde ne fait pas tourner à chaque modification. `npm run test:integration`
lit `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` et `SUPABASE_ANON_KEY` dans
l'environnement du process (`supabase status -o env` les imprime) et échoue
tôt, en les nommant, si l'un manque.

## Isolation

Chaque test crée son propre compte (adresse générée, `crypto.randomUUID()`) et
ses propres items : aucun test ne dépend d'un état laissé par un autre, ni de
l'ordre d'exécution. Un `npm run db:reset` entre deux lancements n'est jamais
nécessaire pour que la suite passe, seulement pour repartir d'une base vide.
