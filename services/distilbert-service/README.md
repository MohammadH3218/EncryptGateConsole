# EncryptGate DistilBERT Phishing Detection Service

FastAPI microservice for email phishing detection using the **cybersectony/phishing-email-detection-distilbert_v2.4.1** model from Hugging Face.

## Overview

This service provides real-time phishing detection for emails using a fine-tuned DistilBERT model. It's designed to run as a private microservice accessible only within your AWS VPC.

## Features

- **High-Performance Detection**: DistilBERT-based multilabel classification
- **REST API**: Simple POST endpoint for predictions
- **Docker Support**: Containerized deployment
- **Health Checks**: Built-in health monitoring endpoints
- **GPU Support**: Automatic GPU detection and usage (falls back to CPU)
- **Comprehensive Logging**: Detailed request/response logging

## API Endpoints

### `POST /predict`

Analyze an email for phishing indicators.

**Request Body:**
```json
{
  "subject": "Urgent: Verify your account",
  "body": "Click here to verify your account immediately...",
  "urls": ["https://suspicious-domain.com/verify"]
}
```

**Response:**
```json
{
  "model_version": "cybersectony/phishing-email-detection-distilbert_v2.4.1",
  "labels": [
    {"label": "phishing_url", "score": 0.91},
    {"label": "legitimate_email", "score": 0.04},
    {"label": "spam", "score": 0.03}
  ],
  "phish_score": 0.91,
  "processing_time_ms": 45.23,
  "device_used": "cuda:0"
}
```

### `GET /health`

Health check endpoint for monitoring.

**Response:**
```json
{
  "status": "healthy",
  "model_loaded": true,
  "device": "cuda:0",
  "model_version": "cybersectony/phishing-email-detection-distilbert_v2.4.1",
  "timestamp": "2025-12-12T10:30:00.000Z"
}
```

### `GET /model-info`

Get detailed model configuration and metadata.

## Local Development

### Prerequisites

- Python 3.11+
- Docker (optional, recommended)
- 4GB+ RAM

### Setup with Python Virtual Environment

```bash
cd services/distilbert-service

# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Activate (Linux/Mac)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the service
python main.py
```

The service will be available at `http://localhost:8000`

### Setup with Docker

```bash
cd services/distilbert-service

# Build image
docker build -t encryptgate-distilbert:latest .

# Run container
docker run -d \
  --name encryptgate-distilbert \
  -p 8000:8000 \
  --restart unless-stopped \
  encryptgate-distilbert:latest
```

Or use docker-compose:

```bash
docker-compose up -d
```

### Test the Service

```bash
# Health check
curl http://localhost:8000/health

# Test prediction
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Urgent: Account Verification Required",
    "body": "Your account will be suspended. Click here to verify immediately.",
    "urls": ["https://fake-bank.com/verify"]
  }'
```

## EC2 Deployment

### Step 1: Launch EC2 Instance

1. **Instance Type**: `t3.medium` (2 vCPU, 4GB RAM) or larger
2. **AMI**: Ubuntu Server 22.04 LTS
3. **Security Group**: Create with the following rules:
   - **Inbound**: Port 8000 from your Next.js app server security group (NOT public)
   - **Outbound**: Allow HTTPS (443) for downloading model from Hugging Face

### Step 2: Install Docker on EC2

```bash
# SSH into EC2 instance
ssh -i your-key.pem ubuntu@<EC2-IP>

# Update packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add ubuntu user to docker group
sudo usermod -aG docker ubuntu

# Install docker-compose
sudo apt install docker-compose -y

# Verify installation
docker --version
docker-compose --version

# Log out and back in for group changes to take effect
exit
ssh -i your-key.pem ubuntu@<EC2-IP>
```

### Step 3: Deploy the Service

```bash
# Create app directory
mkdir -p ~/encryptgate-distilbert
cd ~/encryptgate-distilbert

# Copy files (use SCP, git, or paste manually)
# You need: main.py, requirements.txt, Dockerfile, docker-compose.yml

# Option A: Clone from your repository
git clone <your-repo-url> .

# Option B: Use SCP to copy files
# (from your local machine)
scp -i your-key.pem -r services/distilbert-service/* ubuntu@<EC2-IP>:~/encryptgate-distilbert/

# Build and run with docker-compose
docker-compose up -d

# Check logs
docker-compose logs -f

# Verify service is running
curl http://localhost:8000/health
```

