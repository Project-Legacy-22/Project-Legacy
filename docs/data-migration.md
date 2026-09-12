# Migration des données

Comment faire entrer des données venues d'un autre moteur, et comment en faire sortir les nôtres.
L'ADR-0017 dit pourquoi ces deux chemins existent : la dépendance à Supabase est assumée parce
qu'elle est réversible, et une réversibilité qu'on n'a jamais exécutée est une intention, pas une
propriété.

Les outils sont dans `packages/data-migration`. Ce paquet **ne déclare aucune dépendance**, ni
externe ni interne, et il n'ouvre **aucune connexion** : il lit du texte et il en écrit. Les deux
choix sont volontaires. Le premier parce qu'un outil de sortie qui dépend de ce qu'on quitte n'est
pas un outil de sortie. Le second parce qu'un script relu avant d'être appliqué est la seule forme
qui laisse une chance de refuser une reprise qui s'est trompée — et qu'appliquer une migration est
une décision qui appartient à une personne, pas à un programme.

## Ce qui ne traverse jamais

Avant les procédures, ce qu'aucune des deux ne transporte, parce que ce n'est pas du SQL :

- **les comptes et les mots de passe**, tenus par GoTrue dans le schéma `auth`. Notre table
  `public.users` est un miroir alimenté par un déclencheur : elle porte l'identifiant, l'adresse
  et le consentement, jamais un secret d'authentification. Changer de fournisseur veut donc dire
  réinscrire les comptes, ou écrire un adaptateur d'authentification.
- **les politiques de sécurité au niveau ligne**, qui sont du PostgreSQL et n'ont pas d'équivalent
  en MySQL ni en SQLite. Sur un autre moteur, l'autorisation redevient entièrement du code
  applicatif.

L'ADR-0017 les nomme comme le coût de sortie. Ils sont écrits ici pour qu'on ne les découvre pas
le jour du départ.

## Sens 1 : d'un MySQL ou d'un SQLite vers notre PostgreSQL

C'est le chemin de reprise du projet d'origine, qui stockait ses tâches dans l'un ou l'autre au
choix du déploiement : `src/persistence/mysql.js` et `src/persistence/sqlite.js` au commit
`42752ef`, tous deux créant la même table
`todo_items (id varchar(36), name varchar(255), completed boolean)`.

### 1. Produire l'export

Depuis un MySQL :

```bash
mysqldump --no-tablespaces --skip-add-locks legacy todo_items > legacy.sql
```

Depuis un SQLite :

```bash
sqlite3 legacy.db .dump > legacy.sql
```

Les deux formes sont lues. Le moteur est un paramètre de la commande suivante, jamais une
détection : `mysqldump` écrit une apostrophe `\'`, `sqlite3` écrit `''` et laisse une
contre-oblique telle quelle, et lire un export SQLite avec les règles de MySQL fusionnerait deux
colonnes dès qu'un nom de tâche finit par une contre-oblique.

### 2. Écrire le script de reprise

Le compte destinataire doit exister : la reprise rattache des tâches, elle ne crée pas de compte.
L'identifiant de projet est fourni plutôt que tiré au hasard, et c'est lui qui rend la reprise
rejouable — le réutiliser à l'identique ne crée pas un second projet.

```bash
uuidgen | tr 'A-Z' 'a-z'          # l'identifiant de projet, a garder
npm run data:import -- \
  --from legacy.sql \
  --engine mysql \
  --owner quelquun@example.com \
  --project-id <l-uuid-ci-dessus> \
  --project "Reprise du legacy" \
  --out data-out
```

La commande écrit deux fichiers dans `data-out/`, que `.gitignore` couvre : le script porte
l'adresse du destinataire en clair, parce que c'est la clé qui résout le compte, et une donnée
personnelle n'a rien à faire dans l'historique du dépôt.

### 3. Relire le script, puis l'appliquer

```bash
psql "$DATABASE_URL" --set ON_ERROR_STOP=1 -f data-out/import-<horodatage>.sql
```

Le script est encadré par une transaction. Si aucun compte ne porte l'adresse, il lève et tout est
annulé : mieux vaut une reprise qui refuse qu'un projet que personne ne possède.

### Ce que la reprise décide, et ce qu'elle refuse

Le legacy a trois colonnes, `items` en a dix.

| Champ | Ce qui est écrit | Pourquoi |
|---|---|---|
| propriétaire | l'adresse de `--owner`, résolue en SQL | une adresse inconnue annule la reprise |
| projet | créé par la reprise | `items.project_id` est `not null` depuis US-16 |
| `status` | `completed` vrai vers `done`, faux vers `todo` | le seul champ que le legacy porte |
| `priority`, `due_date`, `version` | laissés au schéma | le legacy n'en a aucun |
| dates | la date de la reprise, écrite en clair dans le script | la source n'en a pas, et en inventer une par ligne serait un mensonge |

Un `completed` nul est lu comme `todo`, et le rapport le dit : c'est une lecture, pas un fait.

Rien n'est altéré pour faire entrer une ligne : un nom n'est ni tronqué ni même rogné. Une tâche
silencieusement modifiée est pire qu'une tâche manquante, parce que la manquante est dans le
rapport. Sont refusées et nommées, avec leur ligne dans l'export : l'absence d'identifiant, un
identifiant qui n'est pas un UUID, un identifiant qui apparaît deux fois, un nom nul, vide, ou
au-delà de 255 caractères.

