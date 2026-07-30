# src/worker/Dockerfile
# ─────────────────────────────────────────────────────────────────────────────
# Image du worker de scraping Anime Notif.
#
# Pas besoin de multi-stage ici : le worker n'a pas d'étape de build
# (pas de TypeScript, pas de bundler). Un seul étage suffit.
# On garde les mêmes bonnes pratiques que l'image web :
#   - version figée de l'image de base
#   - copie des manifests AVANT le code (cache des dépendances)
#   - utilisateur non-root
#   - healthcheck basé sur un fichier heartbeat
# ─────────────────────────────────────────────────────────────────────────────

FROM node:22-alpine3.21

LABEL org.opencontainers.image.title="anime-notif-worker" \
      org.opencontainers.image.description="Scraper d'épisodes anime avec notifications Discord"

ENV NODE_ENV=production
WORKDIR /app

# Copier les manifests SEULS d'abord — ce layer n'est recalculé
# que si les dépendances changent, pas à chaque modification de code.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Puis le code du worker
COPY src/worker/ ./src/worker/

# Basculer en utilisateur non-root
USER node

# Healthcheck basé sur le fichier heartbeat :
# Le worker touche /tmp/.heartbeat à la fin de chaque cycle.
# Si le fichier n'a pas été modifié depuis plus de 3600 secondes (1h),
# c'est que le worker est bloqué → Docker le déclare "unhealthy"
# → autoheal le redémarre.
#
# Note : on utilise 'stat -c %Y' (GNU coreutils, dispo sur Alpine)
# pour lire le timestamp de dernière modification en epoch.
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=2 \
  CMD test $(( $(date +%s) - $(stat -c %Y /tmp/.heartbeat 2>/dev/null || echo 0) )) -lt 3600 || exit 1

CMD ["node", "src/worker/index.js"]