### Step 4: Configure Autostart

Create a systemd service for automatic restart on reboot:

```bash
sudo nano /etc/systemd/system/distilbert.service
```

Add the following content:

```ini
[Unit]
Description=EncryptGate DistilBERT Service
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/ubuntu/encryptgate-distilbert
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
User=ubuntu

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable distilbert.service
sudo systemctl start distilbert.service
sudo systemctl status distilbert.service
```

### Step 5: Update Next.js Environment Variables

Add to your Next.js `.env` or AWS Parameter Store:

```bash
# Private IP of EC2 instance (not public IP)
DISTILBERT_URL=http://10.0.1.50:8000/predict

# Or use private DNS name if configured
DISTILBERT_URL=http://ip-10-0-1-50.ec2.internal:8000/predict
```

**Important**: Use the **private IP** or **private DNS** for VPC-internal communication.

## Security Considerations

1. **Network Isolation**:
   - Deploy in private subnet or restrict security group to your app server
   - DO NOT expose port 8000 to the public internet

2. **VPC Configuration**:
   - Ensure EC2 instance can reach internet for model downloads (NAT Gateway or public subnet during setup)
   - After initial setup, can move to fully private subnet

3. **Authentication** (Optional):
   - Add API key authentication in production
   - Use AWS IAM roles for service-to-service authentication

## Performance Tuning

### CPU-Only Optimization

If not using GPU, set worker count based on CPU cores:

```yaml
# docker-compose.yml
command: ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

### GPU Support

For GPU instances (e.g., g4dn.xlarge):

1. Install NVIDIA Docker runtime:
```bash
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list

sudo apt-get update && sudo apt-get install -y nvidia-docker2
sudo systemctl restart docker
```

2. Update docker-compose.yml:
```yaml
services:
  distilbert-service:
    runtime: nvidia
    environment:
      - NVIDIA_VISIBLE_DEVICES=all
```

## Monitoring

### Health Checks

```bash
# Basic health check
curl http://<EC2-IP>:8000/health

# Detailed model info
curl http://<EC2-IP>:8000/model-info
```

### View Logs

```bash
# Real-time logs
docker-compose logs -f

# Last 100 lines
docker-compose logs --tail=100

# Logs for specific container
docker logs encryptgate-distilbert
```

### CloudWatch Integration (Optional)

Install CloudWatch agent to send logs:

```bash
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i -E ./amazon-cloudwatch-agent.deb

# Configure to send Docker logs to CloudWatch
```

## Troubleshooting

### Model Download Issues

If model fails to download from Hugging Face:

```bash
# Check internet connectivity
curl -I https://huggingface.co

# Manual model download (run inside container)
docker exec -it encryptgate-distilbert python -c "from transformers import AutoTokenizer, AutoModelForSequenceClassification; AutoTokenizer.from_pretrained('cybersectony/phishing-email-detection-distilbert_v2.4.1'); AutoModelForSequenceClassification.from_pretrained('cybersectony/phishing-email-detection-distilbert_v2.4.1')"
```

### Memory Issues

If container crashes due to OOM:

1. Increase EC2 instance size (minimum 4GB RAM recommended)
2. Reduce worker count to 1
3. Add swap space:
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Connection Refused from Next.js

1. Verify service is running: `curl http://localhost:8000/health`
2. Check security group allows inbound from app server
3. Verify using private IP, not public IP
4. Test from Next.js EC2: `curl http://<PRIVATE-IP>:8000/health`

## Scaling

For high-volume deployments:

1. **Multiple Replicas**: Run multiple containers behind a load balancer
2. **Auto Scaling**: Use AWS Auto Scaling Group with ALB
3. **Caching**: Add Redis cache for frequently seen emails
4. **Batch Processing**: Implement batch prediction endpoint

## Model Updates

To update to a newer model version:

1. Update `MODEL_NAME` in `main.py`
2. Rebuild Docker image: `docker-compose build`
3. Restart service: `docker-compose up -d`
4. Monitor logs for successful model loading

## Support

For issues or questions:
- Check logs: `docker-compose logs -f`
- Test health endpoint: `curl http://localhost:8000/health`
- Verify model loading in startup logs

## License

Internal use for EncryptGate platform.
