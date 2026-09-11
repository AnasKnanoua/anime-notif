#!/usr/bin/env bash
# Déploiement sûr avec rollback automatique en cas d'échec.
set -euo pipefail

cd "$(dirname "$0")/.."   # se place à la racine du projet

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# ── 1. Sauvegarder le commit actuel (pour rollback) ──────────────────
PREVIOUS_COMMIT=$(git rev-parse HEAD)
log "Commit actuel sauvegardé : $PREVIOUS_COMMIT"

# ── 2. Récupérer le nouveau code ─────────────────────────────────────
log "Récupération du nouveau code..."
git fetch origin main
git checkout main
git pull origin main
NEW_COMMIT=$(git rev-parse HEAD)

if [ "$PREVIOUS_COMMIT" = "$NEW_COMMIT" ]; then
  log "Aucun changement à déployer."
  exit 0
fi

log "Déploiement de $NEW_COMMIT"

# ── 3. Déployer ──────────────────────────────────────────────────────
cd deploy
docker compose up -d --build

# ── 4. Vérifier que le web est healthy ──────────────────────────────
log "Vérification de la santé du service..."
HEALTHY=false
for i in $(seq 1 30); do
  status=$(docker inspect --format='{{.State.Health.Status}}' anime-notif-web 2>/dev/null || echo "starting")
  if [ "$status" = "healthy" ]; then
    HEALTHY=true
    break
  fi
  sleep 3
done

# ── 5. Rollback si échec ─────────────────────────────────────────────
if [ "$HEALTHY" = "true" ]; then
  log "✅ Déploiement réussi — service healthy"
else
  log "❌ Le service n'est pas healthy — ROLLBACK en cours"
  cd ..
  git checkout "$PREVIOUS_COMMIT"
  cd deploy
  docker compose up -d --build
  log "↩️  Retour à la version précédente : $PREVIOUS_COMMIT"
  exit 1
fi
