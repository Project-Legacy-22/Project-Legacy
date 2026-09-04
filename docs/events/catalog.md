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
| **Consommateurs** | aucun à ce jour |
| **Effet attendu** | notifier le propriétaire que son item a été créé |
| **Statut** | contrat défini ; publication et consommation à venir dans `US-10` |

Payload :

| Champ | Type | Pourquoi il est là |
|---|---|---|
| `itemId` | uuid | Désigne l'item concerné. Un consommateur qui a besoin de son contenu le relit. |
| `ownerId` | uuid | Désigne le destinataire de l'effet, sans transporter son identité réelle. |

Le nom de l'item est délibérément absent : c'est du contenu utilisateur.

## Ajouter un événement

1. Décrire le schéma dans `packages/contracts/src/events.ts` et l'ajouter à l'union
   `DomainEvent`.
2. Documenter ici le producteur, les consommateurs et l'effet attendu.
3. Couvrir par un test le fait que le payload ne transporte aucune donnée personnelle.

Changer la forme d'un événement déjà publié se fait en publiant une nouvelle version à côté
de l'ancienne, jamais en modifiant celle qui existe : un consommateur peut être en train de
la lire.
