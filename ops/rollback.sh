#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${ROOT:-/var/www/studycod}"
BACKUP_ROOT_BASE="$ROOT/.deploy-backups"
NODE_ROOT="${NODE_ROOT:-/opt/nodejs/current}"
export PATH="$NODE_ROOT/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

log() { printf '\n[%s] %s\n' "$(date +'%F %T')" "$*"; }

target="${1:-latest}"
if [[ "$target" == "latest" ]]; then
  target="$(find "$BACKUP_ROOT_BASE" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r | head -n 1)"
fi
[[ "$target" =~ ^[0-9]{8}T[0-9]{6}-[0-9]+$ ]] || { echo "Invalid rollback id: $target" >&2; exit 2; }
backup="$BACKUP_ROOT_BASE/$target"
[[ -d "$backup" ]] || { echo "Rollback backup not found: $backup" >&2; exit 3; }

for pair in \
  "$ROOT/backend/dist|$backup/backend-dist" \
  "$ROOT/judge/dist|$backup/judge-dist" \
  "$ROOT/lsp-service/dist|$backup/lsp-dist"; do
  target_path="${pair%%|*}"
  backup_path="${pair#*|}"
  if [[ -d "$backup_path" ]]; then
    rm -rf "$target_path"
    cp -a "$backup_path" "$target_path"
  fi
done

if [[ -d "$backup/frontend-dist" ]]; then
  next="$ROOT/frontend/.dist-live.rollback"
  rm -f "$next"
  ln -s "$backup/frontend-dist" "$next"
  mv -Tf "$next" "$ROOT/frontend/.dist-live"
fi

log "Restarting applications after rollback: $target"
pm2 restart studycod-backend --update-env
pm2 restart studycod-lsp --update-env
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:4000/ready
log "Rollback complete"
