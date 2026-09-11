# ADR-0013 — L'outbox est la garantie, et la notification est l'effet démontrable

- **Statut** : Accepté
- **Date** : 2026-09-11
- **Décideurs** : équipe, à la revue du sprint 2
- **Issue liée** : #228, prolonge l'ADR-0007

## Contexte

L'ADR-0007 a retenu un courtier externe sans statuer sur ce qui garantit qu'un événement publié
corresponde à un fait réellement écrit. Sa ligne 69 laisse le choix ouvert : « soit conserver
l'outbox avec Redis comme transport, soit assumer explicitement qu'un événement peut être perdu ».

Le code a tranché de lui-même depuis. Au 11 septembre 2026 : la table `outbox` est écrite dans la
même transaction que la tâche (`create_item_with_event`), un relais la vide vers Redis,
`processed_events` absorbe un rejeu, et la purge est documentée au registre des traitements. La
question restait ouverte dans le dépôt alors qu'elle était fermée dans le schéma.

Le sujet demande par ailleurs « au moins un flux événementiel démontrable », sans dire lequel.

## Options considérées

### Option A — Conserver l'outbox, Redis comme transport
- Avantages : un événement publié correspond toujours à un fait écrit, puisque les deux écritures
  partagent une transaction. Un courtier indisponible retarde la livraison sans la perdre.
- Inconvénients : une table de plus, un relais à faire tourner, et une livraison au moins une fois
  qui oblige le consommateur à être idempotent.

### Option B — Publier directement, perte assumée
- Avantages : ni table ni relais.
- Inconvénients : une panne du courtier entre l'écriture et la publication perd l'événement
  définitivement, et rien ne permet de savoir lequel.

## Décision

Nous retenons **l'option A**, et nous nommons l'effet démontrable : **créer une tâche produit une
notification visible par son destinataire**.

Parce que la garantie est déjà construite et testée, et parce que l'alternative rend une perte
invisible : rien, dans l'option B, ne dit quel événement a disparu. L'effet retenu est celui qui
traverse toute la chaîne — écriture, outbox, courtier, consommateur, lecture — en un seul geste
observable.

## Conséquences

**Positives**
- Le consommateur est idempotent par construction, `processed_events` faisant foi.
- Le flux se démontre en une action : créer une tâche, ouvrir les notifications.

**Négatives / dette acceptée**
- Livraison au moins une fois, jamais exactement une fois.
- Un événement que le consommateur ne peut pas appliquer est perdu : il a déjà quitté la file. La
  file d'attente morte est l'objet de `EN-35`.

**Ce que ça impose au reste du projet**
- Tout producteur d'événement écrit dans l'outbox dans la transaction du fait, jamais après.
- Toute cible de déploiement doit faire tourner une passe de relais. Sur une cible sans processus
  long, elle est déclenchée par l'écriture et balayée par un appel planifié (#258).

## Comment on saura qu'on s'est trompé

Une ligne de l'outbox non publiée depuis plus longtemps que l'intervalle du balai, sans panne du
courtier pour l'expliquer.

## Références

- ADR-0007 (mécanisme d'événements), `docs/features/127-event-consumer-and-notifications.md`
- `docs/gdpr/registre.md`, traitement des événements
