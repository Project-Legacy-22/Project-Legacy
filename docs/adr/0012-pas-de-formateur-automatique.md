# ADR-0012 — Pas de formateur automatique pour l'instant

- **Statut** : Accepté
- **Date** : 2026-09-11
- **Décideurs** : équipe, à la revue du sprint 2
- **Issue liée** : #221

## Contexte

Le dépôt n'a ni `prettier`, ni `.editorconfig`, ni règle de mise en forme dans `eslint.config.js` :
la mise en forme tient par convention seule, sur 267 fichiers TypeScript.

Mesure du 11 septembre 2026 sur ces 267 fichiers :

| Ce qui est mesuré | Résultat |
|---|---|
| Indentations rencontrées | 4, 8, 12, 16 espaces — multiples de 4, sans exception mesurée |
| Guillemets | 11 610 simples contre 1 094 doubles, ces derniers presque tous à l'intérieur de chaînes |
| Lignes de plus de 100 caractères | 446 |

La convention tient donc d'elle-même sur l'indentation et les guillemets. Le seul écart réel est la
longueur de ligne.

## Options considérées

### Option A — Adopter prettier maintenant
- Avantages : la mise en forme cesse d'être un sujet de relecture ; les 446 lignes longues sont
  reformatées d'un coup.
- Inconvénients : un reformatage de 267 fichiers en un commit rend `git blame` inutilisable sans
  `.git-blame-ignore-revs`, et entre en conflit avec les trois pull requests ouvertes. Les règles
  du projet interdisent par ailleurs le reformatage global au passage d'une tâche.
- Coût : faible en outillage, élevé en bruit d'historique au pire moment.

### Option B — Ajouter des règles de mise en forme à eslint
- Avantages : pas de second outil ; l'application reste dans le contrôle déjà en place.
- Inconvénients : les règles de mise en forme d'eslint sont dépréciées au profit de
  `@stylistic`, donc une dépendance de plus malgré tout, et le même reformatage à absorber.

### Option C — Ne rien adopter, et laisser la convention tenir
- Avantages : aucun reformatage, aucun conflit, aucune dépendance.
- Inconvénients : la cohérence dépend des relecteurs ; un contributeur nouveau n'a rien qui
  l'oriente automatiquement.

## Décision

Nous retenons **l'option C pour le sprint 2**, et l'option A comme candidate à une frontière de
sprint.

Parce que la mesure ne montre aucune dérive à corriger : l'indentation et les guillemets sont
uniformes sans outil. Et parce que le coût tombe au mauvais moment — trois pull requests ouvertes et
une revue le lendemain, pour un gain qui ne se voit pas dans le code livré.

## Conséquences

**Positives**
- Aucun conflit introduit dans les pull requests en cours.
- L'historique reste lisible : aucun commit ne touche 267 fichiers sans changer de comportement.

**Négatives / dette acceptée**
- 446 lignes dépassent 100 caractères et resteront ainsi jusqu'à une éventuelle adoption.
- La cohérence continue de reposer sur la relecture.

**Ce que ça impose au reste du projet**
- Si l'adoption est décidée, elle se fait en un commit qui ne contient que le reformatage, avec un
  `.git-blame-ignore-revs` qui le référence, et aucune pull request ouverte à ce moment-là.

## Comment on saura qu'on s'est trompé

Une relecture qui discute de mise en forme au lieu du comportement, ou une seconde mesure montrant
plusieurs largeurs d'indentation dans le dépôt.

## Références

- Mesure : `git ls-files '*.ts' '*.tsx'`, 11 septembre 2026
- Standards de style du projet, section 3 (conventions de nommage et de forme)
