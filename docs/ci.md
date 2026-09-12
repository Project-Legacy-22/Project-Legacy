# La chaîne d'intégration continue

Ce que GitHub Actions exécute, quand, et ce qui empêche une pull request d'être intégrée. État au
12 septembre 2026 ; chaque affirmation se vérifie dans `.github/workflows/`.

## Les six campagnes

| Campagne | Déclenchée par | Ce qu'elle fait |
|---|---|---|
| `ci` | chaque pull request, chaque push sur `dev`, et appelée par `image` | les huit vérifications détaillées ci-dessous |
| `codeql` | pull request, push, et une fois par semaine | analyse statique de sécurité de GitHub |
| `guard-branches` | chaque push | refuse un commit qui n'a pas l'origine attendue |
| `image` | push sur `main` | rejoue `ci`, puis publie l'image sur GHCR et crée la release |
| `pages` | push sur `dev` | publie le rapport de couverture sur GitHub Pages |
| `relais` | toutes les cinq minutes | déclenche une passe de livraison de l'outbox sur le déploiement |

## Les huit vérifications de `ci`

| Job | Ce qu'il vérifie | Ce qu'il attrape |
|---|---|---|
| Types et style | `tsc --build`, `scripts/check-layers.mjs`, ESLint | un type faux, un import qui traverse une frontière de couche, un plafond de lignes ou de complexité franchi |
| Tests et couverture | `npm test` avec la couverture agrégée | une régression de comportement, une couverture sous les seuils : 70 % pour les lignes, les instructions et les fonctions, 60 % pour les branches |
| Tests d'intégration | la pile Supabase locale, migrations appliquées | ce que seule une vraie base montre : politiques de ligne, transactions, révocation de session |
| Qualite (SonarCloud) | analyse et **attente du verdict du gate** | duplication, complexité, sécurité, couverture vue par l'outil |
| Audit des dépendances | `npm audit --audit-level=high` | une vulnérabilité haute ou critique dans une dépendance ; une modérée ne bloque pas |
| Build | `npm run build` | ce que les tests ne voient pas : une feuille de style invalide, un bundle qui ne se construit pas |
| Image Docker | construction de l'image sans publication | un Dockerfile cassé, avant qu'une livraison ne le découvre |
| Migrations et schéma | rejoue toutes les migrations sur une base neuve | une migration qui ne s'applique pas dans l'ordre |

## Ce qui bloque une intégration

La protection de branche de `dev` exige trois choses, et elles sont vérifiables par l'API :

- **une approbation** d'une autre personne ;
- **le contexte `Qualite (SonarCloud)` au vert** — le seul contexte requis, et c'est délibéré : il attend le verdict du gate, donc il englobe ce que les autres mesurent ;
- **toutes les conversations de relecture résolues**.

`enforce_admins` est actif : la règle s'applique aussi à qui administre le dépôt. `main` a la même
exigence d'approbation.

Deux conséquences que l'équipe a rencontrées, et qu'il vaut mieux connaître :

Un contrôle requis qui **saute** n'est pas satisfait pour GitHub. C'est pourquoi le job SonarCloud
saute son *étape* d'analyse plutôt que le job entier quand elle n'a pas lieu d'être — sur une pull
request de Dependabot, dont le magasin de secrets refuse le jeton, et sur un push vers `main`, où
l'offre gratuite n'analyse pas une seconde branche.

Un workflow appelé par un autre ne reçoit **aucun secret** sans `secrets: inherit`. Sans cette
ligne, `image` faisait tourner `ci` avec un jeton SonarCloud vide, l'analyse échouait, et la
publication d'image était sautée sans que personne comprenne pourquoi.

## Le chemin d'une modification

```
branche de travail  ──pull request──▶  dev  ──tk release──▶  main
      │                                 │                      │
      ci + codeql                    ci + pages          image : ci, puis GHCR + release
```

`main` n'est jamais atteint par un merge de branche de travail : seule une livraison depuis `dev` y
va, et elle se fait par un commit de merge afin que les deux branches ne divergent pas alors que
leur contenu est identique.

## Références

- `.github/workflows/`, `sonar-project.properties`
- ADR-0009 (SonarCloud comme outil de quality gate), ADR-0015 (GHCR comme registre)
