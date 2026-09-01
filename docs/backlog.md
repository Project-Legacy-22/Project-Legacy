# Backlog produit

Projet « TodoList to Kanban Application Rework ».
Construit à partir des exigences du sujet et de l'audit du dépôt existant (`SP-00`).

Ce document est la référence du périmètre et de la priorisation. Il est tenu à jour à chaque
Sprint Planning et à chaque revue. Le suivi d'avancement au quotidien se fait sur le board :
<https://github.com/orgs/Project-Legacy-22/projects/1>.

Chaque item existe comme issue, rattachée en sub-issue à son epic. Les identifiants
distinguent la nature de l'item : `US-` pour une User Story, `EN-` pour un enabler,
`SP-` pour un spike. La numérotation est unique sur l'ensemble du backlog.

---

## 1. Cadre de travail

### Types d'items

| Type | Définition | Estimation |
|---|---|---|
| **US** | Rend un service observable par un utilisateur | Points de story |
| **Enabler** | Rend possible ou fiabilise la livraison ; aucun bénéfice utilisateur direct | Points de story, comptés à part |
| **Spike** | Recherche à résultat incertain : produit une décision, pas du code | Temps plafonné, jamais de points |

### Échelle

Fibonacci 1, 2, 3, 5, 8. **Un item estimé au-delà de 8 est découpé, sans exception** : au-delà,
l'estimation ne veut plus rien dire et l'item ne tient pas dans un sprint.

Repère de conversion, à recalibrer après le sprint 1 avec la vélocité réelle :
1 point vaut environ une demi-journée pour une personne, revue et tests compris.

### Capacité

Six personnes. La durée des sprints n'est pas encore fixée (décision D-02). Règle :
capacité = (jours ouvrés du sprint × 6) × 0,6, le facteur 0,6 couvrant les cérémonies, les
revues croisées et l'apprentissage de la stack. L'engagement se pose en Sprint Planning à
partir de cette capacité, jamais depuis ce document.

### MoSCoW

`Must` = le produit est incomplet sans lui, au sens du §6.1 du sujet.
`Should` = livré si le cœur est maîtrisé. `Could` = si le temps le permet.
`Would` = hors périmètre assumé, documenté, non développé.

La priorité MoSCoW **n'est pas** l'ordre de réalisation : un `Should` évalué à la revue
intermédiaire passe avant un `Must` de fin de parcours.

### Definition of Ready

Un item entre en sprint quand : le récit est clair, les critères d'acceptation sont testables,
l'estimation est posée par l'équipe, les dépendances sont **mergées sur `main`**, aucune
décision bloquante ne reste ouverte, et les impacts RGPD et accessibilité sont renseignés,
même pour dire qu'il n'y en a pas.

### Definition of Done

Les huit points du §7 du sujet : PR approuvée, tests de la logique métier, seuil de couverture,
quality gate, CI complète verte, artefacts produits, documentation à jour, démontrée en revue.

### Affinage progressif

Le sprint 1 est détaillé au niveau critère d'acceptation (§4). Les sprints 2 et 3 portent une
intention et un périmètre ; leurs critères sont écrits lors de leur Sprint Planning. Détailler
aujourd'hui le sprint 3 produirait des critères périmés avant d'être lus.

---

## 2. Décisions à trancher le premier jour

Huit décisions bloquent le sprint 1. Une session de deux heures, une recommandation par point
pour partir d'une proposition plutôt que d'une page blanche. Chaque décision retenue devient un
ADR (SP-01).

