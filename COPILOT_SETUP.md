# Security Copilot Setup Guide

## Environment Variables

To enable the Security Copilot functionality, you need to set up the following environment variables:

### Required Variables

```bash
# OpenAI API Configuration (Required for AI functionality)
OPENAI_API_KEY=your_openai_api_key_here

# Neo4j Database Configuration
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_neo4j_password

# Optional Variables
OPENAI_MODEL=gpt-4o-mini
NEO4J_ENCRYPTED=false
```

### Setup Instructions

1. **OpenAI API Key**:
   - Sign up at https://platform.openai.com/
   - Get your API key from the dashboard
   - Set the `OPENAI_API_KEY` environment variable

2. **Neo4j Database**:
   - Install Neo4j locally or use Neo4j Aura Cloud
   - Set up authentication credentials
   - Update the connection details in the environment variables

3. **Start the Application**:
   ```bash
   npm run dev
   ```

## Features

The Security Copilot provides:

- **Email Analysis**: Analyze email relationships and patterns
- **Graph Queries**: Query the knowledge graph using natural language
- **Threat Intelligence**: Get insights about potential security threats
- **Investigation Support**: Assist with email investigations

## Usage

1. Navigate to any investigation page
2. Click on the "AI Copilot" tab
3. Ask questions about the email or general security topics
4. The copilot will analyze the data and provide insights

## Sample Questions

- "Who else has received similar emails?"
- "What makes this email suspicious?"
- "Analyze the sender's email history"
- "What actions should I take?"
- "Show me recent phishing attempts"
- "Find emails with suspicious URLs"