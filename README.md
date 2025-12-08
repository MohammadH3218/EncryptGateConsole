# EncryptGate Console

A Next.js frontend (App Router) and Flask backend for email security management.

## Quick Start - Local Development

**📖 For detailed local development setup, see [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md)**

### Quick Setup

**Option 1: Use the setup script (recommended):**
```powershell
.\setup-local-dev.ps1
```

**Option 2: Manual setup:**
```powershell
Copy-Item .env.local.example .env.local
Copy-Item .env.example .env
```

2. **Install dependencies:**
   ```powershell
   npm install
   python -m venv .venv
   .venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

3. **Start both servers:**
   ```powershell
   # Terminal 1 - Backend
   python main.py
   
   # Terminal 2 - Frontend (with local dev mode)
   npm run dev:local
   ```

4. **Open:** http://localhost:3000

## Key Features

- **Local Development Mode**: Set `LOCAL_DEV=true` in `.env.local` to route all API calls to your local Flask backend
- **Environment Variables**: Use `.env.local.example` and `.env.example` as templates
- **No Cloud Required**: Test UI and navigation without AWS credentials (some features will be limited)

## Scripts

- `npm run dev` - Start Next.js in production mode (routes to remote backend)
- `npm run dev:local` - Start Next.js in local mode (routes to local Flask backend)
- `npm run build` - Build for production
- `npm run start` - Start production server

## Prerequisites

- Node.js 18+ and npm
- Python 3.10+ (3.11 recommended) and pip
- Optional: AWS credentials, Neo4j, OpenAI API key for full feature testing

## Documentation

- [Local Development Guide](./LOCAL_DEVELOPMENT.md) - Complete setup and troubleshooting guide
- Environment variable templates: `.env.local.example` and `.env.example`
