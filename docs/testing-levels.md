# Les niveaux de test

But de cette page : en regardant un test, savoir a quel niveau il appartient, ce qu il a le
droit de supposer, et ce qui n a rien a y faire. Le vocabulaire est celui de
`standards/03-testing.md`, section 1. Cette page ne le remplace pas, elle dit comment il se
traduit dans ce depot.

Les motifs de fichiers de chaque niveau vivent dans `vitest.levels.ts`, en un seul endroit,
parce que `vitest.config.ts`, `vitest.integration.config.ts` et le garde ci-dessous lisent les
memes.

## Les quatre niveaux qui existent

| Niveau | Commande | Ou vivent ses fichiers |
|---|---|---|
| `unit` | `npm run test:unit` | `packages/**`, plus deux fichiers purs de `apps/api/src` |
| `http` | `npm run test:http` | `apps/api/src/http/routes/**` |
| `dom` | `npm run test:dom` | `apps/web/src/**` |
| `integration` | `npm run test:integration` | `apps/api/test/integration/**`, pile locale requise |

Les motifs exacts sont dans `vitest.levels.ts` ; cette colonne les resume. Aucun compte de
fichiers ni de cas ici : il perimerait au prochain test ajoute, et cette page serait alors fausse
sans que rien ne le signale -- exactement ce que le garde plus bas existe pour empecher ailleurs.
Pour les chiffres du jour, `npm test`.

`npm test` lance les trois premiers ensemble et produit **le** rapport de couverture. Il n est
pas la somme de trois commandes : deux rapports partiels rendraient tout seuil ininterpretable,
ce que le commentaire de `vitest.config.ts` disait deja avant ce decoupage. Les commandes par
niveau servent la boucle courte pendant le developpement, jamais la mesure.

Les noms sont ceux des niveaux, pas des runtimes. `node` et `jsdom` decrivent un environnement,
ce qui ne dit rien de ce qu un test a le droit de supposer.

### `unit`

`packages/**`, plus `apps/api/src/config.test.ts` et `apps/api/src/http/cookies.test.ts`.

**Ce qu on y teste** : le domaine et l application des paquets `core`, les schemas partages de
`contracts`, la traduction faite par les adaptateurs de `infra`, et les fonctions pures de
`apps/api` qui ne montent aucun serveur.

**Ce qu un test peut supposer** : rien d exterieur. Tout ce qui est derriere un port est un faux
ecrit a la main qui implemente reellement le port. L horloge et le generateur d identifiants
sont injectes, donc le test est deterministe sans rien attendre.

**Ce qui n a rien a y faire** : un vrai serveur, une vraie base, un vrai bus, une horloge
reelle, un `sleep`.

### `http`

`apps/api/src/http/routes/**`.

**Ce qu on y teste** : le cablage d une route. Un vrai serveur Express ecoute sur le port 0 et
est interroge par `fetch`, avec des faux derriere les ports. Ce qui est verifie est le code
HTTP, l en-tete, le corps rendu, le cookie pose.

**Ce qu un test peut supposer** : que la regle metier appelee est deja verifiee au niveau
`unit`. Un test de route n a pas a reprouver une regle de validation du domaine ; il verifie que
la route la delegue et traduit son resultat.

**Ce qui n a rien a y faire** : une regle de domaine, une vraie base, un vrai bus.

### `dom`

`apps/web/src/**`.

**Ce qu on y teste** : des composants montes en jsdom par `apps/web/src/test/react-root.tsx`,
interroges par selecteur CSS. Les etats rendus, les libelles annonces, l ordre de tabulation, le
contraste des jetons de couleur, et les violations detectables par `axe-core` sur `wcag2a`,
`wcag2aa` et `wcag21aa`.

**Ce qu un test peut supposer** : que le harnais dit vrai. Il est lui-meme teste, par
`apps/web/src/test/react-root.test.tsx`, contre du DOM ecrit a la main -- sans quoi une erreur
dedans rendrait vert un test qui devrait etre rouge, sans aucun echec pour le signaler.

