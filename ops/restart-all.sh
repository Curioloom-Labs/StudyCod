#!/usr/bin/env bash
set -Eeuo pipefail

# Safe application deploy helper. It deliberately builds while the current
# processes keep serving traffic, then uses PM2 reload/restart only after all
# artifacts are ready. The frontend is switched through an Nginx-facing
# symlink so a partial Vite output is never visible to users.

ROOT="${ROOT:-/var/www/studycod}"
NODE_ROOT="${NODE_ROOT:-/opt/nodejs/current}"
BUILD_BACKEND="${BUILD_BACKEND:-1}"
BUILD_JUDGE="${BUILD_JUDGE:-1}"
BUILD_AI_SERVICE="${BUILD_AI_SERVICE:-1}"
BUILD_LSP_SERVICE="${BUILD_LSP_SERVICE:-1}"
BUILD_AI_WORKER="${BUILD_AI_WORKER:-0}"
BUILD_FRONTEND="${BUILD_FRONTEND:-1}"
PM2_TARGET="${PM2_TARGET:-all}"
KEEP_BACKUPS="${KEEP_BACKUPS:-5}"

export PATH="$NODE_ROOT/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

log() { printf '\n[%s] %s\n' "$(date +'%F %T')" "$*"; }
need_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 127; }; }

check_node() {
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if [[ "$major" -lt 22 ]]; then
    echo "Node.js 22+ required for deploys (found $(node -v))" >&2
    exit 2
  fi
}

update_repo() {
  [[ -d "$ROOT/.git" ]] || { echo "Git repository not found in ROOT: $ROOT" >&2; exit 2; }
  log "Updating repository in: $ROOT"
  (
    cd "$ROOT"
    git fetch --prune origin
    if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
      echo "Tracked local changes detected; refusing to overwrite them." >&2
      git status --short
      exit 3
    fi
    if git merge-base --is-ancestor HEAD origin/main; then
      git merge --ff-only origin/main
    elif git merge-base --is-ancestor origin/main HEAD; then
      echo "Local server integration is ahead of origin/main; preserving it."
    else
      git merge --no-edit origin/main
    fi
  )
}

npm_install() {
  if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
}

BACKUP_ROOT=""
FRONTEND_LIVE="$ROOT/frontend/.dist-live"

backup_dir() {
  local source="$1" name="$2"
  [[ -e "$source" ]] || return 0
  mkdir -p "$BACKUP_ROOT"
  cp -a "$source" "$BACKUP_ROOT/$name"
}

restore_dir() {
  local target="$1" backup="$2"
  [[ -e "$backup" ]] || return 0
  rm -rf "$target"
  cp -a "$backup" "$target"
}

restore_frontend() {
  local backup="$BACKUP_ROOT/frontend-dist"
  [[ -d "$backup" ]] || return 0
  local next="$ROOT/frontend/.dist-live.rollback"
  rm -f "$next"
  ln -s "$backup" "$next"
  mv -Tf "$next" "$FRONTEND_LIVE"
}

recover_on_error() {
  local code=$?
  if [[ "$code" -ne 0 && -n "$BACKUP_ROOT" ]]; then
    log "Deploy failed; restoring previous artifacts from $BACKUP_ROOT"
    restore_dir "$ROOT/backend/dist" "$BACKUP_ROOT/backend-dist"
    restore_dir "$ROOT/judge/dist" "$BACKUP_ROOT/judge-dist"
    restore_dir "$ROOT/lsp-service/dist" "$BACKUP_ROOT/lsp-dist"
    restore_frontend
    pm2 restart studycod-backend --update-env >/dev/null 2>&1 || true
    pm2 restart studycod-lsp --update-env >/dev/null 2>&1 || true
  fi
  exit "$code"
}

prune_backups() {
  local parent="$ROOT/.deploy-backups"
  [[ -d "$parent" ]] || return 0
  mapfile -t old < <(find "$parent" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r | tail -n +$((KEEP_BACKUPS + 1)))
  for name in "${old[@]}"; do
    [[ "$name" =~ ^[0-9]{8}T[0-9]{6}-[0-9]+$ ]] || continue
    rm -rf "$parent/$name"
  done
}

