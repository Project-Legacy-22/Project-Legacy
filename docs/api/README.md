# Documentation de l'API

`openapi.json` décrit chaque route de l'API au format OpenAPI 3.1 : méthode, chemin, paramètres,
corps accepté, réponse et codes d'erreur, ces derniers au format problem details (RFC 7807) que
l'API rend déjà (#45).

## D'où il vient

Il n'est pas écrit à la main. `apps/api/src/openapi/catalog.ts` liste les routes en désignant, pour
chacune, les schémas zod de `packages/contracts` que la route applique vraiment ;
`apps/api/src/openapi/document.ts` les rend en JSON Schema 2020-12, que zod 4 produit sans
dépendance supplémentaire.

## Ce qui l'empêche de dériver

`apps/api/src/openapi/openapi.test.ts`, qui tourne avec `npm test` et donc en intégration continue :

- le fichier versionné doit être exactement celui que le code produit ; sinon le test échoue et
  nomme la commande qui corrige, `npm run docs:api` ;
- la liste documentée doit être exactement celle des routes que l'application monte, méthode par
  méthode, lue dans l'application et non recopiée ;
- chaque opération documente sa réponse `500`, chaque référence d'erreur existe.

## Où le lire

<https://project-legacy-22.github.io/Project-Legacy/api/>, publiée par le workflow `pages` à chaque
intégration sur `dev`. Le document brut est à côté, `openapi.json`, pour un outil qui le consomme.

Le document ne contient ni secret ni adresse interne : les deux schémas d'authentification nomment
le cookie de session et l'en-tête du secret de relais, jamais leur valeur.
