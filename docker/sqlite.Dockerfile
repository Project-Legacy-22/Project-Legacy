# Un conteneur qui ne sert qu a tenir le binaire sqlite3.
#
# SQLite n est pas un serveur : il n y a rien a demarrer, et un fichier de base
# suffirait. Le conteneur existe pour que l epreuve de migration ne depende pas
# de ce qui est installe sur le poste, et donne le meme resultat ici et dans la
# chaine d integration.
FROM alpine:3.21

RUN apk add --no-cache sqlite

# Rien a servir, mais il faut rester joignable par `docker compose exec`.
CMD ["sleep", "infinity"]