| ID | Décision | Recommandation | Bloque |
|---|---|---|---|
| D-20 | Mono-utilisateur ou projets partagés | **Mono-utilisateur.** Le partage est un `Would have` : il fait exploser le modèle de données, l'autorisation et les tests, pour un point non exigé par le sujet | EN-09, US-16, modèle entier |
| D-03 | Typage | **TypeScript strict.** Le sujet évalue explicitement « the current level of typing » comme dette à corriger | EN-04, EN-06 |
| D-04 | Découpage du backend | **Par domaine, en couches à l'intérieur de chaque domaine.** Un découpage purement horizontal reproduit le couplage actuel | EN-04 |
| D-05 | Chaîne front | **Vite, React conservé.** Conserver React limite la réécriture à l'outillage ; le sujet ne demande pas de changer de bibliothèque | EN-05 |
| D-06 | Accès aux données | **Query builder ou ORM léger + migrations versionnées, en fichiers.** Le point noté est le versionnement du schéma, pas l'outil | EN-09 |
| D-07 | SGBD | **PostgreSQL.** MySQL et SQLite sont déjà présents dans le legacy sans qu'aucun ne soit assumé ; PostgreSQL offre les types et les contraintes dont le modèle a besoin | EN-03, EN-09 |
| D-09 | Mécanisme d'événements | **Bus in-process derrière une interface, avec table outbox.** Un broker externe ajoute de l'exploitation sans rien apporter à la démonstration attendue ; l'interface permet d'en changer plus tard | US-10, US-18, EN-35 |
| D-19 | Stratégie de session | **Jeton d'accès court + jeton de rafraîchissement révocable, stocké en cookie httpOnly.** Un JWT seul ne se révoque pas, ce qui contredit US-27 et US-13 | US-11, US-27 |

Décisions non bloquantes, à trancher avant leur sprint :

