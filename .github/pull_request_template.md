## Contexte

Pourquoi ce changement. Une ou deux phrases.

## Ce qui change

- 
- 

## Issue liée

Closes #

## Comment tester

1. 
2. 

## Impacts

- **API** : aucune / ajout rétrocompatible / rupture (détailler)
- **Base de données** : aucune / migration ajoutée (réversible ? )
- **Événements** : aucun / nouvel événement / modification (nouvelle version ? )
- **Dépendances** : aucune / ajout (nom, raison, licence, poids)
- **RGPD** : aucune donnée personnelle touchée / détailler
- **Accessibilité** : sans objet / vérifié au clavier et au contraste

## Checklist

- [ ] `tk verify` est vert
- [ ] Cette PR cible `dev` (une PR vers `main` est une livraison, ouverte par `tk release`)
- [ ] Branche rebasée sur `origin/dev`
- [ ] Tests couvrant la logique métier ajoutée
- [ ] Tous les critères d'acceptation de l'issue sont couverts
- [ ] Diff relu par moi-même, aucun code mort ni `console.log`
- [ ] Aucun secret, aucune donnée personnelle dans les logs ou les événements
- [ ] Documentation mise à jour (README / ADR / OpenAPI)
- [ ] Moins de 400 lignes de diff, ou justification ci-dessus
