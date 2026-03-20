#!/usr/bin/env node
/**
 * CLI entry point for running the authorization server
 */

import { readFileSync, existsSync } from 'fs';
import { CognitoAuthorizationClient } from './client.js';
import { Config, loadConfigFromEnv, validateConfig, isAVPConfig } from './config.js';
import { createServer } from './server/index.js';

/**
 * Load configuration from file or environment
 */
function loadConfiguration(): Config {
  // Try to load from config file first
  const configPaths = ['./config.json', './cognito-authz-config.json'];

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      console.log(`Loading configuration from ${configPath}`);
      const configData = JSON.parse(readFileSync(configPath, 'utf-8'));
      return validateConfig(configData);
    }
  }

  // Fall back to environment variables
  console.log('Loading configuration from environment variables');
  const envConfig = loadConfigFromEnv();
  return validateConfig(envConfig);
}

/**
 * Start the server
 */
async function main() {
  try {
    // Load configuration
    const config = loadConfiguration();

    console.log('Configuration loaded:');
    console.log(`  - Cognito Region: ${config.cognito.region}`);
    console.log(`  - User Pool ID: ${config.cognito.userPoolId}`);
    console.log(`  - Cedar Namespace: ${config.cedar.namespace}`);

    if (isAVPConfig(config.cedar)) {
      console.log(`  - Policy Source: Amazon Verified Permissions`);
      console.log(`  - Policy Store ID: ${config.cedar.policyStoreId}`);
      if (config.cedar.refreshIntervalSeconds > 0) {
        console.log(`  - Policy Refresh: Every ${config.cedar.refreshIntervalSeconds} seconds`);
      }
    } else {
      console.log(`  - Policy Source: Local file`);
      console.log(`  - Policies: ${config.cedar.policies}`);
    }

    // Create client (async for AVP support)
    console.log('\nInitializing authorization client...');
    const client = await CognitoAuthorizationClient.create(config);
    console.log('Authorization client initialized');

    // Create and start server
    const app = createServer(client);
    const port = config.server?.port ?? 3000;
    const host = config.server?.host ?? 'localhost';

    app.listen(port, host, () => {
      console.log(`\nCognito Authorization Client running at http://${host}:${port}`);
      console.log('\nAvailable endpoints:');
      console.log('  GET  /health          - Health check');
      console.log('  POST /authorize       - Authorize a single request');
      console.log('  POST /batch-authorize - Authorize multiple requests');
      console.log('  POST /validate-token  - Validate a token');
      if (isAVPConfig(config.cedar)) {
        console.log('  POST /refresh-policies - Refresh policies from AVP');
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
