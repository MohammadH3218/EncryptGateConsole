# Local Development Setup Guide

This guide will help you set up your EncryptGate Console project to run locally for testing before deploying.

## Quick Start

**Option 1: Use the automated setup script (recommended):**
```powershell
.\setup-local-dev.ps1
```
This script will:
- Create `.env.local` and `.env` from templates
- Check if Node.js and Python are installed
- Provide next steps

**Option 2: Manual setup:**
1. **Copy environment files:**
   ```powershell
   Copy-Item .env.local.example .env.local
   Copy-Item .env.example .env
   ```

2. **Install dependencies:**
   ```powershell
   # Frontend
   npm install
   
   # Backend (create virtual environment first)
   python -m venv .venv
   .venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

3. **Start the backend:**
   ```powershell
   # With venv activated
   python main.py
   ```
   Backend will run on `http://localhost:8000`

4. **Start the frontend (in a new terminal):**
   ```powershell
   npm run dev:local
   ```
   Frontend will run on `http://localhost:3000`

## Environment Variables

### Frontend (.env.local)

The `.env.local` file is used by Next.js. **Copy `.env.local.example` to `.env.local`** and fill in your values.

**Required for local development:**
- `LOCAL_DEV=true` - **CRITICAL**: Routes all API calls to your local Flask backend
- `NEXT_PUBLIC_API_URL=http://localhost:8000` - Points to your local Flask backend

**Optional (only needed for specific features):**
- `OPENAI_API_KEY` - For Copilot/LLM features
- `OPENAI_MODEL` - Default: `gpt-4o-mini`
- `OPENAI_URL` - Default: `https://api.openai.com/v1/chat/completions`
- `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `NEO4J_ENCRYPTED` - For graph features
- `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY` - AWS credentials (if testing AWS features)
- `COGNITO_USERPOOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_CLIENT_SECRET` - For authentication
- `COGNITO_REDIRECT_URI`, `COGNITO_LOGOUT_URI` - Auth callback URLs (use localhost for local dev)
- `CORS_ORIGINS` - Allowed origins (use localhost for local dev)
- `FRONTEND_URL` - Frontend URL (use localhost for local dev)

**DynamoDB Table Names (already configured):**
- `CLOUDSERVICES_TABLE_NAME`, `DETECTIONS_TABLE_NAME`, `EMAILS_TABLE_NAME`, `EMPLOYEES_TABLE_NAME`, `USERS_TABLE_NAME`

### Backend (.env)

The `.env` file is used by Flask. **Copy `.env.example` to `.env`** and fill in your values.

**Required:**
- `FLASK_ENV=development` - Enables development mode
- `CORS_ORIGINS=http://localhost:3000,http://localhost:8000` - Allows frontend to call backend

**Optional (same as frontend):**
- AWS credentials, Cognito config, OpenAI, Neo4j, etc. (see `.env.example` for full list)

## What's Different in Local Mode?

When `LOCAL_DEV=true` is set:

1. **API Routing**: All `/api/*` calls are routed to `http://localhost:8000` instead of the remote backend
2. **No File Logging**: The Flask backend won't try to write to `/var/log/encryptgate/application.log`
3. **Environment Variables**: Secrets are read from `.env` files instead of AWS Parameter Store

## Connecting to Cloud Neo4j from Local Dev

**Yes, you can connect to your EC2 Neo4j instance from local development!** The code is already configured to use environment variables for Neo4j connection.

### Steps to Connect:

1. **Get your EC2 instance's public IP or domain:**
   - Go to AWS EC2 Console
   - Find your Neo4j instance
   - Copy the Public IPv4 address (e.g., `54.123.45.67`) or use a domain if you have one

2. **Update `.env.local` and `.env`:**
   ```env
   NEO4J_URI=bolt://YOUR_EC2_IP:7687
   # Example: NEO4J_URI=bolt://54.123.45.67:7687
   NEO4J_USER=neo4j
   NEO4J_PASSWORD=Qwe!1234
   NEO4J_ENCRYPTED=true
   ```

3. **Configure EC2 Security Group:**
   - Go to EC2 → Security Groups → Select your Neo4j instance's security group
   - Add inbound rule:
     - Type: Custom TCP
     - Port: 7687
     - Source: Your IP address (or `0.0.0.0/0` for testing, but restrict it later!)
     - Description: "Neo4j Bolt from local dev"

4. **Verify Neo4j is listening on all interfaces:**
   SSH into your EC2 instance and check Neo4j config:
   ```bash
   # Check if Neo4j is bound to 0.0.0.0 (not just localhost)
   sudo grep -r "dbms.default_listen_address" /etc/neo4j/
   
   # If it's set to localhost, update it:
   # Edit /etc/neo4j/neo4j.conf
   # Set: dbms.default_listen_address=0.0.0.0
   # Then restart: sudo systemctl restart neo4j
   ```

5. **Test the connection:**
   ```powershell
   # From your local machine, test connection
   node test-neo4j-connection.js
   ```

### Security Note:
For production, restrict the security group to only allow connections from specific IPs or use a VPN/bastion host. For local testing, you can temporarily allow your IP.

## Testing Without Cloud Services

You can test most UI features locally without AWS credentials:

- ✅ Navigation and routing
- ✅ UI components and layouts
- ✅ Frontend state management
- ✅ Local API routes (if implemented)

You'll need AWS credentials for:
- ❌ Authentication (Cognito) - **Now configured in .env files!**
- ❌ Database operations (DynamoDB) - **Now configured in .env files!**
- ❌ Email processing (WorkMail/SES) - **Now configured in .env files!**
- ❌ Copilot features - **OpenAI API key now configured!**
- ❌ Neo4j graph features - **Can connect to EC2 instance!**

## Troubleshooting

### Backend won't start

- Make sure Python virtual environment is activated
- Check that port 8000 is not in use: `netstat -ano | findstr :8000`
- Verify `.env` file exists and has `FLASK_ENV=development`

### Frontend can't connect to backend

- Verify backend is running on `http://localhost:8000`
- Check that `LOCAL_DEV=true` is set in `.env.local`
- Check browser console for CORS errors (backend should allow `http://localhost:3000`)

### API calls still going to remote server

- Make sure `LOCAL_DEV=true` is in `.env.local`
- Restart the Next.js dev server after changing `.env.local`
- Check `next.config.mjs` - it should log "Local development mode" when starting

### File logging errors

- This is normal in local development - the backend will only use console logging
- The error is handled gracefully and won't prevent the server from starting

## Switching Between Local and Remote

- **Local Development**: Use `npm run dev:local` and set `LOCAL_DEV=true` in `.env.local`
- **Production Testing**: Use `npm run dev` (without `LOCAL_DEV=true`) to test against remote backend

## Next Steps

1. Edit `.env.local` and `.env` with your actual values (if testing AWS features)
2. Start both servers
3. Open `http://localhost:3000` in your browser
4. Test your changes locally before deploying!

