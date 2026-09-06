#!/usr/bin/env bash
# Pulls the latest backend/frontend release artifacts (built by
# .github/workflows/release.yml) and installs them — no npm ci/nx build on this box.
#
# One-time prerequisites on the server:
#   - node, npm (matching the version release.yml builds with)
#   - curl and jq (both packaged for every mainstream distro
#   - Caddy installed (https://caddyserver.com/) with deploy/Caddyfile copied to
#     /etc/caddy/Caddyfile, and `systemctl enable --now caddy`
#   - deploy/webcutter-backend.service copied to /etc/systemd/system/, then:
#       sudo systemctl daemon-reload && sudo systemctl enable webcutter-backend
#   - a `webcutter` system user, in the `dialout` group, owning /opt/webcutter
set -euo pipefail

REPO="bchanudet/webcutter"
INSTALL_ROOT="/opt/webcutter"
BACKEND_DIR="$INSTALL_ROOT/backend"
FRONTEND_DIR="$INSTALL_ROOT/frontend"
DATA_DIR="$INSTALL_ROOT/data"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "==> Fetching latest release metadata for $REPO"
RELEASE_JSON="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest")"
TAG="$(echo "$RELEASE_JSON" | jq -r '.tag_name')"
echo "==> Latest release: $TAG"

for asset in backend-dist.tar.gz frontend-dist.tar.gz; do
  url="$(echo "$RELEASE_JSON" | jq -r --arg name "$asset" '.assets[] | select(.name == $name) | .browser_download_url')"
  if [[ -z "$url" || "$url" == "null" ]]; then
    echo "Asset $asset not found in release $TAG" >&2
    exit 1
  fi
  curl -fsSL -o "$WORKDIR/$asset" "$url"
done

mkdir -p "$DATA_DIR"

echo "==> Deploying backend"
sudo systemctl stop webcutter-backend
rm -rf "$BACKEND_DIR"
mkdir -p "$BACKEND_DIR"
tar xzf "$WORKDIR/backend-dist.tar.gz" -C "$BACKEND_DIR"
(cd "$BACKEND_DIR" && npm ci --omit=dev)
sudo chown -R webcutter:webcutter "$BACKEND_DIR" "$DATA_DIR"
sudo systemctl start webcutter-backend

echo "==> Deploying frontend"
rm -rf "$FRONTEND_DIR"
mkdir -p "$FRONTEND_DIR"
tar xzf "$WORKDIR/frontend-dist.tar.gz" -C "$FRONTEND_DIR"

echo "==> Reloading Caddy"
sudo systemctl reload caddy

echo "==> Done"
sudo systemctl status --no-pager webcutter-backend | head -5
