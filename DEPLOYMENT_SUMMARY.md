# DistilBERT Deployment - Phase 3 & 4 Complete ✅

## What Was Completed

### ✅ Phase 3.1 - Postdeploy Hook Created
- **File:** `.platform/hooks/postdeploy/01_start_distilbert.sh`
- **Purpose:** Automatically starts DistilBERT container after each Elastic Beanstalk deployment
- **Location:** Will run on `/var/app/current/services/distilbert-service`

### ✅ Phase 3.2 - Dockerfile Updated
- **File:** `services/distilbert-service/Dockerfile`
- **Changes:**
  - Uses CPU-only PyTorch (much smaller, saves disk space)
  - Removed requirements.txt dependency (direct pip install)
  - Optimized for t3.small instance

### ✅ Phase 4 - Configuration
- **Parameter Store:** `/encryptgate/distilbert-url` = `http://127.0.0.1:8001/predict`
- **Elastic Beanstalk:** Environment variable `DISTILBERT_URL` will be set during deployment

## Next Steps - Deploy to Elastic Beanstalk

### Step 1: Wait for Environment to be Ready
The Elastic Beanstalk environment is currently updating (from Phase 1 & 2 changes). Wait until it shows **"Ready"** status before deploying.

### Step 2: Create Deployment Package

**Option A: Using AWS CLI (Recommended)**
```bash
# Create zip excluding unnecessary files
# (You can use the same method we used before)
```

**Option B: Manual Zip**
1. Select all files EXCEPT:
   - `node_modules/`
   - `.next/`
   - `.git/`
   - `__pycache__/`
   - `*.log`
   - `.env*` files
2. Create `deploy.zip`

### Step 3: Deploy

```bash
# Upload to S3
aws s3 cp deploy.zip s3://encryptgate-deployments/distilbert-deploy-$(date +%Y%m%d-%H%M%S).zip --region us-east-1

# Create application version
VERSION_LABEL="v-distilbert-$(date +%Y%m%d-%H%M%S)"
aws elasticbeanstalk create-application-version \
  --application-name EncryptGateConsole \
  --version-label $VERSION_LABEL \
  --source-bundle S3Bucket=encryptgate-deployments,S3Key=distilbert-deploy-*.zip \
  --region us-east-1

# Deploy
aws elasticbeanstalk update-environment \
  --application-name EncryptGateConsole \
  --environment-name EncryptGateConsole-env \
  --version-label $VERSION_LABEL \
  --region us-east-1
```

### Step 4: Monitor Deployment

Watch the logs:
```bash
aws elasticbeanstalk describe-events \
  --environment-name EncryptGateConsole-env \
  --max-items 20 \
  --region us-east-1
```

### Step 5: Verify DistilBERT is Running

After deployment completes, check:
```bash
# Via SSH or SSM Session Manager
docker ps | grep distilbert
curl http://127.0.0.1:8001/health
```

## What Happens During Deployment

1. **Elastic Beanstalk deploys your code** to `/var/app/current/`
2. **Postdeploy hook runs** (`.platform/hooks/postdeploy/01_start_distilbert.sh`)
3. **Docker installs** (if not already installed)
4. **DistilBERT image builds** (takes 5-10 minutes first time)
5. **Container starts** on port 8001
6. **Health check runs** - deployment fails if service doesn't start

## Configuration Details

### DistilBERT Service URL
- **Local/Internal:** `http://127.0.0.1:8001/predict`
- **Health Check:** `http://127.0.0.1:8001/health`
- **Model Info:** `http://127.0.0.1:8001/model-info`

### Why 127.0.0.1?
- DistilBERT runs on the **same instance** as your app
- No network latency
- No security group changes needed
- Works automatically after deployment

## Troubleshooting

### If deployment fails:
1. Check Elastic Beanstalk logs: `/var/log/eb-hooks.log`
2. Check Docker logs: `docker logs encryptgate-distilbert`
3. Verify disk space: `df -h` (should have 30GB now)
4. Check instance type: Should be `t3.small` (not `t3.micro`)

### If DistilBERT doesn't start:
```bash
# SSH into instance
cd /var/app/current/services/distilbert-service
docker build -t encryptgate-distilbert:latest .
docker run -d --name encryptgate-distilbert -p 8001:8000 --restart unless-stopped encryptgate-distilbert:latest
```

## Files Changed

1. ✅ `.platform/hooks/postdeploy/01_start_distilbert.sh` (NEW)
2. ✅ `services/distilbert-service/Dockerfile` (UPDATED - CPU-only PyTorch)

## Environment Variables

The application will automatically use:
- `DISTILBERT_URL` from Elastic Beanstalk environment variables
- Or `/encryptgate/distilbert-url` from Parameter Store
- Or `process.env.DISTILBERT_URL` from environment

All set to: `http://127.0.0.1:8001/predict`

---

**Status:** ✅ Ready for deployment
**Next Action:** Wait for EB environment to be Ready, then deploy

