# Priorisation : où en sont les « Must »

Le compte rendu de la défense intermédiaire demande de vérifier que les fonctionnalités classées
« Must » restent prioritaires, et en particulier « qu'un critère secondaire lié au déploiement ne
passe pas avant un besoin classé Must ».

Ce document croise le classement du backlog avec l'état réel des issues. Mesure du 15 septembre
2026, reproductible : le classement vient de `backlog-v2.md`, l'état de `gh issue list`.

## Le classement, en chiffres

48 éléments classés : **25 Must**, 16 Should, 7 Could.

## Les 25 « Must »

Vingt-et-un sont livrés et leur issue est fermée :

| Code | Élément | Issue |
|---|---|---|
| SP-00 | Audit du legacy et inventaire de la dette | #1 |
| SP-01 | ADR de la stack et de l'architecture cible | #2 |
| EN-02 | Conventions Git, protection de `main`, templates | #3 |
| EN-24 | Board, backlog et traces agiles tenus à jour | #25 |
| EN-03 | Environnement complet démarré en une commande | #4 |
| EN-30 | Configuration par variables d'environnement | #31 |
| EN-04 | Backend restructuré en couches et typé | #5 |
| EN-05 | Chaîne de build front et socle d'accessibilité | #6 |
| EN-09 | Modèle de données et migrations versionnées | #10 |
| EN-06 | Tests et lint exécutables en local | #7 |
| EN-07 | Intégration continue sur chaque pull request | #8 |
| EN-08 | Image Docker publiée à chaque merge sur `main` | #9 |
| US-10 | Workflow événementiel démontrable de bout en bout | #11 |
| US-11 | Créer un compte et me connecter | #12 |
| US-12 | Créer et consulter mes tâches | #13 |
| US-31 | Modifier, terminer et supprimer une tâche | #32 |
| US-16 | Regrouper mes tâches par projet | #17 |
| US-15 | Déplacer une tâche entre les colonnes du Kanban | #16 |
| US-47 | Me déconnecter | #48 |
| US-36 | Modifier mon e-mail et mon mot de passe | #37 |
| US-37 | Politique de confidentialité et consentement | #38 |
| US-13 | Exporter et supprimer mes données personnelles | #14 |

Aucune User Story classée « Must » n'est ouverte. **Les trois qui restent sont des Enablers de
fin de projet**, et leur objet est précisément de venir en dernier :

| Code | Élément | Issue | Pourquoi ouvert |
|---|---|---|---|
| EN-44 | Documentation d'API publiée | #45 | décrit une API qui a bougé jusqu'au sprint 3 |
| EN-45 | README et parcours d'onboarding complets | #46 | décrit un dépôt qui a bougé jusqu'au sprint 3 |
| EN-46 | Préparation de la démonstration finale | #47 | la démonstration finale n'a pas eu lieu |

Un quatrième point mérite d'être nommé pour ne pas être compté deux fois : **#269** est ouverte et
porte le code `US-36`, mais la story elle-même (#37) est livrée. #269 est une dette de cohérence —
intégrer US-36 aux motifs d'interface arrivés depuis — et non le besoin.

## La question du déploiement, chiffrée

C'est la crainte explicite du professeur. Le classement y répond :

| Code | Élément | MoSCoW | État |
|---|---|---|---|
| EN-08 | Image Docker publiée à chaque merge sur `main` | **Must** | fermé, mais voir ci-dessous |
| EN-42 | Observabilité : healthcheck et logs structurés | Should | ouvert (#43) |
| EN-22 | **Déploiement continu complet** | **Could** | ouvert (#23), non commencé |

Le seul travail de déploiement livré est **EN-08, lui-même classé Must**. Le « déploiement continu
complet » est classé **Could**, vaut 8 points, et n'a pas été commencé : il n'est donc pas passé
devant quoi que ce soit.

Aucun élément Should ou Could n'a été livré au détriment d'un Must, et c'est vérifiable autrement
que par une affirmation : tous les Must sauf les trois Enablers terminaux sont fermés.

### Une exception à assumer, et elle ne va pas dans le sens redouté

La supervision — Prometheus comme format, Grafana Cloud comme plateforme, ADR-0016 — **n'est pas
un élément du backlog**. Elle a été faite parce que la défense intermédiaire l'a demandée
explicitement (action 7 : « Choisir une plateforme de monitoring et rédiger l'ADR correspondant »).
Elle se lit donc comme une réponse à la revue, pas comme une priorité que l'équipe se serait
donnée à la place d'un besoin.

Il faut l'assumer comme telle : du temps a été dépensé hors backlog, sur demande du client.

## Le vrai défaut trouvé par cette vérification

Il n'est pas celui qu'on cherchait, et il est plus gênant.

**EN-08 est un Must fermé dont l'effet a disparu.** L'image Docker et la release datent du
3 septembre. Le workflow `image` a échoué sur le push du 11 septembre, à l'étape SonarCloud, et
l'étape de publication a été sautée. Personne ne l'a vu, parce que l'issue était fermée et le
board vert.

La cause, le détail et ce qui débloque sont dans **#315**. Le point à retenir ici est de méthode :
**un board vert ne prouve pas qu'un artefact existe.** Une issue fermée dit qu'un travail a été
fait une fois, pas qu'il produit encore son effet.

C'est la seule inversion de priorité réelle de ce projet, et elle est dans l'autre sens que celui
que la revue redoutait : ce n'est pas un critère secondaire qui a pris la place d'un Must, c'est un
Must qui a cessé de fonctionner sans bruit.

## Comment refaire cette mesure

```bash
# le classement, dans le backlog de l'equipe
grep -E "\| (Must|Should|Could)" backlog-v2.md

# l'etat
gh issue list --state all --limit 400 --json number,title,state
```

Croiser sur le code (`US-11`, `EN-08`) présent dans les titres d'issues. Le tableau ci-dessus est
le résultat de ce croisement, pas une lecture à l'œil.
