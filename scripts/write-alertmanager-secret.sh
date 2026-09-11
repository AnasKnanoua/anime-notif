#!/usr/bin/env bash
set -euo pipefail

SECRETS_DIR="${1:-./data/alertmanager}"
mkdir -p "$SECRETS_DIR"

if [ -z "${DEFAULT_DISCORD_WEBHOOK:-}" ]; then
  echo "FATAL: DEFAULT_DISCORD_WEBHOOK non défini"
  exit 1
fi

echo -n "$DEFAULT_DISCORD_WEBHOOK" > "$SECRETS_DIR/discord-webhook.txt"
chmod 600 "$SECRETS_DIR/discord-webhook.txt"
echo "Secret Alertmanager écrit dans $SECRETS_DIR"
