// Simple test script for AI Copilot functionality
const https = require('https');
const http = require('http');

function fetchJson(url, options) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const req = client.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            json: () => Promise.resolve(JSON.parse(data))
          });
        } catch (e) {
          resolve({
            ok: false,
            json: () => Promise.resolve({ error: 'Invalid JSON' })
          });
        }
      });
    });
    
    req.on('error', reject);
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

async function testCopilot() {
  try {
    console.log('🔍 Testing AI Copilot functionality...\n');
    
    // Test 1: Health check
    console.log('1. Testing health check...');
    const healthResponse = await fetchJson('http://localhost:3000/api/graph', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'health_check',
        data: {}
      })
    });
    
    const healthResult = await healthResponse.json();
    console.log('Health check result:', JSON.stringify(healthResult, null, 2));
    
    if (!healthResponse.ok || !healthResult.healthy) {
      console.log('❌ Health check failed. Stopping tests.');
      return;
    }
    
    console.log('✅ Health check passed!\n');
    
    // Test 2: Simple copilot query
    console.log('2. Testing copilot query...');
    const queryResponse = await fetchJson('http://localhost:3000/api/graph', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'query_copilot',
        data: {
          question: 'What emails are related to the gas market?',
          messageId: '<test@example.com>',
          context: {
            sender: 'christi.nicolay@enron.com',
            subject: 'Re: Talking points about California Gas market',
            recipients: ['N/A']
          }
        }
      })
    });
    
    const queryResult = await queryResponse.json();
    console.log('Query result:', JSON.stringify(queryResult, null, 2));
    
    if (queryResponse.ok && queryResult.response) {
      console.log('✅ Query test passed!');
    } else {
      console.log('❌ Query test failed.');
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

testCopilot();