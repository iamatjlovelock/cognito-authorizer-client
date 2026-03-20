/**
 * Basic usage example for the Cognito Authorization Client
 *
 * This example demonstrates how to:
 * 1. Create an authorization client with inline configuration
 * 2. Authorize requests using Cognito tokens
 * 3. Handle authorization responses
 */

import { CognitoAuthorizationClient, Config } from '../src/index.js';

// Example configuration with inline policies
const config: Config = {
  cognito: {
    region: 'us-east-1',
    userPoolId: 'us-east-1_XXXXXXXXX',
    clientId: 'your-app-client-id',
  },
  cedar: {
    namespace: 'MyApp',
    policiesAreInline: true,
    policies: `
      // Allow admins to do anything
      permit (
          principal in MyApp::CognitoGroup::"admins",
          action,
          resource
      );

      // Allow users to read documents
      permit (
          principal,
          action == MyApp::Action::"read",
          resource is MyApp::Document
      );
    `,
  },
};

async function main() {
  // Create the authorization client
  const client = new CognitoAuthorizationClient(config);
  console.log('Authorization client created');

  // Example: Authorize a request with a Cognito token
  // In a real application, this token would come from the user's session
  const cognitoToken = 'eyJraWQiOi...'; // Your Cognito ID or Access token

  try {
    const response = await client.authorize({
      token: cognitoToken,
      action: 'read',
      resource: {
        type: 'Document',
        id: 'doc-123',
      },
      context: {
        // Optional context for the authorization decision
        requestTime: new Date().toISOString(),
        ipAddress: '192.168.1.1',
      },
    });

    console.log('Authorization response:');
    console.log(`  Allowed: ${response.allowed}`);
    console.log(`  Decision: ${response.decision}`);
    console.log(`  Principal: ${response.principal.type}::${response.principal.id}`);

    if (response.diagnostics.reason.length > 0) {
      console.log(`  Policies that allowed: ${response.diagnostics.reason.join(', ')}`);
    }

    if (response.diagnostics.errors.length > 0) {
      console.log(`  Errors: ${response.diagnostics.errors.join(', ')}`);
    }
  } catch (error) {
    console.error('Authorization failed:', error);
  }
}

main();
