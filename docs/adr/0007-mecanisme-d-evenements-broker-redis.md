# ADR-0007 — Redis comme broker d'événements

- **Statut** : Accepté
- **Date** : 2026-09-02
- **Décideurs** : équipe complète, réunion de lancement
- **Issue liée** : #2

## Contexte

Le sujet exige **au moins un workflow événementiel complet et démontrable**, opérationnel
tôt. C'est un des points examinés en revue intermédiaire, et il n'existe rien dans le code
hérité sur lequel s'appuyer.

L'ADR-0001 donne aux événements un destinataire réel : sans projets partagés, notifier
reviendrait à se notifier soi-même.

## Options considérées

### Option A — Bus in-process derrière une interface, avec table outbox
- Avantages : rien à exploiter en plus ; la fiabilité est assurée par la base, dans la même
  transaction que l'écriture métier ; remplaçable plus tard sans toucher au domaine.
- Inconvénients : le découplage n'est pas observable de l'extérieur du processus — difficile
  à démontrer autrement qu'en montrant du code.
- C'était la recommandation du backlog (`D-09`).

### Option B — Broker externe, Redis
- Avantages : le découplage devient observable — on arrête le consommateur, la file
  s'accumule, on le redémarre, elle se vide. C'est une démonstration, pas une explication.
- Inconvénients : un service de plus à faire tourner en local, en CI et à l'exécution ; la
  publication sort de la transaction de base.

### Option C — RabbitMQ
- Écarté : les garanties supplémentaires ne servent à rien ici, pour une exploitation
  nettement plus lourde.

## Décision

Nous retenons **l'option B — un broker externe, Redis**, contre la recommandation du backlog.

Parce que :

1. L'architecture événementielle est notée et démontrée en revue. Un bus in-process se
   raconte ; un consommateur qu'on arrête et qu'on redémarre devant le jury se montre.
2. Redis est le broker le moins coûteux à exploiter, et Docker était déjà requis par
   l'ADR-0004 et par l'image livrable : il n'introduit pas de prérequis nouveau sur les
   postes.
3. Un `worker` séparé, consommateur des événements, rend le découplage visible dans
   l'arborescence du dépôt autant qu'à l'exécution.

## Conséquences

**Positives**
- Le flux événementiel est démontrable sans lire de code.
- Le consommateur est un processus distinct : une panne du worker ne fait pas tomber l'API,
  ce qui est exactement la propriété qu'on cherche à montrer.

**Négatives / dette acceptée**
- Un service de plus dans la composition locale (`EN-03`), dans l'image (`EN-08`) et,
  le jour venu, en CI.
- **La fiabilité n'est pas fournie par le broker.** Publier dans Redis depuis le code qui
  vient d'écrire en base réintroduit précisément le problème que la table outbox résolvait :
  si la transaction échoue après la publication, l'événement existe sans le fait qu'il
  annonce. Le broker est un transport, pas une garantie d'atomicité.

**Ce que ça impose au reste du projet**
- Les domaines publient sur une **interface**, jamais sur le client Redis : c'est ce qui
  rend cette décision réversible (ADR-0003).
- `EN-35` doit trancher un point que la réunion n'a pas tranché : soit conserver la table
  outbox avec Redis comme transport, soit assumer explicitement qu'un événement peut être
  perdu. **À décider au planning du sprint 2**, avant d'écrire le premier producteur.
- L'effet visible qui sert de démonstration n'a pas non plus été acté. La proposition du
  backlog — « créer une tâche produit une notification visible » — reste à confirmer. Sans
  effet observable, la démonstration ne prouve rien.

## Comment on saura qu'on s'est trompé

Si à la revue intermédiaire le broker n'apporte rien de plus qu'un bus in-process — pas de
worker réellement séparé, pas de reprise observable — alors qu'il coûte un service en local,
en CI et dans l'image, on repasse à l'implémentation in-process. Les domaines ne changent
pas : seul l'adaptateur derrière l'interface est remplacé.

## Références

- `docs/backlog.md`, décision `D-09`
- `US-10`, `US-18`, `EN-35`
- Standards d'équipe, `standards/01-architecture.md`, section 3
