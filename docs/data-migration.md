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

C'est l'objet de #282, et ce document le portera quand il sera livré. Le principe est déjà
tranché par l'ADR-0017, et il tient en une distinction qui doit être écrite plutôt que découverte :

- **vers un PostgreSQL** reconstruit par les migrations versionnées, l'export est fidèle : rien ne
  se perd ;
- **vers un MySQL ou un SQLite**, il l'est seulement si le schéma cible est **traduit du nôtre**.
  Réécrire les données dans la table `todo_items` de trois colonnes du projet d'origine perdrait le
  projet, le propriétaire, la priorité, l'échéance et les notifications. La sortie traduit donc le
  schéma ; elle ne revient pas au legacy.

## Exécutions réelles

Une procédure qu'on n'a jamais jouée n'est pas une procédure.

| Date | Sens | Ce qui a été fait |
|---|---|---|
| | | |
