# ADR-0002 — TypeScript strict sur tout le dépôt

- **Statut** : Accepté
- **Date** : 2026-09-02
- **Décideurs** : équipe complète, réunion de lancement
- **Issue liée** : #2

## Contexte

Le code hérité est du JavaScript sans annotations, sans JSDoc, sans `tsconfig.json` (dette
`DET-16`). Le sujet nomme explicitement « the current level of typing » parmi les points à
examiner et à corriger : c'est donc une dette évaluée, pas une préférence d'équipe.

Deux membres n'ont pas d'expérience significative de TypeScript.

## Options considérées

### Option A — TypeScript strict
- Avantages : erreurs attrapées à la compilation, contrats explicites entre modules,
  outillage mûr.
- Inconvénients : coût d'apprentissage réel, étape de compilation obligatoire.
- Coût d'apprentissage : quelques jours, payés au début du sprint 1.

### Option B — JSDoc typé
- Avantages : moins de friction, pas d'étape de compilation.
- Inconvénients : garanties plus faibles, outillage plus fragile, et surtout un signal
  ambigu envoyé à l'évaluation — on répond à moitié à une dette nommée.

### Option C — Rester en JavaScript
- Reproduit exactement la dette qu'on est censé corriger.

## Décision

Nous retenons **l'option A — TypeScript strict**, avec `noUncheckedIndexedAccess`.

Parce que :

1. C'est une dette nommée par le sujet. La corriger à moitié coûterait presque autant que la
   corriger entièrement, pour un résultat non défendable.
2. Le coût d'apprentissage se paie une fois, et il se paie au meilleur moment : au début,
   sur du code neuf, pas sur une base à migrer.
3. Le typage rend le découpage de l'ADR-0003 **vérifiable** : un import interdit entre
   couches devient une erreur de compilation et non une convention qu'on rappelle en revue.

## Conséquences

**Positives**
- Les frontières de modules sont contrôlées mécaniquement (`scripts/check-layers.mjs`).
- Les données externes sont validées à l'entrée avec des schémas qui produisent aussi les
  types : une seule source de vérité pour le contrat.

**Négatives / dette acceptée**
- Une étape de compilation obligatoire, donc une image Docker multi-étapes et un temps de
  CI plus long.
- Le lint typé exige que les projets soient **construits** avant d'être analysés. Constaté à
  l'intégration de `EN-05` et `EN-06` le 3 septembre : la CI exécute `typecheck` avant
  `lint`, et non l'inverse.
- Deux personnes travaillent avec un outil qu'elles découvrent pendant un sprint noté.

**Ce que ça impose au reste du projet**
- `strict` et `noUncheckedIndexedAccess` sont activés dès le premier `tsconfig.json` : les
  activer plus tard reviendrait à réécrire le code déjà produit.
- Tout `any` ou `@ts-expect-error` porte un commentaire justifiant sa présence.

## Comment on saura qu'on s'est trompé

Si à mi-sprint 2 les `any` et les `@ts-expect-error` non justifiés apparaissent plus vite
qu'on ne les retire, le problème n'est pas TypeScript mais des contrats de frontière mal
posés. On corrige les contrats ; on n'assouplit pas le compilateur, ce qui rendrait le
typage décoratif.

## Références

- `docs/backlog.md`, décision `D-03`
- `docs/audit-legacy.md`, dette `DET-16` (livrée par `SP-00`, PR #107)
- Standards d'équipe, `standards/02-code-style.md`
