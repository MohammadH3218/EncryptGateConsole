EncryptGate Console – Local Development

This project includes a Next.js frontend (App Router) and a Flask backend. You can run both locally for development and basic testing.

Prerequisites

- Node.js 18+ and npm
- Python 3.10+ (3.11 recommended) and pip
- PowerShell or a shell of your choice
- Optional: Neo4j and an OpenAI API key if you plan to use graph/LLM features

Environment Setup

1) Frontend env (`.env.local` in repo root)

Create a `.env.local` file in the repository root:

```
NEXT_PUBLIC_API_URL=http://localhost:8000

# Optional/common vars used in code
AWS_REGION=us-east-1
REGION=us-east-1

# If you plan to use Copilot/LLM or graph features locally
# OPENAI_API_KEY=sk-...
# NEO4J_URI=bolt://localhost:7687
# NEO4J_USER=neo4j
# NEO4J_PASSWORD=your_password
# NEO4J_ENCRYPTED=false
```

Note: The Next.js config rewrites most `/api/:path*` calls to the remote backend unless a specific header is set, but `/api/auth` routes are handled locally. Setting `NEXT_PUBLIC_API_URL` to your local Flask server ensures client-side auth calls target local backend endpoints when used.

2) Backend env (`.env` for Flask in repo root)

Create a `.env` file in the repository root:

```
FLASK_ENV=development
CORS_ORIGINS=http://localhost:3000

# If you need AWS integration (Cognito/DynamoDB) locally, also set:
# AWS_REGION=us-east-1
# AWS_ACCESS_KEY_ID=...
# AWS_SECRET_ACCESS_KEY=...
# Optional app config depending on your environment:
# COGNITO_USERPOOL_ID=...
# COGNITO_CLIENT_ID=...
# COGNITO_CLIENT_SECRET=...
# CLOUDSERVICES_TABLE=...
```

Install Dependencies

- Frontend
  - `npm install`

- Backend
  - Windows PowerShell (recommended):
    - `python -m venv .venv`
    - `.venv\Scripts\Activate.ps1`
    - `pip install -r requirements.txt`

Running Locally

1) Start Flask backend (port 8000 by default)

```
# From repo root, with the venv active
python main.py
```

Health checks:
- Backend: http://localhost:8000/health and http://localhost:8000/api/health

2) Start Next.js dev server (port 3000)

```
npm run dev
```

Open the app: http://localhost:3000

Notes and Tips

- If you don’t configure AWS/Cognito/SSM/Neo4j/OpenAI, pages or API routes that depend on them may fail. For basic UI navigation and health checks, the above envs suffice.
- To test graph/LLM features locally without AWS SSM, set `OPENAI_API_KEY` and `NEO4J_*` in `.env.local`.
- The Next.js config includes rewrites that send most `/api/:path*` to the remote backend. Consider adjusting `next.config.mjs` or using the `x-skip-rewrite: 1` header in requests if you need to hit local Next.js route handlers for those paths.
- For production, the app reads secrets from AWS SSM Parameter Store. In local dev, environment variables take precedence where supported.
- The landing page now routes existing customers through `/orgs/select`, which queries local `/api/orgs/search` (remember to include an `x-skip-rewrite: 1` header when calling this API from scripts to avoid the global proxy). Friendly org names on `/o/{orgId}/login` come from `/api/orgs/[orgId]`, so keep the `Organizations` table populated with `name`, `region`, and optional `orgCode` fields.
