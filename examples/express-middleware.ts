/**
 * Express middleware example for the Cognito Authorization Client
 *
 * This example shows how to integrate the authorization client
 * as middleware in an Express application.
 */

import express, { Request, Response, NextFunction } from 'express';
import { CognitoAuthorizationClient, Config, AuthzResponse } from '../src/index.js';

// Extend Express Request to include authorization info
declare global {
  namespace Express {
    interface Request {
      auth?: {
        principal: { type: string; id: string };
        claims: Record<string, unknown>;
      };
    }
  }
}

// Configuration
const config: Config = {
  cognito: {
    region: 'us-east-1',
    userPoolId: 'us-east-1_XXXXXXXXX',
    clientId: 'your-app-client-id',
  },
  cedar: {
    namespace: 'MyApp',
    policies: './policies.cedar',
    policiesAreInline: false,
  },
};

// Create the authorization client
const authzClient = new CognitoAuthorizationClient(config);

/**
 * Middleware to validate the token and attach user info to request
 */
async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const validated = await authzClient.validateToken(token);
    req.auth = {
      principal: authzClient.getEntityBuilder().getPrincipal(validated.claims),
      claims: validated.claims as Record<string, unknown>,
    };
    next();
  } catch (error) {
    res.status(401).json({
      error: 'Invalid token',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Middleware factory for authorization checks
 */
function authorize(action: string, getResource: (req: Request) => { type: string; id: string }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing authorization header' });
      return;
    }

    const token = authHeader.slice(7);
    const resource = getResource(req);

    try {
      const response: AuthzResponse = await authzClient.authorize({
        token,
        action,
        resource,
      });

      if (!response.allowed) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to perform this action',
          decision: response.decision,
        });
        return;
      }

      // Attach auth info for downstream handlers
      req.auth = {
        principal: response.principal,
        claims: response.claims as Record<string, unknown>,
      };

      next();
    } catch (error) {
      res.status(500).json({
        error: 'Authorization failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

// Example Express app
const app = express();
app.use(express.json());

// Health check - no auth required
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Get all documents - requires 'list' action on Documents collection
app.get(
  '/documents',
  authorize('list', () => ({ type: 'DocumentCollection', id: 'all' })),
  (_req, res) => {
    res.json({ documents: [] });
  }
);

// Get a specific document - requires 'read' action on the document
app.get(
  '/documents/:id',
  authorize('read', (req) => ({ type: 'Document', id: req.params.id })),
  (req, res) => {
    res.json({ document: { id: req.params.id, title: 'Example' } });
  }
);

// Create a document - requires 'create' action
app.post(
  '/documents',
  authorize('create', () => ({ type: 'DocumentCollection', id: 'all' })),
  (req, res) => {
    res.status(201).json({ document: { id: 'new-doc', ...req.body } });
  }
);

// Update a document - requires 'write' action on the document
app.put(
  '/documents/:id',
  authorize('write', (req) => ({ type: 'Document', id: req.params.id })),
  (req, res) => {
    res.json({ document: { id: req.params.id, ...req.body } });
  }
);

// Delete a document - requires 'delete' action on the document
app.delete(
  '/documents/:id',
  authorize('delete', (req) => ({ type: 'Document', id: req.params.id })),
  (req, res) => {
    res.status(204).send();
  }
);

// Get current user profile - requires authentication only
app.get('/me', authenticate, (req, res) => {
  res.json({
    principal: req.auth?.principal,
    claims: req.auth?.claims,
  });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`);
});
