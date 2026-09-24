# ADR-0020 — Relais serverless par une boucle de trente secondes

- **Statut** : Accepté
- **Date** : 2026-09-24
- **Décideurs** : équipe
- **Issue liée** : #410, prolonge l'ADR-0013

## Contexte

Sur Vercel, aucun processus ne tourne entre deux requêtes. L'ADR-0013 impose que toute cible
fasse tourner une passe de relais ; la cible serverless le fait après chaque écriture qui produit
un événement (`apps/api/src/after-write.ts`) et par un appel planifié sur `POST /internal/relay`
depuis le workflow `relais`, déclaré toutes les cinq minutes.

Le 24 septembre, deux constats. L'invitation dans un projet n'était pas branchée sur la passe
après écriture, et reposait donc entièrement sur le planificateur. Le planificateur, lui, ne tient
pas sa fréquence : les passes planifiées ont eu lieu à 21:41, 23:58, 03:39 et 08:44. Une
notification pouvait donc arriver plusieurs heures après son fait. Deux invitations de test n'ont
été livrées qu'après un déclenchement manuel.

## Options considérées

### Option A — garder le cron de cinq minutes
- Avantages : rien à changer.
- Inconvénients : cinq minutes est le minimum que GitHub accepte, et il ne le respecte pas ; la
  latence réelle se compte en heures.

### Option B — cron Vercel
- Avantages : au plus près du déploiement.
- Inconvénients : une exécution par jour en offre gratuite.

### Option C — un job GitHub Actions qui boucle et se relance
- Avantages : une passe toutes les trente secondes, tenue par le job lui-même et non par le
  planificateur ; aucun service de plus ; les minutes ne sont pas comptées sur un dépôt public.
- Inconvénients : un runner occupé en permanence ; un trou de quelques secondes à chaque relève ;
  la chaîne dépend de la relance par `workflow_dispatch`.

### Option D — un planificateur externe (cron-job.org, Upstash QStash)
- Avantages : fréquence tenue sans runner occupé.
- Inconvénients : un sous-traitant de plus, qui détiendrait le secret du relais et devrait entrer
  au registre RGPD.

## Décision

Nous retenons **l'option C**, avec la passe après écriture étendue à l'invitation.

Parce que : la fréquence de trente secondes est tenue par le job et non par un planificateur qui
ne tient pas la sienne ; elle n'ajoute ni service, ni secret hors de GitHub, ni destinataire au
registre ; et la passe après écriture reste le chemin normal, la boucle rattrapant ce qu'elle
manque.

## Conséquences

**Positives**
- Une notification arrive dans la seconde qui suit l'écriture, et au plus trente secondes après
  quand la passe après écriture a échoué.
- Les mesures sont poussées toutes les dix passes, sommées : même information, dix fois moins de
  séries que des poussées par passe.

**Négatives / dette acceptée**
- Un job tourne en continu. Si le dépôt devenait privé, il consommerait environ 43 000 minutes
  par mois et cette décision serait à revoir.
- La relève laisse un trou de quelques secondes toutes les 345 minutes.

**Ce que ça impose au reste du projet**
- Tout nouveau cas d'usage qui écrit un événement passe par `afterWrite` dans
  `composition-root.ts`, avec un test qui le vérifie (`item-use-cases.test.ts`,
  `project-use-cases.test.ts`).
- La boucle ne se relance qu'après être allée à son terme ; une variable absente l'arrête sans
  relance, pour ne pas enchaîner des exécutions vides.

## Comment on saura qu'on s'est trompé

L'historique du workflow `relais` montre plus d'une boucle en cours à la fois, ou une période
sans boucle active plus longue que quelques minutes ; ou `legacy22_outbox_pending` reste au-dessus
de zéro plus d'une minute sur le tableau de bord.

## Références

- `.github/workflows/relay.yml`, `scripts/relay-loop.mjs`, `test/relay-loop.test.ts`
- Documentation GitHub : les événements déclenchés par `GITHUB_TOKEN` ne créent pas de nouvelle
  exécution, à l'exception de `workflow_dispatch` et `repository_dispatch`.
