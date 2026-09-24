# Catalogue des événements

Référence des événements publiés par l'application. Un événement qui n'est pas décrit ici
n'a pas le droit d'être publié : le catalogue est ce qui permet à un consommateur de savoir
ce qu'il reçoit sans lire le code du producteur.

Le contrat exécutable est `packages/contracts/src/events.ts`. Ce document explique les
règles et l'intention ; le schéma fait foi sur la forme.

## Règles

**Le nom porte la version.** Un événement s'appelle `<domaine>.<fait>.v<n>`, par exemple
`item.created.v1`. La version est dans le nom et non dans un champ séparé : un consommateur
s'abonne à une forme précise et continue de fonctionner le jour où `item.created.v2` est
publié à côté. Un champ numérique obligerait chaque consommateur à se brancher dessus avant
même de savoir s'il sait lire le payload.

**Un événement décrit un fait passé.** Il se nomme au participe passé et n'est jamais un
ordre. Un consommateur décide de ce qu'il en fait ; le producteur n'attend rien en retour.

**Aucune donnée personnelle ne circule.** Le payload ne transporte que des identifiants et
ce qui est strictement nécessaire. Le nom d'un item est du contenu saisi par l'utilisateur :
il reste en base, et un consommateur qui en a besoin le relit auprès du composant qui le
détient. Cette règle est ce qui permet à l'export et à l'effacement (`US-13`) de rester
maîtrisés, et elle évite qu'une donnée personnelle se retrouve dans un journal de
consommateur. Le schéma du payload est strict : ajouter un champ échoue à la validation au
lieu d'être silencieusement ignoré.

**Une livraison en double ne change rien.** Un consommateur peut recevoir deux fois le même
événement. L'identifiant d'enveloppe est stable d'une republication à l'autre : c'est la clé
qu'un consommateur enregistre pour reconnaître ce qu'il a déjà traité.

## Enveloppe

| Champ | Type | Rôle |
|---|---|---|
| `id` | uuid | Identité de l'événement, stable en cas de republication. Clé d'idempotence côté consommateur. |
| `name` | littéral | Nom versionné, par exemple `item.created.v1`. Discrimine le schéma du payload. |
| `occurredAt` | instant ISO 8601 | Date du fait, pas de la publication. |
| `payload` | objet strict | Propre à chaque événement, décrit ci-dessous. |

## Événements

### `item.created.v1`

Un item a été créé.

| | |
|---|---|
| **Producteur** | `apps/api`, cas d'usage `addItem` de `packages/core/items` |
| **Consommateurs** | `apps/worker` |
| **Effet attendu** | une notification non lue pour le propriétaire, visible dans le bandeau de session |
| **Statut** | en service |

Payload :

| Champ | Type | Pourquoi il est là |
|---|---|---|
| `itemId` | uuid | Désigne l'item concerné. Un consommateur qui a besoin de son contenu le relit. |
| `ownerId` | uuid | Désigne le destinataire de l'effet, sans transporter son identité réelle. |

Le nom de l'item est délibérément absent : c'est du contenu utilisateur.

### `membership.created.v1`

Une appartenance à un projet a été créée : quelqu'un a été ajouté à un projet.

| | |
|---|---|
| **Producteur** | `apps/api`, cas d'usage `addProjectMember` de `packages/core/projects` |
| **Consommateurs** | `apps/worker` |
| **Effet attendu** | une notification non lue pour la personne ajoutée, disant par qui |
| **Statut** | en préparation — la fonction `add_member_with_event` et le schéma du domaine existent ; le schéma de `packages/contracts` et la branche du consommateur arrivent avec #359 |

Payload :

| Champ | Type | Pourquoi il est là |
|---|---|---|
| `projectId` | uuid | Désigne le projet rejoint. Un consommateur qui a besoin de son nom le relit. |
| `memberId` | uuid | Désigne le destinataire de l'effet, sans transporter son identité réelle. |
| `addedBy` | uuid | Sans lui, la notification pourrait dire « ajouté » mais pas « par qui », et c'est la raison pour laquelle l'invitation passe par le flux. |

