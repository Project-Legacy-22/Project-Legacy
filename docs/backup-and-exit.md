# Sauvegarde, restauration, sortie

Quatre questions auxquelles ce dépôt ne répondait pas : quelle durée de conservation est garantie,
ce qui se passe si le projet est suspendu, comment on sauvegarde, comment on récupère. Elles sont
venues de la défense intermédiaire, avec une phrase qui tranche : abandonner les données des
utilisateurs n'est pas acceptable.

## 1. Ce que l'offre gratuite garantit

Rien, et c'est écrit noir sur blanc par le fournisseur.

| Fait | Source |
|---|---|
| « We may pause applications on the Free Plan that exhibit low activity in a 7-day period to save on server resources. » | [Going into prod](https://supabase.com/docs/guides/platform/going-into-prod) |
| « You can restore paused projects from the Supabase dashboard. » | idem |
| « Database backups are not available for download for Free Plan projects. » | idem |
| « We recommend that free tier plan projects regularly export their data using the Supabase CLI `db dump` command and maintain off-site backups. » | [Backups](https://supabase.com/docs/guides/platform/backups) |
| L'offre Pro donne accès aux sept derniers jours de sauvegardes quotidiennes. | idem |

Trois conséquences, qu'il vaut mieux énoncer que découvrir :

- **sept jours sans activité suffisent** pour que le projet soit mis en pause. Une période de
  vacances, un sprint sur autre chose, et l'application ne répond plus ;
- une pause se rattrape depuis le tableau de bord, donc elle n'est pas une perte. Mais la
  **récupération dépend du fournisseur** : c'est lui qui détient la seule copie ;
- sur cette offre, **la sauvegarde que nous prenons est la seule qui existe**. Supabase ne le
  cache pas, il recommande explicitement de le faire soi-même.

C'est la raison d'être de tout ce qui suit, et de l'ADR-0017.

## 2. Sauvegarder

```bash
npm run backup              # le projet lié, celui que `supabase link` a retenu
npm run backup -- --local   # la pile locale
```

Sans `--local`, le CLI demande le mot de passe de la base, ou lit `SUPABASE_DB_PASSWORD`.

La commande écrit dans `backups/<horodatage>/` quatre fichiers :

| Fichier | Ce qu'il porte |
|---|---|
| `roles.sql` | les rôles du cluster et leurs réglages |
| `schema.sql` | les tables, les types, les fonctions, les politiques de sécurité au niveau ligne |
| `data.sql` | les données, **schéma `auth` compris** |
| `MANIFEST.txt` | la date, la cible, la version du CLI, et la taille et l'empreinte SHA-256 de chaque fichier |

L'ordre du tableau est l'ordre de restauration : les données avant le schéma n'ont nulle part où
aller.

**`data.sql` porte les comptes et leurs empreintes de mot de passe**, parce que le vidage des
données inclut le schéma `auth`. Ce dossier est donc une donnée personnelle au sens du règlement :
`.gitignore` l'exclut du dépôt, et une sauvegarde qui compte vraiment doit sortir de la machine.

Le manifeste existe pour qu'un dossier de trois `.sql` trouvé dans six mois dise d'où il vient et
si quelque chose l'a abîmé.

## 3. Restaurer

La cible est **un projet Supabase neuf, sur lequel nos migrations n'ont pas tourné**. Les deux
moitiés de cette phrase ont été mesurées, et chacune a une raison.

*Un projet Supabase*, parce que `schema.sql` crée ses extensions dans les schémas `extensions` et
`vault`, et que `data.sql` insère dans `auth.users` — des tables que GoTrue gère et que notre
vidage ne crée pas. Une base PostgreSQL nue refuse donc cette restauration. Pour sortir vers un
PostgreSQL quelconque, ou vers MySQL ou SQLite, c'est `docs/data-migration.md` qui s'applique.

*Sur lequel nos migrations n'ont pas tourné*, parce que la migration initiale crée l'utilisateur
système. Restaurer par-dessus échoue sur
`ERROR: duplicate key value violates unique constraint "users_pkey"` — mesuré le 12 septembre
2026, pas supposé.

```bash
# 1. Un projet neuf, puis ses coordonnees
supabase link --project-ref <nouveau-ref>

# 2. Les trois fichiers, dans cet ordre
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backups/<horodatage>/roles.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backups/<horodatage>/schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backups/<horodatage>/data.sql

# 3. Comparer, table par table, avec les comptes de la source
```

### Ce qui a été éprouvé, et quand

Le 12 septembre 2026, sur la pile locale (PostgreSQL 17.6, CLI Supabase 2.116.0).

Un compte a été créé avec un mot de passe connu, et sa connexion vérifiée. Sauvegarde prise. Les
deux schémas entièrement vidés. `data.sql` appliqué. Puis les deux vérifications qui comptent :

| Table | Avant | Après |
|---|---|---|
| `auth.users` | 68 | 68 |
| `public.users` | 69 | 69 |
| `public.projects` | 79 | 79 |
| `public.project_memberships` | 79 | 79 |
| `public.items` | 36 | 36 |
| `public.outbox` | 38 | 38 |
| `public.notifications` | 30 | 30 |

Et surtout : **le compte s'est reconnecté avec son mot de passe d'origine**. Des lignes qui
reviennent ne sont pas la même chose que des personnes qui peuvent revenir ; c'est la seconde qu'il
fallait démontrer.

### Ce qui n'a pas été éprouvé, et pourquoi

`schema.sql` n'a pas été appliqué à un projet réellement neuf : il en faudrait un second, et le
seul projet hébergé est celui qui sert. Ce que la restauration ci-dessus a exercé, c'est
`data.sql` sur un schéma que les migrations avaient construit — or `schema.sql` est un vidage de ce
même schéma, et la chaîne d'intégration reconstruit ce schéma depuis les migrations à chaque
exécution. Le risque restant est donc étroit, mais il n'est pas nul, et il est écrit ici plutôt
que passé sous silence.

## 4. Sortir

Quitter Supabase se découpe en trois parts, dont une seule est gratuite.

**Le schéma est acquis.** Des migrations versionnées reconstruisent un PostgreSQL vierge, et
`packages/data-migration` le traduit aussi pour MySQL et SQLite. C'est éprouvé sur trois moteurs
réels par `npm run test:migration`.

**Les données sont acquises.** Dans les deux sens, et éprouvées de la même façon. Le détail est
dans `docs/data-migration.md`.

**Ce qui reste à réécrire** — nommé maintenant, pour ne pas le découvrir le jour du départ :

| Ce qu'on perd | Ce qu'il faut à la place |
|---|---|
| GoTrue : inscription, connexion, jetons, réinitialisation, courriels | un service d'authentification, ou une bibliothèque dans l'application |
| les politiques de sécurité au niveau ligne | de l'autorisation applicative, à écrire et à tester |
| PostgREST | les routes qui manquent à l'API, s'il en reste qui passent par lui |

Deux précisions sur cette liste. Les comptes ne sont pas perdus : `npm run data:export` les écrit
pour chaque moteur cible, empreintes bcrypt comprises (#426), et le remplaçant de GoTrue n'a
besoin que d'une bibliothèque bcrypt pour les relire — `docs/data-migration.md`, « Les comptes ».
Et les
politiques de ligne sont la part la plus coûteuse : aujourd'hui la base refuse elle-même ce qu'un
compte n'a pas le droit de lire, et sans elles c'est à l'application de ne jamais se tromper.

L'ADR-0017 porte la décision et son coût. Ce document porte les commandes.

## 5. Ce qu'un lecteur perdrait aujourd'hui

Si le projet hébergé disparaissait maintenant, sans sauvegarde prise : **tout**, sauf le schéma,
que le dépôt reconstruit. Comptes, projets, tâches, notifications.

Avec une sauvegarde prise : rien de ce qu'elle contient, et donc tout ce qui a été écrit depuis.
C'est la seule vraie question de fréquence, et elle n'a pas de bonne réponse automatique sur
l'offre gratuite : la commande est manuelle, donc la perte possible est l'intervalle entre deux
exécutions.
