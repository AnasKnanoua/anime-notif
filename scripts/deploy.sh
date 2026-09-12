#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Déploiement de production avec rollback automatique.
#
# Usage : depuis la racine du projet, ./scripts/deploy.sh
#
# Le staging se teste séparément et à la demande (voir README).
# Ce script ne gère QUE la production :
#   1. sauvegarde le commit actuel
#   2. récupère le nouveau code
#   3. déploie
#   4. vérifie que le service web devient healthy
#   5. revient automatiquement en arrière si ça échoue
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."   # se placer à la racine du projet

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# ── 1. Sauvegarder le commit actuel (pour rollback) ──────────────────────────
PREVIOUS_COMMIT=$(git rev-parse HEAD)
log "Commit actuel sauvegardé : $PREVIOUS_COMMIT"

# ── 2. Récupérer le nouveau code ─────────────────────────────────────────────
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

# ── 3. Déployer la production ────────────────────────────────────────────────
cd deploy
docker compose up -d --build

# ── 4. Vérifier que le web devient healthy ───────────────────────────────────
log "Vérification de la santé du service..."
HEALTHY=false
for i in $(seq 1 30); do
  status=$(docker inspect --format='{{.State.Health.Status}}' anime-notif-web 2>/dev/null || echo "starting")
  log "Tentative $i : $status"
  if [ "$status" = "healthy" ]; then
    HEALTHY=true
    break
  fi
  sleep 3
done

# ── 5. Rollback automatique si échec ─────────────────────────────────────────
if [ "$HEALTHY" = "true" ]; then
  log "✅ Déploiement réussi — service healthy"
else
  log "❌ Le service n'est pas devenu healthy — ROLLBACK en cours"
  docker compose logs --tail 30 web
  cd ..
  git checkout "$PREVIOUS_COMMIT"
  cd deploy
  docker compose up -d --build
  log "↩️  Retour à la version précédente : $PREVIOUS_COMMIT"
  exit 1
fi
