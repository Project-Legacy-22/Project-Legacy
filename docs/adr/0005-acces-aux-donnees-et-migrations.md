# ADR-0005 — Accès aux données par le client Supabase, schéma versionné en migrations

- **Statut** : Accepté
- **Date** : 2026-09-02
- **Décideurs** : équipe complète, réunion de lancement
- **Issue liée** : #2

## Contexte

Le schéma hérité est créé au démarrage par un `CREATE TABLE IF NOT EXISTS` en ligne, exécuté
par chaque pilote, sans versionnement (`DET-26`). Il n'a ni clé primaire, ni index, ni
contrainte : deux lignes peuvent partager le même identifiant (`DET-27`).

Le point évalué par le sujet est le **versionnement du schéma**, pas l'outil retenu pour
écrire les requêtes.

## Options considérées

### Option A — SQL manuel
- Avantages : contrôle total, aucune couche à expliquer.
- Inconvénients : beaucoup de code répétitif, et un risque d'injection dès qu'on relâche la
  discipline sur la construction des requêtes.

### Option B — Query builder du client Supabase
- Avantages : requêtes lisibles, paramétrées, aucun comportement implicite. Le client est
  déjà présent pour l'authentification et RLS (ADR-0004, ADR-0008).
- Inconvénients : ne couvre pas les requêtes complexes ; l'API est propre à Supabase.

### Option C — ORM complet (Prisma, TypeORM)
- Avantages : rapide au démarrage, migrations intégrées.
- Inconvénients : comportements implicites — chargement différé, cascades, requêtes générées
  — difficiles à expliquer en soutenance, et qui masquent ce que le sujet demande de
  démontrer.

## Décision

Nous retenons **l'option B — le query builder du client Supabase**, avec le schéma versionné
en fichiers de migration SQL.

Parce que :

1. Le point noté est le versionnement, et il est satisfait par la CLI :
   `supabase migration new` crée un fichier horodaté dans `supabase/migrations/`,
   `supabase db reset` les rejoue toutes, `supabase db push` les applique à la cible.
2. Le client Supabase est déjà présent pour l'authentification et pour RLS. En ajouter un
   second uniquement pour les requêtes ferait cohabiter deux vérités sur la connexion et sur
   l'identité de l'appelant — donc deux endroits où l'autorisation peut diverger.
3. Un ORM complet demanderait de défendre en soutenance des requêtes que nous n'aurions pas
   écrites.

## Conséquences

**Positives**
- Plus aucun `CREATE TABLE` au démarrage : la fonction d'initialisation du legacy disparaît
  avec `EN-09`.
- Toute évolution du schéma est un fichier relu en pull request, réversible et daté.
- Le client applique les politiques RLS avec l'identité de l'appelant : l'autorisation de
  l'ADR-0001 s'exerce au niveau de la base, pas seulement dans les routes.

**Négatives / dette acceptée**
- Le query builder ne couvre pas tout. Une requête complexe passe par une fonction SQL
  versionnée dans une migration, **pas** par une chaîne construite à la main.
- L'API du client est propre à Supabase. Atténuation : les requêtes restent derrière le port
  du domaine (ADR-0003), donc le remplacement se limite à un adaptateur.

**Ce que ça impose au reste du projet**
- `EN-09` livre les migrations initiales avec clés primaires, index et contraintes — les
  trois absences de `DET-27`.
- Aucune modification de schéma appliquée à la main sur un projet hébergé : elle serait
  invisible du dépôt et impossible à rejouer.

## Comment on saura qu'on s'est trompé

Si plus d'un quart des accès doivent contourner le query builder par du SQL brut, le besoin
est celui d'un outil SQL généraliste : on remplace l'adaptateur par un query builder complet.
Les migrations, elles, restent valables — c'est ce qui rend ce changement peu coûteux.

## Références

- `docs/backlog.md`, décision `D-06`
- `docs/audit-legacy.md`, dettes `DET-26`, `DET-27` (`SP-00`, PR #107)
- https://supabase.com/docs/guides/local-development/overview
