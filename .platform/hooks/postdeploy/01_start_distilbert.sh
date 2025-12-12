#!/usr/bin/env bash
set -euo pipefail

echo "Starting DistilBERT postdeploy hook..."

# Ensure Docker is installed
if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  dnf install -y docker
fi

systemctl enable docker
systemctl start docker

APP_DIR="/var/app/current"
SVC_DIR="$APP_DIR/services/distilbert-service"

if [ ! -d "$SVC_DIR" ]; then
  echo "DistilBERT service directory not found at $SVC_DIR"
  exit 0
fi

cd "$SVC_DIR"

echo "Building DistilBERT image..."
docker build -t encryptgate-distilbert:latest .

echo "Restarting DistilBERT container..."
docker stop encryptgate-distilbert 2>/dev/null || true
docker rm encryptgate-distilbert 2>/dev/null || true

docker run -d \
  --name encryptgate-distilbert \
  -p 8001:8000 \
  --restart unless-stopped \
  -e PYTHONUNBUFFERED=1 \
  encryptgate-distilbert:latest

sleep 5

curl -sf http://127.0.0.1:8001/health || {
  echo "DistilBERT health check failed"
  exit 1
}

echo "DistilBERT started successfully"

