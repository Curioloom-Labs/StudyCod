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
node "$ROOT/ops/assert-queue-drained.mjs"
# Stop admission before the final check: a request arriving between a check and
# replacement must not leave an accepted job behind an incompatible backend.
pm2 stop studycod-backend
if ! node "$ROOT/ops/assert-queue-drained.mjs"; then
  pm2 restart studycod-backend --update-env
  echo "Rollback deferred; compatible backend resumed to finish accepted work." >&2
  exit 4
fi
trap 'pm2 restart studycod-backend --update-env >/dev/null 2>&1 || true' ERR

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

if [[ "${EUID}" -eq 0 && -d "$backup/privileged-judge" ]]; then
  exec 9>/run/lock/studycod-judge.lock
  flock 9
  rm -rf /usr/local/lib/studycod-judge
  cp -a "$backup/privileged-judge" /usr/local/lib/studycod-judge
  [[ ! -f "$backup/privileged-wrapper" ]] || cp -a "$backup/privileged-wrapper" /usr/local/sbin/studycod-judge-worker
  [[ -f /usr/local/lib/studycod-judge/judge-cache-maintenance.py ]] || systemctl disable --now studycod-judge-cache.timer
  flock -u 9
fi

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
trap - ERR
