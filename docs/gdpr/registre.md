# Registre des traitements

Ce que l'application collecte, pourquoi, pendant combien de temps et pour qui. Une ligne par
traitement, tenue à jour à chaque migration qui ajoute ou retire un champ.

Le registre est la source : la politique de confidentialité (`US-37`) le reformule pour un
lecteur non technique, et les durées écrites ici sont celles que la purge automatique
(`US-39`) implémentera. Une durée qui change se change d'abord ici.

## Responsable de traitement

| | |
|---|---|
| **Responsable** | Équipe Legacy 22 (`Project-Legacy-22`) |
| **Contact** | Seïf Soltane — seif.soltane@epitech.eu |

Le responsable est l'équipe, pas une personne : c'est elle qui décide des finalités et des
moyens, et le règlement désigne à ce titre l'entité, pas un de ses membres. Seïf Soltane est
le point de contact, comme la réunion de lancement l'a acté.

Ces deux valeurs sont reprises telles quelles par la politique de confidentialité (`US-37`).
Elles changent ici en premier.

## Sous-traitants et localisation

Les traitements ci-dessous nomment leurs destinataires. Cette section dit une fois pour toutes où
ils se trouvent, parce que la colonne « Localisation » de chaque traitement désigne la table, pas le
pays.

| Sous-traitant | Ce qu'il fait | Où | Société |
|---|---|---|---|
| Supabase | base de données et authentification | Irlande, région `eu-west-1` | Supabase Inc., États-Unis |
| Vercel | exécution de l'application et journaux | Paris, région `cdg1`, fixée par `vercel.json` | Vercel Inc., États-Unis |
| Grafana Cloud | supervision : métriques et tableaux de bord | Allemagne, région `prod-eu-west-2` | Grafana Labs, États-Unis |
| Have I Been Pwned | vérification d'un mot de passe compromis | réseau du fournisseur | opéré depuis l'Australie |

Tout est donc stocké et traité dans l'Union. Ce qui n'est pas neutre pour autant : Supabase et
Vercel sont des sociétés américaines, donc soumises au CLOUD Act, et une autorité américaine peut
les contraindre à communiquer des données qui n'ont jamais quitté l'Europe. C'est une dépendance
assumée, pas un oubli, et elle est écrite dans la politique de confidentialité plutôt que laissée
implicite.

Ce qui la rend réversible : le schéma est décrit par des migrations versionnées, donc un PostgreSQL
quelconque le reconstruit. Ce qu'il faudrait réécrire est ce que Supabase fournit en plus du SQL,
l'authentification et les politiques de sécurité au niveau ligne. Les conséquences complètes sont
suivies par #273 et #274.

Grafana Cloud ne reçoit aucune donnée personnelle, et c'est une contrainte de conception, pas une
observation : l'ADR-0016 interdit d'étiqueter une métrique par un identifiant de compte, une
adresse, un intitulé de tâche ou une adresse IP. Ce qui sort est un compteur ou une durée agrégée.

Have I Been Pwned ne reçoit aucune donnée personnelle : cinq caractères d'une empreinte, qui
n'identifient personne, et rien n'est conservé. Il est cité pour être exhaustif.

## Traitements

### T-01 — Compte et authentification

