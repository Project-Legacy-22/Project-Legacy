# ADR-0011 — Anglais pour le code et pour l'interface

- **Statut** : Accepté
- **Date** : 2026-09-10
- **Décideurs** : équipe
- **Issue liée** : #15 (constat), la migration a la sienne

## Contexte

Deux questions de langue traînaient depuis le sprint 1, chacune sans décision écrite.

La première est dans le tableau « À trancher » de l'index des ADR : « Langue de l'interface,
messages d'erreur compris — une seule, tranchée une fois », donnée comme bloquant toutes les
US front. Elle n'a jamais été tranchée. Dans les faits, l'interface est déjà entièrement en
anglais : `apps/web/src/labels.ts` compte 121 libellés, aucun accentué, et aucun message
d'erreur de l'API ne l'est non plus. La décision existait dans le code sans exister sur le
papier.

La seconde est la langue du code. `standards/03-testing.md` §3 demande qu'un test soit nommé
« en français ou en anglais mais **de façon uniforme** », sans désigner laquelle. Mesure du
10 septembre sur les 332 noms de tests du dépôt : **168 en français, 164 en anglais**. Le
partage est de l'ordre de la moitié dans `apps/web`, dans `apps/api` et dans `packages`
séparément, donc il ne s'agit pas d'une convention par zone mais d'une dérive. Les
identifiants et les commentaires suivent le même désordre.

Le coût n'est pas cosmétique. Un lecteur qui cherche `fichiersDeTest` ne trouve pas
`testFiles`. Une recherche par mot-clé rate la moitié du dépôt, et une revue de code passe son
temps à traduire.

## Options considérées

### Option A — Français partout dans le code
- Avantages : c'est la langue de l'équipe et celle des issues ; les noms de domaine métier
  restent proches du vocabulaire des User Stories.
- Inconvénients : l'écosystème est anglophone, donc chaque identifiant côtoie un mot anglais
  qu'on ne traduit pas (`request`, `response`, `cursor`, `outbox`) ; les accents obligent à
  choisir entre les écrire dans les identifiants, ce qui est fragile, et écrire un français
  faux ; il faudrait retraduire l'interface, déjà anglaise à 121 libellés.
- Coût de mise en œuvre : le plus élevé des trois, interface comprise.

### Option B — Anglais pour le code et l'interface, français pour la documentation du dépôt
- Avantages : aligne le code sur son écosystème et sur l'interface existante ; rend une
  recherche par mot-clé fiable ; ne demande aucun travail sur l'interface ; laisse la
  documentation dans la langue où l'équipe raisonne le mieux, ce que `docs/features/README.md`
  documente déjà pour les ADR et le catalogue d'événements.
- Inconvénients : une frontière à tenir, donc une règle de plus à connaître ; migration de
  168 noms de tests et des identifiants français existants.

### Option C — Laisser chacun choisir, en exigeant seulement la cohérence d'un fichier
- Avantages : aucun travail de migration.
- Inconvénients : c'est l'état actuel, et il est déjà à 168/164. La règle « uniforme » sans
  langue désignée n'a rien empêché en deux sprints. Une règle qu'on ne peut pas enfreindre
  parce qu'elle ne dit rien n'est pas une règle.

## Décision

Nous retenons **l'option B**.

Parce que l'interface était déjà tranchée en anglais sans que personne l'écrive, et qu'aligner
le code dessus coûte moins que l'inverse. Parce que la règle actuelle a produit un partage à
la moitié en deux sprints, ce qui démontre qu'exiger l'uniformité sans nommer la langue ne
suffit pas. Et parce que la documentation du dépôt est déjà officiellement en français : la
frontière existe, elle n'était pas énoncée.

### Périmètre exact

**En anglais :**
- les identifiants — variables, fonctions, types, fichiers, dossiers ;
- les commentaires de code ;
- les noms de tests, `describe` et `it` ;
- l'interface, messages d'erreur affichés compris ;
- les messages de commit et les titres de pull request, ce qui était déjà la règle de
  `standards/04-git.md`.

**En français :**
- la documentation du dépôt : ADR, catalogue d'événements, audit du legacy. Le présent ADR en
  est un exemple ;
- les issues, descriptions de pull request, commentaires de revue et notes de board, qui sont
  la langue de travail de l'équipe.

Les pages de `docs/features/` restent en anglais, comme leur README l'exige déjà.

## Conséquences

**Positives**
- Une recherche par mot-clé retrouve tous les usages d'un concept.
- L'interface n'a rien à changer.
- La question ne se repose plus à chaque revue.

**Négatives / dette acceptée**
- 168 noms de tests à traduire, plus les identifiants et commentaires français. Ce travail ne
  peut pas se faire d'un coup : 41 des 60 fichiers de test sont modifiés par des pull requests
  ouvertes, et les toucher provoquerait des conflits chez leurs auteurs. La migration se fait
  donc par zones libres, avec son issue, et le reste après les merges.
- Pendant la migration le dépôt reste mélangé, donc temporairement moins cohérent que si l'on
  n'avait rien décidé. C'est le coût d'une transition, pas un état d'arrivée.

**Ce que ça impose au reste du projet**
- `standards/02-code-style.md` et `standards/03-testing.md` §3 portent désormais la langue
  désignée, au lieu de « français ou anglais ».
- Toute nouvelle pull request est écrite en anglais côté code. Une revue peut le refuser.
- Le tableau « À trancher » de l'index perd sa ligne sur la langue de l'interface.

## Comment on saura qu'on s'est trompé

Si des noms de domaine métier deviennent moins clairs traduits qu'en français — le vocabulaire
des User Stories étant français — au point qu'une revue doive régulièrement demander ce qu'un
identifiant désigne. Le signal serait une discussion de traduction dans une revue de code, et
non plus une discussion de comportement.

## Références

- `standards/03-testing.md` §3, règle « de façon uniforme » sans langue désignée
- `standards/04-git.md`, messages de commit déjà en anglais
- `docs/features/README.md`, documentation du dépôt en français, pages de fonctionnalité en anglais
- Mesure du 2026-09-10 : 332 noms de tests, 168 français, 164 anglais