| ID | Décision | Échéance |
|---|---|---|
| D-01 | Composition de l'équipe, PO, rotation des Scrum Masters | avant sprint 1 |
| D-02 | Dates des sprints et des deux revues | avant sprint 1 |
| D-08 | Framework de test et sort du dossier `spec/` existant | sprint 1 |
| D-10 | Outil de quality gate | sprint 1 |
| D-11 | Seuil de couverture définitif (proposition : 70 %) | sprint 1 |
| D-13 | Registre d'images (proposition : GHCR, déjà lié au dépôt) | sprint 1 |
| D-15 | Niveau d'accessibilité visé (proposition : WCAG 2.1 AA) | sprint 1 |
| D-18 | Direction graphique et bibliothèque de composants | sprint 1 |
| D-21 | Langue de l'interface | sprint 1 |
| D-14 | Canal de notification (proposition : in-app d'abord) | sprint 2 |
| D-16 | Responsable de traitement RGPD et contact | sprint 2 |
| D-17 | Durées de conservation des données | sprint 2 |
| D-12 | Cible de déploiement | sprint 2 |
| D-22 | Scénario et jeu de données de démonstration | sprint 3 |

---

## 3. Vue d'ensemble

### Sprint 1 — Fondations, architecture et première tranche verticale

Objectif : à la revue intermédiaire, démontrer les sept points évalués. Le périmètre du sprint
**est** la grille d'évaluation intermédiaire.

| ID | Type | Titre | MoSCoW | Pts | Dépend de |
|---|---|---|---|---|---|
| SP-00 | Spike | Audit du legacy et inventaire de la dette | Must | 1 j | — |
| SP-01 | Spike | ADR de la stack et de l'architecture cible | Must | continu | SP-00, §3 |
| EN-02 | Enabler | Conventions Git, protection de `main`, templates | Must | 1 | — |
| EN-24 | Enabler | Board, backlog et traces agiles tenus à jour | Must | 2 | EN-02 |
| EN-03 | Enabler | Environnement complet démarré en une commande | Must | 3 | SP-00 |
| EN-30 | Enabler | Configuration par variables d'environnement, zéro secret versionné | Must | 2 | EN-03 |
| EN-04 | Enabler | Backend restructuré en couches et typé, périmètre constant | Must | 8 | SP-01 |
| EN-05 | Enabler | Chaîne de build front et socle d'accessibilité | Must | 5 | SP-01 |
| EN-09 | Enabler | Modèle de données et migrations versionnées | Must | 5 | EN-04, D-20 |
| EN-06 | Enabler | Tests et lint exécutables en local | Must | 3 | EN-04 |
| EN-07 | Enabler | CI sur chaque PR : lint, types, tests, build, couverture | Must | 5 | EN-06 |
| EN-17 | Enabler | Quality gate bloquant sur le nouveau code | Should | 3 | EN-07 |
| EN-08 | Enabler | Image Docker publiée à chaque merge sur `main` | Must | 3 | EN-03, EN-07 |
| US-10 | US | Workflow événementiel démontrable de bout en bout | Must | 8 | EN-04, EN-09 |
| US-11 | US | Créer un compte et me connecter | Must | 8 | EN-09 |
| US-12 | US | Créer et consulter mes tâches | Must | 5 | US-11 |

**61 points, dont 40 d'enablers.** Ce déséquilibre est normal au sprint 1 et doit être dit en
revue : on reconstruit le socle d'une application existante.

Ordre de démarrage imposé par les dépendances :
`EN-02 + SP-00` → `SP-01 + EN-03` → `EN-04 + EN-05` → `EN-09 + EN-06` → `EN-07` → `EN-17 + EN-08` → `US-10` → `US-11` → `US-12`.
Les items d'une même étape se mènent en parallèle par des personnes différentes.

### Sprint 2 — Fonctionnalités cœur

| ID | Type | Titre | MoSCoW | Pts | Dépend de |
|---|---|---|---|---|---|
| US-31 | US | Modifier, terminer et supprimer une tâche | Must | 3 | US-12 |
| US-16 | US | Regrouper mes tâches par projet | Must | 5 | US-12 |
| US-15 | US | Déplacer une tâche entre les colonnes du Kanban | Must | 8 | US-12, US-16 |
| US-47 | US | Me déconnecter | Must | 2 | US-11 |
| US-36 | US | Modifier mon e-mail et mon mot de passe | Must | 3 | US-11 |
| US-37 | US | Politique de confidentialité et consentement | Must | 3 | US-11 |
| US-13 | US | Exporter et supprimer mes données personnelles | Must | 5 | US-11, US-12, US-16 |
| US-27 | US | Session persistante et expiration propre | Should | 3 | US-11 |
| US-19 | US | Priorité et échéance sur une tâche | Should | 3 | US-12 |
| US-18 | US | Être notifié des événements qui me concernent | Should | 5 | US-10, US-11 |
| US-28 | US | Réinitialiser mon mot de passe oublié | Should | 5 | US-11, US-18 |
| US-14 | US | Conformité d'accessibilité et remédiation | Should | 5 | EN-05, US-15 |
| EN-48 | Enabler | États de chargement, vide et erreur cohérents | Should | 3 | EN-05 |
| EN-29 | Enabler | Durcissement de la sécurité de l'API | Should | 3 | US-11 |
| EN-25 | Enabler | Tests d'intégration API, autorisation incluse | Should | 5 | EN-07, US-12 |
| EN-38 | Enabler | Registre des traitements et minimisation | Should | 2 | EN-09 |

**63 points.** Les `Must` en représentent 29 : c'est le plancher du sprint.

### Sprint 3 — Stabilisation, qualité et démonstration

| ID | Type | Titre | MoSCoW | Pts | Dépend de |
|---|---|---|---|---|---|
| EN-44 | Enabler | Documentation d'API publiée | Must | 3 | US-12 |
| EN-45 | Enabler | README et parcours d'onboarding complets | Must | 2 | EN-03 |
| EN-46 | Enabler | Préparation de la démonstration finale | Must | 3 | EN-43 |
| EN-42 | Enabler | Observabilité : healthcheck et logs structurés | Should | 3 | EN-04 |
| EN-40 | Enabler | Logs sans données personnelles superflues | Should | 2 | EN-42 |
| US-39 | US | Conservation limitée et purge automatique | Should | 3 | EN-38 |
| US-41 | US | Interface utilisable sur petit écran | Should | 3 | EN-05 |
| US-20 | US | Écran d'accueil personnalisé | Should | 5 | US-12, US-16, US-19 |
| EN-43 | Enabler | Jeu de données de démonstration | Should | 2 | US-15, US-16 |
| US-21 | US | Clôture automatique d'un projet terminé | Could | 3 | US-10, US-16 |
| US-32 | US | Rechercher et filtrer mes tâches | Could | 3 | US-16, US-19 |
| US-49 | US | Réordonner une tâche à l'intérieur d'une colonne | Could | 3 | US-15 |
| EN-35 | Enabler | Fiabilité des événements : rejeu et file de rebut | Could | 5 | US-10 |
| EN-26 | Enabler | Tests de bout en bout des parcours critiques | Could | 5 | US-15 |
| EN-23 | Enabler | Tests de contrat entre composants | Could | 8 | US-10 |
| EN-22 | Enabler | Déploiement continu complet | Could | 8 | EN-08, D-12 |

**Engagement : les `Must` et `Should`, soit 26 points.** Les 35 points de `Could` sont une
réserve, prise dans l'ordre du tableau. Un sprint de stabilisation qui s'engage sur 60 points
ne stabilise rien.

### Would have — hors périmètre, assumé et documenté

| ID | Sujet | Raison de l'exclusion |
|---|---|---|
| US-33 | Partage d'un projet entre utilisateurs | Découle de D-20 : impose un modèle de rôles et d'autorisation qui double le coût de chaque US |
| US-34 | Rôles et permissions avancés | Même raison ; non exigé par le sujet |
| US-50 | Collaboration en temps réel | Exige une infrastructure de diffusion sans rapport avec les points évalués |
| US-51 | Application mobile native | Hors périmètre technique du sujet |
| US-52 | Intégrations tierces | Aucune valeur pour l'évaluation |
| US-53 | Commentaires et pièces jointes | Ajoute stockage de fichiers et modération pour un gain marginal |
| US-54 | Colonnes de board personnalisables | Complexifie le modèle Kanban avant qu'il soit stable |
| US-55 | Internationalisation | Une seule langue suffit à la démonstration (D-21) |
| US-56 | Sous-tâches et diagramme de Gantt | Hors périmètre Kanban |
| US-57 | Analytics utilisateur | Contradictoire avec la minimisation RGPD affichée |

---

## 4. Détail des items du sprint 1

Seul le sprint 1 est détaillé : ses items doivent satisfaire la Definition of Ready dès
maintenant. Les sprints 2 et 3 sont affinés à leur planning.

### SP-00 — Audit du legacy et inventaire de la dette *(spike, 1 jour)*

Produire une liste datée et priorisée des limites du code existant, chacune reliée à l'item de
backlog qui la traite. L'audit sert d'argumentaire aux ADR et de point de départ à la revue.

Résultat attendu : un document versionné listant, pour chaque dette, le fichier concerné, la
conséquence concrète et l'item qui la corrige. Rejeté s'il se contente de généralités.

Constats déjà établis, à confirmer et compléter : absence de couche métier entre les routes HTTP
et la persistance ; sélection du pilote de base par effet de bord au chargement du module ;
schéma créé au démarrage sans aucune migration ni clé primaire ; absence totale de validation
des entrées et de gestion d'erreur ; front transpilé dans le navigateur avec des bibliothèques
figées et non versionnées ; suite de tests présente mais dont le lanceur n'est pas installé, donc
inexécutable ; aucun conteneur, aucune intégration continue ; absence de la notion
d'utilisateur dans le modèle, ce qui rend l'authentification et le RGPD impossibles sans refonte.

### SP-01 — ADR de la stack et de l'architecture cible *(spike, continu)*

Un ADR par décision structurante, au format retenu par l'équipe : contexte, options réellement
envisagées, décision, conséquences assumées, signal qui remettrait la décision en cause.

Périmètre minimal : les huit décisions bloquantes du §2. Chaque ADR est mergé avant que l'item
qu'il débloque ne démarre.

### EN-02 — Conventions Git, protection de `main`, templates *(enabler, 1)*

- Les conventions de branche, de commit et de PR sont écrites et accessibles à toute l'équipe.
- `main` refuse le push direct ; une PR et une approbation sont exigées avant merge.
- Les templates de PR et d'issue sont en place et utilisés par la première PR ouverte.
- Le mode de merge est unifié pour tout le dépôt.

### EN-24 — Board, backlog et traces agiles tenus à jour *(enabler, 2)*

- Chaque item du backlog existe comme issue, portant sa priorité, son estimation et son sprint.
- Le board reflète l'état réel à tout moment de la journée, pas la veille des revues.
- Les rôles et la rotation du Scrum Master sont écrits et à jour.
- Les comptes rendus de revue et de rétrospective sont versionnés à la fin de chaque sprint,
  avec des actions nominatives.

### EN-03 — Environnement complet démarré en une commande *(enabler, 3)*

- Une seule commande démarre l'API, le front et la base de données depuis un dépôt fraîchement
  cloné, sans étape manuelle.
- Aucun chemin absolu ni répertoire système n'est requis : le legacy écrit sa base dans un
  répertoire système, ce qui empêche tout démarrage local.
- Les données de développement survivent au redémarrage.
- Le README décrit les prérequis, la commande et les variables nécessaires ; il est vérifié par
  une personne qui n'a pas écrit l'item.

### EN-30 — Configuration par variables d'environnement, zéro secret versionné *(enabler, 2)*

- Aucun secret, identifiant ni chaîne de connexion n'est présent dans le dépôt ni dans son
  historique.
- Toutes les variables attendues sont documentées dans un fichier d'exemple versionné, sans
  valeur réelle.
- L'application refuse de démarrer si une variable requise manque, avec un message nommant la
  variable.
- Aucune lecture de l'environnement n'a lieu en dehors du module de configuration.
- Un contrôle automatique détecte l'ajout d'un secret et bloque avant publication.

### EN-04 — Backend restructuré en couches et typé, périmètre constant *(enabler, 8)*

- Le comportement fonctionnel observable est identique avant et après : mêmes routes, mêmes
  réponses pour les cas nominaux.
- Le code métier est isolé du transport HTTP et de la persistance ; il ne dépend d'aucun
  framework ni d'aucun pilote de base.
- Les dépendances entre couches sont vérifiées automatiquement, pas seulement en revue.
- Le pilote de persistance est fourni au démarrage de l'application, plus choisi au chargement
  d'un module.
- Toute entrée est validée à la frontière ; une entrée invalide produit une réponse d'erreur
  explicite et non une exception non gérée.
- Les erreurs métier sont typées et traduites en réponses HTTP par un point unique.
- La journalisation est structurée et ne contient aucune donnée personnelle.

### EN-05 — Chaîne de build front et socle d'accessibilité *(enabler, 5)*

- Le front est compilé par un outil de build : plus aucune transpilation dans le navigateur,
  plus aucune bibliothèque copiée dans le dépôt.
- Les dépendances front sont déclarées et verrouillées.
- Le développement offre le rechargement à chaud ; la production produit un bundle optimisé.
- Le socle d'accessibilité est en place : structure sémantique, focus visible, contrastes
  conformes au niveau retenu, respect de la préférence de réduction des animations.
- Un contrôle d'accessibilité automatique s'exécute avec les tests.
- Les défauts d'accessibilité hérités du legacy sont corrigés sur les écrans repris, notamment
  les champs sans étiquette et les références d'aide pointant vers des éléments inexistants.

### EN-09 — Modèle de données et migrations versionnées *(enabler, 5)*

- Le schéma n'est plus créé au démarrage : il résulte de migrations versionnées, appliquées et
  vérifiées en intégration continue.
- Chaque table possède une clé primaire, les contraintes d'intégrité et les index nécessaires ;
  la table héritée n'en avait aucun.
- Toute donnée appartenant à un utilisateur porte son propriétaire de façon obligatoire.
- Les dates sont stockées dans un type temporel, en temps universel.
- Une migration s'annule ou porte en en-tête la raison pour laquelle elle est irréversible.
- Deux migrations écrites en parallèle par deux personnes ne se contredisent pas.

### EN-06 — Tests et lint exécutables en local *(enabler, 3)*

- Une commande unique lance les tests, une autre l'analyse statique, une troisième la
  vérification des types ; toutes réussissent sur un dépôt fraîchement cloné.
- Le lanceur de tests est déclaré en dépendance : la suite héritée est présente mais
  inexécutable faute de lanceur installé.
- Le sort des tests hérités est tranché et documenté : repris, réécrits ou supprimés, avec la
  raison.
- Les tests reposent sur le comportement observable et non sur la séquence d'appels internes.
- La couverture est mesurée et publiée localement.

### EN-07 — CI sur chaque PR : lint, types, tests, build, couverture *(enabler, 5)*

- Chaque PR déclenche l'analyse statique, la vérification des types, les tests, la construction
  et le rapport de couverture.
- Un échec de n'importe quelle étape empêche le merge.
- Le résultat est lisible depuis la PR sans ouvrir les journaux.
- Les dépendances sont installées de façon reproductible et mises en cache.
- La chaîne complète s'exécute en moins de dix minutes.
- Aucun secret n'apparaît dans les journaux d'exécution.

### EN-17 — Quality gate bloquant sur le nouveau code *(enabler, 3)*

- Une analyse de qualité s'exécute sur chaque PR et publie son verdict dans la PR.
- Les seuils portent sur le code ajouté ou modifié, non sur l'ensemble du dépôt : sinon la dette
  héritée bloquerait toute contribution dès le premier jour.
- Le franchissement d'un seuil empêche le merge, il ne se contente pas d'avertir.
- Les seuils retenus sont écrits et justifiés.
- Une PR de démonstration prouve que le blocage fonctionne réellement.

### EN-08 — Image Docker publiée à chaque merge sur `main` *(enabler, 3)*

- Chaque merge sur `main` construit et publie une image.
- L'image porte un identifiant traçable jusqu'au commit qui l'a produite.
- Elle démarre sans configuration autre que ses variables d'environnement documentées.
- Elle ne contient ni secret, ni sources inutiles, ni dépendances de développement.
- La publication n'a lieu que si l'intégration continue est verte.
- La procédure pour récupérer et exécuter l'image est documentée.

### US-10 — Workflow événementiel démontrable de bout en bout *(US, 8)*

**En tant qu'** utilisateur, **je veux** que la création d'une tâche déclenche automatiquement
un effet visible ailleurs dans l'application, **afin de** ne pas avoir à réaliser cet effet
moi-même.

- La création d'une tâche publie un événement décrit dans un catalogue versionné.
- L'événement est enregistré dans la même transaction que la tâche : si l'enregistrement de la
  tâche échoue, aucun événement n'est publié, et inversement.
- Un composant distinct consomme l'événement et produit un effet observable par l'utilisateur,
  pas seulement une ligne de journal.
- Rejouer deux fois le même événement laisse le système dans le même état.
- Le payload ne transporte aucune donnée personnelle : seulement des identifiants et des données
  strictement nécessaires.
- Le nom de l'événement porte une version ; le catalogue documente producteur, consommateurs et
  effet attendu.
- Trois tests couvrent la publication transactionnelle, la consommation et l'idempotence.
- Le flux est démontrable en moins d'une minute devant un jury.

*Impact RGPD* : aucune donnée personnelle dans les événements, contrainte structurante pour
US-13 et EN-40.

### US-11 — Créer un compte et me connecter *(US, 8)*

**En tant que** visiteur, **je veux** créer un compte puis m'y connecter, **afin de** retrouver
mes tâches d'une session à l'autre.

- La création de compte demande une adresse e-mail et un mot de passe, et rien d'autre.
- Une adresse déjà utilisée ne permet pas de créer un second compte, sans révéler à un tiers
  qu'elle existe déjà.
- Le mot de passe est stocké sous forme d'empreinte calculée par un algorithme conçu pour cet
  usage ; il n'apparaît jamais en clair, ni en base, ni dans les journaux, ni dans une réponse.
- La politique de mot de passe est appliquée côté serveur et énoncée à l'utilisateur avant la
  saisie.
- Une tentative de connexion échouée ne dit pas laquelle des deux informations est erronée.
- Les tentatives de connexion et de création de compte sont limitées en fréquence.
- Après connexion, l'utilisateur atteint son espace ; sans session valide, il en est écarté.
- Les formulaires sont utilisables entièrement au clavier, chaque champ porte une étiquette, et
  les erreurs sont annoncées et rattachées au champ concerné.

*Impact RGPD* : première collecte de données personnelles ; alimente le registre des traitements
(EN-38) et conditionne US-13.

### US-12 — Créer et consulter mes tâches *(US, 5)*

**En tant qu'** utilisateur connecté, **je veux** créer une tâche et voir la liste des miennes,
**afin de** suivre ce que j'ai à faire.

- Une tâche se crée avec un intitulé ; l'intitulé vide ou uniquement composé d'espaces est refusé
  avec un message explicite.
- La longueur maximale de l'intitulé est appliquée côté serveur, pas seulement dans le champ.
- La liste affichée ne contient que les tâches de l'utilisateur connecté. **Une requête portant
  sur la tâche d'un autre utilisateur renvoie la même réponse que pour une tâche inexistante**,
  afin de ne pas divulguer son existence. Ce critère est bloquant.
- Une demande non authentifiée est rejetée.
- La liste gère explicitement l'absence de tâche, le chargement et l'échec de chargement : le
  code hérité affiche un texte brut pendant le chargement et ignore les erreurs réseau.
- La liste est paginée ou bornée : la version héritée renvoie l'intégralité de la table.
- La création est utilisable au clavier et le retour d'action est annoncé aux technologies
  d'assistance.

*Impact RGPD* : le contenu des tâches est une donnée utilisateur ; il n'apparaît ni dans les
journaux ni dans les événements.

---

## 5. Couverture des exigences du sujet

| Exigence du sujet | Items | Sprint |
|---|---|---|
| Authentification sécurisée | US-11, US-27, US-28, EN-29, US-47 | 1-2 |
| Gestion des utilisateurs conforme au RGPD | US-13, US-36, US-37, EN-38, US-39, EN-40 | 2-3 |
| CRUD projets et tâches | US-12, US-31, US-16 | 1-2 |
| Workflow Kanban | US-15, US-49 | 2-3 |
| Priorités et échéances | US-19 | 2 |
| Notifications | US-18 | 2 |
| Pipeline CI complète | EN-06, EN-07, EN-25 | 1-2 |
| Publication d'image Docker | EN-08 | 1 |
| Workflow événementiel démontrable | US-10, US-18, US-21, EN-23, EN-35 | 1-3 |
| Écran d'accueil personnalisé | US-20 | 3 |
| Gate qualité bloquant | EN-17 | 1 |
| Clôture automatique d'un projet | US-21 | 3 |
| Continuous Delivery | EN-22 | 3 |
| Tests de contrat | EN-23 | 3 |
| Séparation des responsabilités, API, testabilité | EN-04, EN-44 | 1-3 |
| Décisions d'architecture justifiées | SP-00, SP-01 | 1 |
| Traces agiles : board, backlog, historique Git | EN-02, EN-24, EN-46 | 1-3 |
| Accessibilité *(ajout de l'équipe)* | EN-05, US-14, US-41 + critères de chaque US front | 1-3 |

### Grille de la revue intermédiaire

| Point évalué | Couvert par | Preuve montrée |
|---|---|---|
| Architecture et fondations techniques | SP-01, EN-04, EN-05, EN-09 | ADR + parcours du code par couches |
| Pipeline CI | EN-07 | une PR ouverte en direct, checks visibles |
| Workflow événementiel | US-10 | création d'une tâche, effet visible immédiat |
| Qualité et priorisation du backlog | ce document, EN-24 | board et backlog en ligne |
| Conventions Git | EN-02 | historique et PR fermées |
| Gate qualité | EN-17 | une PR volontairement dégradée, bloquée |
| Démonstration du workflow d'une US | US-11 ou US-12 | issue, branche, PR, revue, CI, merge, board |
