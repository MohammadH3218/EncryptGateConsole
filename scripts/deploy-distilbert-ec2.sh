#!/bin/bash
#
# Deploy DistilBERT Service to EC2
#
# This script:
# 1. Installs Docker
# 2. Deploys the DistilBERT FastAPI service
# 3. Configures it to run on port 8000
#

set -e

echo "======================================"
echo "DistilBERT EC2 Deployment"
echo "======================================"
echo ""

# Update system
echo "[1/6] Updating system packages..."
sudo yum update -y

# Install Docker
echo "[2/6] Installing Docker..."
sudo yum install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -a -G docker ec2-user

# Install Docker Compose
echo "[3/6] Installing Docker Compose..."
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Create application directory
echo "[4/6] Creating application directory..."
sudo mkdir -p /opt/encryptgate/distilbert
sudo chown ec2-user:ec2-user /opt/encryptgate/distilbert
cd /opt/encryptgate/distilbert

# Create DistilBERT service files
echo "[5/6] Creating DistilBERT service files..."

# Create Dockerfile
cat > Dockerfile <<'EOF'
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Download model on build (cached in image)
RUN python -c "from transformers import AutoTokenizer, AutoModelForSequenceClassification; \
    model_name='cybersectony/phishing-email-detection-distilbert_v2.4.1'; \
    AutoTokenizer.from_pretrained(model_name); \
    AutoModelForSequenceClassification.from_pretrained(model_name)"

# Copy application code
COPY main.py .

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
EOF

# Create requirements.txt
cat > requirements.txt <<'EOF'
fastapi==0.104.1
uvicorn[standard]==0.24.0
transformers==4.35.0
torch==2.1.0
pydantic==2.5.0
python-multipart==0.0.6
EOF

# Create main.py
cat > main.py <<'EOF'
"""
DistilBERT Phishing Detection Service
FastAPI microservice for email threat classification
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
import time
from typing import List, Dict

app = FastAPI(
    title="DistilBERT Phishing Detection API",
    description="Email phishing detection using fine-tuned DistilBERT",
    version="1.0.0"
)

# Model configuration
MODEL_NAME = "cybersectony/phishing-email-detection-distilbert_v2.4.1"

# Load model and tokenizer on startup
print(f"Loading model: {MODEL_NAME}")
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)

# Set device
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model.to(device)
model.eval()

print(f"Model loaded successfully on {device}")

class PredictionRequest(BaseModel):
    subject: str
    body: str
    urls: List[str] = []

class Label(BaseModel):
    label: str
    score: float

class PredictionResponse(BaseModel):
    model_version: str
    labels: List[Label]
    phish_score: float
    processing_time_ms: float
    device_used: str

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "model": MODEL_NAME,
        "device": str(device)
    }

@app.get("/model-info")
async def model_info():
    """Get model information"""
    return {
        "model_name": MODEL_NAME,
        "model_type": "DistilBERT",
        "task": "phishing-email-detection",
        "device": str(device),
        "labels": model.config.id2label
    }

@app.post("/predict", response_model=PredictionResponse)
async def predict_phishing(request: PredictionRequest):
    """
    Predict phishing probability for an email

    Combines subject, body, and URLs into a single text for classification
    """
    try:
        start_time = time.time()

        # Combine email components
        urls_text = " ".join(request.urls) if request.urls else ""
        email_text = f"Subject: {request.subject}\n\nBody: {request.body}\n\nURLs: {urls_text}".strip()

        # Tokenize
        inputs = tokenizer(
            email_text,
            return_tensors="pt",
            truncation=True,
            max_length=512,
            padding=True
        ).to(device)

        # Predict
        with torch.no_grad():
            outputs = model(**inputs)
            probabilities = torch.softmax(outputs.logits, dim=-1)

        # Get labels and scores
        probs = probabilities[0].cpu().numpy()
        labels = []

        for idx, prob in enumerate(probs):
            label_name = model.config.id2label.get(idx, f"label_{idx}")
            labels.append(Label(label=label_name, score=float(prob)))

        # Sort by score descending
        labels.sort(key=lambda x: x.score, reverse=True)

        # Compute phish score (probability of phishing class)
        # Assuming label 1 is phishing (adjust based on model config)
        phish_score = float(max(
            prob for idx, prob in enumerate(probs)
            if "phish" in model.config.id2label.get(idx, "").lower()
        )) if any("phish" in model.config.id2label.get(i, "").lower() for i in range(len(probs))) else float(probs[1] if len(probs) > 1 else 0)

        processing_time = (time.time() - start_time) * 1000  # ms

        return PredictionResponse(
            model_version=MODEL_NAME,
            labels=labels,
            phish_score=phish_score,
            processing_time_ms=processing_time,
            device_used=str(device)
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
EOF

# Create docker-compose.yml
cat > docker-compose.yml <<'EOF'
version: '3.8'

services:
  distilbert:
    build: .
    container_name: encryptgate-distilbert
    ports:
      - "8000:8000"
    restart: unless-stopped
    environment:
      - PYTHONUNBUFFERED=1
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
EOF

# Build and start the service
echo "[6/6] Building and starting DistilBERT service..."
echo "This may take 5-10 minutes (downloading model)..."

# Need to use sudo docker since we just added ec2-user to docker group
sudo docker-compose build
sudo docker-compose up -d

echo ""
echo "======================================"
echo "Deployment Complete!"
echo "======================================"
echo ""
echo "DistilBERT service is running on:"
echo "  - Local: http://localhost:8000"
echo "  - Private IP: http://172.31.76.196:8000"
echo ""
echo "Test the service:"
echo "  curl http://localhost:8000/health"
echo ""
echo "View logs:"
echo "  sudo docker-compose logs -f"
echo ""
echo "Update .env.local with:"
echo "  DISTILBERT_URL=http://172.31.76.196:8000/predict"
echo ""
