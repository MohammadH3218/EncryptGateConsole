# Connecting to Neo4j on EC2 from Local Development

This guide explains how to connect your local development environment to Neo4j running on an EC2 instance.

## Quick Setup

1. **Get your EC2 instance details:**
   - Public IP address or domain name
   - Security group name/ID

2. **Update environment variables:**
   ```env
   # In .env.local and .env
   NEO4J_URI=bolt://YOUR_EC2_IP:7687
   NEO4J_USER=neo4j
   NEO4J_PASSWORD=Qwe!1234
   NEO4J_ENCRYPTED=true
   ```

3. **Configure EC2 Security Group:**
   - Allow inbound TCP port 7687 from your IP

4. **Verify Neo4j configuration on EC2:**
   - Ensure Neo4j listens on `0.0.0.0`, not just `localhost`

## Detailed Steps

### Step 1: Find Your EC2 Instance

1. Go to AWS Console → EC2 → Instances
2. Find your Neo4j instance
3. Note the **Public IPv4 address** (e.g., `54.123.45.67`)
4. Note the **Security Group** name/ID

### Step 2: Update Security Group

1. Go to EC2 → Security Groups
2. Select the security group attached to your Neo4j instance
3. Click "Edit inbound rules"
4. Click "Add rule":
   - **Type**: Custom TCP
   - **Port**: 7687
   - **Source**: 
     - For testing: `My IP` (recommended)
     - Or your specific IP: `YOUR_IP/32`
     - ⚠️ **Never use `0.0.0.0/0` in production!**
   - **Description**: "Neo4j Bolt from local dev"
5. Click "Save rules"

### Step 3: Configure Neo4j on EC2

SSH into your EC2 instance and verify/update Neo4j configuration:

```bash
# Check current listen address
sudo grep dbms.default_listen_address /etc/neo4j/neo4j.conf

# If it shows localhost or 127.0.0.1, update it:
sudo nano /etc/neo4j/neo4j.conf

# Find and update:
# dbms.default_listen_address=0.0.0.0

# Restart Neo4j
sudo systemctl restart neo4j

# Check status
sudo systemctl status neo4j

# Verify it's listening on all interfaces
sudo netstat -tlnp | grep 7687
# Should show: 0.0.0.0:7687 (not 127.0.0.1:7687)
```

### Step 4: Update Local Environment Files

Update both `.env.local` and `.env`:

```env
NEO4J_URI=bolt://54.123.45.67:7687  # Replace with your EC2 IP
NEO4J_USER=neo4j
NEO4J_PASSWORD=Qwe!1234
NEO4J_ENCRYPTED=true
```

### Step 5: Test Connection

From your local machine:

```powershell
# Test Neo4j connection
node test-neo4j-connection.js
```

Or test from your application:
- Start your local dev server
- Try using a feature that requires Neo4j
- Check the console for connection logs

## Troubleshooting

### Connection Refused (ECONNREFUSED)

**Possible causes:**
1. Security group not allowing port 7687
2. Neo4j not listening on 0.0.0.0
3. Firewall blocking the connection
4. Wrong IP address

**Solutions:**
- Verify security group allows your IP on port 7687
- Check Neo4j is listening on all interfaces: `sudo netstat -tlnp | grep 7687`
- Verify the IP address is correct
- Try connecting from EC2 itself: `cypher-shell -a bolt://localhost:7687`

### Connection Timeout

**Possible causes:**
1. Security group blocking
2. Network routing issues
3. Neo4j not running

**Solutions:**
- Check security group rules
- Verify Neo4j is running: `sudo systemctl status neo4j`
- Test from EC2: `cypher-shell -a bolt://localhost:7687`

### Authentication Failed

**Possible causes:**
1. Wrong password
2. User doesn't exist

**Solutions:**
- Verify password in `.env` files matches EC2 Neo4j password
- Reset password on EC2 if needed:
  ```bash
  cypher-shell -a bolt://localhost:7687 -u neo4j -p oldpassword
  # Then: CALL dbms.security.changePassword('Qwe!1234')
  ```

## Security Best Practices

1. **Restrict Security Group**: Only allow your specific IP, not `0.0.0.0/0`
2. **Use VPN**: Consider using AWS VPN or bastion host for production
3. **Change Default Password**: Make sure you've changed Neo4j's default password
4. **Use Encrypted Connection**: Keep `NEO4J_ENCRYPTED=true`
5. **Rotate Credentials**: Regularly update passwords

## Alternative: SSH Tunnel

If you can't open port 7687, use an SSH tunnel:

```powershell
# Create SSH tunnel (replace with your EC2 details)
ssh -L 7687:localhost:7687 ec2-user@YOUR_EC2_IP -i your-key.pem

# Then in .env.local, use:
NEO4J_URI=bolt://localhost:7687
```

This tunnels Neo4j traffic through SSH, so you don't need to open port 7687 in the security group.

