# ADR-0016 — Prometheus comme format, Grafana Cloud en Allemagne comme plateforme

- **Statut** : Accepté
- **Date** : 2026-09-12
- **Décideurs** : équipe, après la défense intermédiaire
- **Issue liée** : #276

## Contexte

La défense intermédiaire demande qu'une plateforme de supervision soit choisie avant la fin du
projet, et que la décision soit portée par un ADR nommant les besoins, les solutions comparées, les
données collectées, les coûts et les limites.

Rien n'existe aujourd'hui : aucune métrique n'est exposée, et la seule observabilité est le journal
d'exécution de Vercel, qui se consulte à la main et ne conserve rien de durable.

Ce qu'il faut pouvoir voir, dans l'ordre de ce qui nous a réellement manqué pendant le sprint 2 :

- si une route répond, avec quel code et en combien de temps — les 500 de `/auth/me` et de
  `/auth/login` ont été trouvés par hasard, en lisant des journaux ;
- si l'outbox se vide — dix événements sont restés bloqués derrière un seul inconsommable sans que
  rien ne le signale ;
- si une passe de livraison échoue, et combien d'événements elle applique.

## Options considérées

### Option A — Prometheus auto-hébergé, uniquement en local
- Avantages : aucun compte, aucune dépendance, aucun transfert. Un conteneur dans `compose.yaml`
  suffit à démontrer la chaîne.
- Inconvénients : rien n'est observé sur le déploiement, donc la supervision ne sert qu'à la
  démonstration. Aucune conservation entre deux `docker compose down`.

### Option B — Grafana Cloud, format Prometheus
- Avantages : palier gratuit, conservation, tableaux de bord et alertes sans serveur à tenir. Le
  format reste Prometheus, donc le coût de sortie est celui d'un changement d'adresse.
- Inconvénients : un fournisseur de plus, et une région à choisir — voir la contrainte ci-dessous.

### Option C — L'observabilité de Vercel seule
- Avantages : déjà là, rien à configurer.
- Inconvénients : pas de métrique métier, pas d'alerte sur la profondeur de l'outbox, et une
  conservation courte sur le palier gratuit.

## Décision

Nous retenons **Prometheus comme format** et **l'option B pour la cible déployée**, avec l'option A
conservée pour la démonstration locale : un conteneur Prometheus dans `compose.yaml` scrute
l'application, et Grafana Cloud reçoit ce que le déploiement peut pousser.

Deux contraintes font partie de la décision, pas de son commentaire.

**La région.** La première pile créée était en `prod-us-west-0`, aux États-Unis — vérifié le
12 septembre 2026 sur l'URL de sa source de données Prometheus. Une pile Grafana Cloud ne change
pas de région après création ; comme rien n'y était encore connecté, elle a été refaite en
Allemagne, région `prod-eu-west-2`. Aucune donnée n'a donc traversé l'Atlantique.

**Aucune donnée personnelle.** Une métrique ne porte ni identifiant de compte, ni adresse, ni
intitulé de tâche, ni adresse IP, en valeur comme en étiquette. Ce qui sort est un compteur ou une
durée, agrégé par route et par code de statut. C'est ce qui fait que Grafana Labs, société
américaine, n'est destinataire d'aucune donnée personnelle malgré une pile européenne.

## Conséquences

**Positives**
- Une route qui casse se voit, au lieu d'être trouvée en lisant un journal par hasard.
- La profondeur de l'outbox devient observable, donc alertable.
- Le format étant Prometheus, changer de plateforme revient à changer une adresse d'écriture.

**Négatives / dette acceptée**
- Sur la cible serverless, un compteur repart de zéro à chaque invocation : les métriques de
  processus n'y ont pas de sens, et seules les mesures poussées par requête sont exploitables.
  C'est la même contrainte que celle qui empêche le relais d'y tourner (ADR-0013).
- Le palier gratuit limite la conservation et le nombre de séries. Une étiquette à forte
  cardinalité — un identifiant de tâche, par exemple — le saturerait, ce que la règle ci-dessus
  interdit de toute façon.
- Un fournisseur de plus à déclarer au registre et à la politique de confidentialité.

**Ce que ça impose au reste du projet**
- Toute métrique ajoutée passe la même règle : aucune étiquette ne peut identifier une personne ni
  un objet qu'elle a créé.
- La démonstration du flux événementiel se fait en local, où Prometheus scrute réellement.

## Comment on saura qu'on s'est trompé

Une panne trouvée dans les journaux alors qu'une métrique existait pour la voir. Ou une série dont
la cardinalité explose, signe qu'une étiquette porte quelque chose d'identifiant.

## Références

- Région mesurée : URL de `grafanacloud-prom`, `prod-eu-west-2`, 12 septembre 2026
- ADR-0013 (ce qui empêche un processus long sur la cible serverless)
- `docs/gdpr/registre.md`, section « Sous-traitants et localisation »
