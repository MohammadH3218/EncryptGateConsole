// test-neo4j-connection.js - Simple Neo4j connection tester
const neo4j = require('neo4j-driver');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'Qwe!1234';

console.log('🔧 Testing Neo4j connection...');
console.log(`URI: ${NEO4J_URI}`);
console.log(`User: ${NEO4J_USER}`);
console.log(`Password: ${'*'.repeat(NEO4J_PASSWORD.length)}`);

async function testConnection() {
  let driver;
  try {
    // Create driver
    console.log('\n📡 Creating Neo4j driver...');
    driver = neo4j.driver(
      NEO4J_URI,
      neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
      { 
        encrypted: false,
        connectionTimeout: 10000,
        maxConnectionLifetime: 30000
      }
    );

    console.log('✅ Driver created successfully');

    // Test connection
    console.log('\n🔌 Testing connection...');
    const session = driver.session();
    
    const result = await session.run('RETURN "Hello Neo4j!" as message, datetime() as time');
    const record = result.records[0];
    
    console.log('✅ Connection successful!');
    console.log(`Message: ${record.get('message')}`);
    console.log(`Server time: ${record.get('time')}`);
    
    await session.close();
    
    // Test database info
    console.log('\n📊 Getting database info...');
    const infoSession = driver.session();
    const infoResult = await infoSession.run('CALL db.info() YIELD name, value RETURN name, value LIMIT 5');
    
    console.log('Database info:');
    infoResult.records.forEach(record => {
      console.log(`  ${record.get('name')}: ${record.get('value')}`);
    });
    
    await infoSession.close();
    
    console.log('\n🎉 All tests passed! Neo4j is working correctly.');
    
  } catch (error) {
    console.error('\n❌ Connection failed:');
    console.error(`Error: ${error.message}`);
    
    if (error.code) {
      console.error(`Code: ${error.code}`);
    }
    
    // Provide helpful troubleshooting tips
    console.log('\n🔧 Troubleshooting tips:');
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log('  • Neo4j server is not running or not accessible');
      console.log('  • Check if Neo4j is running on your EC2 instance');
      console.log('  • Verify the EC2 security group allows port 7687');
      console.log('  • Make sure NEO4J_URI in .env.local points to your EC2 instance');
    }
    
    if (error.message.includes('authentication')) {
      console.log('  • Check NEO4J_USER and NEO4J_PASSWORD in .env.local');
      console.log('  • Default password might need to be changed on first login');
    }
    
    if (error.message.includes('timeout')) {
      console.log('  • Network connectivity issues');
      console.log('  • EC2 security group might be blocking port 7687');
      console.log('  • Check if Neo4j is bound to 0.0.0.0 (not just localhost)');
    }
    
    console.log('\n📖 Next steps:');
    console.log('  1. Update NEO4J_URI in .env.local with your EC2 public IP');
    console.log('  2. Ensure Neo4j is running: sudo systemctl status neo4j');
    console.log('  3. Check EC2 security group allows inbound port 7687');
    console.log('  4. Test from EC2: cypher-shell -a bolt://localhost:7687');
    
  } finally {
    if (driver) {
      await driver.close();
      console.log('\n🔌 Driver closed');
    }
  }
}

testConnection().catch(console.error);