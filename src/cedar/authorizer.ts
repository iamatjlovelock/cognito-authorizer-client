import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import { CedarEntity, CedarValue } from './entity-builder.js';

/**
 * Authorization request
 */
export interface AuthorizationRequest {
  principal: { type: string; id: string };
  action: { type: string; id: string };
  resource: { type: string; id: string };
  context?: Record<string, CedarValue>;
  entities: CedarEntity[];
}

/**
 * Authorization decision
 */
export type Decision = 'Allow' | 'Deny';

/**
 * Authorization response
 */
export interface AuthorizationResponse {
  decision: Decision;
  diagnostics: {
    reason: string[];
    errors: string[];
  };
}

/**
 * Configuration for the Cedar authorizer
 */
export interface AuthorizerConfig {
  /**
   * Cedar policies in text format
   */
  policies: string;

  /**
   * Cedar schema in JSON format (optional but recommended)
   */
  schema?: string;
}

/**
 * Cedar-based authorizer
 */
export class CedarAuthorizer {
  private policies: string;
  private schema: cedar.Schema | undefined;

  constructor(config: AuthorizerConfig) {
    this.policies = config.policies;
    this.schema = config.schema ? this.parseSchema(config.schema) : undefined;

    // Validate policies on construction
    this.validatePolicies();
  }

  /**
   * Parse schema - if it's JSON, parse it to object; otherwise treat as human-readable format
   */
  private parseSchema(schemaStr: string): cedar.Schema {
    const trimmed = schemaStr.trim();
    if (trimmed.startsWith('{')) {
      // JSON format - parse to object
      try {
        return JSON.parse(trimmed) as cedar.SchemaJson<string>;
      } catch {
        throw new Error('Invalid JSON schema format');
      }
    }
    // Human-readable format - pass as string
    return trimmed;
  }

  /**
   * Make an authorization decision
   */
  isAuthorized(request: AuthorizationRequest): AuthorizationResponse {
    // Convert entities to Cedar format
    const cedarEntities: cedar.EntityJson[] = request.entities.map((e) => ({
      uid: { type: e.uid.type, id: e.uid.id },
      attrs: e.attrs as Record<string, cedar.CedarValueJson>,
      parents: e.parents.map((p) => ({ type: p.type, id: p.id })),
    }));

    // Build the authorization call
    const authCall: cedar.AuthorizationCall = {
      principal: { type: request.principal.type, id: request.principal.id },
      action: { type: request.action.type, id: request.action.id },
      resource: { type: request.resource.type, id: request.resource.id },
      context: (request.context ?? {}) as cedar.Context,
      policies: { staticPolicies: this.policies },
      entities: cedarEntities,
      schema: this.schema,
    };

    const result = cedar.isAuthorized(authCall);

    if (result.type === 'failure') {
      return {
        decision: 'Deny',
        diagnostics: {
          reason: [],
          errors: result.errors.map((e) => e.message),
        },
      };
    }

    const response = result.response;
    return {
      decision: response.decision === 'allow' ? 'Allow' : 'Deny',
      diagnostics: {
        reason: response.diagnostics.reason,
        errors: response.diagnostics.errors.map((e) => `${e.policyId}: ${e.error.message}`),
      },
    };
  }

  /**
   * Batch authorization - check multiple requests
   */
  batchIsAuthorized(requests: AuthorizationRequest[]): AuthorizationResponse[] {
    return requests.map((req) => this.isAuthorized(req));
  }

  /**
   * Update the policies
   */
  updatePolicies(policies: string): void {
    this.policies = policies;
    this.validatePolicies();
  }

  /**
   * Update the schema
   */
  updateSchema(schema: string): void {
    this.schema = this.parseSchema(schema);
    // Validate policies against new schema
    if (this.policies) {
      this.validatePolicies();
    }
  }

  /**
   * Validate policies (optionally against schema)
   */
  private validatePolicies(): void {
    // Parse and validate the policies
    const policySet: cedar.PolicySet = { staticPolicies: this.policies };
    const parseResult = cedar.checkParsePolicySet(policySet);

    if (parseResult.type === 'failure') {
      const errors = parseResult.errors.map((e) => e.message).join(', ');
      throw new Error(`Invalid Cedar policies: ${errors}`);
    }

    // If schema is provided, validate policies against it
    if (this.schema) {
      const validateCall: cedar.ValidationCall = {
        validationSettings: { mode: 'strict' },
        schema: this.schema,
        policies: policySet,
      };

      const validateResult = cedar.validate(validateCall);

      if (validateResult.type === 'failure') {
        const errors = validateResult.errors.map((e) => e.message).join(', ');
        throw new Error(`Schema validation failed: ${errors}`);
      }

      if (validateResult.validationErrors && validateResult.validationErrors.length > 0) {
        const errors = validateResult.validationErrors.map((e) => e.error.message).join(', ');
        throw new Error(`Policy validation errors: ${errors}`);
      }
    }
  }
}

/**
 * Create an authorizer from policies and optional schema
 */
export function createAuthorizer(policies: string, schema?: string): CedarAuthorizer {
  return new CedarAuthorizer({ policies, schema });
}
