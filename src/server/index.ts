import express from 'express';
import { CognitoAuthorizationClient } from '../client.js';
import { createHandlers } from './handlers.js';

/**
 * Create and configure the Express server
 */
export function createServer(client: CognitoAuthorizationClient) {
  const app = express();

  // Middleware
  app.use(express.json());

  // CORS for local development
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
  });

  // Create handlers
  const handlers = createHandlers(client);

  // Routes
  app.get('/health', handlers.health);
  app.post('/authorize', handlers.authorize);
  app.post('/batch-authorize', handlers.batchAuthorize);
  app.post('/validate-token', handlers.validateToken);
  app.post('/refresh-policies', handlers.refreshPolicies);

  return app;
}

export { createHandlers } from './handlers.js';
