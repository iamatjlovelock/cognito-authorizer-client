import { Request, Response } from 'express';
import { CognitoAuthorizationClient, AuthzRequest } from '../client.js';
import { z } from 'zod';

/**
 * Entity UID schema
 */
const EntityUidSchema = z.object({
  type: z.string(),
  id: z.string(),
});

/**
 * Cedar entity schema
 */
const CedarEntitySchema = z.object({
  uid: EntityUidSchema,
  attrs: z.record(z.unknown()),
  parents: z.array(EntityUidSchema),
});

/**
 * Request body schema for authorization requests
 */
const AuthzRequestSchema = z.object({
  token: z.string(),
  action: z.string(),
  resource: z.object({
    type: z.string(),
    id: z.string(),
  }),
  context: z.record(z.unknown()).optional(),
  additionalEntities: z.array(CedarEntitySchema).optional(),
});

/**
 * Request body schema for batch authorization requests
 */
const BatchAuthzRequestSchema = z.object({
  token: z.string(),
  requests: z.array(z.object({
    action: z.string(),
    resource: z.object({
      type: z.string(),
      id: z.string(),
    }),
    context: z.record(z.unknown()).optional(),
  })),
});

/**
 * Create authorization handlers
 */
export function createHandlers(client: CognitoAuthorizationClient) {
  return {
    /**
     * Health check endpoint
     */
    health(_req: Request, res: Response): void {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    },

    /**
     * Authorization endpoint
     */
    async authorize(req: Request, res: Response): Promise<void> {
      try {
        const parsed = AuthzRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error: 'Invalid request',
            details: parsed.error.issues,
          });
          return;
        }

        const request: AuthzRequest = {
          token: parsed.data.token,
          action: parsed.data.action,
          resource: parsed.data.resource,
          context: parsed.data.context,
          additionalEntities: parsed.data.additionalEntities as AuthzRequest['additionalEntities'],
        };

        // Log input (excluding token for security)
        console.log('[AUTHZ REQUEST]', JSON.stringify({
          action: request.action,
          resource: request.resource,
          context: request.context,
          additionalEntities: request.additionalEntities,
        }));

        const response = await client.authorize(request);

        // Don't include claims in response for security
        const { claims: _claims, ...safeResponse } = response;

        // Log response
        console.log('[AUTHZ RESPONSE]', JSON.stringify(safeResponse));

        res.json(safeResponse);
      } catch (error) {
        console.error('Authorization error:', error);
        res.status(500).json({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },

    /**
     * Batch authorization endpoint
     */
    async batchAuthorize(req: Request, res: Response): Promise<void> {
      try {
        const parsed = BatchAuthzRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error: 'Invalid request',
            details: parsed.error.issues,
          });
          return;
        }

        const { token, requests } = parsed.data;

        // Log batch input (excluding token for security)
        console.log('[BATCH AUTHZ REQUEST]', JSON.stringify({ requests }));

        // Authorize all requests in parallel
        const responses = await Promise.all(
          requests.map((r) =>
            client.authorize({
              token,
              action: r.action,
              resource: r.resource,
              context: r.context,
            })
          )
        );

        // Remove claims from responses for security
        const safeResponses = responses.map(({ claims: _claims, ...rest }) => rest);

        const result = {
          results: safeResponses,
          summary: {
            total: safeResponses.length,
            allowed: safeResponses.filter((r) => r.allowed).length,
            denied: safeResponses.filter((r) => !r.allowed).length,
          },
        };

        // Log batch response
        console.log('[BATCH AUTHZ RESPONSE]', JSON.stringify(result));

        res.json(result);
      } catch (error) {
        console.error('Batch authorization error:', error);
        res.status(500).json({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },

    /**
     * Token validation endpoint (for debugging)
     */
    async validateToken(req: Request, res: Response): Promise<void> {
      try {
        const token = req.body.token || req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
          res.status(400).json({ error: 'Token is required' });
          return;
        }

        const validated = await client.validateToken(token);
        res.json({
          valid: true,
          tokenUse: validated.claims.token_use,
          sub: validated.claims.sub,
          exp: validated.claims.exp,
          expiresAt: new Date(validated.claims.exp * 1000).toISOString(),
        });
      } catch (error) {
        res.status(401).json({
          valid: false,
          error: error instanceof Error ? error.message : 'Token validation failed',
        });
      }
    },

    /**
     * Refresh policies from AVP
     */
    async refreshPolicies(_req: Request, res: Response): Promise<void> {
      try {
        await client.refreshPoliciesFromAVP();
        res.json({ success: true, message: 'Policies refreshed from AVP' });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to refresh policies',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  };
}
