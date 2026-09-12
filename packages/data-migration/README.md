# @legacy/data-migration

Le chemin des données entre notre PostgreSQL et les moteurs d'à côté.

Ce paquet ne déclare **aucune dépendance**, ni externe ni interne. C'est voulu : il sert à
récupérer des données le jour où l'application ne tourne plus, ou ne tourne plus ici. Un outil
de sortie qui dépend de ce qu'on quitte n'est pas un outil de sortie.

Il ne parle à aucune base. Il lit du texte et il en écrit :

- en entrée, un export SQL produit par `mysqldump` ou par `sqlite3 .dump` (#275) ;
- en sortie, un script SQL que quelqu'un relit avant de l'appliquer.

C'est la raison pour laquelle rien ici n'ouvre de connexion : un script qu'on relit avant de
l'exécuter est le seul format qui laisse une chance de refuser une reprise qui se serait
trompée.

L'ADR-0017 dit pourquoi ce paquet existe.
