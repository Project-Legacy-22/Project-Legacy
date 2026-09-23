# Sprint 3 — Planning

- **Date** : jeudi 17 septembre 2026
- **Sprint** : 3, échéance le vendredi 25 septembre 2026
- **Présents** : Arthur Dos Santos, Arthur Gasmi, Arthur Guyetand, Aurélien Pochart, Seïf Soltane, Victor Briez
- **Scrum Master** : Arthur Guyetand

## Bilan du sprint précédent

Toutes les issues prévues pour le sprint précédent ont été terminées.

Des bugs ont cependant été découverts pendant l'intégration et les tests. Ils doivent être
qualifiés et priorisés avant d'être ajoutés au sprint 3, afin de ne pas remplacer silencieusement
les objectifs déjà engagés.

## Objectif

Finaliser les usages collaboratifs autour des projets et des tâches, améliorer l'utilisation de
l'application sur les différents écrans et préparer une démonstration fiable avec des données
reproductibles.

## Issues retenues

### Victor Briez — 15 points estimés

| Issue | Intitulé | Points | État au planning |
|---|---|---|---|
| #44 | EN-43 - Jeu de données de démonstration | 2 | Ready |
| #21 | US-20 - Écran d'accueil personnalisé | 5 | Ready |
| #33 | US-32 - Rechercher et filtrer mes tâches | 3 | Ready |
| #34 | US-33 - Partage d'un projet entre utilisateurs | 5 | Ready |

### Arthur Guyetand — 8 points estimés, deux sous-issues à estimer

| Issue | Intitulé | Points | État au planning |
|---|---|---|---|
| #348 | US-58 - Attribuer une tâche à un membre du projet | 5 | Ready |
| #351 | Écran des membres d'un projet, sous-issue de US-33 | à estimer | Ready |
| #354 | Retirer un membre d'un projet, sous-issue de US-33 | à estimer | Ready |
| #50 | US-49 - Réordonner une tâche à l'intérieur d'une colonne | 3 | Backlog |

### Arthur Gasmi — 3 points estimés, deux issues à estimer

| Issue | Intitulé | Points | État au planning |
|---|---|---|---|
| #246 | Parcours clavier sur les écrans livrés avant le Kanban | à estimer | Ready |
| #352 | Déclarer la divulgation des adresses entre membres, sous-issue de US-33 | à estimer | Ready |
| #42 | US-41 - Interface utilisable sur petit écran | 3 | Backlog |

## Charge du sprint

Total estimé au planning : 26 points, dont les 5 points de US-33.

Les sous-issues #351, #352 et #354 ne s'ajoutent pas une seconde fois si leurs estimations servent
uniquement à répartir les 5 points de US-33. L'issue #246 est indépendante : ses points s'ajoutent
au total après son estimation.

## Dépendances

- US-58 dépend de US-33 : l'attribution d'une tâche ne peut être finalisée que lorsque la gestion
  des membres du projet est disponible.
- #351, #352 et #354 sont des sous-issues de US-33, à coordonner avec l'implémentation portée par
  Victor Briez.
- US-49 dépend du Kanban existant.
- US-41 dépend du socle d'accessibilité.

## Risques identifiés

- La charge de trois membres de l'équipe n'est pas encore renseignée.
- #246, #351, #352 et #354 ne sont pas estimées, et les critères de complétion de #351, #352 et
  #354 restent à définir.
- US-41 et US-49 sont assignées mais encore au statut Backlog.
- Un retard sur le partage de projet bloquera l'attribution des tâches.
- US-32 et US-49 sont classées Could : premières candidates au retrait si la capacité réelle est
  insuffisante.
- Les bugs découverts pendant le sprint précédent peuvent réduire la capacité du sprint.

## Décisions

- L'objectif principal est la collaboration autour des projets et des tâches, et la préparation
  d'une démonstration stable.
- US-33 est découpée entre plusieurs membres ; Victor Briez conserve la coordination de la user
  story parente.
- US-58 ne démarre qu'une fois les éléments nécessaires de US-33 disponibles.
- Chaque membre ne garde qu'une seule issue en cours à la fois.
- Une issue ne démarre qu'après validation de ses critères d'acceptation, de son estimation et de
  ses dépendances.
- Les éléments Could sont les premiers candidats au retrait si le sprint est surchargé.
- Un bug découvert pendant le sprint est créé et classé séparément ; il ne remplace une issue
  engagée qu'après une décision explicite de l'équipe.

## Validation

Le planning reste provisoire tant que les trois affectations manquantes, les estimations et les
critères de complétion ne sont pas renseignés.
