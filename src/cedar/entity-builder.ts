import {
  CognitoTokenClaims,
  CognitoIdTokenClaims,
  isIdToken,
  getUserIdentifier,
  getGroups,
  getCustomAttributes,
} from '../cognito/token-types.js';

/**
 * Cedar entity representation
 */
export interface CedarEntity {
  uid: {
    type: string;
    id: string;
  };
  attrs: Record<string, CedarValue>;
  parents: Array<{ type: string; id: string }>;
}

/**
 * Cedar value types
 */
export type CedarValue =
  | string
  | number
  | boolean
  | { __entity: { type: string; id: string } }
  | { __extn: { fn: string; arg: string } }
  | CedarValue[]
  | { [key: string]: CedarValue };

/**
 * Configuration for entity building
 */
export interface EntityBuilderConfig {
  /**
   * Namespace for Cedar types (e.g., "MyApp")
   */
  namespace: string;

  /**
   * Type name for user entities (default: "User")
   */
  userTypeName?: string;

  /**
   * Type name for group entities (default: "CognitoGroup")
   */
  groupTypeName?: string;

  /**
   * Custom attribute mapping - maps token claims to entity attributes
   */
  attributeMapping?: Record<string, string>;

  /**
   * Whether to include all custom attributes from the token
   */
  includeCustomAttributes?: boolean;

  /**
   * Whether to include standard profile claims (email, name, etc.)
   */
  includeProfileClaims?: boolean;
}

/**
 * Builds Cedar entities from Cognito tokens
 */
export class EntityBuilder {
  private readonly config: EntityBuilderConfig;

  constructor(config: EntityBuilderConfig) {
    this.config = {
      userTypeName: 'User',
      groupTypeName: 'CognitoGroup',
      includeCustomAttributes: true,
      includeProfileClaims: true,
      ...config,
    };
  }

  /**
   * Build all entities from token claims (user + groups)
   */
  buildEntities(claims: CognitoTokenClaims): CedarEntity[] {
    const entities: CedarEntity[] = [];

    // Build group entities first
    const groups = getGroups(claims);
    for (const group of groups) {
      entities.push(this.buildGroupEntity(group));
    }

    // Build user entity
    entities.push(this.buildUserEntity(claims));

    return entities;
  }

  /**
   * Build a user entity from token claims
   */
  buildUserEntity(claims: CognitoTokenClaims): CedarEntity {
    const username = getUserIdentifier(claims);
    const groups = getGroups(claims);

    const attrs: Record<string, CedarValue> = {
      sub: claims.sub,
      username: username,
    };

    // Add profile claims from ID token
    if (this.config.includeProfileClaims && isIdToken(claims)) {
      this.addProfileClaims(attrs, claims);
    }

    // Add custom attributes from ID token
    // Skip attributes that are being mapped via attributeMapping to avoid duplicates
    if (this.config.includeCustomAttributes && isIdToken(claims)) {
      const mappedClaimNames = new Set(
        Object.keys(this.config.attributeMapping || {}).map(k => k.replace('custom:', ''))
      );
      const customAttrs = getCustomAttributes(claims);
      for (const [key, value] of Object.entries(customAttrs)) {
        if (!mappedClaimNames.has(key)) {
          attrs[key] = value;
        }
      }
    }

    // Apply custom attribute mapping
    if (this.config.attributeMapping) {
      for (const [claimName, attrName] of Object.entries(this.config.attributeMapping)) {
        const value = (claims as unknown as Record<string, unknown>)[claimName];
        if (value !== undefined) {
          attrs[attrName] = this.convertToCedarValue(value);
        }
      }
    }

    // Add groups as an attribute (set of strings)
    attrs.groups = groups;

    return {
      uid: {
        type: `${this.config.namespace}::${this.config.userTypeName}`,
        id: username,
      },
      attrs,
      parents: groups.map((group) => ({
        type: `${this.config.namespace}::${this.config.groupTypeName}`,
        id: group,
      })),
    };
  }

  /**
   * Build a group entity
   */
  buildGroupEntity(groupName: string): CedarEntity {
    return {
      uid: {
        type: `${this.config.namespace}::${this.config.groupTypeName}`,
        id: groupName,
      },
      attrs: {
        name: groupName,
      },
      parents: [],
    };
  }

  /**
   * Get the principal reference for authorization requests
   */
  getPrincipal(claims: CognitoTokenClaims): { type: string; id: string } {
    return {
      type: `${this.config.namespace}::${this.config.userTypeName}`,
      id: getUserIdentifier(claims),
    };
  }

  /**
   * Build an action reference
   */
  buildAction(actionName: string): { type: string; id: string } {
    return {
      type: `${this.config.namespace}::Action`,
      id: actionName,
    };
  }

  /**
   * Build a resource reference
   */
  buildResource(resourceType: string, resourceId: string): { type: string; id: string } {
    return {
      type: `${this.config.namespace}::${resourceType}`,
      id: resourceId,
    };
  }

  private addProfileClaims(attrs: Record<string, CedarValue>, claims: CognitoIdTokenClaims): void {
    if (claims.email !== undefined) {
      attrs.email = claims.email;
    }
    if (claims.email_verified !== undefined) {
      attrs.email_verified = claims.email_verified;
    }
    if (claims.name !== undefined) {
      attrs.name = claims.name;
    }
    if (claims.given_name !== undefined) {
      attrs.given_name = claims.given_name;
    }
    if (claims.family_name !== undefined) {
      attrs.family_name = claims.family_name;
    }
    if (claims.phone_number !== undefined) {
      attrs.phone_number = claims.phone_number;
    }
    if (claims.preferred_username !== undefined) {
      attrs.preferred_username = claims.preferred_username;
    }
  }

  private convertToCedarValue(value: unknown): CedarValue {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.convertToCedarValue(v));
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, CedarValue> = {};
      for (const [k, v] of Object.entries(value)) {
        result[k] = this.convertToCedarValue(v);
      }
      return result;
    }
    return String(value);
  }
}