| | |
|---|---|
| **Finalité** | Permettre à une personne de créer un compte, de s'y connecter et de retrouver ses données d'une session à l'autre |
| **Base légale** | Exécution du contrat : sans compte, le service ne peut pas être rendu |
| **Personnes concernées** | Utilisateurs inscrits |
| **Catégories de données** | Adresse e-mail ; empreinte du mot de passe ; horodatages de création et de modification ; jetons de session ; version de la politique de confidentialité acceptée et date de cette acceptation |
| **Localisation** | `auth.users` (Supabase Auth), reflété dans `public.users` par un déclencheur |
| **Conservation** | Toute la vie du compte, puis effacement immédiat à sa suppression (`US-13`) |
| **Destinataires** | Vercel (sous-traitant, hébergement applicatif : l'API Express tourne en fonction Vercel, `vercel.json` y redirige `/auth` et `/items`, donc le corps des requêtes et des réponses y transite en clair) ; Supabase (sous-traitant, persistance et authentification) |
| **Mesures de sécurité** | Mot de passe haché par Supabase Auth, jamais stocké ni journalisé en clair ; session en cookie `httpOnly` et `SameSite=Lax` ; politiques RLS restreignant chaque ligne à son propriétaire ; limitation de fréquence sur l'inscription et la connexion |

La trace du consentement (`policy_version`, `policy_accepted_at`) est écrite par le
déclencheur de miroir, dans la transaction qui crée le compte. Elle est conservée aussi
longtemps que le compte : c'est elle qui permet de dire à quoi la personne a consenti le jour
où le texte change, et l'effacer reviendrait à perdre la preuve que l'on doit pouvoir produire.

`public.users` ne duplique qu'`id` et `email`. Le miroir existe parce qu'`items.user_id` doit
référencer une table du schéma `public` ; l'e-mail y est repris parce que l'export de données
personnelles le restitue.

### T-02 — Vérification des mots de passe compromis

| | |
|---|---|
| **Finalité** | Refuser un mot de passe figurant dans une fuite connue, lors d'une réinitialisation |
| **Base légale** | Intérêt légitime : protéger les comptes contre la réutilisation d'identifiants |
| **Personnes concernées** | Utilisateurs réinitialisant leur mot de passe |
| **Catégories de données** | Les cinq premiers caractères d'une empreinte SHA-1 du mot de passe candidat |
| **Localisation** | Aucune. Rien n'est stocké : l'empreinte est une clé de recherche, calculée puis jetée |
| **Conservation** | Sans objet |
| **Destinataires** | Have I Been Pwned (API Pwned Passwords), atteinte depuis le réseau sortant de Vercel (sous-traitant, hébergement applicatif) |
| **Mesures de sécurité** | k-anonymat : seul un préfixe de cinq caractères sort du processus, la comparaison se fait localement ; en-tête `Add-Padding` pour que la taille de la réponse ne révèle rien ; délai de deux secondes, un échec ne bloque pas la réinitialisation |

Le préfixe ne permet pas de retrouver le mot de passe, mais l'appel constitue une
communication à un tiers : il figure ici pour cette raison.

### T-03 — Tâches

| | |
|---|---|
| **Finalité** | Créer, consulter, modifier et supprimer ses propres tâches |
| **Base légale** | Exécution du contrat : c'est le service lui-même |
| **Personnes concernées** | Utilisateurs inscrits |
| **Catégories de données** | Intitulé saisi par l'utilisateur ; colonne de progression du Kanban ; priorité ; échéance facultative ; propriétaire et projet de rattachement ; horodatages de création et de modification |
| **Localisation** | `public.items` |
| **Conservation** | Aucune : une suppression demandée par l'utilisateur efface la ligne immédiatement. Effacement immédiat également à la suppression du compte, et à celle d'un projet dont il était le dernier membre |
| **Destinataires** | Vercel (sous-traitant, hébergement applicatif : l'API Express tourne en fonction Vercel, `vercel.json` y redirige `/auth` et `/items`, donc le corps des requêtes et des réponses y transite en clair) ; Supabase (sous-traitant, persistance) |
| **Mesures de sécurité** | Politiques RLS par propriétaire ; toute lecture nomme un propriétaire ; l'intitulé ne sort jamais dans un journal ni dans un événement |

L'intitulé est du contenu libre : il peut contenir n'importe quelle donnée personnelle, y
compris sensible, sans que l'application puisse l'anticiper. C'est ce qui rend l'effacement
immédiat préférable à un délai de grâce : une tâche supprimée ne survit nulle part, et il n'y
a pas de fenêtre pendant laquelle une donnée que l'utilisateur a voulu retirer reste lisible.

La suppression douce a existé jusqu'à la migration `20260909123004_remove_item_soft_deletion` :
la colonne `deleted_at` a disparu avec elle, et aucune ligne n'est plus marquée plutôt que
retirée.

### T-04 — Notifications

| | |
|---|---|
| **Finalité** | Signaler à une personne qu'une de ses tâches a été créée |
| **Base légale** | Exécution du contrat, comme le service qu'elles accompagnent |
| **Personnes concernées** | Utilisateurs inscrits |
| **Catégories de données** | Identifiants du destinataire, de la tâche et de l'événement d'origine ; date de lecture ; horodatages |
| **Localisation** | `public.notifications` |
| **Conservation** | Quatre-vingt-dix jours après création, puis effacement. Immédiat à la suppression du compte |
| **Destinataires** | Vercel (sous-traitant, hébergement applicatif : l'API Express tourne en fonction Vercel, `vercel.json` y redirige `/auth` et `/items`, donc le corps des requêtes et des réponses y transite en clair) ; Supabase (sous-traitant, persistance) |
| **Mesures de sécurité** | Aucun libellé stocké : le texte affiché est construit par l'interface, la table ne contient que des identifiants |

### T-05 — File d'événements

| | |
|---|---|
| **Finalité** | Garantir qu'un fait enregistré est annoncé une fois et une seule aux composants qui en dépendent |
| **Base légale** | Intérêt légitime : fiabilité technique du service |
| **Personnes concernées** | Utilisateurs inscrits, indirectement |
| **Catégories de données** | Identifiant d'événement, nom versionné, instant, et un payload restreint à des identifiants (`itemId`, `ownerId`) |
| **Localisation** | `public.outbox`, `public.processed_events`, et la file Redis pendant le transport |
| **Conservation** | `outbox` : sept jours après publication (`published_at`). Un événement jamais publié (`published_at is null`) n'est pas purgé : il représente un fait écrit dont personne n'a encore été prévenu, et le supprimer perdrait l'effet au lieu de le retarder. `processed_events` : quatre-vingt-dix jours à compter de sa création, c'est-à-dire de la consommation, ce qui rend un rejeu sans effet pendant cette durée. La file Redis ne conserve rien : un message en sort dès qu'il est lu, et le broker n'est pas persistant |
| **Destinataires** | Vercel (sous-traitant, hébergement applicatif : l'API Express tourne en fonction Vercel, `vercel.json` y redirige `/auth` et `/items`, donc le corps des requêtes et des réponses y transite en clair) ; Supabase (sous-traitant, persistance de l'outbox et des événements traités). Le broker Redis est exécuté par l'équipe et n'est pas un tiers distinct ; s'il était un jour hébergé, il rejoindrait cette ligne |
| **Mesures de sécurité** | Le contrat d'événement interdit toute donnée personnelle dans le payload, et un test échoue si l'intitulé d'une tâche s'y trouve ; schéma strict, un champ ajouté est rejeté |

Un événement ne transporte que des identifiants, et `ownerId` en est un : il désigne un compte,
donc il reste rattachable à une personne. C'est une **minimisation**, pas une anonymisation — la
CNIL distingue les deux, et un identifiant pseudonyme demeure une donnée personnelle.

**L'effacement les supprime donc, et le fait déjà.** `account_erasure.sql` retire les lignes de
`public.outbox` dont le `payload ->> 'ownerId'` désigne le compte, et les lignes de
`public.processed_events` correspondantes.

**Ce que ça impose à `US-39`**, qui implémentera la purge : elle retrouve aujourd'hui les
`processed_events` d'un compte **en passant par l'outbox**. Une purge à J+7 supprime ce chemin,
et une suppression de compte à J+8 laisserait alors les traces de traitement en place. La purge
doit donc préserver l'effacement par compte — en supprimant les deux tables ensemble, ou en
rattachant `processed_events` au compte directement. À trancher avant d'activer la purge, pas
après.

**La portabilité, elle, les exclut**, et pour une raison qui lui est propre : le droit porte sur
les données que la personne a fournies ou qui la concernent, pas sur les traces techniques que
leur traitement produit. Un identifiant d'événement et un instant de publication ne lui
apprennent rien sur elle ; l'objet auquel ils renvoient — la tâche — est restitué par `T-03`.
Cette exclusion ne dépend pas de l'argument de minimisation ci-dessus.

### T-06 — Journaux applicatifs

| | |
|---|---|
| **Finalité** | Diagnostiquer une panne et constater un abus |
| **Base légale** | Intérêt légitime : maintien en condition opérationnelle |
| **Personnes concernées** | Toute personne émettant une requête, inscrite ou non |
| **Catégories de données** | Méthode, chemin appelé, code de réponse, durée, identifiant de corrélation. Le chemin peut contenir l'identifiant d'une tâche |
| **Localisation** | Sortie standard des processus, collectée par l'hébergeur |
| **Conservation** | Trente jours |
| **Destinataires** | Vercel (sous-traitant, journaux d'exécution). Ses journaux de bord enregistrent l'adresse IP du client quoi que notre ligne de journal contienne, ce qui est une finalité et une durée distinctes de l'hébergement applicatif ci-dessus |
| **Mesures de sécurité** | Masquage du corps des requêtes, de l'en-tête d'autorisation, du cookie et de tout champ nommé `password` ; ni adresse e-mail ni intitulé de tâche n'est journalisé, ce qu'un test vérifie |

### T-07 — Projets et appartenance

| | |
|---|---|
| **Finalité** | Regrouper des tâches et les partager entre plusieurs comptes |
| **Base légale** | Exécution du contrat : le regroupement est la fonction demandée |
| **Personnes concernées** | Utilisateurs inscrits, membres d'au moins un projet |
| **Catégories de données** | Intitulé du projet, choisi par l'utilisateur et pouvant contenir ce qu'il veut ; identifiant du compte membre ; rôle (`owner` ou `member`) ; horodatages de création et de mise à jour |
| **Localisation** | `public.projects` et `public.project_memberships` |
| **Conservation** | Toute la vie du projet. À la suppression d'un compte, ses appartenances partent, et un projet dont il était le dernier membre est supprimé avec ses tâches ; un projet encore partagé subsiste |
| **Destinataires** | Vercel (sous-traitant, hébergement applicatif) ; Supabase (sous-traitant, persistance) |
| **Mesures de sécurité** | Politiques RLS restreignant chaque projet à ses membres ; l'appartenance est vérifiée avant toute lecture ou écriture d'une tâche ; un non-membre reçoit la même absence qu'un projet inexistant, ce qui ne révèle pas qu'un projet existe |

Un projet partagé a une conséquence qu'il faut écrire ici plutôt que de la découvrir : **un
membre qui efface son compte fait disparaître ses tâches des projets que les autres continuent
d'utiliser**. L'intitulé d'une tâche est sa donnée personnelle, donc l'effacement la retire — et
les autres membres perdent ce contenu sans avertissement. C'est assumé au titre du RGPD, mais
rien ne le dit encore à l'utilisateur : la politique de confidentialité (`US-37`) doit le
mentionner, et l'écran de suppression de compte devrait le rappeler.

### T-08 — Courriel de réinitialisation de mot de passe

| | |
|---|---|
| **Finalité** | Permettre à une personne qui ne peut plus se connecter de reprendre la main sur son compte |
| **Base légale** | Exécution du contrat : sans ce canal, un mot de passe oublié rend le compte inaccessible |
| **Personnes concernées** | Utilisateurs demandant une réinitialisation |
| **Catégories de données** | Adresse e-mail, et un jeton de récupération à usage unique envoyé dans le message |
| **Localisation** | Aucune de notre côté. Le jeton est émis et vérifié par Supabase Auth ; le message part vers la boîte du destinataire |
| **Conservation** | Le jeton expire côté fournisseur et est à usage unique. Le message vit dans la boîte du destinataire, hors de notre portée |
| **Destinataires** | Supabase (sous-traitant, émission du message) et le fournisseur SMTP configuré. En développement, le mail-catcher de la pile locale ; en production, aucun SMTP n'est encore provisionné (#164) |
| **Mesures de sécurité** | La réponse de l'API est identique que l'adresse ait un compte ou non, donc la demande ne révèle pas qui est inscrit ; l'échange du jeton se fait entièrement côté serveur ; le lien n'est jamais journalisé |

C'est le seul traitement où une donnée personnelle **sort vers un tiers qui n'est ni Vercel ni
Supabase**. L'ADR-0010 a tranché ce canal ; le choix du fournisseur de production reste ouvert et
devra revenir ici.

### T-09 — Limitation de fréquence

| | |
|---|---|
| **Finalité** | Refuser une attaque par force brute sur l'inscription, la connexion et la demande de réinitialisation |
| **Base légale** | Intérêt légitime : protéger les comptes contre l'essai systématique d'identifiants |
| **Personnes concernées** | Toute personne émettant une requête, inscrite ou non |
| **Catégories de données** | Adresse IP de l'appelant, seule clé du compteur |
| **Localisation** | Mémoire du processus, dans une table effacée au redémarrage |
| **Conservation** | La durée de la fenêtre, cinq minutes, puis la clé est retirée |
| **Destinataires** | Aucun. La valeur ne quitte pas le processus |
| **Mesures de sécurité** | Jamais journalisée — `request-log.ts` ne consigne aucune adresse, ce qu'un test vérifie — jamais persistée, jamais transmise. `TRUST_PROXY` détermine combien de sauts de proxy sont crus pour la dériver, et une valeur fausse ferait partager un même compteur à tous les visiteurs |

## Ce que le registre ne couvre pas encore

Rien. Les neuf traitements ci-dessus couvrent chaque table du schéma, chaque appel sortant et
chaque donnée tenue en mémoire par le processus.

## Champs sans finalité identifiée

Chaque colonne persistée a été rattachée à un traitement ci-dessus. Aucune n'est restée sans
finalité, donc aucune suppression de champ n'est requise par cette issue.

Le cas examiné de près est `public.users.email`, qui duplique `auth.users.email`. Il est
conservé : le miroir est ce qui permet à `items.user_id` de référencer un compte, et l'e-mail
y est nécessaire à l'export de données personnelles, qui doit restituer l'adresse sans
dépendre d'un appel à l'API d'authentification.

## Décisions à ratifier

Chaque durée ci-dessus a été confrontée au schéma en vigueur, pas à celui du sprint 1 : une
durée que le code ne pratique pas est pire qu'une durée absente, puisqu'elle affirme une
rétention qui n'existe pas. Celles qui restent à appliquer engagent `US-39`, qui les
implémentera au sprint 3, et lui imposent une contrainte écrite en `T-05` :
la purge de l'outbox ne doit pas casser l'effacement par compte, qui passe aujourd'hui par
elle. Trois points demandent une confirmation de l'équipe en relecture :

1. **La région d'hébergement Supabase.** Une instance hors Union européenne impose un
   encadrement des transferts qu'il faut alors décrire ici. C'est le seul point qui peut
   encore changer le contenu d'un traitement.
2. **Les durées elles-mêmes.** Le compte rendu de lancement proposait « indéfiniment sauf
   demande de l'utilisateur ». Ce n'est pas tenable : la limitation de la conservation est un
   principe du règlement, et une durée indéfinie ne s'écrit pas dans un registre. Les valeurs
   retenues ici sont celles qui paraissent proportionnées à chaque finalité ; l'équipe peut
   les allonger ou les raccourcir, pas les supprimer.
