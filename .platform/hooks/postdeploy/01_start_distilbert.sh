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

echo "Waiting for DistilBERT to start (model download may take 60-90s)..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  sleep 3
  RETRY_COUNT=$((RETRY_COUNT + 1))

  if curl -sf http://127.0.0.1:8001/health > /dev/null 2>&1; then
    echo "DistilBERT health check passed on attempt $RETRY_COUNT"
    echo "DistilBERT started successfully"
    exit 0
  fi

  echo "Health check attempt $RETRY_COUNT/$MAX_RETRIES failed, retrying..."
done

echo "WARNING: DistilBERT health check failed after $MAX_RETRIES attempts"
echo "Container is running but may still be loading the model"
echo "Check container logs: docker logs encryptgate-distilbert"
exit 0

