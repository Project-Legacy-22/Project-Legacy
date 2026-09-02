# Image de production : l API Express et le front construit, servis sur le meme
# port. Vite ecrit son bundle dans la sortie de l API, il n y a donc qu un seul
# artefact a publier.
#
# Trois etapes. Les dependances de production sont installees separement de
# celles de developpement : l image finale ne recoit que les premieres, sans
# avoir a desinstaller quoi que ce soit ensuite.

ARG NODE_VERSION=22.12

# --- dependances de production -------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app

# sqlite3 se compile depuis les sources sur musl, faute de binaire preconstruit.
# La chaine de compilation reste dans cette etape et n atteint jamais l image
# finale. Elle disparaitra avec EN-09, quand Supabase remplacera SQLite.
RUN apk add --no-cache python3 make g++

# Les manifestes sont copies avant le reste du code : tant qu ils ne changent
# pas, Docker reutilise la couche d installation, qui est de loin la plus longue.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/items/package.json packages/core/items/
COPY packages/infra/package.json packages/infra/

RUN npm ci --omit=dev

# --- compilation ----------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/items/package.json packages/core/items/
COPY packages/infra/package.json packages/infra/
RUN npm ci

COPY . .
RUN npm run build

# --- image finale -----------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# L image tourne sans privilege. node:alpine fournit deja l utilisateur `node`.
USER node

# Seuls la sortie compilee et les manifestes traversent. Copier `packages`
# entier ferait entrer les sources TypeScript et les tests dans l image
# publiee : inutiles a l execution, et autant de surface en plus.
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node --from=builder /app/apps/api/package.json ./apps/api/
COPY --chown=node:node --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --chown=node:node --from=builder /app/packages/contracts/package.json ./packages/contracts/
COPY --chown=node:node --from=builder /app/packages/core/items/dist ./packages/core/items/dist
COPY --chown=node:node --from=builder /app/packages/core/items/package.json ./packages/core/items/
COPY --chown=node:node --from=builder /app/packages/infra/dist ./packages/infra/dist
COPY --chown=node:node --from=builder /app/packages/infra/package.json ./packages/infra/
COPY --chown=node:node package.json ./

# Documente le port ecoute ; le port reel se configure par l environnement.
EXPOSE 3000

CMD ["node", "apps/api/dist/index.js"]
