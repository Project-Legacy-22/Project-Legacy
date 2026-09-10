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

## Traitements

### T-01 — Compte et authentification

| | |
|---|---|
| **Finalité** | Permettre à une personne de créer un compte, de s'y connecter et de retrouver ses données d'une session à l'autre |
| **Base légale** | Exécution du contrat : sans compte, le service ne peut pas être rendu |
| **Personnes concernées** | Utilisateurs inscrits |
| **Catégories de données** | Adresse e-mail ; empreinte du mot de passe ; horodatages de création et de connexion ; jetons de session |
| **Localisation** | `auth.users` (Supabase Auth), reflété dans `public.users` par un déclencheur |
| **Conservation** | Toute la vie du compte, puis effacement immédiat à sa suppression (`US-13`) |
| **Destinataires** | Supabase (sous-traitant, hébergement et authentification) |
| **Mesures de sécurité** | Mot de passe haché par Supabase Auth, jamais stocké ni journalisé en clair ; session en cookie `httpOnly` et `SameSite=Lax` ; politiques RLS restreignant chaque ligne à son propriétaire ; limitation de fréquence sur l'inscription et la connexion |

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
| **Destinataires** | Have I Been Pwned (API Pwned Passwords) |
| **Mesures de sécurité** | k-anonymat : seul un préfixe de cinq caractères sort du processus, la comparaison se fait localement ; en-tête `Add-Padding` pour que la taille de la réponse ne révèle rien ; délai de deux secondes, un échec ne bloque pas la réinitialisation |

Le préfixe ne permet pas de retrouver le mot de passe, mais l'appel constitue une
communication à un tiers : il figure ici pour cette raison.

### T-03 — Tâches

| | |
|---|---|
| **Finalité** | Créer, consulter, modifier et supprimer ses propres tâches |
| **Base légale** | Exécution du contrat : c'est le service lui-même |
| **Personnes concernées** | Utilisateurs inscrits |
| **Catégories de données** | Intitulé saisi par l'utilisateur ; état d'avancement ; propriétaire ; horodatages de création, de modification et de suppression |
| **Localisation** | `public.items` |
| **Conservation** | Trente jours après suppression par l'utilisateur (`deleted_at`), puis effacement définitif. Immédiat à la suppression du compte |
| **Destinataires** | Supabase (sous-traitant) |
| **Mesures de sécurité** | Politiques RLS par propriétaire ; toute lecture nomme un propriétaire ; l'intitulé ne sort jamais dans un journal ni dans un événement |

L'intitulé est du contenu libre : il peut contenir n'importe quelle donnée personnelle, y
compris sensible, sans que l'application puisse l'anticiper. C'est ce qui justifie que
`deleted_at` ne soit pas une conservation indéfinie.

### T-04 — Notifications

| | |
|---|---|
| **Finalité** | Signaler à une personne qu'une de ses tâches a été créée |
| **Base légale** | Exécution du contrat, comme le service qu'elles accompagnent |
| **Personnes concernées** | Utilisateurs inscrits |
| **Catégories de données** | Identifiants du destinataire, de la tâche et de l'événement d'origine ; date de lecture ; horodatages |
| **Localisation** | `public.notifications` |
| **Conservation** | Quatre-vingt-dix jours après création, puis effacement. Immédiat à la suppression du compte |
| **Destinataires** | Supabase (sous-traitant) |
| **Mesures de sécurité** | Aucun libellé stocké : le texte affiché est construit par l'interface, la table ne contient que des identifiants |

### T-05 — File d'événements

| | |
|---|---|
| **Finalité** | Garantir qu'un fait enregistré est annoncé une fois et une seule aux composants qui en dépendent |
| **Base légale** | Intérêt légitime : fiabilité technique du service |
| **Personnes concernées** | Utilisateurs inscrits, indirectement |
| **Catégories de données** | Identifiant d'événement, nom versionné, instant, et un payload restreint à des identifiants (`itemId`, `ownerId`) |
| **Localisation** | `public.outbox`, `public.processed_events`, et la file Redis pendant le transport |
| **Conservation** | Sept jours après publication (`published_at`), puis effacement. `processed_events` est conservé quatre-vingt-dix jours : c'est ce qui rend un rejeu sans effet |
| **Destinataires** | Supabase (sous-traitant). Redis s'exécute localement et n'est pas un tiers |
| **Mesures de sécurité** | Le contrat d'événement interdit toute donnée personnelle dans le payload, et un test échoue si l'intitulé d'une tâche s'y trouve ; schéma strict, un champ ajouté est rejeté |

Un événement ne transporte que des identifiants. C'est ce qui permet de ne pas avoir à purger
la file lors d'un export ou d'un effacement : elle ne contient rien à restituer.

### T-06 — Journaux applicatifs

| | |
|---|---|
| **Finalité** | Diagnostiquer une panne et constater un abus |
| **Base légale** | Intérêt légitime : maintien en condition opérationnelle |
| **Personnes concernées** | Toute personne émettant une requête, inscrite ou non |
| **Catégories de données** | Méthode, chemin appelé, code de réponse, durée, identifiant de corrélation. Le chemin peut contenir l'identifiant d'une tâche |
| **Localisation** | Sortie standard des processus, collectée par l'hébergeur |
| **Conservation** | Trente jours |
| **Destinataires** | Vercel (sous-traitant, hébergement de l'application) |
| **Mesures de sécurité** | Masquage du corps des requêtes, de l'en-tête d'autorisation, du cookie et de tout champ nommé `password` ; ni adresse e-mail ni intitulé de tâche n'est journalisé, ce qu'un test vérifie |

## Ce que le registre ne couvre pas encore

**Les projets.** Le critère d'acceptation les mentionne, mais aucune table de projets
n'existe au schéma à ce jour : `US-16` n'est pas livrée. La ligne sera ajoutée par l'issue qui
introduira la table, pas anticipée ici sur un modèle qui n'est pas arrêté.

## Champs sans finalité identifiée

Chaque colonne persistée a été rattachée à un traitement ci-dessus. Aucune n'est restée sans
finalité, donc aucune suppression de champ n'est requise par cette issue.

Le cas examiné de près est `public.users.email`, qui duplique `auth.users.email`. Il est
conservé : le miroir est ce qui permet à `items.user_id` de référencer un compte, et l'e-mail
y est nécessaire à l'export de données personnelles, qui doit restituer l'adresse sans
dépendre d'un appel à l'API d'authentification.

## Décisions à ratifier

Les durées ci-dessus sont proposées, argumentées et prêtes à être appliquées. Elles engagent
`US-39`, qui les implémentera au sprint 3. Trois points demandent une confirmation de
l'équipe en relecture :

1. **La région d'hébergement Supabase.** Une instance hors Union européenne impose un
   encadrement des transferts qu'il faut alors décrire ici. C'est le seul point qui peut
   encore changer le contenu d'un traitement.
2. **Les durées elles-mêmes.** Le compte rendu de lancement proposait « indéfiniment sauf
   demande de l'utilisateur ». Ce n'est pas tenable : la limitation de la conservation est un
   principe du règlement, et une durée indéfinie ne s'écrit pas dans un registre. Les valeurs
   retenues ici sont celles qui paraissent proportionnées à chaque finalité ; l'équipe peut
   les allonger ou les raccourcir, pas les supprimer.
