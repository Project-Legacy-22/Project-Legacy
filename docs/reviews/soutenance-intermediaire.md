# Soutenance intermédiaire — retours de l'enseignant

Compte rendu de la première défense intermédiaire, tenue entre les sprints 2 et 3 (date non notée
dans le compte rendu).

## Organisation de l'équipe

Les rôles importants du projet doivent être clairement présentés :

- le Product Owner ;
- le Scrum Master de chaque sprint ;
- les responsabilités de l'équipe de développement.

La présentation doit aussi expliquer concrètement le fonctionnement de l'équipe et la répartition
des responsabilités.

## Méthode de travail

L'équipe utilise Scrum, avec des sprints itératifs. Le travail est organisé autour :

- d'un Sprint Planning ;
- de user stories regroupées dans un backlog ;
- de réunions quotidiennes pour suivre l'avancement et identifier les blocages ;
- de branches de travail associées aux issues ;
- de pull requests relues par un autre membre avant leur intégration.

## GitHub Actions

La prochaine présentation doit montrer les GitHub Actions du projet et expliquer :

- les vérifications lancées automatiquement ;
- les tests exécutés ;
- les contrôles de qualité ;
- le processus de déploiement ;
- les conditions nécessaires avant l'intégration d'une pull request.

## Décisions d'architecture

Les ADR doivent être présentés pour justifier les choix techniques : les principales alternatives
étudiées, la décision retenue, ses avantages et ses limites.

## Points de vigilance concernant Supabase

### Hébergement et souveraineté des données

L'hébergement proposé par Supabase peut placer les données sur des serveurs situés à l'étranger.
Cela soulève des questions sur la localisation réelle des données, les autorisations d'accès, la
conformité avec les exigences de protection des données, et la dépendance envers un fournisseur
non souverain. Ce choix doit être assumé et clairement documenté.

### Pérennité des données

Une offre gratuite présente un risque pour la conservation des données sur plusieurs années.
L'équipe doit vérifier et documenter :

- la durée de conservation garantie ;
- les conséquences d'une suspension ou d'une suppression du projet Supabase ;
- la procédure de sauvegarde ;
- la procédure de récupération des données ;
- la méthode permettant de changer de fournisseur sans perdre les données des utilisateurs.

Abandonner les données des utilisateurs en cas de problème avec Supabase n'est pas acceptable.

### Migration des données

Le projet étant une reprise d'une application legacy, l'objectif principal reste de faire évoluer
le système sans casser ce qui fonctionne déjà. Une procédure claire doit expliquer comment migrer
les données depuis MySQL ou SQLite vers PostgreSQL et Supabase ; la migration doit être
reproductible et aussi transparente que possible pour les utilisateurs.

Pour limiter la dépendance envers Supabase, les évolutions de la base doivent être décrites par des
migrations versionnées. Une solution de remplacement doit pouvoir reconstruire le schéma et
récupérer les données.

## Priorisation

L'équipe doit vérifier qu'un critère secondaire lié au déploiement ne passe pas avant un besoin
classé Must. Si un compromis est nécessaire, la décision doit être assumée, expliquée et
documentée.

## Monitoring

Une plateforme de monitoring doit être choisie avant la fin du projet, et faire l'objet d'un ADR
présentant les besoins de surveillance, les solutions comparées, la solution retenue, les données
collectées, les coûts et les limites, et les impacts sur la sécurité et les données personnelles.

## Actions pour la suite

1. Clarifier les rôles dans la présentation et dans la documentation.
2. Présenter le fonctionnement des GitHub Actions.
3. Montrer les ADR les plus importants.
4. Documenter les limites de Supabase et le risque d'hébergement non souverain.
5. Définir une procédure de sauvegarde, de restauration et de migration des données.
6. Préparer une stratégie permettant de changer de base ou de fournisseur.
7. Choisir une plateforme de monitoring et rédiger l'ADR correspondant.
8. Vérifier que les fonctionnalités Must restent prioritaires.
