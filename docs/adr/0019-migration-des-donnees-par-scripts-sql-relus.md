# ADR-0019 — Migration des données dans les deux sens par scripts SQL générés et relus

- **Statut** : Accepté
- **Date** : 2026-09-24, enregistre une décision appliquée depuis le 12 septembre
- **Décideurs** : équipe, après la défense intermédiaire
- **Issue liée** : #413 ; décision livrée par #275 (reprise) et #282 (sortie), prolonge l'ADR-0017

## Contexte

La défense intermédiaire demande deux choses sur les données. D'abord une procédure claire,
reproductible et aussi transparente que possible pour reprendre les données du projet d'origine,
qui les stockait dans un MySQL ou un SQLite selon le déploiement, vers notre PostgreSQL. Ensuite de
pouvoir quitter Supabase sans abandonner les données des utilisateurs.

L'ADR-0017 a posé l'exigence : la dépendance à Supabase est assumée parce qu'elle est réversible,
et les deux chemins doivent être éprouvés avant d'en avoir besoin. Il ne dit pas comment. Ce
document enregistre ce choix, qui était jusqu'ici décrit seulement par la procédure
(`docs/data-migration.md`).

Les deux sens ne sont pas symétriques. Le legacy a une table de trois colonnes (`todo_items`) ;
notre schéma en a dix pour les tâches, plus les comptes, les projets, les appartenances et les
notifications. Reprendre, c'est enrichir en décidant de ce qui manque ; sortir, c'est traduire
sans perdre.

## Options considérées

### Option A — un outil de transfert connecté aux deux bases (pgloader ou équivalent)
- Avantages : outil établi, transfert direct de MySQL ou SQLite vers PostgreSQL.
- Inconvénients : une seule direction ; il écrit dans la base cible sans laisser de script à
  relire ; il faut des accès réseau et des identifiants vers les deux bases en même temps ; les
  règles de reprise (propriétaire, projet, statut) deviennent de la configuration propre à l'outil.

### Option B — les exports natifs des moteurs, et rien d'autre
- Avantages : aucun code à écrire (`mysqldump`, `sqlite3 .dump`, `supabase db dump`).
- Inconvénients : un export MySQL ne se charge pas dans notre schéma, et un export PostgreSQL ne
  se charge ni dans MySQL ni dans SQLite. La traduction reste à faire, à la main, le jour où on en
  a besoin.

### Option C — un paquet qui lit un export et écrit des scripts SQL, relus puis appliqués
- Avantages : les deux sens avec le même outil ; le script est un texte relu avant d'être
  appliqué, dans une transaction ; aucune connexion ouverte par l'outil ; rejouable et vérifiable
  en intégration continue.
- Inconvénients : du code à nous, à maintenir quand le schéma change ; lire correctement deux
  dialectes d'export.

## Décision

Nous retenons **l'option C** : `packages/data-migration`, qui lit un export texte et écrit des
scripts SQL.

Parce que :

- **Appliquer une migration de données est une décision humaine.** L'outil écrit ; une personne
  relit le script puis l'applique avec `psql --set ON_ERROR_STOP=1`. Le script est encadré par une
  transaction et refuse la reprise entière si le compte destinataire n'existe pas, plutôt que de
  créer un projet que personne ne possède.
- **Un outil de sortie ne dépend pas de ce qu'on quitte.** Le paquet ne déclare aucune dépendance
  et n'ouvre aucune connexion. Il fonctionne le jour où Supabase n'est plus joignable.
- **La preuve est rejouable.** `npm run test:migration` démarre PostgreSQL 17, MySQL 8.4 et
  SQLite, fait entrer un export `mysqldump` dans notre schéma, fait ressortir nos données vers les
  trois cibles et compare les valeurs de bout en bout. La chaîne d'intégration exécute la même
  commande.

Les règles de chaque sens font partie de la décision :

- **Reprise** : le moteur source est un paramètre et non une détection (`mysqldump` et `sqlite3`
  n'échappent pas l'apostrophe de la même façon). Rien n'est altéré pour faire entrer une ligne :
  une ligne invalide est refusée et nommée dans le rapport. L'identifiant de projet est fourni par
  la personne, ce qui rend la reprise rejouable sans créer de doublon.
- **Sortie** : le schéma est traduit du nôtre pour chaque cible, jamais ramené à la table du
  legacy, qui perdrait le projet, le propriétaire, la priorité, l'échéance et les notifications.
  Un horodatage hors UTC est refusé plutôt que décalé au jugé.
- **Modèle du schéma** : `packages/data-migration/src/schema.ts` décrit nos tables pour la
  traduction. Un test d'intégration (`schema-model.integration.test.ts`) échoue dès que ce modèle
  diverge de la base réelle : colonnes, ordre, valeurs par défaut et clés étrangères.

## Conséquences

**Positives**
- Les deux chemins existent, sont documentés et sont exécutés à chaque changement.
- Rien ne quitte ni n'entre dans une base sans qu'une personne ait lu ce qui va s'y écrire.
- Le script de reprise, qui contient l'adresse du destinataire, est écrit hors du dépôt
  (`data-out/`, ignoré par Git).

**Négatives / dette acceptée**
- Chaque migration de schéma doit mettre à jour le modèle ; le test d'intégration le rappelle.
  C'est arrivé pour les invitations (#401), où MySQL a imposé de retirer une valeur par défaut
  sur une colonne texte.
- Ne traversent pas : les comptes et les mots de passe (Supabase Auth), les politiques de sécurité
  au niveau ligne, les déclencheurs et les contrôles de valeur. Ils sont nommés dans
  `docs/data-migration.md` comme le coût réel d'un départ.
- La reprise n'a été exécutée que sur des exports de test, pas sur une base legacy de production.

**Ce que ça impose au reste du projet**
- Une migration qui ajoute une table ou une colonne met à jour `schema.ts` dans la même pull
  request.
- Un type de colonne nouveau doit avoir une traduction pour MySQL et SQLite, ou être refusé
  explicitement par l'outil.

## Comment on saura qu'on s'est trompé

Une reprise réelle échoue sur une forme d'export que `test:migration` ne couvre pas ; ou le
maintien de `schema.ts` coûte plus de temps que les migrations elles-mêmes ; ou une sortie vers
un autre fournisseur exige une connexion directe que le principe « aucune connexion » interdit.

## Références

- `docs/data-migration.md` : les commandes des deux sens et ce que chacun décide
- `docs/backup-and-exit.md` : sauvegarde, restauration, et coût d'un départ de Supabase
- ADR-0005 (schéma en migrations versionnées), ADR-0017 (hébergement et réversibilité)