build_package() {
  local dir="$1"
  [[ -d "$dir" ]] || { echo "Directory not found: $dir" >&2; exit 2; }
  log "Installing and building: $dir"
  (
    cd "$dir"
    npm_install
    npm run build
  )
}

build_frontend_release() {
  local dir="$ROOT/frontend"
  local release="$ROOT/.deploy-releases/frontend-$RELEASE_ID"
  mkdir -p "$ROOT/.deploy-releases"
  rm -rf "$release"
  log "Installing and building frontend release: $release"
  (
    cd "$dir"
    npm_install
    STUDYCOD_BUILD_OUT_DIR="$release" npm run build
  )
  [[ -f "$release/index.html" ]] || { echo "Frontend release is missing index.html" >&2; exit 5; }
  local next="$ROOT/frontend/.dist-live.next"
  rm -f "$next"
  ln -s "$release" "$next"
  mv -Tf "$next" "$FRONTEND_LIVE"
}

wait_ready() {
  for attempt in $(seq 1 30); do
    if curl --fail --silent --show-error --max-time 5 http://127.0.0.1:4000/ready >/tmp/studycod-ready-deploy.json; then
      cat /tmp/studycod-ready-deploy.json
      return 0
    fi
    sleep 2
  done
  echo "Backend readiness failed after PM2 reload" >&2
  pm2 status || true
  pm2 logs studycod-backend --err --lines 80 --nostream || true
  return 4
}

main() {
  need_cmd git
  need_cmd node
  need_cmd npm
  need_cmd pm2
  need_cmd curl
  [[ -d "$ROOT" ]] || { echo "ROOT not found: $ROOT" >&2; exit 2; }
  need_cmd flock
  exec 9>"$ROOT/.deploy.lock"
  flock -n 9 || { echo "Another deploy is already running." >&2; exit 10; }
  check_node
  update_repo

  RELEASE_ID="$(date +%Y%m%dT%H%M%S)-$$"
  BACKUP_ROOT="$ROOT/.deploy-backups/$RELEASE_ID"
  mkdir -p "$BACKUP_ROOT"
  trap recover_on_error EXIT

  backup_dir "$ROOT/backend/dist" backend-dist
  backup_dir "$ROOT/judge/dist" judge-dist
  backup_dir "$ROOT/lsp-service/dist" lsp-dist
  if [[ -L "$FRONTEND_LIVE" || -d "$FRONTEND_LIVE" ]]; then
    backup_dir "$(readlink -f "$FRONTEND_LIVE")" frontend-dist
  elif [[ -d "$ROOT/frontend/dist" ]]; then
    backup_dir "$ROOT/frontend/dist" frontend-dist
  fi

  [[ "$BUILD_BACKEND" == "1" ]] && build_package "$ROOT/backend"
  [[ "$BUILD_JUDGE" == "1" ]] && build_package "$ROOT/judge"
  [[ "$BUILD_AI_SERVICE" == "1" && -d "$ROOT/ai-service" ]] && build_package "$ROOT/ai-service"
  [[ "$BUILD_AI_WORKER" == "1" && -d "$ROOT/ai-service/cloudflare-ai-worker" ]] && build_package "$ROOT/ai-service/cloudflare-ai-worker"
  [[ "$BUILD_FRONTEND" == "1" && -d "$ROOT/frontend" ]] && build_frontend_release

  log "Reloading PM2 applications"
  if [[ "$BUILD_BACKEND" == "1" ]]; then pm2 reload studycod-backend --update-env; fi
  if [[ "$BUILD_LSP_SERVICE" == "1" ]]; then pm2 restart studycod-lsp --update-env; fi
  wait_ready
  prune_backups
  trap - EXIT
  log "Deploy complete: $RELEASE_ID"
}

main "$@"
