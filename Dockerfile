# syntax=docker/dockerfile:1

# =============================================================================
# Étage 1 — dépendances de production uniquement
# =============================================================================
FROM node:22-alpine3.21 AS deps

WORKDIR /app

# Les manifests sont copiés SEULS, avant le code : ce layer n'est invalidé
# que si les dépendances changent. Un simple changement de code réutilise
# donc le cache et évite un `npm ci` complet.
COPY package.json package-lock.json ./

# `npm ci` (clean install) installe strictement ce que décrit le lockfile,
# contrairement à `npm install` qui peut le mettre à jour. Reproductible,
# et nettement plus rapide. `--omit=dev` exclut les dépendances de dev.
RUN npm ci --omit=dev && npm cache clean --force

# =============================================================================
# Étage 2 — image finale
# =============================================================================
FROM node:22-alpine3.21 AS runtime

# Métadonnées standard OCI — exploitées par les registries et les scanners.
LABEL org.opencontainers.image.title="anime-notif-web" \
      org.opencontainers.image.source="https://github.com/AnasKnanoua/anime-notif" \
      org.opencontainers.image.licenses="MIT"

# curl est nécessaire au HEALTHCHECK ; --no-cache évite de laisser
# l'index des paquets dans l'image.
# hadolint ignore=DL3018
RUN apk add --no-cache curl

ENV NODE_ENV=production

WORKDIR /app

# Les images Node officielles fournissent déjà un utilisateur `node` (uid 1000).
# On copie en lui attribuant la propriété plutôt que de faire un `chown`
# après coup, qui dupliquerait tous les fichiers dans un nouveau layer.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src/ ./src/

# Bascule en utilisateur non privilégié. Toute instruction suivante,
# et le processus lui-même, s'exécutent sans les droits root.
USER node

EXPOSE 3000

# Docker interroge cette sonde périodiquement et expose l'état
# `healthy` / `unhealthy` — c'est ce que consommeront l'autoheal
# et la supervision à l'étape 3.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:3000/health || exit 1

# Forme "exec" (tableau JSON) et non "shell" : sans elle, le processus
# est lancé via /bin/sh qui n'transmet pas SIGTERM à Node — l'arrêt
# gracieux qu'on vient d'écrire ne serait jamais déclenché.
CMD ["node", "src/web/server.js"]
