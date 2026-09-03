# ADR-0003 — Découpage du backend par domaine, en couches à l'intérieur

- **Statut** : Accepté
- **Date** : 2026-09-02
- **Décideurs** : équipe complète, réunion de lancement
- **Issue liée** : #2

## Contexte

Le code hérité n'a aucune couche métier : les gestionnaires Express appellent directement la
persistance (`DET-01`), et le pilote de base est choisi par effet de bord au chargement du
module (`DET-02`). Aucune règle n'est testable sans HTTP ni base de données.

Six personnes travaillent en parallèle sur le même dépôt pendant trois sprints. La question
n'est donc pas seulement « quel découpage est propre » mais « quel découpage évite six
personnes dans les mêmes fichiers ».

## Options considérées

### Option A — Par domaine, en couches à l'intérieur de chaque domaine
- Avantages : chaque domaine est autonome ; les frontières sont vérifiables
  automatiquement ; un module a un propriétaire identifiable.
- Inconvénients : plus de fichiers, plus d'imports, plus de cérémonie pour un cas simple.

### Option B — Par couche uniquement (`controllers/`, `services/`, `models/`)
- Avantages : familier, immédiat à comprendre.
- Inconvénients : tout le monde édite les trois mêmes dossiers. Les conflits sont garantis à
  six, et le couplage du legacy est reproduit à l'identique, une couche plus haut.

### Option C — Plat, comme le legacy
- Écarté : c'est la dette `DET-01` elle-même.

## Décision

Nous retenons **l'option A — découpage par domaine**, style hexagonal allégé : le domaine
n'importe rien, expose des ports, et les adaptateurs (HTTP, base, bus) sont branchés à la
composition root.

Parce que :

1. À six, un découpage horizontal fait converger tout le monde vers les mêmes trois
   dossiers. Le découpage par domaine est ce qui rend l'ownership par module possible, donc
   ce qui évite les conflits — c'est un choix d'organisation autant que d'architecture.
2. La règle « `domain/` n'importe rien » est vérifiable par script, donc elle tient sans
   dépendre de la vigilance en revue.
3. Un domaine isolé se teste sans HTTP ni base : c'est la condition pour que les tests
   portent sur un comportement et non sur une séquence d'appels, ce que le legacy ne
   permettait pas (`DET-14`).

## Conséquences

**Positives**
- Un domaine ne communique avec un autre que par événement ou par port, jamais par import
  direct.
- Chaque adaptateur est remplaçable sans toucher au métier — ce qui rend réversibles les
  ADR-0005 et ADR-0007.

**Négatives / dette acceptée**
- Plus de fichiers et d'indirection qu'un CRUD ne le justifierait pris isolément.
- Un développeur pressé trouvera le chemin le plus court en important directement un
  adaptateur : la vérification automatique est ce qui l'en empêche, pas la convention.

**Ce que ça impose au reste du projet**
- `packages/contracts` est le seul contrat public entre domaines.
- `.github/CODEOWNERS` suit le découpage : un module, un propriétaire.
- Toute nouvelle communication entre domaines se déclare comme un événement ou un port, et
  se discute — elle ne s'ajoute pas par un import.

## Comment on saura qu'on s'est trompé

Si un domaine devient un fourre-tout dont trois personnes modifient les mêmes fichiers à
chaque sprint, la frontière est mal placée : on scinde ce domaine. Revenir à un découpage
par couche ramènerait le problème partout au lieu de le corriger à un endroit.

## Références

- `docs/backlog.md`, décision `D-04`
- `docs/audit-legacy.md`, dettes `DET-01`, `DET-02`, `DET-14` (livrées par `SP-00`, PR #107)
- Standards d'équipe, `standards/01-architecture.md`