## Sens 2 : de notre PostgreSQL vers un autre moteur

Une distinction d'abord, parce qu'elle doit être écrite plutôt que découverte :

- **vers un PostgreSQL** reconstruit par le schéma rendu, l'export est fidèle : rien ne se perd ;
- **vers un MySQL ou un SQLite**, il l'est seulement si le schéma cible est **traduit du nôtre**.
  Réécrire les données dans la table `todo_items` de trois colonnes du projet d'origine perdrait le
  projet, le propriétaire, la priorité, l'échéance et les notifications. La sortie traduit donc le
  schéma ; elle ne revient pas au legacy.

### 1. Produire l'export

```bash
npx supabase db dump --local --data-only -s public -f dump.sql
```

Sur le projet hébergé, remplacer `--local` par `--linked`. La commande écrit des `insert`, sauf
si on lui demande `--use-copy` : c'est cette forme que l'outil lit.

L'export doit être produit **en UTC**. Un horodatage portant un autre décalage est refusé plutôt
que converti : ni `datetime(6)` ni le texte de SQLite ne porte de fuseau, et décaler toutes les
dates au jugé est précisément le genre de silence que ces outils existent pour éviter.

### 2. Écrire le schéma et les données pour les trois cibles

```bash
npm run data:export -- --from dump.sql --out data-out
```

Six fichiers dans `data-out/` : `<cible>-schema.sql` et `<cible>-data.sql` pour `postgres`,
`mysql` et `sqlite`. On applique le schéma, puis les données.

### Ce que la traduction du schéma porte, et ce qu'elle laisse

| Nous | postgres | mysql | sqlite |
|---|---|---|---|
| `uuid` | `uuid` | `char(36)` | `text` |
| `timestamptz` | `timestamptz` | `datetime(6)`, sans fuseau | `text`, UTC |
| `jsonb` | `jsonb` | `json` | `text` |
| énumération | le type qu'elle a déjà | `enum(...)` en ligne | `text` + `check` |

Les types, la nullabilité, les clés, les clés étrangères, l'unicité et les valeurs par défaut
traversent. Ne traversent pas : les contrôles de valeur (`char_length` ne s'écrit pas pareil en
SQLite), les politiques de sécurité au niveau ligne, les déclencheurs, et le générateur
d'identifiants — une fonction à nous, dont une cible n'a pas besoin puisqu'elle reçoit les
identifiants avec les données.

## Rejouer la preuve

Une procédure qu'on ne peut pas rejouer n'est pas une preuve. Tout est dans le dépôt :

```bash
npm run test:migration
```

La commande démarre trois conteneurs — PostgreSQL 17, MySQL 8.4 et un Alpine qui ne porte que
`sqlite3` — et rejoue les deux sens : un export `mysqldump` entre dans notre schéma, puis nos
données ressortent vers les trois cibles, et les valeurs sont comparées de bout en bout.

Aucun port n'est publié et aucun client n'a besoin d'être installé : tout passe par
`docker compose exec`. Docker suffit, et la chaîne d'intégration exécute exactement la même
commande. Les conteneurs vivent sous le profil `migration`, donc `npm run up` ne les démarre pas.

```bash
docker compose ps                          # les voir
docker compose --profile migration down    # les arreter
```

Dans la chaîne d'intégration, le job `Migration de donnees` ne tourne que sur le chemin de
livraison : la pull request de `dev` vers `main` et le push sur `main`. Sur une pull request
ordinaire il est ignoré — trois moteurs à démarrer pour un code qui change rarement.

La garde qui empêche le modèle de dériver est ailleurs, au niveau `integration` :
`schema-model.integration.test.ts` compare `packages/data-migration/src/schema.ts` à
`information_schema` de la vraie base. Une colonne ajoutée par une migration et absente du
modèle fait échouer ce test, au lieu de disparaître silencieusement des exports.

## Exécutions réelles

Une procédure qu'on n'a jamais jouée n'est pas une procédure.

| Date | Sens | Ce qui a été fait |
|---|---|---|
| 2026-09-12 | legacy vers nous | Un MySQL 8.4 chargé de six lignes `todo_items`, exporté par `mysqldump`, repris par `npm run data:import`. Quatre lignes reprises, deux refusées et nommées. Script appliqué sur PostgreSQL 17.6, puis réappliqué : rien de dupliqué. Adresse inconnue : la transaction est annulée. |
| 2026-09-12 | nous vers ailleurs | Export des quatre tâches vers les trois cibles. Schéma et données appliqués sur PostgreSQL 17.6, MySQL 8.4 et SQLite 3.41. Comptes identiques, et une tâche nommée avec deux contre-obliques et une apostrophe retrouvée caractère pour caractère dans les trois. |

Ces deux lignes sont l'exécution qui a servi à écrire la procédure. `npm run test:migration` les
rejoue, et c'est cette commande qui vaut preuve : elle ne dépend d'aucun état laissé par la
précédente, puisqu'elle refait les trois bases depuis rien.

L'épreuve a trouvé deux défauts réels, ce qui est la raison de son existence. Le schéma rendu ne
portait pas les valeurs par défaut, donc une cible refusait les lignes que notre propre script de
reprise lui envoyait (`null value in column "version"`). Et une contre-oblique était divisée par
deux en arrivant dans MySQL, où elle est une échappée à l'intérieur d'un littéral.
