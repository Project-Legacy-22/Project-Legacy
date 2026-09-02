# Audit du legacy

Point de départ : `docker/getting-started-app`, commit `42752ef`, environ 250 lignes utiles.

Ce document répond au §2 du sujet, qui demande de comprendre le système existant avant de
décider comment le faire évoluer, et qui nomme six axes d'attention. Chaque dette porte un
identifiant, le fichier concerné, sa conséquence observable, et l'item de backlog qui la
corrige. Une dette sans conséquence concrète n'en est pas une : ce document ne liste que ce
qui produisait un effet mesurable.

Il sert d'argumentaire aux ADR (`SP-01`) et de justification aux estimations du backlog.

---

## 1. Structure de l'application

Trois répertoires, aucune couche. `src/index.js` monte Express, branche quatre routes et
appelle `db.init()`. `src/routes/` contient un fichier par verbe HTTP. `src/persistence/`
expose deux pilotes derrière un `index.js` qui en choisit un. `src/static/` sert le front.

Il n'y a pas de couche métier : entre la requête HTTP et la base, rien.

| Dette | Constat | Conséquence | Corrigée par |
|---|---|---|---|
| **D-01** | Les handlers appellent directement la persistance (`src/routes/*.js`) | Aucune règle métier n'est testable sans HTTP ni base de données | `EN-04` |
| **D-02** | Le pilote est choisi par effet de bord au chargement du module : `if (process.env.MYSQL_HOST) module.exports = require('./mysql')` | Impossible d'injecter une doublure ; le choix est global et figé au premier `require` | `EN-04` |

## 2. Organisation du front et du back

Le front est servi statiquement par l'API depuis `src/static/`. Il transpile **dans le
navigateur** : `index.html` charge `babel.min.js`, puis `app.js` en `type="text/babel"`.
React, ReactDOM, React-Bootstrap et Font Awesome sont des fichiers copiés dans le dépôt.

| Dette | Constat | Conséquence | Corrigée par |
|---|---|---|---|
| **D-03** | Transpilation navigateur, bibliothèques vendorées (`src/static/js/*.min.js`) | Aucun build, aucun bundling, aucune dépendance versionnée ni actualisable | `EN-05` |
| **D-04** | `app.js` mélange rendu, appels réseau et état dans un seul fichier | Un composant ne peut pas être testé sans réseau | `EN-05` |
| **D-05** | ``className={`item ${item.completed && 'completed'}`}`` produit la classe `item false` quand la tâche n'est pas terminée | Classe parasite dans le DOM livré | `EN-05` |
| **D-06** | `aria-describedby="basic-addon1"` pointe un élément inexistant ; le champ n'a pas de `label` | Un lecteur d'écran annonce une référence morte et un champ sans nom | `EN-05`, `US-14` |
| **D-07** | Les `fetch` ne vérifient jamais `response.ok` | Une erreur serveur est traitée comme un succès : l'interface affiche un état faux | `EN-05`, `EN-48` |

## 3. Répartition des responsabilités

Les routes portent la validation, la génération d'identifiant, la persistance et le format de
réponse — c'est-à-dire tout. La persistance porte la création du schéma. Personne ne porte les
règles métier, puisqu'il n'y en a aucune d'explicite.

| Dette | Constat | Conséquence | Corrigée par |
|---|---|---|---|
| **D-08** | Aucune validation d'entrée : `POST /items` accepte `{}` et stocke `name: undefined` | Une ligne invalide entre en base sans qu'aucune couche ne s'y oppose | `EN-04` |
| **D-09** | Aucun `try/catch`, aucun middleware d'erreur | Une erreur de base rejette une promesse non gérée ; la réponse reste pendante jusqu'au délai d'attente du client | `EN-04` |
| **D-10** | `updateItem` fait un `UPDATE` puis un `SELECT` sans vérifier l'existence | Sur un identifiant inconnu : `200` avec un corps vide, au lieu de `404` | `EN-04` |
| **D-11** | `deleteItem` répond `res.sendStatus(200)` sans regarder si la ligne existait | Impossible de distinguer une suppression effective d'une ressource déjà absente | `EN-04` |
| **D-12** | `getItems` renvoie `SELECT * FROM todo_items` sans limite | La réponse grandit avec la table, sans pagination ni borne | `US-12` |

## 4. Stratégie de test

Cinq fichiers dans `spec/`, écrits pour Jest. **Jest n'est pas dans les dépendances** et
`package.json` ne déclare aucun script `test` : la suite ne peut pas s'exécuter.

Lue de près, elle vérifie des séquences d'appels internes plutôt que des comportements.

| Dette | Constat | Conséquence | Corrigée par |
|---|---|---|---|
| **D-13** | `devDependencies` ne contient que `nodemon` ; aucun script `test` | La suite héritée est morte : elle ne protège rien | `EN-06` |
| **D-14** | `expect(db.storeItem.mock.calls[0][0]).toEqual(...)` (`spec/routes/addItem.spec.js`) | Tout renommage interne casse le test alors que le comportement est intact | `EN-06` |
| **D-15** | `jest.mock('../../src/persistence')` mocke un module par son chemin | Le test dépend de l'arborescence, pas du contrat | `EN-06` |

## 5. Typage et qualité du code

