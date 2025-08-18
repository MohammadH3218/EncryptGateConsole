# Neo4j Setup Guide for EncryptGate

## Quick Test

First, test if Neo4j is working with your configuration:

```bash
# Test the connection directly
node test-neo4j.js

# Test through your API (make sure your Next.js app is running)
node test-api.js

# Or visit in browser when app is running:
# http://localhost:3000/api/test-neo4j
```

## Installation Options

### Option 1: Neo4j Desktop (Recommended for Development)

1. **Download Neo4j Desktop**
   - Visit: https://neo4j.com/download/
   - Download Neo4j Desktop (free)
   - Install and create an account

2. **Create a New Database**
   - Open Neo4j Desktop
   - Click "New" → "Create project"
   - Click "Add" → "Local DBMS"
   - Set name: "EncryptGate"
   - Set password: `REDACTED_PASSWORD` (or match your config)
   - Version: 4.4 or later
   - Click "Create"

3. **Start the Database**
   - Click the "Start" button on your database
   - Wait for it to show "Active"
   - Default port should be 7687

### Option 2: Neo4j Community Server

1. **Download and Install**
   ```bash
   # Windows (using Chocolatey)
   choco install neo4j-community
   
   # Or download from: https://neo4j.com/download-center/#community
   ```

2. **Configure Password**
   ```bash
   # Start Neo4j
   neo4j start
   
   # Set initial password (default user: neo4j)
   cypher-shell -u neo4j -p neo4j
   # Then run: CALL dbms.changePassword('REDACTED_PASSWORD')
   ```

### Option 3: Neo4j Aura (Cloud)

1. **Create Free Account**
   - Visit: https://neo4j.com/cloud/aura/
   - Sign up for free tier

2. **Create Database**
   - Click "Create database"
   - Choose "AuraDB Free"
   - Save the connection details

3. **Update Configuration**
   ```typescript
   // In lib/neo4j.ts, update these values:
   const NEO4J_URI = 'neo4j+s://your-instance.databases.neo4j.io'
   const NEO4J_USER = 'neo4j'
   const NEO4J_PASSWORD = 'your-generated-password'
   const NEO4J_ENCRYPTED = true // Important for Aura!
   ```

## Common Issues and Solutions

### Issue 1: Connection Refused (ECONNREFUSED)
```
Error: connect ECONNREFUSED 127.0.0.1:7687
```

**Solutions:**
- Ensure Neo4j is running: Check Neo4j Desktop or run `neo4j status`
- Check port: Neo4j should be listening on port 7687
- Verify with: `netstat -an | findstr 7687` (Windows) or `netstat -an | grep 7687` (Mac/Linux)

### Issue 2: Authentication Failed
```
Error: The client is unauthorized due to authentication failure.
```

**Solutions:**
- Check username/password in your configuration
- Default Neo4j user is `neo4j`
- Reset password if needed:
  ```bash
  cypher-shell -u neo4j -p current-password
  CALL dbms.changePassword('REDACTED_PASSWORD')
  ```

### Issue 3: Encryption Settings
```
Error: Failed to connect to server. Please ensure that you have compatible encryption settings
```

**Solutions:**
- For local Neo4j: Set `NEO4J_ENCRYPTED = false`
- For Neo4j Aura: Set `NEO4J_ENCRYPTED = true`
- Try different protocol: `bolt://` vs `neo4j://`

## Verification Steps

1. **Check Neo4j Status**
   ```bash
   # Run the test script
   node test-neo4j.js
   ```

2. **Check Browser Interface**
   - Open: http://localhost:7474
   - Login with your credentials
   - Run: `RETURN "Hello World" as message`

3. **Test with Your App**
   ```bash
   # Start your Next.js app
   npm run dev
   
   # Visit the diagnostic endpoint
   # http://localhost:3000/api/test-neo4j
   ```

## Database Schema Setup

Your app will automatically create the schema, but you can also set it up manually:

```cypher
// Create indexes for better performance
CREATE INDEX user_email IF NOT EXISTS FOR (u:User) ON (u.email);
CREATE INDEX email_messageId IF NOT EXISTS FOR (e:Email) ON (e.messageId);
CREATE INDEX url_domain IF NOT EXISTS FOR (u:URL) ON (u.domain);

// Example data structure
MERGE (u1:User {email: 'sender@example.com'})
MERGE (u2:User {email: 'recipient@example.com'})
MERGE (e:Email {messageId: '<test@example.com>', subject: 'Test Email'})
MERGE (url:URL {url: 'https://example.com', domain: 'example.com'})

MERGE (u1)-[:WAS_SENT]->(e)
MERGE (e)-[:WAS_SENT_TO]->(u2)
MERGE (e)-[:CONTAINS_URL]->(url)
```

## Production Deployment

For production, consider:

1. **Neo4j Aura** (managed cloud service)
2. **Docker deployment**:
   ```yaml
   version: '3.8'
   services:
     neo4j:
       image: neo4j:4.4-community
       ports:
         - "7474:7474"
         - "7687:7687"
       environment:
         NEO4J_AUTH: neo4j/REDACTED_PASSWORD
       volumes:
         - neo4j_data:/data
   volumes:
     neo4j_data:
   ```

3. **Security considerations**:
   - Use strong passwords
   - Enable encryption in production
   - Configure proper firewall rules
   - Regular backups

## Need Help?

- Check logs: Neo4j Desktop → Database → Logs
- Neo4j Documentation: https://neo4j.com/docs/
- Community Forum: https://community.neo4j.com/