**Ce qu un test ne peut pas supposer** : que jsdom se comporte comme un navigateur. Il
n implemente ni la navigation sequentielle au clavier ni la soumission implicite d un
formulaire, et ne calcule aucune couleur effective -- `color-contrast` est donc desactive dans
chaque passe `axe`, et le contraste est verifie autrement, en lisant les jetons et en calculant
la luminance relative. La simulation clavier boucle du dernier element au premier la ou un
navigateur sortirait vers sa propre barre d outils : rien ne peut conclure sur la sortie de la
page.

**Ce qui n a rien a y faire** : un appel reseau reel, une assertion sur une couleur calculee, un
parcours qui traverse plusieurs pages.

### `integration`

`apps/api/test/integration/**`, config et commande separees.

**Ce qu on y teste** : une vraie route contre une vraie base. C est le seul niveau qui prouve
qu une politique RLS fait ce qu elle annonce, et que les adaptateurs sortants parlent bien a
PostgREST.

**Ce qu un test peut supposer** : que la pile Supabase locale tourne (`npm run db:start`). C est
pourquoi il ne fait pas partie de `npm test`, que tout le monde lance a chaque changement.

**Ce qui n a rien a y faire** : un cas qui se verifie sans base. Ces tests coutent des secondes
la ou les autres coutent des millisecondes.

## Le niveau qui n existe pas

**E2E navigateur.** Porte par #27 (`EN-26`), classe `Could`, bloque par `US-15`.

Le seul argument serieux pour l ajouter maintenant etait le contraste, que jsdom ne sait pas
calculer. Il se resout autrement, par le test de jetons du niveau `dom`. Les parcours navigateur
porteraient par ailleurs sur des ecrans qui vont changer.

**Signal qui remettrait cette decision en cause** : le jour ou un critere d acceptation ne peut
plus etre verifie hors navigateur. Le contraste en etait un ; il ne l est plus.

## Le garde qui tient la partition

`test/test-levels.test.ts` verifie deux choses sur les motifs de `vitest.levels.ts` :

- chaque fichier de test **versionne** appartient a un niveau ;
- aucun n appartient a deux.

Sans lui, un fichier de test place hors de tous les motifs ne serait lance par rien, et **rien
ne le dirait** : la suite deviendrait simplement plus silencieuse, sans un seul echec. C est la
forme de perte la plus couteuse a retrouver.

Sa limite est dans son nom : il ne voit que ce que `git ls-files` connait. Un fichier non
versionne echappe au controle, mais il echappe aussi au depot.

## Deux ecarts avec les standards, a arbitrer en equipe

Ni l un ni l autre n est corrige ici : `standards/` vit dans un autre depot et fait foi sur son
sujet. Les noter est le minimum ; les changer est une decision d equipe.

**La table de `03-testing.md` section 1 compte trois lignes** -- Unitaire, Integration, E2E --
la ou ce depot distingue trois familles avant l integration. Les niveaux `unit`, `http` et `dom`
appartiennent tous a la ligne « Unitaire » au sens du standard, puisque tout ce qui est derriere
un port y est un faux. La table ne nomme donc pas la difference entre verifier une regle et
verifier le cablage qui l appelle.

**`07-quality-gates.md` section 3 nomme une etape `test:unit` qui porte la couverture.** Dans ce
depot, c est `npm test` qui la porte, et `npm run test:unit` est la boucle courte sans
couverture. Le nom du standard et celui du depot ne designent pas la meme chose.

## Ce que d autres issues portent

| Etage | Porte par |
|---|---|
| Contrat entre composants | #24 (`EN-23`) |
| Bout en bout navigateur | #27 (`EN-26`) |
| Accessibilite et clavier | #181 (`US-14a`) |
| Flux evenementiel | #179 (`EN-50b`) |
| Angles morts de mesure | #180 (`EN-50c`) |
| Cohesion des harnais entre branches | #170 |
