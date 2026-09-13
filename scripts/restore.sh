#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Restauration d'une sauvegarde Anime Notif.
#
# Usage : ./scripts/restore.sh <chemin-vers-backup.tar.gz.age>
#
# ⚠️  Écrase les données actuelles. À utiliser avec précaution.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT_ROOT="$(pwd)"

BACKUP_FILE="${1:-}"
AGE_KEY_FILE="${AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "Usage: $0 <chemin-vers-backup.tar.gz.age>"
  exit 1
fi

RESTORE_DIR="/tmp/restore_$$"
mkdir -p "$RESTORE_DIR"

# ── 1. Déchiffrer ────────────────────────────────────────────────────────────
log "Déchiffrement..."
age --decrypt --identity "$AGE_KEY_FILE" \
  --output "$RESTORE_DIR/backup.tar.gz" \
  "$BACKUP_FILE"

# ── 2. Extraire ──────────────────────────────────────────────────────────────
log "Extraction..."
tar xzf "$RESTORE_DIR/backup.tar.gz" -C "$RESTORE_DIR"
EXTRACTED=$(ls -d "$RESTORE_DIR"/anime-notif_* | head -1)

# ── 3. Afficher ce qui va être restauré (dry-run visuel) ─────────────────────
log "Contenu de la sauvegarde :"
ls -la "$EXTRACTED"

echo ""
read -p "⚠️  Restaurer et ÉCRASER les données actuelles ? (oui/non) " confirm
if [ "$confirm" != "oui" ]; then
  log "Restauration annulée."
  rm -rf "$RESTORE_DIR"
  exit 0
fi

# ── 4. Restaurer subscriptions.json ──────────────────────────────────────────
if [ -f "$EXTRACTED/subscriptions.json" ]; then
  log "Restauration de subscriptions.json..."
  cp "$EXTRACTED/subscriptions.json" "$PROJECT_ROOT/data/subscriptions.json"
  sudo chown 1000:1001 "$PROJECT_ROOT/data/subscriptions.json"
fi

# ── 5. Restaurer Uptime Kuma ─────────────────────────────────────────────────
if [ -f "$EXTRACTED/uptime-kuma.tar.gz" ]; then
  log "Restauration d'Uptime Kuma..."
  sudo tar xzf "$EXTRACTED/uptime-kuma.tar.gz" -C "$PROJECT_ROOT/data" --no-same-owner
fi

# ── 6. Restaurer les volumes Docker ──────────────────────────────────────────
restore_volume() {
  local archive=$1
  local volume=$2
  if [ -f "$EXTRACTED/$archive" ]; then
    log "Restauration du volume $volume..."
    docker run --rm \
      -v "${volume}:/target" \
      -v "${EXTRACTED}:/backup:ro" \
      alpine sh -c "rm -rf /target/* && tar xzf /backup/$archive -C /target"
  fi
}

restore_volume "grafana-data.tar.gz" "anime-notif_grafana-data"
restore_volume "prometheus-data.tar.gz" "anime-notif_prometheus-data"

# ── 7. Nettoyer ──────────────────────────────────────────────────────────────
rm -rf "$RESTORE_DIR"

log "✅ Restauration terminée. Redémarre la stack :"
log "   cd deploy && docker compose restart"
