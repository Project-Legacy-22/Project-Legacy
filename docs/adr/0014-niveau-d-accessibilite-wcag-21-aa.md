# ADR-0014 — WCAG 2.1 AA comme niveau visé

- **Statut** : Accepté
- **Date** : 2026-09-11
- **Décideurs** : équipe, à la revue du sprint 2
- **Issue liée** : #228, décision `D-15`

## Contexte

Le niveau d'accessibilité visé conditionne les critères d'acceptation de toutes les histoires
front. Il n'avait jamais été ratifié, alors que le code l'applique : chaque passe `axe-core` du
dépôt tourne sur les étiquettes `wcag2a`, `wcag2aa` et `wcag21aa`, et le test de contraste calcule
la luminance relative avec les seuils WCAG — 4,5:1 pour le texte, 3:1 pour les composants.

`docs/features/15-accessibility-audit.md` note lui-même `D-15` comme « still unratified » tout en
s'y conformant. Une exigence appliquée par la CI sans être décidée peut se défaire sans discussion.

## Options considérées

### Option A — WCAG 2.1 AA
- Avantages : c'est le niveau de référence des obligations légales européennes, et celui que
  l'outillage vérifie déjà sans configuration supplémentaire.
- Inconvénients : le contraste et les parcours clavier demandent un travail réel sur chaque écran.

### Option B — WCAG 2.1 A
- Avantages : moins de critères.
- Inconvénients : laisse tomber le contraste, qui est le défaut le plus courant et le plus visible.

### Option C — Aucun niveau, au cas par cas
- Inconvénients : aucun critère d'acceptation vérifiable, et une accessibilité qui dépend du
  relecteur.

## Décision

Nous retenons **l'option A**, WCAG 2.1 AA.

Parce que c'est déjà ce que la CI impose, donc la ratifier ne coûte rien et l'écarter coûterait de
défaire du travail livré. Et parce que le sujet évalue l'accessibilité : un niveau nommé donne des
critères vérifiables au lieu d'une appréciation.

## Conséquences

**Positives**
- Toute histoire front hérite de critères d'acceptation vérifiables par `axe` et par le test de
  contraste.

**Négatives / dette acceptée**
- `color-contrast` reste désactivé dans les passes `axe`, jsdom ne résolvant aucune cascade. Le
  contraste est couvert autrement, par le test qui lit les jetons de couleur.
- Les écarts relevés et non corrigés sont suivis par des issues datées, pas par des lignes de
  rapport.

**Ce que ça impose au reste du projet**
- Un écran livré sans passe `axe` est un écran non conforme, et se traite comme un défaut.

## Comment on saura qu'on s'est trompé

Un critère du niveau qui ne peut être vérifié ni par `axe` en jsdom ni par un test sur les jetons,
et qui exigerait donc un navigateur — le signal qui ferait entrer `EN-26`.

## Références

- `docs/features/15-accessibility-audit.md`
- `apps/web/src/styles/contrast.test.ts`
