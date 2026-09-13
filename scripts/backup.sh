#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Sauvegarde de l'état d'Anime Notif : fichiers + volumes Docker.
# Le backup est chiffré avec age avant d'être stocké.
#
# Usage : ./scripts/backup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT_ROOT="$(pwd)"

# ── Configuration ────────────────────────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_NAME="anime-notif_${TIMESTAMP}"
WORK_DIR="/tmp/${BACKUP_NAME}"

# Clé publique age pour chiffrer (récupère-la depuis ~/.config/sops/age/keys.txt)
AGE_PUBLIC_KEY="${AGE_PUBLIC_KEY:-age1taeuuvysdpgy9lccadwl0g45qfjvcqp5dsfjn6pxkfufkuutf9ts9valqt}"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

if [ -z "$AGE_PUBLIC_KEY" ]; then
  echo "FATAL: AGE_PUBLIC_KEY non défini (clé publique age pour chiffrer)"
  exit 1
fi

mkdir -p "$BACKUP_DIR" "$WORK_DIR"

# ── 1. Sauvegarder subscriptions.json ────────────────────────────────────────
log "Sauvegarde de subscriptions.json..."
cp "$PROJECT_ROOT/data/subscriptions.json" "$WORK_DIR/subscriptions.json"

# ── 2. Sauvegarder les volumes Docker ────────────────────────────────────────
# On lance un conteneur temporaire qui monte le volume et l'archive.
backup_volume() {
  local volume=$1
  local output=$2
  log "Sauvegarde du volume $volume..."
  docker run --rm \
    -v "${volume}:/source:ro" \
    -v "${WORK_DIR}:/backup" \
    alpine tar czf "/backup/${output}" -C /source . 2>/dev/null || \
    log "  (volume $volume absent ou vide, ignoré)"
}

backup_volume "anime-notif_grafana-data" "grafana-data.tar.gz"
backup_volume "anime-notif_prometheus-data" "prometheus-data.tar.gz"

# Uptime Kuma stocke ses données dans data/uptime-kuma (bind mount)
if [ -d "$PROJECT_ROOT/data/uptime-kuma" ]; then
  log "Sauvegarde d'Uptime Kuma..."
  tar czf "$WORK_DIR/uptime-kuma.tar.gz" -C "$PROJECT_ROOT/data" uptime-kuma
fi

# ── 3. Archiver le tout ──────────────────────────────────────────────────────
log "Création de l'archive..."
tar czf "/tmp/${BACKUP_NAME}.tar.gz" -C /tmp "$BACKUP_NAME"

# ── 4. Chiffrer avec age ─────────────────────────────────────────────────────
log "Chiffrement..."
age --encrypt --recipient "$AGE_PUBLIC_KEY" \
  --output "$BACKUP_DIR/${BACKUP_NAME}.tar.gz.age" \
  "/tmp/${BACKUP_NAME}.tar.gz"

# ── 5. Nettoyer les fichiers temporaires en clair ────────────────────────────
rm -rf "$WORK_DIR" "/tmp/${BACKUP_NAME}.tar.gz"

# ── 6. Rotation : garder les 7 dernières sauvegardes ─────────────────────────
log "Rotation des anciennes sauvegardes..."
ls -t "$BACKUP_DIR"/anime-notif_*.tar.gz.age 2>/dev/null | tail -n +8 | xargs -r rm --

log "✅ Sauvegarde terminée : $BACKUP_DIR/${BACKUP_NAME}.tar.gz.age"
log "   Taille : $(du -h "$BACKUP_DIR/${BACKUP_NAME}.tar.gz.age" | cut -f1)"
