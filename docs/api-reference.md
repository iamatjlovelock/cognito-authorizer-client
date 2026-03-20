# API Reference

This document provides detailed API documentation for the Cognito Authorization Client.

## Table of Contents

- [CognitoAuthorizationClient](#cognitoauthorizationclient)
- [TokenValidator](#tokenvalidator)
- [EntityBuilder](#entitybuilder)
- [CedarAuthorizer](#cedarauthorizer)
- [Types](#types)

---

## CognitoAuthorizationClient

The main client class that combines token validation, entity building, and Cedar authorization.

### Constructor

```typescript
new CognitoAuthorizationClient(config: Config)
```

**Parameters:**
- `config` - Configuration object (see [Config](#config))

**Example:**
```typescript
const client = new CognitoAuthorizationClient({
  cognito: {
    region: 'us-east-1',
    userPoolId: 'us-east-1_xxx',
  },
  cedar: {
    namespace: 'MyApp',
    policies: './policies.cedar',
  },
});
```

### Methods

#### authorize(request: AuthzRequest): Promise<AuthzResponse>

Authorize a request using a Cognito token.

**Parameters:**
- `request.token` - Cognito ID or access token (JWT)
- `request.action` - Action name (e.g., "read", "write")
- `request.resource.type` - Resource type name
- `request.resource.id` - Resource identifier
- `request.context` - Optional context object
- `request.additionalEntities` - Optional additional Cedar entities

**Returns:** `AuthzResponse`

**Example:**
```typescript
const response = await client.authorize({
  token: 'eyJraWQiOi...',
  action: 'read',
  resource: { type: 'Document', id: 'doc-123' },
  context: { ipAddress: '192.168.1.1' },
});

if (response.allowed) {
  // Access granted
}
```

#### validateToken(token: string): Promise<ValidatedToken>

Validate a token without performing authorization.

**Parameters:**
- `token` - Cognito ID or access token

**Returns:** `ValidatedToken` with claims and header

**Example:**
```typescript
const validated = await client.validateToken(token);
console.log(validated.claims.sub);
console.log(validated.claims['cognito:groups']);
```

#### reloadPolicies(policies: string): void

Hot-reload Cedar policies without restarting.

**Parameters:**
- `policies` - New Cedar policies as a string

#### reloadSchema(schema: string): void

Update the Cedar schema.

**Parameters:**
- `schema` - New Cedar schema as JSON string

#### getEntityBuilder(): EntityBuilder

Get the entity builder for custom entity creation.

---

## TokenValidator

Validates Cognito JWT tokens using JWKS.

### Constructor

```typescript
new TokenValidator(config: TokenValidatorConfig, jwksClient?: JwksClient)
```

**Parameters:**
- `config.issuer` - Cognito issuer URL
- `config.audience` - Expected audience (for ID tokens)
- `config.clientId` - Expected client ID (for access tokens)
- `config.clockTolerance` - Clock skew tolerance in seconds (default: 60)

### Methods

#### validateIdToken(token: string): Promise<ValidatedToken<CognitoIdTokenClaims>>

Validate a Cognito ID token.

**Throws:** `TokenValidationError` if validation fails

#### validateAccessToken(token: string): Promise<ValidatedToken<CognitoAccessTokenClaims>>

Validate a Cognito access token.

**Throws:** `TokenValidationError` if validation fails

#### validateToken(token: string): Promise<ValidatedToken>

Validate any Cognito token (auto-detects type).

---

## EntityBuilder

Builds Cedar entities from Cognito token claims.

### Constructor

```typescript
new EntityBuilder(config: EntityBuilderConfig)
```

**Parameters:**
- `config.namespace` - Cedar namespace (e.g., "MyApp")
- `config.userTypeName` - User entity type name (default: "User")
- `config.groupTypeName` - Group entity type name (default: "CognitoGroup")
- `config.includeCustomAttributes` - Include custom:* attributes (default: true)
- `config.includeProfileClaims` - Include email, name, etc. (default: true)
- `config.attributeMapping` - Custom claim-to-attribute mapping

### Methods

#### buildEntities(claims: CognitoTokenClaims): CedarEntity[]

Build all entities (user + groups) from token claims.

**Returns:** Array of Cedar entities

**Example:**
```typescript
const entities = entityBuilder.buildEntities(claims);
// Returns: [
//   { uid: { type: 'MyApp::CognitoGroup', id: 'admins' }, attrs: {...}, parents: [] },
//   { uid: { type: 'MyApp::User', id: 'johndoe' }, attrs: {...}, parents: [...] }
// ]
```

#### buildUserEntity(claims: CognitoTokenClaims): CedarEntity

Build only the user entity.

#### buildGroupEntity(groupName: string): CedarEntity

Build a group entity.

#### getPrincipal(claims: CognitoTokenClaims): { type: string; id: string }

Get the principal reference for authorization requests.

#### buildAction(actionName: string): { type: string; id: string }

Build an action reference with the configured namespace.

#### buildResource(resourceType: string, resourceId: string): { type: string; id: string }

Build a resource reference with the configured namespace.

---

## CedarAuthorizer

Low-level Cedar policy evaluation using WASM.

### Constructor

```typescript
new CedarAuthorizer(config: AuthorizerConfig)
```

**Parameters:**
- `config.policies` - Cedar policies as text
- `config.schema` - Optional Cedar schema as JSON

**Throws:** Error if policies are invalid

### Methods

#### isAuthorized(request: AuthorizationRequest): AuthorizationResponse

Evaluate an authorization request.

**Parameters:**
- `request.principal` - Principal entity reference
- `request.action` - Action entity reference
- `request.resource` - Resource entity reference
- `request.context` - Optional context
- `request.entities` - Array of Cedar entities

**Returns:** `AuthorizationResponse` with decision and diagnostics

#### batchIsAuthorized(requests: AuthorizationRequest[]): AuthorizationResponse[]

Evaluate multiple authorization requests.

#### updatePolicies(policies: string): void

Update policies (validates on update).

#### updateSchema(schema: string): void

Update schema (re-validates policies).

---

## Types

### Config

```typescript
interface Config {
  cognito: {
    region: string;
    userPoolId: string;
    clientId?: string;
  };
  cedar: {
    namespace: string;
    policies: string;
    schema?: string;
    policiesAreInline?: boolean;  // default: false
  };
  server?: {
    port?: number;   // default: 3000
    host?: string;   // default: 'localhost'
  };
  entities?: {
    userTypeName?: string;      // default: 'User'
    groupTypeName?: string;     // default: 'CognitoGroup'
    includeCustomAttributes?: boolean;  // default: true
    includeProfileClaims?: boolean;     // default: true
    attributeMapping?: Record<string, string>;
  };
}
```

### AuthzRequest

```typescript
interface AuthzRequest {
  token: string;
  action: string;
  resource: {
    type: string;
    id: string;
  };
  context?: Record<string, unknown>;
  additionalEntities?: CedarEntity[];
}
```

### AuthzResponse

```typescript
interface AuthzResponse {
  allowed: boolean;
  decision: 'Allow' | 'Deny';
  principal: { type: string; id: string };
  diagnostics: {
    reason: string[];
    errors: string[];
  };
  claims?: CognitoTokenClaims;
}
```

### CedarEntity

```typescript
interface CedarEntity {
  uid: {
    type: string;
    id: string;
  };
  attrs: Record<string, CedarValue>;
  parents: Array<{ type: string; id: string }>;
}
```

### CedarValue

```typescript
type CedarValue =
  | string
  | number
  | boolean
  | { __entity: { type: string; id: string } }
  | { __extn: { fn: string; arg: string } }
  | CedarValue[]
  | { [key: string]: CedarValue };
```

### CognitoIdTokenClaims

```typescript
interface CognitoIdTokenClaims {
  sub: string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
  auth_time: number;
  token_use: 'id';
  'cognito:username': string;
  'cognito:groups'?: string[];
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  phone_number?: string;
  phone_number_verified?: boolean;
  preferred_username?: string;
  [key: `custom:${string}`]: string | number | boolean | undefined;
}
```

### CognitoAccessTokenClaims

```typescript
interface CognitoAccessTokenClaims {
  sub: string;
  iss: string;
  exp: number;
  iat: number;
  auth_time: number;
  jti: string;
  token_use: 'access';
  client_id: string;
  username: string;
  'cognito:groups'?: string[];
  scope?: string;
}
```

### TokenValidationError

```typescript
class TokenValidationError extends Error {
  code: string;
  cause?: Error;
}
```

Error codes:
- `TOKEN_EXPIRED` - Token has expired
- `INVALID_SIGNATURE` - Signature verification failed
- `INVALID_TOKEN_USE` - Wrong token type
- `INVALID_AUDIENCE` - Audience mismatch
- `INVALID_CLIENT_ID` - Client ID mismatch
- `CLAIM_VALIDATION_FAILED` - Generic claim validation failure
- `VALIDATION_FAILED` - Generic validation failure

---

## Utility Functions

### getUserIdentifier(claims: CognitoTokenClaims): string

Extract username from token claims.

### getGroups(claims: CognitoTokenClaims): string[]

Extract groups array from token claims.

### isIdToken(claims: CognitoTokenClaims): boolean

Check if claims are from an ID token.

### isAccessToken(claims: CognitoTokenClaims): boolean

Check if claims are from an access token.

### getCustomAttributes(claims: CognitoIdTokenClaims): Record<string, string | number | boolean>

Extract custom attributes (removes `custom:` prefix).

### createClient(config: Config): CognitoAuthorizationClient

Factory function for creating a client.

### createAuthorizer(policies: string, schema?: string): CedarAuthorizer

Factory function for creating an authorizer.
