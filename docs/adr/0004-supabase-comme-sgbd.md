# ADR-0004 — Supabase comme SGBD, pile locale en développement et en CI

- **Statut** : Accepté
- **Date** : 2026-09-02, amendé le 2026-09-03
- **Décideurs** : équipe complète, réunion de lancement
- **Issue liée** : #2

## Contexte

Le code hérité embarque **deux** moteurs, MySQL et SQLite, sans qu'aucun ne soit assumé : le
choix se fait par effet de bord sur la présence d'une variable d'environnement (`DET-02`).
Le chemin par défaut de la base est `/etc/todos/todo.db`, un répertoire système, ce qui fait
échouer le démarrage local sans privilèges (`DET-21`).

L'ADR-0001 impose une appartenance à plusieurs comptes, donc une autorisation par ligne et
non par ressource. L'ADR-0008 impose une authentification. Le choix de moteur est le même
sujet que ces deux-là, pas un sujet séparé.

## Options considérées

### Option A — PostgreSQL nu, en conteneur
- Avantages : les types et contraintes dont le modèle a besoin, un seul moteur assumé, aucune
  dépendance à un fournisseur.
- Inconvénients : l'authentification et l'autorisation par ligne restent entièrement à
  écrire, alors que ce sont les points les plus faciles à rater et les plus notés.
- C'était la recommandation du backlog (`D-07`).

### Option B — Supabase
- Avantages : c'est PostgreSQL, plus l'authentification (ADR-0008) et les politiques RLS, qui
  répondent exactement au coût introduit par l'ADR-0001. La CLI fournit des migrations en
  fichiers versionnés.
- Inconvénients : dépendance à un fournisseur ; une pile locale plus lourde qu'un seul
  conteneur `postgres`.

### Option C — Rester sur SQLite
- Écarté : ni les types, ni les contraintes, ni l'autorisation par ligne. Reproduit `DET-27`.

## Décision

Nous retenons **l'option B — Supabase**.

**Amendement du 3 septembre** : la pile Supabase tourne **localement** (`supabase start`) en
développement et en intégration continue. Le projet hébergé ne sert que de cible de
déploiement.

Parce que :

1. On obtient PostgreSQL — le moteur que la recommandation visait — et par-dessus,
   l'authentification et l'autorisation par ligne, c'est-à-dire précisément le travail que
   l'ADR-0001 rend coûteux.
2. La CLI versionne le schéma en fichiers SQL (`supabase/migrations/<horodatage>_<nom>.sql`,
   créés par `supabase migration new`). Le point noté est le versionnement du schéma : il est
   satisfait par l'outil, sans convention à tenir.
3. L'amendement : six personnes et la CI écrivant dans une seule base hébergée rendraient les
   tests d'intégration non reproductibles — une suite verte le deviendrait par hasard. Une
   pile par poste et par exécution supprime la question.

## Conséquences

**Positives**
- Un seul moteur assumé, contre deux subis.
- `supabase db reset` rejoue toutes les migrations : l'état de la base est reproductible à
  partir du dépôt seul.
- `supabase db push` déploie le même SQL vers le projet hébergé : le développement et la
  cible partagent leurs migrations.

**Négatives / dette acceptée**
- Docker devient un prérequis de poste. Il l'était déjà pour Redis (ADR-0007) et pour
  l'image livrable (`EN-08`), donc ce n'est pas un prérequis nouveau — mais le temps de
  démarrage de la pile s'ajoute à celui des deux autres.
- Dépendance à un fournisseur. Atténuation : le cœur est un PostgreSQL standard et les
  migrations sont du SQL. Ce qui est réellement propriétaire est l'authentification, isolée
  derrière le port du domaine `auth` (ADR-0003, ADR-0008).
- Démarrer la pile en CI consomme des minutes d'Actions, contraintes par le quota gratuit.
  À n'activer qu'avec `EN-25`, quand des tests d'intégration existeront réellement.

**Ce que ça impose au reste du projet**
- `EN-03` orchestre la pile locale, Redis, l'API et le front en une commande.
- `EN-09` supprime les deux pilotes hérités et tout `CREATE TABLE` au démarrage.
- `EN-30` documente les variables de connexion dans `.env.example` ; `EN-08` les attend dans
  l'image.

## Comment on saura qu'on s'est trompé

Si `supabase start` coûte plus de temps qu'il n'en fait gagner sur les postes — démarrage
lent, mémoire insuffisante, allers-retours pour le remettre en marche — on remplace la pile
locale par un conteneur `postgres` nu et on garde le projet hébergé pour l'authentification.
Le SQL et les migrations restent valables sans modification.

## Références

- `docs/backlog.md`, décision `D-07`
- `docs/audit-legacy.md`, dettes `DET-02`, `DET-21`, `DET-26`, `DET-27` (`SP-00`, PR #107)
- https://supabase.com/docs/guides/local-development/overview
