# ADR-0008 — Sessions et authentification gérées par Supabase Auth

- **Statut** : Accepté
- **Date** : 2026-09-02
- **Décideurs** : équipe complète, réunion de lancement
- **Issue liée** : #2

## Contexte

Le code hérité n'a aucune notion d'utilisateur (`DET-28`). Quatre User Stories dépendent
directement de la stratégie de session : `US-11` (authentification), `US-27` (expiration
propre), `US-47` (déconnexion) et `US-13` (suppression de compte).

L'exigence commune à ces quatre items est la **révocation** : une session doit pouvoir être
terminée avant son expiration naturelle.

## Options considérées

### Option A — JWT seul
- Avantages : simple, sans stockage de session.
- Inconvénients : **ne se révoque pas**. Un jeton volé reste valable jusqu'à son expiration.
  Contredit `US-27`, `US-47` et `US-13`. Écarté pour cette seule raison.

### Option B — Session serveur, écrite par nous
- Avantages : révocable, entièrement sous notre contrôle.
- Inconvénients : nous porterions le stockage, la rotation, le hachage des mots de passe et
  la politique de mot de passe — c'est-à-dire la partie la plus facile à rater d'une
  application évaluée sur la sécurité.
- La recommandation du backlog (`D-19`) décrivait cette option : jeton d'accès court, jeton
  de rafraîchissement révocable, cookie `httpOnly`.

### Option C — Supabase Auth
- Avantages : implémente exactement le mécanisme que décrivait la recommandation, sans que
  nous l'écrivions. Cohérent avec l'ADR-0004, déjà retenu pour les données.
- Inconvénients : le comportement est celui du fournisseur ; ce qu'il ne fait pas, nous ne
  pouvons pas le lui faire faire.

## Décision

Nous retenons **l'option C — Supabase Auth**.

Parce que :

1. Ce que la recommandation décrivait est ce que Supabase Auth fait déjà. Vérifié dans sa
   documentation : le jeton d'accès est un JWT court — une heure par défaut — portant un
   `session_id` ; le jeton de rafraîchissement est à usage unique et tourne à chaque échange,
   avec un intervalle de réutilisation de dix secondes par défaut pour absorber les rejeux
   réseau ; une réutilisation hors de cet intervalle **termine la session et révoque tous ses
   jetons** ; la déconnexion supprime les sessions concernées de la base.
2. Écrire nous-mêmes ce mécanisme nous ferait porter le risque le plus coûteux du projet pour
   un gain d'évaluation nul — le sujet évalue que la révocation fonctionne, pas qui l'a
   écrite.
3. L'ADR-0004 amène déjà le client Supabase. Une authentification tierce ferait cohabiter
   deux identités de l'appelant, donc deux endroits où l'autorisation peut diverger.

## Conséquences

**Positives**
- `US-11` et `US-27` se réduisent à brancher le mécanisme et à **tester son comportement**,
  au lieu de l'écrire.
- La révocation à la déconnexion est réelle et vérifiable, ce que `US-47` exige.
- Les politiques RLS s'appuient sur l'identité authentifiée : l'appartenance de l'ADR-0001
  s'exprime au niveau de la base.

**Négatives / dette acceptée**
- La politique de mot de passe — douze caractères, vérification contre une liste de mots de
  passe compromis — se configure côté Supabase. **À vérifier dans la configuration réelle
  avant de cocher `US-11`**, pas à supposer acquise.
- Le stockage du jeton en cookie `httpOnly` n'est pas le comportement par défaut d'un client
  navigateur : c'est un point d'attention explicite de `US-11`, pas un acquis.
- Une politique RLS absente échoue **silencieusement** : la requête ne renvoie rien au lieu
  de lever une erreur. Un test qui vérifie seulement « l'accès interdit ne renvoie pas la
  donnée » passerait aussi sur une table vide. Chaque test d'autorisation doit donc vérifier
  d'abord que la donnée est bien visible pour un membre.

**Ce que ça impose au reste du projet**
- Le domaine `auth` expose un port ; le client Supabase reste un adaptateur (ADR-0003).
- `US-13` (suppression de compte) doit décrire ce qui est supprimé côté Supabase **et** côté
  données applicatives : les deux ne sont pas la même base logique.

## Comment on saura qu'on s'est trompé

Si une exigence du sujet ne peut pas être satisfaite dans le modèle de Supabase Auth — une
durée de session imposée, une suppression de compte qui doit cascader ailleurs — on garde
Supabase pour les données et on écrit la session nous-mêmes. C'est la raison pour laquelle
le domaine `auth` doit rester indépendant du client : sans ce port, ce repli coûterait une
réécriture au lieu d'un adaptateur.

## Références

- `docs/backlog.md`, décision `D-19`
- `docs/audit-legacy.md`, dette `DET-28` (`SP-00`, PR #107)
- https://supabase.com/docs/guides/auth/sessions
- Standards d'équipe, `standards/07-quality-gates.md`, section sécurité
