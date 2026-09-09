# ADR-0010 — Récupération de compte par e-mail, via Supabase Auth

- **Statut** : Accepté
- **Date** : 2026-09-08
- **Décideurs** : équipe, planning de US-28
- **Issue liée** : #29

## Contexte

US-28 demande qu'un utilisateur ayant oublié son mot de passe puisse le réinitialiser. Le
backlog rattachait cet item à US-18 (notifications dans l'application), mais une récupération
de mot de passe doit atteindre quelqu'un qui, par définition, ne peut plus se connecter :
elle passe donc nécessairement hors de l'application. La note de l'issue #29 le prévoyait
explicitement : « seul item susceptible d'imposer un canal e-mail ; la décision peut être
prise à son planning ».

L'ADR-0008 confie déjà à Supabase Auth (GoTrue) les identifiants, le hachage, les sessions et
la *password recovery*. GoTrue émet nativement un e-mail de récupération. La pile Supabase
locale (ADR-0004) tourne en développement et en CI. Aucun fournisseur SMTP de production
n'est provisionné à ce jour, et la décision D-14 sur le canal de notification n'était pas
tranchée.

## Options considérées

### Option A — E-mail émis par GoTrue, capturé localement par le mail-catcher de la pile Supabase
- Avantages : natif, aucun code d'envoi à écrire, aligné sur l'ADR-0008 ; l'échange du jeton
  se fait entièrement côté serveur (`verifyOtp` sur le hash du jeton) ; le mail-catcher local
  rend le flux vérifiable sur un dépôt fraîchement cloné sans rien envoyer.
- Inconvénients : dépend d'un SMTP de production à fournir au déploiement ; la délivrabilité
  échappe à notre contrôle ; la protection « mot de passe compromis » de Supabase est
  réservée au plan Pro, donc indisponible en local.
- Coût de mise en œuvre : brancher deux méthodes sur le port `IdentityProvider` et les tester.

### Option B — Notification dans l'application (US-18)
- Avantages : aucun canal externe, aucun secret supplémentaire.
- Inconvénients : **inutilisable pour ce cas** — l'utilisateur ne peut pas se connecter pour
  lire la notification. Écartée pour cette seule raison.

### Option C — Canal tiers (SMS, lien magique via un service externe)
- Avantages : indépendant de l'e-mail.
- Inconvénients : nouvelle dépendance, nouveau secret, coût d'apprentissage, et collecte
  d'une donnée personnelle de plus (le numéro de téléphone), contraire à la minimisation
  affichée par l'ADR-0001 et le standard RGPD.

## Décision

Nous retenons **l'option A**.

Parce que :

1. C'est le seul canal utilisable quand l'utilisateur est précisément dehors.
2. GoTrue le fournit déjà : US-28 se réduit à brancher le mécanisme et à **tester son
   comportement**, comme US-11 et US-27 sous l'ADR-0008, au lieu de l'écrire.
3. Le mail-catcher local rend la démonstration reproductible sur un checkout neuf sans
   configurer ni solliciter un vrai serveur d'envoi.

L'échange du jeton est fait **côté serveur** : le gabarit de courriel `recovery` émet le hash
du jeton en paramètre de requête sur notre propre chemin (`/reset-password`), une route API
l'échange contre une session (`verifyOtp`), pose le nouveau mot de passe (`updateUser`) puis
révoque toutes les sessions du compte (`signOut` global). Aucun jeton n'atteint le
navigateur, et la discipline du cookie `httpOnly` d'US-11 est préservée.

## Conséquences

**Positives**
- Le jeton de récupération est à usage unique et expire, nativement (`otp_expiry`).
- La révocation de toutes les sessions à la réinitialisation est explicite et vérifiée par
  un test, indépendamment de la version de GoTrue.
- Aucune table, aucune migration : le modèle de données n'est pas touché.

**Négatives / dette acceptée**
- Un serveur SMTP de production doit être configuré au déploiement
  (`[auth.email.smtp]` dans `supabase/config.toml`, identifiants par variables
  d'environnement). Différé et suivi, hors périmètre de US-28.
- La vérification « mot de passe compromis » exigée par le standard qualité n'est pas
  fournie par Supabase en dehors du plan Pro : l'application porte sa propre vérification
  contre l'API *range* de Have I Been Pwned (k-anonymat, mode ouvert sur panne du service).
- Un JWT d'accès reste valide jusqu'à son expiration (une heure au plus) après la révocation
  des sessions : dette déjà reconnue par l'ADR-0008.

**Ce que ça impose au reste du projet**
- `site_url` en développement pointe sur l'origine réellement servie (Vite), et un
  déploiement l'écrase par son origine publique.
- Un gabarit de courriel `recovery` personnalisé émet le hash du jeton sur notre chemin.
- L'API sert la coquille de l'application sur `/reset-password` : c'est le premier lien
  profond que le produit expose.

## Comment on saura qu'on s'est trompé

Un taux de rebond élevé des courriers de récupération en production, ou une exigence du sujet
imposant une équivalence temporelle stricte des réponses que le modèle de GoTrue ne permet
pas de garantir. Dans ce cas : ajouter un plancher de temps constant dans le cas d'usage, ou
écrire l'envoi nous-mêmes en gardant Supabase pour les données (le repli déjà décrit par
l'ADR-0008).

## Références

- Issue #29 (US-28) ; ADR-0004, ADR-0008 ; décision `D-14`
- `docs/features/29-password-reset.md`
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/local-development/cli/config
