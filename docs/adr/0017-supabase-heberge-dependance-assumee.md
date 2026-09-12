# ADR-0017 — Supabase hébergé, dépendance assumée et réversible

- **Statut** : Accepté
- **Date** : 2026-09-12
- **Décideurs** : équipe, après la défense intermédiaire
- **Issue liée** : #273, prolonge l'ADR-0004

## Contexte

L'ADR-0004 a retenu Supabase comme SGBD pour ce que le CLI apporte en développement local. Il n'a
pas statué sur l'hébergement : ni la localisation des données, ni la dépendance à un fournisseur
non européen, ni ce qui se passe si le projet disparaît. La défense intermédiaire demande que ce
choix soit assumé et documenté.

Faits mesurés le 12 septembre 2026, par `supabase projects list` :

| | |
|---|---|
| Projet | `Legacy`, créé le 2 septembre 2026 |
| Région | `eu-west-1`, Irlande |
| Statut | `ACTIVE_HEALTHY` |
| PostgreSQL | 17.6 |
| Offre | gratuite |

Les données sont donc dans l'Union. Ce qui reste à assumer est ailleurs : Supabase Inc. est une
société américaine et l'infrastructure est AWS, donc le CLOUD Act s'applique au sous-traitant même
quand la région est européenne. Et l'offre gratuite n'offre aucun engagement de conservation : un
projet sans activité est suspendu, et la restauration dépend alors du fournisseur.

## Options considérées

### Option A — Supabase hébergé, offre gratuite
- Avantages : la base, l'authentification, les politiques de ligne et le stockage arrivent ensemble.
  Le CLI applique les mêmes migrations en local et sur la cible, donc le développement et la
  production ne divergent pas. Aucun coût.
- Inconvénients : un sous-traitant américain, aucune garantie de conservation, et une partie de ce
  qu'il fournit — GoTrue, les politiques de ligne — n'est pas du PostgreSQL standard.

### Option B — PostgreSQL géré par un hébergeur européen
- Avantages : sous-traitant et juridiction européens, engagement de conservation contractuel.
- Inconvénients : l'authentification, les politiques de ligne et le stockage sont à écrire ou à
  assembler. Payant. Pour une équipe de six sur trois sprints, c'est le temps qui manque, pas
  l'argent.

### Option C — PostgreSQL auto-hébergé
- Avantages : aucune dépendance, aucune juridiction étrangère.
- Inconvénients : sauvegardes, mises à jour, disponibilité et sécurité deviennent notre travail, et
  personne dans l'équipe ne s'en occuperait pendant que les fonctionnalités attendent.

## Décision

Nous retenons **l'option A**, et nous l'assumons à trois conditions qui font partie de la décision.

**La région reste européenne.** `eu-west-1` aujourd'hui ; un changement de région est un changement
de décision, pas un réglage.

**La dépendance est écrite, pas implicite.** Le registre des traitements nomme le sous-traitant, sa
région et sa société ; la politique de confidentialité dit au lecteur ce que chacun détient, où, et
qui y accède, y compris que la clé de service contourne les politiques de ligne et n'est utilisée
que par l'application.

**La sortie reste possible, et dans les deux sens.** Le schéma est décrit par des migrations
versionnées, donc un PostgreSQL quelconque le reconstruit. Ce qui n'est pas du SQL —
l'authentification et les politiques de ligne — est la part à réécrire, et elle est nommée plutôt
que découverte le jour où il faut partir.

Un schéma reconstructible ne suffit pourtant pas : il faut aussi que les données circulent. Deux
chemins sont donc exigés, et éprouvés avant d'en avoir besoin plutôt que sous la contrainte :
reprendre des données venues d'un MySQL ou d'un SQLite — les deux moteurs du projet
d'origine — vers notre PostgreSQL (#275), et ressortir les nôtres vers un PostgreSQL quelconque,
un MySQL ou un SQLite (#274).

Ces deux sorties ne se valent pas, et la différence doit être écrite plutôt que découverte. Vers un
PostgreSQL reconstruit par les migrations, l'export est fidèle : rien ne se perd. Vers un MySQL ou
un SQLite, il est fidèle **seulement si le schéma cible est traduit du nôtre** ; réécrire les
données dans la table `todo_items` de trois colonnes du projet d'origine perdrait le projet, le
propriétaire, la priorité, l'échéance et les notifications. Le chemin de sortie traduit donc le
schéma, il ne revient pas au legacy.

## Conséquences

**Positives**
- Les données restent dans l'Union, et cela se vérifie par une commande.
- Le développement local et la cible appliquent les mêmes migrations, donc une différence de
  comportement entre les deux est un défaut, pas une fatalité.

**Négatives / dette acceptée**
- Un sous-traitant soumis au CLOUD Act. Aujourd'hui le projet ne traite ni données de santé ni
  données sensibles au sens de l'article 9 : la contrainte ne se pose pas, et c'est ce qui rend
  l'option A acceptable. Elle se posera le jour où une donnée sensible entrera dans le périmètre.
  Ce jour-là, le passage à l'option B doit être **une migration, pas une réécriture** : un
  changement d'hébergeur et de juridiction, pas un changement d'application. C'est la raison
  d'être des deux chemins de données ci-dessus. Les construire maintenant, alors que rien ne
  l'impose, est le seul moment où on peut les éprouver sans urgence.
- Aucun engagement de conservation sur l'offre gratuite. C'est la raison pour laquelle une
  sauvegarde hors de Supabase est exigée et non recommandée.
- GoTrue et les politiques de ligne sont du coût de sortie, pas du code à nous.

**Ce que ça impose au reste du projet**
- Toute évolution du schéma passe par une migration versionnée. Une modification faite à la main
  dans le tableau de bord serait invisible pour une reconstruction, donc interdite.
- Aucune donnée personnelle ne va chez un sous-traitant qui n'est pas au registre.

## Comment on saura qu'on s'est trompé

Une suspension du projet dont on ne se relève pas avec la seule sauvegarde du dépôt. Ou une
fonctionnalité qui exige de sortir de Supabase et qu'on découvre non réversible parce qu'elle
reposait sur autre chose que du SQL. Ou une donnée sensible qui entre dans le périmètre alors que
le chemin de sortie n'a jamais été exécuté : la réversibilité serait alors une intention, pas une
propriété.

## Références

- Faits mesurés : `supabase projects list`, 12 septembre 2026
- ADR-0004 (Supabase comme SGBD), ADR-0005 (accès aux données et migrations)
- `docs/gdpr/registre.md`, section « Sous-traitants et localisation » ; #274 pour la sortie
