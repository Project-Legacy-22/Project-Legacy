# ADR-0019 — Application automatique des migrations à la base hébergée

- **Statut** : Accepté
- **Date** : 2026-09-23
- **Décideurs** : équipe
- **Issue liée** : #385, prolonge l'ADR-0005

## Contexte

L'ADR-0005 versionne le schéma en migrations SQL. Il ne dit pas qui les applique à la base
hébergée. Personne n'en a la charge : le 23 septembre, six migrations fusionnées sur `dev`
n'ont jamais atteint la base, le code de #382 lisait une colonne absente, et les
prévisualisations répondaient 500 (#385).

Une contrainte pèse sur le choix : la production et les prévisualisations partagent un seul
projet Supabase, sur l'offre gratuite (ADR-0017).

## Options considérées

### Option A — application manuelle par une personne désignée
- Avantages : aucun secret de base dans la CI.
- Inconvénients : c'est la situation qui a produit l'incident ; la personne peut être absente, et
  rien ne signale l'oubli avant la première erreur 500.

### Option B — application à la livraison, dans le workflow de `main`
- Avantages : la migration part avec le code qui s'en sert.
- Inconvénients : la base étant partagée, les prévisualisations de `dev` lisent déjà le nouveau
  code sans la migration, jusqu'à la livraison suivante.

### Option C — application après chaque exécution verte de `ci` sur `dev`
- Avantages : une migration fusionnée atteint la base en quelques minutes ; elle a déjà été
  rejouée sur une base vide par `ci` ; la liste de ce qui part est écrite dans le résumé de
  l'exécution.
- Inconvénients : une migration atteint la production avant le code qui s'en sert ; des secrets
  d'accès à la base dans la CI.

### Option D — un projet Supabase par environnement
- Avantages : isole les prévisualisations de la production.
- Inconvénients : un second projet à configurer, à sauvegarder et à tenir à jour, et des
  secrets en double dans Vercel et la CI ; pour les prévisualisations d'un projet de trois
  sprints, le coût dépasse le risque que la règle additive couvre déjà.

## Décision

Nous retenons **l'option C** (workflow `migrations`), avec une règle qui fait partie de la
décision : **une migration est additive**.

Parce que : l'incident venait de l'absence de responsable, et un déclenchement automatique en
est un ; `ci` a déjà appliqué chaque migration à une base vide avant qu'elle arrive ici ; et la
contrainte de la base partagée se traite par une règle d'écriture plutôt que par un second
projet à tenir.

La règle : une migration doit rester compatible avec le code déjà livré, puisqu'elle atteint la
production avant lui. Ajouter une table, une colonne avec une valeur par défaut ou une fonction,
ou redéfinir une fonction sans changer sa signature. Un renommage, une suppression ou un
changement de signature se fait en deux temps : la migration qui ajoute, livrée ; puis, une fois
livré le code qui ne lit plus l'ancien, celle qui retire.

## Conséquences

**Positives**
- Une migration fusionnée atteint la base sans que personne n'ait à y penser. L'application est
  rejouable sans effet quand la base est à jour.
- Deux applications ne se chevauchent pas : le groupe de concurrence les met en file, sans jamais
  en annuler une.
- Le commit appliqué est celui que `ci` a vérifié, pas la tête de `dev` au moment du démarrage.

**Négatives / dette acceptée**
- La CI détient `SUPABASE_ACCESS_TOKEN`. Le jeton et le mot de passe passent par l'environnement,
  jamais en argument.
- Une migration destructive fusionnée par erreur casserait la production. La relecture et la
  règle additive en sont les seules protections, avec la sauvegarde (`npm run backup`,
  `docs/backup-and-exit.md`) pour revenir en arrière.

**Ce que ça impose au reste du projet**
- Toute migration est relue au regard de la règle additive.
- `docs/ci.md`, section « Migrations de la base hébergée », tient la configuration et la règle.

## Comment on saura qu'on s'est trompé

Une migration additive casse quand même la production, parce que le code livré dépendait d'un
comportement qu'elle change ; ou l'équipe doit régulièrement suspendre le workflow pour livrer un
changement en deux temps. Dans les deux cas, un projet séparé pour les prévisualisations
redevient à étudier, même payant.

## Références

- `.github/workflows/migrations.yml`
- `docs/ci.md`, section « Migrations de la base hébergée »
- ADR-0005 (migrations versionnées), ADR-0017 (Supabase hébergé)