L'adresse est délibérément absente : c'est ce que la personne a tapé pour trouver le compte,
donc du contenu. Un consommateur qui a besoin de nommer quelqu'un relit l'adresse auprès du
composant qui la détient.

**Pourquoi le schéma de contrats n'est pas encore là.** Un événement que le consommateur refuse
est perdu : la passe de livraison le retire de la file sans le remettre, ce que l'ADR-0007
assume et qu'EN-35 fermera avec une file de rebut. Publier ce nom avant que le consommateur
sache l'écrire en notification perdrait donc les invitations émises entre les deux. Rien ne
l'émet pour l'instant.

### `invitation.created.v1`

Une personne a été invitée dans un projet et n'a pas encore répondu (#401).

| | |
|---|---|
| **Producteur** | `apps/api`, cas d'usage `inviteProjectMember` de `packages/core/projects`, par la fonction `invite_member_with_event` qui écrit l'invitation et l'événement dans la même transaction |
| **Consommateurs** | `apps/worker`, et la passe de livraison de l'API en déploiement sans serveur |
| **Effet attendu** | une notification non lue pour la personne invitée, qui porte l'invitation et depuis laquelle elle accepte ou refuse |
| **Statut** | en service |

Payload :

| Champ | Type | Pourquoi il est là |
|---|---|---|
| `invitationId` | uuid | Désigne l'invitation à laquelle la notification permet de répondre. Son état est relu, jamais transporté. |
| `projectId` | uuid | Désigne le projet proposé. Son nom est relu à l'affichage. |
| `inviteeId` | uuid | Désigne le destinataire de l'effet, sans transporter son identité réelle. |
| `invitedBy` | uuid | Permet de dire qui invite sans transporter son adresse. |

L'adresse saisie par la personne qui invite est absente pour la même raison que dans
`membership.created.v1`. Une invitation déjà présente, ou adressée à un membre, n'émet rien :
seule une invitation réellement créée produit l'événement.

## Ajouter un événement

1. Décrire le schéma dans `packages/contracts/src/events.ts` et l'ajouter à l'union
   `DomainEvent`.
2. Documenter ici le producteur, les consommateurs et l'effet attendu.
3. Couvrir par un test le fait que le payload ne transporte aucune donnée personnelle.

Changer la forme d'un événement déjà publié se fait en publiant une nouvelle version à côté
de l'ancienne, jamais en modifiant celle qui existe : un consommateur peut être en train de
la lire.

## Démontrer le flux

Le découplage se montre plutôt qu'il ne s'explique : c'est la raison pour laquelle
l'ADR-0007 a retenu un broker externe et un consommateur dans son propre processus.

`npm run up` démarre les quatre étages, worker compris. La séquence tient en une minute.

1. Se connecter, créer une tâche. Le compte de notifications du bandeau passe à 1 en une
   seconde ou deux : l'API n'a rien notifié elle-même, elle a seulement écrit l'événement
   dans la même transaction que la tâche.
2. Arrêter le worker seul, puis créer deux tâches. Le compte ne bouge plus. La file
   s'accumule, ce que l'on peut lire :

   ```bash
   docker compose exec redis redis-cli LLEN legacy22:events
   ```

3. Redémarrer le worker : `npm run dev:worker`. La file se vide, le compte rattrape son
   retard. Rien n'a été perdu pendant l'arrêt.

Ce que la démonstration établit : l'API ne dépend pas du consommateur pour répondre, une
panne du consommateur ne fait pas tomber l'API, et le travail en attente survit à son arrêt.

Pour montrer l'idempotence sans attendre une panne, republier un événement déjà traité :

```bash
docker compose exec redis redis-cli LPUSH legacy22:events "$(...)"
```

Le worker le consomme, journalise `event already handled, nothing to do`, et le compte de
notifications ne bouge pas : la clé primaire de `processed_events` a refusé la seconde
réservation.
