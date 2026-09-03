# ADR-0006 — Vite pour la chaîne front, React conservé

- **Statut** : Accepté
- **Date** : 2026-09-02
- **Décideurs** : équipe complète, réunion de lancement
- **Issue liée** : #2

## Contexte

Le front hérité est transpilé **dans le navigateur** : `index.html` charge `babel.min.js`
puis `app.js` en `type="text/babel"`. React, ReactDOM, React-Bootstrap et Font Awesome sont
des fichiers copiés dans le dépôt (`DET-03`). Il n'y a ni build, ni bundling, ni dépendance
déclarée ou actualisable.

Le sujet demande de corriger la dette d'outillage. Il ne demande pas de changer de
bibliothèque d'interface.

## Options considérées

### Option A — Vite, React conservé
- Avantages : la réécriture se limite à l'outillage ; les composants existants restent
  lisibles et servent de filet fonctionnel ; dépendances déclarées et verrouillées.
- Inconvénients : aucun rendu côté serveur, non demandé par le sujet.

### Option B — Changer de bibliothèque (Vue, Svelte)
- Avantages : aucun, à l'échelle de ce projet.
- Inconvénients : réécriture complète des composants, pour un gain nul à l'évaluation et un
  filet fonctionnel perdu.

### Option C — Garder la transpilation navigateur
- Écarté : c'est la dette `DET-03`.

## Décision

Nous retenons **l'option A — Vite, React conservé**.

Parce que :

1. La dette est l'outillage, pas la bibliothèque. Changer de bibliothèque ferait payer une
   réécriture pour un point qui n'est pas évalué.
2. Les composants existants décrivent le comportement attendu. Les conserver donne un filet :
   on sait à quoi comparer le résultat.
3. Vite apporte exactement ce qui manque — build, bundling, dépendances verrouillées, serveur
   de développement — sans rien imposer d'autre.

## Conséquences

**Positives**
- Les bibliothèques copiées dans le dépôt disparaissent : 27 315 lignes supprimées par
  `EN-05`.
- Le front est bâti dans `apps/api/dist/static` et servi par l'API : une seule image
  livrable (`EN-08`), pas deux services à déployer.
- Le projet `jsdom` de Vitest couvre le front dans le même rapport de couverture que le
  reste, donc un seul seuil interprétable.

**Négatives / dette acceptée**
- Conserver React ne corrige pas les fautes de code du front hérité : `DET-05` (classe
  `item false` dans le DOM), `DET-06` (`aria-describedby` pointant un élément inexistant,
  champ sans `label`) et `DET-07` (`response.ok` jamais vérifié) sont des fautes, pas de
  l'outillage, et doivent être corrigées explicitement.
- Pas de rendu côté serveur : le premier affichage attend le bundle.

**Ce que ça impose au reste du projet**
- `EN-05` supprime les fichiers vendorés plutôt que de les laisser à côté du nouveau build.
- La direction graphique — bibliothèque de composants ou CSS maison — reste à trancher, et
  ne l'est pas par cet ADR.

## Comment on saura qu'on s'est trompé

Si le référencement ou le temps d'affichage initial devenait une exigence mesurée, Vite seul
ne suffirait plus et il faudrait un rendu côté serveur. Ce n'est pas au périmètre du sujet :
ce signal n'est pas attendu pendant le projet.

## Références

- `docs/backlog.md`, décision `D-05`
- `docs/audit-legacy.md`, dettes `DET-03` à `DET-07` (`SP-00`, PR #107)
