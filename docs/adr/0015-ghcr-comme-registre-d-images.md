# ADR-0015 — GHCR comme registre d'images

- **Statut** : Accepté
- **Date** : 2026-09-11
- **Décideurs** : équipe, à la revue du sprint 2
- **Issue liée** : #228, décision `D-13`

## Contexte

Le sujet demande la publication d'une image Docker. Le registre n'avait jamais été ratifié, alors
que `.github/workflows/image.yml` publie sur GitHub Container Registry depuis le sprint 1, avec une
attestation de provenance.

## Options considérées

### Option A — GHCR
- Avantages : déjà lié au dépôt, aucun secret supplémentaire à gérer — le jeton de la campagne
  suffit — et l'attestation de provenance est native.
- Inconvénients : lie la publication à GitHub, comme le reste de la chaîne.

### Option B — Docker Hub
- Avantages : le plus connu.
- Inconvénients : un compte et un secret de plus, des limites de tirage sur l'offre gratuite, et
  aucune attestation.

## Décision

Nous retenons **l'option A**.

Parce qu'elle n'ajoute aucun secret à gérer, ce qui est le coût réel d'un second registre dans un
projet de six personnes, et parce que l'attestation de provenance vient sans travail.

## Conséquences

**Positives**
- Une image publiée est rattachable à la campagne qui l'a produite.

**Négatives / dette acceptée**
- La chaîne de livraison dépend entièrement de GitHub.

**Ce que ça impose au reste du projet**
- Aucune image ne se pousse depuis un poste : seule la campagne déclenchée par un push sur `main`
  publie, après avoir rejoué les vérifications.

## Comment on saura qu'on s'est trompé

Une contrainte de déploiement qui exigerait un registre tiers, ou une limite de GHCR rencontrée.

## Références

- `.github/workflows/image.yml`
