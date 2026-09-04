# ADR-0009 — SonarCloud comme outil de quality gate, seuils du gate integre

- **Statut** : Accepté
- **Date** : 2026-09-04
- **Décideurs** : aurelienpochart (EN-17)
- **Issue liée** : #18

## Contexte

`EN-07` fait tourner l'analyse statique, les types et les tests sur chaque pull request, mais
rien ne mesure la qualite du **nouveau code** ni ne bloque une regression : c'est l'objet
d'`EN-17`. `standards/07-quality-gates.md` section 4 fixe la cible sur le nouveau code
uniquement (couverture, duplication, bugs et vulnerabilites bloquants, note de
maintenabilite) et nomme explicitement « SonarCloud ou equivalent », deja retenu comme
proposition dans `docs/adr/README.md` (decision `D-10`). Le seuil de couverture (`D-11`) y est
propose a 70 %, sans etre tranche.

L'organisation GitHub `Project-Legacy-22` est sur le plan **Free** de SonarCloud.

## Options considérées

### Option A — SonarCloud, gate integre « Sonar way »
- Avantages : deja nomme par les standards ; l'app GitHub est deja installee sur
  l'organisation ; l'analyse de pull request compare nativement contre la branche cible, donc
  le nouveau code est mesure sans configuration supplementaire ; gratuit.
- Inconvenients : verifie a l'API (`qualitygates/select` et `qualitygates/set_as_default`) —
  le plan Free interdit de choisir ou de modifier le gate applique a un projet
  (`Organization ... is not allowed to modify Quality gates`). Le gate integre est impose tel
  quel, ses seuils ne sont pas negociables sans passer sur un plan payant.

### Option B — Script maison (vitest + diff Git)
- Avantages : aucune dependance externe, seuils entierement choisis par l'equipe.
- Inconvenients : reimplemente ce qu'un outil dedie fait deja ; ne mesure ni la duplication ni
  la maintenabilite, seulement la couverture ; le standard nomme explicitement un outil dedie,
  s'en detourner sans raison forte contredirait `07-quality-gates.md`.

### Option C — SonarCloud avec un gate personnalise
- Ecartee : impossible sur le plan Free (verifie a l'API, cf. Option A). Redeviendrait
  possible sur un plan payant.

## Décision

Nous retenons **l'option A — SonarCloud, gate integre « Sonar way »**, tel quel.

Parce que :

1. C'est deja la proposition du standard et de la reunion de lancement ; l'infrastructure
   (organisation, app GitHub) existe deja.
2. Le plan Free ne laisse pas le choix d'un gate personnalise : ecrire un ADR pour une option
   techniquement indisponible n'aurait rien tranche.
3. « Sonar way » est **plus strict** que la proposition initiale sur la seule metrique qui
   differe (couverture), jamais plus laxiste : accepter ses seuils ne degrade aucune exigence
   du standard.

Seuils reellement appliques, sur le nouveau code uniquement (verifies a l'API
`qualitygates/list`) :

| Metrique | Seuil |
|---|---|
| Couverture | ≥ 80 % (`D-11` proposait 70 % ; le gate impose est plus strict) |
| Duplication | ≤ 3 % (identique a la proposition) |
| Note de fiabilite | A |
| Note de securite | A |
| Note de maintenabilite | A (identique a la proposition) |
| Hotspots de securite revus | 100 % |

## Conséquences

**Positives**
- Verdict publie automatiquement sur chaque pull request par l'app GitHub SonarCloud, sans
  configuration supplementaire.
- Le nouveau code est isole nativement par l'analyse de pull request : aucun script de diff a
  maintenir.
- Seuils plus stricts que la proposition initiale, sans effort supplementaire.

**Négatives / dette acceptée**
- Le seuil de couverture reel (80 %) n'est pas celui propose dans le backlog (70 %) : `D-11`
  est cloture par cet ADR sur cette valeur, imposee par la plateforme et non choisie.
- Aucun gate personnalise n'est possible tant que l'organisation reste sur le plan Free : une
  metrique que l'equipe voudrait ajouter ou assouplir plus tard (ex. `D-11` a une valeur
  differente) resterait hors de portee sans changement de plan.
- Le blocage reel du merge (critere d'acceptation d'`EN-17`) suppose de rendre le check
  SonarCloud obligatoire dans la protection de branche `dev` : une action de configuration du
  depot, distincte de cet ADR.

**Ce que ça impose au reste du projet**
- Toute PR qui degraderait la couverture, la duplication, ou une note de qualite sur le code
  qu'elle ajoute ou modifie sera signalee par ce gate ; en dessous de 80 % de couverture sur du
  code neuf, la PR echoue le gate.

## Comment on saura qu'on s'est trompé

Si le plan Free devient limitant autrement que sur ce seul point (ex. quota d'analyses,
retention des rapports), ou si l'equipe juge 80 % de couverture trop couteux a maintenir sur
des adaptateurs difficiles a tester (cf. `packages/infra`), remettre en cause cet ADR et
evaluer le cout d'un plan payant plutot que de contourner le gate.

## Références

- `docs/backlog.md`, décisions `D-10` et `D-11`
- `standards/07-quality-gates.md`, section 4
- `docs/adr/README.md`, table « Ce qui reste a trancher »
