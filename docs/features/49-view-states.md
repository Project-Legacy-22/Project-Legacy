# Etats de chargement, vide et erreur coherents

- **Issue**: #49
- **Epic**: A11y
- **Delivered**: 2026-09-11
- **Decisions that apply**: ADR-0006 (Vite et React), ADR-0011 (anglais pour le code)

## Ce que ca fait

Les quatre vues de l'application traversent les memes trois etats -- en cours de chargement, sans
donnee, en echec -- et les rendent maintenant de la meme facon. Une personne qui ne voit pas
l'ecran entend la meme chose sur les quatre ; une personne qui tombe sur un echec y trouve
toujours un moyen de reessayer ; un etat vide dit ce qui manque et, quand c'est possible, offre
l'action qui le remplit.

Hors perimetre : le resultat d'une action (succes ou echec d'un envoi de formulaire), qui est un
autre sujet et reste porte par `action-feedback.tsx` et `form-outcome.tsx`. Cette issue parle de
l'etat d'une vue, pas du compte rendu d'un geste.

## Ce qui existait avant

Sept rendus improvises pour trois etats, et aucun accord entre eux.

| Vue | Chargement | Vide | Echec |
|---|---|---|---|
| Taches | ligne `role="status"` | ligne de texte, aucune action | encart avec reprise |
| Projets | ligne `role="status"` | ligne de texte, aucune action | encart avec reprise |
| Notifications | ligne `role="status"` | ligne de texte, aucune action | encart **sans aucune sortie** |
| Verification de session | `<p role="status">` **hors de tout repere** | sans objet | `<p role="alert">`, **sans sortie** |

Les deux cas sans sortie sont ceux qui comptent. Le panneau de notifications en echec ne pouvait
etre relance qu'en le refermant et le rouvrant, ce que rien n'indiquait. L'ecran de verification de
session en echec ne laissait qu'un rechargement de page, et c'est le moins visible des quatre :
il n'apparait que quand l'API est injoignable, c'est-a-dire precisement quand quelqu'un a besoin
qu'on lui dise quoi faire.

## Surface

| Ecran | Etat porte par |
|---|---|
| Liste des taches | `components/items-content.tsx` |
| Panneau de projets | `components/projects-section.tsx` |
| Panneau de notifications | `components/notifications-panel-content.tsx` |
| Verification de session | `components/session-check-screen.tsx` |

Le composant partage est `components/view-state.tsx`. Il rend un fragment et non un conteneur :
l'etat d'une vue appartient a la region qui la contient, et chaque appelant porte `aria-busy` sur
son propre `<section>`. Un seul porteur, sur l'element qu'un lecteur d'ecran annonce deja --
le mettre sur la ligne de texte dirait que le texte est occupe, pas que le panneau l'est.

## Les quatre cas, et pourquoi

| Etat | Ce qui est rendu | Raison |
|---|---|---|
| chargement, rien encore | la ligne seule | annoncer un etat vide alors que la reponse est en route dirait qu'il n'y a rien, ce qui n'est pas encore su |
| chargement, donnee deja la | la ligne et la donnee | un rafraichissement ne doit pas vider ce que quelqu'un est en train de lire |
| pret, rien | l'etat vide, avec l'action qui le remplit | un etat vide sans issue est l'un des deux defauts que l'issue nomme |
| pret, donnee | la donnee | |

Une exception nommee : `keepsChildrenWhenEmpty`. Le tableau Kanban garde ses trois colonnes quand
il ne porte aucune tache, parce que les colonnes sont le flux de travail et non la donnee, et
chaque colonne dit pour elle-meme qu'elle est vide. Une liste, elle, disparait : rendre un `<ul>`
vide a cote du message le dirait deux fois.

## L'action qui remplit un etat vide

Le type l'exige, par une union : une vue offre soit une `action`, soit une raison ecrite dans
`unfillable`. Laisser l'action de cote n'est pas possible, ce qui evite qu'un oubli passe pour un
choix.

| Vue | Action | Raison quand il n'y en a pas |
|---|---|---|
| Taches | « Add item », qui place le curseur dans `#item-name` | |
| Projets | « Create project », qui place le curseur dans `#project-name` | |
| Notifications | aucune | la liste ne se remplit que quand quelqu'un agit sur une tache : rien sur cet ecran ne la remplit |

L'action pose le focus dans le champ, elle ne fait pas defiler jusqu'a lui : quelqu'un qui ne voit
pas le panneau recoit le curseur la ou la tache s'ecrit.

## Accessibilite

Le chargement s'annonce par `role="status"`, une region live polie : elle annonce sans interrompre
et ne prend pas le focus. L'echec s'annonce par `role="alert"`, parce qu'il interrompt ce que la
personne avait demande et qu'elle a une decision a prendre.

Le focus ne bouge qu'a un seul endroit, et sur un geste volontaire : apres un clic sur « Try
again » dans la liste des taches, le bouton disparait avec l'encart, donc le focus est pose sur le
titre de la region qu'on vient de redemander. Aucun changement d'etat ne deplace le focus de
lui-meme.

`prefers-reduced-motion` est deja respecte globalement : `styles/foundation.css` ramene toutes les
durees de transition a 0,01 ms sous cette preference, et `styles/motion.test.ts` le verifie. Aucune
animation n'a ete ajoutee ici.

L'ecran de verification de session est desormais un `<main>` avec un `<h1>` et l'`id`
`main-content` que visent les liens d'evitement des autres pages. Il reprend la colonne centree de
`.auth-page` plutot qu'une regle presque identique a elle.

## Donnees personnelles

Aucune. Les messages d'echec sont ceux que les modules `api/` ont ecrits ; le composant n'y ajoute
rien -- ni code de statut, ni pile, ni identifiant de requete -- et un test le verifie.

## Comment verifier

```
npm run typecheck && npm run lint && npm test
```

- `components/view-state.test.tsx` : les quatre cas, l'action qui remplit, l'absence d'action
  justifiee, la reprise appelee, l'absence de detail technique, et `axe` sur les trois etats.
- `components/projects-section.test.tsx`, `components/todo-page.test.tsx`,
  `app-notifications-panel.test.tsx` : `aria-busy` expose sur la region et retire quand la vue est
  prete. Rien ne le verifiait avant, sur aucune des trois.
- `app-notifications-panel.test.tsx` et `app.test.tsx` : la reprise **relance la requete**, et pas
  seulement affiche un bouton. Les deux comptent les appels au faux.

## Limites connues

Le compte rendu d'action reste separe : `action-feedback.tsx` et `form-outcome.tsx` disent ce
qu'est devenu un envoi de formulaire, ce qui n'est pas l'etat d'une vue. Les unifier est un autre
sujet.

La section des donnees personnelles n'a pas d'etat de chargement : elle n'affiche aucune liste,
seulement deux actions. Il n'y avait donc rien a migrer.
