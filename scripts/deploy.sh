#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

log() { echo "[$(date '+%H:%M:%S')] $*"; }

PREVIOUS_COMMIT=$(git rev-parse HEAD)
log "Commit actuel : $PREVIOUS_COMMIT"

git fetch origin main
git checkout main
git pull origin main
NEW_COMMIT=$(git rev-parse HEAD)

if [ "$PREVIOUS_COMMIT" = "$NEW_COMMIT" ]; then
  log "Aucun changement à déployer."
  exit 0
fi

# ── ÉTAPE 1 : déployer en STAGING d'abord ────────────────────────────
log "🧪 Déploiement en STAGING..."
cd deploy
docker compose -f docker-compose.staging.yml up -d --build

log "Vérification du staging..."
STAGING_OK=false
for i in $(seq 1 30); do
  status=$(docker inspect --format='{{.State.Health.Status}}' anime-notif-web-staging 2>/dev/null || echo "starting")
  if [ "$status" = "healthy" ]; then STAGING_OK=true; break; fi
  sleep 3
done

if [ "$STAGING_OK" != "true" ]; then
  log "❌ Le staging ne démarre pas — ARRÊT, la prod n'est pas touchée"
  docker compose -f docker-compose.staging.yml logs web-staging
  cd ..
  git checkout "$PREVIOUS_COMMIT"
  exit 1
fi
log "✅ Staging healthy"

# ── ÉTAPE 2 : déployer en PROD ───────────────────────────────────────
log "🚀 Déploiement en PROD..."
docker compose up -d --build

log "Vérification de la prod..."
PROD_OK=false
for i in $(seq 1 30); do
  status=$(docker inspect --format='{{.State.Health.Status}}' anime-notif-web 2>/dev/null || echo "starting")
  if [ "$status" = "healthy" ]; then PROD_OK=true; break; fi
  sleep 3
done

# ── ÉTAPE 3 : rollback prod si échec ─────────────────────────────────
if [ "$PROD_OK" = "true" ]; then
  log "✅ Déploiement PROD réussi"
else
  log "❌ La prod ne démarre pas — ROLLBACK"
  cd ..
  git checkout "$PREVIOUS_COMMIT"
  cd deploy
  docker compose up -d --build
  log "↩️  Retour à $PREVIOUS_COMMIT"
  exit 1
fi