Aucun typage : JavaScript sans annotations, sans JSDoc, sans `tsconfig.json`. Aucun linter,
aucun formateur, aucune règle de complexité. Le sujet nomme explicitement « the current level
of typing » parmi les points à examiner.

| Dette | Constat | Conséquence | Corrigée par |
|---|---|---|---|
| **D-16** | Aucun typage ni analyse statique | Une faute de frappe sur un nom de champ ne se découvre qu'à l'exécution | `EN-04`, `EN-06` |
| **D-17** | `fs.readFileSync(HOST_FILE)` renvoie un `Buffer`, passé tel quel à `waitPort` et `mysql.createPool` | Les variantes `*_FILE`, prévues pour les secrets, transmettent un type inattendu | `EN-04`, `EN-09` |
| **D-18** | `console.log` pour toute journalisation, y compris le chemin de la base | Aucune structure exploitable, et des informations d'infrastructure en clair | `EN-04`, `EN-42` |
| **D-19** | `"main": "index.js"` alors que le point d'entrée est `src/index.js` | Le manifeste décrit un fichier qui n'existe pas | `EN-04` |

## 6. Construction et déploiement

Rien. Ni `Dockerfile`, ni fichier de composition, ni configuration d'intégration continue, ni
`.gitignore`, ni `.env.example`, ni champ `engines`. Le seul script est `dev`, qui lance
`nodemon`. Le `README` d'origine tient en cinq lignes et renvoie vers un tutoriel externe.

| Dette | Constat | Conséquence | Corrigée par |
|---|---|---|---|
| **D-20** | Aucun conteneur, aucune intégration continue, aucun `.gitignore` | Rien ne vérifie une contribution ; aucun artefact livrable | `EN-03`, `EN-07`, `EN-08` |
| **D-21** | Chemin de base par défaut `/etc/todos/todo.db` | Le démarrage local échoue sans privilèges : le répertoire est système | `EN-03`, `EN-30` |
| **D-22** | Port `3000` en dur dans `src/index.js` | Le port n'est pas configurable, ce qu'exige une image publiée | `EN-08`, `EN-30` |
| **D-23** | Aucune variable requise n'est validée ; l'application démarre toujours | Une configuration incomplète produit une panne plus loin, sans message utile | `EN-30` |
| **D-24** | `overrides` fige sept dépendances transitives, sans commentaire ni date | Épingle des versions vulnérables jamais revisitées. Le pin de `tar` maintenait dix alertes ouvertes, dont une critique, jusqu'au 3 septembre | `#101` |
| **D-25** | `gracefulShutdown` appelle `process.exit()` sans fermer le serveur HTTP | Les connexions en cours sont coupées à l'arrêt | `EN-42` |

## 7. Modèle de données

```sql
CREATE TABLE IF NOT EXISTS todo_items (id varchar(36), name varchar(255), completed boolean)
```

Exécuté au démarrage, par chaque pilote, sans versionnement.

| Dette | Constat | Conséquence | Corrigée par |
|---|---|---|---|
| **D-26** | Schéma créé au démarrage, aucune migration | Toute évolution du schéma est irréversible et non traçable | `EN-09` |
| **D-27** | Aucune clé primaire, aucun index, aucune contrainte | Deux lignes peuvent partager le même identifiant ; chaque lecture par identifiant parcourt la table | `EN-09` |
| **D-28** | Aucune notion d'utilisateur : `todo_items` n'a pas de propriétaire | L'authentification et le RGPD sont impossibles sans refonte du modèle | `EN-09`, `US-11`, `US-13` |

---

## Ce que l'audit conclut

**On ne fait pas évoluer cette base, on la remplace couche par couche.** Vingt-huit dettes,
dont trois structurelles — absence de couche métier, absence de propriétaire dans le modèle,
absence de toute vérification automatique — qui rendent chaque ajout de fonctionnalité plus
coûteux que la réécriture de la couche concernée.

L'ordre de traitement suit ces trois-là : `EN-04` rend le code testable, `EN-09` rend le modèle
capable de porter un utilisateur, `EN-07` empêche les régressions. Tout le reste en dépend.

## État au 3 septembre

| Axe | Dettes | Corrigées | Restantes |
|---|---|---|---|
| Structure | D-01, D-02 | les deux | — |
| Front | D-03 à D-07 | D-03, D-04, D-05, D-06 | D-07, partiellement (`EN-48`) |
| Responsabilités | D-08 à D-12 | D-08 à D-11 | D-12 (`US-12`) |
| Tests | D-13 à D-15 | les trois | — |
| Typage et qualité | D-16 à D-19 | les quatre | — |
| Build et déploiement | D-20 à D-25 | D-20, D-24 | D-21, D-22, D-23 (`EN-03`, `EN-30`), D-25 (`EN-42`) |
| Modèle de données | D-26 à D-28 | — | les trois (`EN-09`) |

Dix-neuf dettes sur vingt-huit sont corrigées, et chacune l'est de façon vérifiable : par un
test, par un contrôle de la chaîne d'intégration, ou par une exécution reproductible. Les neuf
restantes sont toutes rattachées à un item ouvert du backlog ; aucune n'est orpheline.

## Méthode

Constats établis par lecture du commit `42752ef` fichier par fichier, puis vérifiés par
exécution : tentative de lancement de la suite héritée, démarrage de l'application, appels HTTP
sur les quatre routes, inspection du schéma créé. Les conséquences décrites ont été observées,
non déduites.
