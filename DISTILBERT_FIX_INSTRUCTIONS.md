# DistilBERT Service Fix - Step by Step Instructions

## Prerequisites
- SSH access to EC2 instance
- Your EC2 key pair file (.pem)

## Step 1: Get SSH Connection Details

**IMPORTANT:** DistilBERT is NOT on a separate EC2 instance. It's deployed on your **Elastic Beanstalk instance**.

**Instance Details:**
- Instance ID: `i-0500c7231a7015669` (This is your Elastic Beanstalk instance - "EncryptGateC..." in your EC2 console)
- Public IP: `54.159.216.184`
- Private IP: `172.31.76.196`
- User: `ec2-user` (Amazon Linux)

**SSH Command:**
```bash
ssh -i /path/to/your-key.pem ec2-user@54.159.216.184
```
(Replace `/path/to/your-key.pem` with your actual key file path)

**Note:** If you don't have SSH access set up, you can use AWS Systems Manager Session Manager instead:
```bash
aws ssm start-session --region us-east-1 --target i-0500c7231a7015669
```

---

## Step 2: Navigate to DistilBERT Directory

Once connected via SSH, run:
```bash
cd /opt/encryptgate/distilbert
ls -la
```

You should see:
- Dockerfile
- main.py
- requirements.txt
- docker-compose.yml

---

## Step 3: Check Disk Space

```bash
df -h
```

If disk usage is above 80%, proceed to Step 4. Otherwise, skip to Step 5.

---

## Step 4: Clean Up Docker (Free Space)

```bash
# Stop any running containers
docker stop encryptgate-distilbert 2>/dev/null || true
docker rm encryptgate-distilbert 2>/dev/null || true

# Remove old images
docker rmi encryptgate-distilbert:latest 2>/dev/null || true

# Clean up Docker system (removes unused images, containers, volumes)
docker system prune -af

# Check space again
df -h
```

---

## Step 5: Update Dockerfile for CPU-Only PyTorch

Edit the Dockerfile to use CPU-only PyTorch (much smaller):

```bash
cat > Dockerfile << 'EOF'
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y gcc g++ curl && rm -rf /var/lib/apt/lists/*

# Install Python dependencies (CPU-only PyTorch to save space)
RUN pip install --no-cache-dir fastapi==0.104.1 "uvicorn[standard]==0.24.0" transformers==4.35.0 pydantic==2.5.0 python-multipart==0.0.6

# Install CPU-only PyTorch (much smaller than CUDA version)
RUN pip install --no-cache-dir torch==2.1.0 --index-url https://download.pytorch.org/whl/cpu

# Copy application code
COPY main.py .

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
EOF
```

Verify the file was created correctly:
```bash
cat Dockerfile
```

---

## Step 6: Build the Docker Image

**Important:** This will take 5-10 minutes as it downloads the model.

```bash
# Build the image (this takes time - be patient!)
docker build -t encryptgate-distilbert:latest .

# Watch the build progress - you'll see it downloading packages and the model
```

**Note:** If you get "No space left on device" error:
- Run Step 4 again (cleanup)
- Or increase the EC2 instance storage size

---

## Step 7: Start the Container on Port 8001

```bash
# Stop any existing container
docker stop encryptgate-distilbert 2>/dev/null || true
docker rm encryptgate-distilbert 2>/dev/null || true

# Start the container (mapping host port 8001 to container port 8000)
docker run -d \
  --name encryptgate-distilbert \
  -p 8001:8000 \
  --restart unless-stopped \
  -e PYTHONUNBUFFERED=1 \
  encryptgate-distilbert:latest
```

---

## Step 8: Verify the Service is Running

```bash
# Check if container is running
docker ps | grep distilbert

# Check container logs
docker logs encryptgate-distilbert

# Wait a moment for the model to load, then test health endpoint
sleep 10
curl http://localhost:8001/health

# You should see a JSON response like:
# {"status":"healthy","model":"cybersectony/phishing-email-detection-distilbert_v2.4.1",...}
```

---

## Step 9: Test the Prediction Endpoint

```bash
curl -X POST http://localhost:8001/predict \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Test email",
    "body": "This is a test email body",
    "urls": []
  }'
```

You should get a JSON response with prediction results.

---

## Step 10: Set Up Auto-Start (Optional but Recommended)

Create a systemd service so it starts automatically on reboot:

```bash
sudo nano /etc/systemd/system/distilbert.service
```

Paste this content:
```ini
[Unit]
Description=EncryptGate DistilBERT Service
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/docker start encryptgate-distilbert
ExecStop=/usr/bin/docker stop encryptgate-distilbert
User=root

[Install]
WantedBy=multi-user.target
```

Save and exit (Ctrl+X, then Y, then Enter).

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable distilbert.service
sudo systemctl start distilbert.service
sudo systemctl status distilbert.service
```

---

## Step 11: Update Application Configuration

The DistilBERT service is now running at:
- **URL:** `http://172.31.76.196:8001/predict`
- **Health Check:** `http://172.31.76.196:8001/health`

You need to update your application's environment variables or configuration to point to this URL.

**For AWS Parameter Store:**
```bash
aws ssm put-parameter \
  --region us-east-1 \
  --name "/encryptgate/distilbert-url" \
  --value "http://172.31.76.196:8001/predict" \
  --type "String" \
  --overwrite
```

**Or update your `.env` file:**
```
DISTILBERT_URL=http://172.31.76.196:8001/predict
```

---

## Troubleshooting

### Container won't start
```bash
# Check logs
docker logs encryptgate-distilbert

# Check if port 8001 is already in use
netstat -tuln | grep 8001
```

### Service not responding
```bash
# Check if container is running
docker ps -a | grep distilbert

# Restart the container
docker restart encryptgate-distilbert

# Check logs for errors
docker logs -f encryptgate-distilbert
```

### Out of disk space
```bash
# Clean up more aggressively
docker system prune -af --volumes

# Check what's using space
du -sh /var/lib/docker/*
df -h
```

### Model download is slow
- This is normal - the model is ~500MB
- Be patient, it only downloads once during build
- Check internet connectivity: `curl -I https://huggingface.co`

---

## Verification Checklist

- [ ] SSH connection successful
- [ ] Navigated to `/opt/encryptgate/distilbert`
- [ ] Disk space cleaned up
- [ ] Dockerfile updated with CPU-only PyTorch
- [ ] Docker image built successfully
- [ ] Container running on port 8001
- [ ] Health endpoint responds: `curl http://localhost:8001/health`
- [ ] Prediction endpoint works: `curl -X POST http://localhost:8001/predict ...`
- [ ] Application configuration updated with new URL
- [ ] Auto-start service configured (optional)

---

## Service URLs

- **Health Check:** `http://172.31.76.196:8001/health`
- **Prediction:** `http://172.31.76.196:8001/predict`
- **Model Info:** `http://172.31.76.196:8001/model-info`

**Important:** Use the **private IP** (172.31.76.196) for VPC-internal communication, not the public IP.

---

## Next Steps

After completing these steps:
1. Test the service from your application
2. Monitor logs: `docker logs -f encryptgate-distilbert`
3. Set up CloudWatch logging if needed
4. Consider adding authentication for production use

