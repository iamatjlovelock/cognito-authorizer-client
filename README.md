# Cognito Authorization Client

A local authorization client for Amazon Cognito customers using Cedar policies. This client validates Cognito tokens and evaluates Cedar policies locally, enabling fast, offline-capable authorization decisions.

## Features

- **Token Validation** - Validates Cognito ID and access tokens using JWKS
- **Cedar Policy Evaluation** - Local policy evaluation using `@cedar-policy/cedar-wasm`
- **Amazon Verified Permissions Integration** - Load policies and schema from AVP policy stores
- **Automatic Cache Refresh** - Periodically checks for policy updates and reloads when changed
- **Entity Mapping** - Automatically maps Cognito token claims to Cedar entities
- **Group-Based Authorization** - Native support for Cognito user groups as Cedar parent entities
- **HTTP API** - REST endpoints for authorization requests
- **Batch Authorization** - Check multiple requests with a single token validation
- **Schema Validation** - Cedar schema validation in strict mode
- **Transparency Files** - Local copies of AVP policies and schema for debugging

## Integration Guides

Two integration guides are available depending on your needs:

| Guide | Audience | Description |
|-------|----------|-------------|
| [cac-integration-guide-humans.md](./cac-integration-guide-humans.md) | Human engineers | Narrative guide with explanations, examples, and troubleshooting. Start here if you're integrating CAC into your application. |
| [cac-integration-guide-agents.md](./cac-integration-guide-agents.md) | AI coding agents | Structured reference with verification steps and questions to ask. Optimized for LLM-assisted development workflows. |

Both guides cover the same technical content—choose based on who (or what) is doing the integration work.

## Installation

```bash
npm install
npm run build
```

## Quick Start

### Using Amazon Verified Permissions (Recommended)

1. Create a `config.json` with your AVP policy store:
```json
{
  "cognito": {
    "region": "us-east-1",
    "userPoolId": "us-east-1_XXXXXXXXX",
    "clientId": "your-app-client-id"
  },
  "cedar": {
    "namespace": "MyApp",
    "source": "avp",
    "policyStoreId": "your-policy-store-id",
    "loadSchemaFromAVP": true,
    "refreshIntervalSeconds": 120
  }
}
```

2. Start the authorization server:
```bash
npm run dev
```

3. Make an authorization request:
```bash
curl -X POST http://localhost:3000/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJraWQiOi...",
    "action": "REVIEW",
    "resource": { "type": "Contract", "id": "contract-123" },
    "additionalEntities": [
      {
        "uid": { "type": "MyApp::Contract", "id": "contract-123" },
        "attrs": { "Region": "US", "Status": "Draft", "Size": "S" },
        "parents": []
      }
    ]
  }'
```

### Using Local Policy Files

1. Create configuration files:
```bash
cp config.example.json config.json
cp policies.example.cedar policies.cedar
```

2. Edit `config.json`:
```json
{
  "cognito": {
    "region": "us-east-1",
    "userPoolId": "us-east-1_XXXXXXXXX",
    "clientId": "your-app-client-id"
  },
  "cedar": {
    "namespace": "MyApp",
    "source": "file",
    "policies": "./policies.cedar",
    "schema": "./schema.cedarschema.json"
  }
}
```

## Configuration

### Full Configuration Reference

```json
{
  "cognito": {
    "region": "us-east-1",
    "userPoolId": "us-east-1_XXXXXXXXX",
    "clientId": "your-app-client-id"
  },
  "cedar": {
    "namespace": "MyApp",
    "source": "avp",
    "policyStoreId": "your-policy-store-id",
    "loadSchemaFromAVP": true,
    "schemaOverride": "./local-schema.json",
    "schemaOverrideIsInline": false,
    "refreshIntervalSeconds": 120
  },
  "server": {
    "port": 3000,
    "host": "localhost"
  },
  "entities": {
    "userTypeName": "User",
    "groupTypeName": "CognitoGroup",
    "includeCustomAttributes": true,
    "includeProfileClaims": true,
    "attributeMapping": {
      "custom:user_type": "type",
      "custom:user_region": "Region"
    }
  }
}
```

### Cedar Configuration Options

#### AVP Source (`source: "avp"`)

| Option | Type | Description |
|--------|------|-------------|
| `namespace` | string | Cedar namespace for types |
| `source` | `"avp"` | Use Amazon Verified Permissions |
| `policyStoreId` | string | AVP policy store ID |
| `loadSchemaFromAVP` | boolean | Load schema from AVP (default: true) |
| `schemaOverride` | string | Optional local schema file path |
| `schemaOverrideIsInline` | boolean | Whether schemaOverride is inline content |
| `refreshIntervalSeconds` | number | Cache check interval in seconds (0 = disabled) |

#### File Source (`source: "file"`)

| Option | Type | Description |
|--------|------|-------------|
| `namespace` | string | Cedar namespace for types |
| `source` | `"file"` | Use local files |
| `policies` | string | Path to Cedar policies file |
| `schema` | string | Path to Cedar schema file (optional) |
| `policiesAreInline` | boolean | Whether policies/schema are inline content |

### Entity Configuration

| Option | Type | Description |
|--------|------|-------------|
| `userTypeName` | string | Cedar type name for users (default: `User`) |
| `groupTypeName` | string | Cedar type name for groups (default: `CognitoGroup`) |
| `includeCustomAttributes` | boolean | Include custom attributes from token |
| `includeProfileClaims` | boolean | Include profile claims (email, name, etc.) |
| `attributeMapping` | object | Map token claims to Cedar attribute names |

### Attribute Mapping

The `attributeMapping` configuration maps Cognito token claims to Cedar entity attributes:

```json
"attributeMapping": {
  "custom:user_type": "type",
  "custom:user_region": "Region"
}
```

This maps:
- `custom:user_type` claim -> `type` attribute on User entity
- `custom:user_region` claim -> `Region` attribute on User entity

**Note:** Mapped claims are not duplicated. If `custom:user_region` is mapped to `Region`, the entity will only have `Region`, not both.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `COGNITO_REGION` | AWS region |
| `COGNITO_USER_POOL_ID` | Cognito User Pool ID |
| `COGNITO_CLIENT_ID` | App client ID |
| `CEDAR_NAMESPACE` | Cedar namespace |
| `CEDAR_SOURCE` | `file` or `avp` |
| `CEDAR_POLICIES_PATH` | Path to policies (file source) |
| `CEDAR_SCHEMA_PATH` | Path to schema (file source) |
| `AVP_POLICY_STORE_ID` | AVP policy store ID |
| `AVP_LOAD_SCHEMA` | Load schema from AVP (`true`/`false`) |
| `AVP_REFRESH_INTERVAL` | Refresh interval in seconds |
| `PORT` | Server port |
| `HOST` | Server host |

## API Reference

### POST /authorize

Authorize a single request.

**Request:**
```json
{
  "token": "eyJraWQiOi...",
  "action": "REVIEW",
  "resource": {
    "type": "Contract",
    "id": "contract-123"
  },
  "context": {},
  "additionalEntities": [
    {
      "uid": { "type": "MyApp::Contract", "id": "contract-123" },
      "attrs": {
        "Region": "US",
        "Client": "Acme",
        "Status": "Draft",
        "Size": "S"
      },
      "parents": []
    }
  ]
}
```

**Response:**
```json
{
  "allowed": true,
  "decision": "Allow",
  "principal": {
    "type": "MyApp::User",
    "id": "user-sub-123"
  },
  "diagnostics": {
    "reason": ["policy-id"],
    "errors": []
  }
}
```

### POST /batch-authorize

Authorize multiple requests with a single token.

**Request:**
```json
{
  "token": "eyJraWQiOi...",
  "requests": [
    {
      "action": "REVIEW",
      "resource": { "type": "Contract", "id": "contract-1" },
      "additionalEntities": [...]
    },
    {
      "action": "EDIT",
      "resource": { "type": "Contract", "id": "contract-2" },
      "additionalEntities": [...]
    }
  ]
}
```

### POST /validate-token

Validate a token without authorization.

**Request:**
```json
{
  "token": "eyJraWQiOi..."
}
```

**Response:**
```json
{
  "valid": true,
  "tokenUse": "id",
  "sub": "abc123",
  "exp": 1234567890,
  "expiresAt": "2024-01-15T12:00:00.000Z"
}
```

### POST /refresh-policies

Manually refresh policies from AVP.

**Response:**
```json
{
  "success": true,
  "message": "Policies refreshed from AVP"
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

## Cache Refresh Mechanism

When using AVP as the policy source, the client automatically checks for policy updates:

1. On startup, records the policy store's `lastUpdatedDate`
2. Every `refreshIntervalSeconds` seconds, checks the current `lastUpdatedDate`
3. If the date has changed, reloads all policies and schema from AVP
4. Updates local transparency files (`avp-policies.txt`, `avp-schema.json`)

Set `refreshIntervalSeconds: 0` to disable automatic cache checking.

## Transparency Files

When loading from AVP, the client writes local copies for debugging:

### avp-policies.txt
```
# ============================================================
# THIS FILE IS A READ-ONLY COPY OF POLICIES FROM AVP
# ============================================================
# Policy Store ID: your-policy-store-id
# Generated: 2024-01-15T12:00:00.000Z
#
# DO NOT EDIT THIS FILE DIRECTLY
# All changes must be applied to the policy store in
# Amazon Verified Permissions (AVP).
# ============================================================

@id("my-policy")
permit (
    principal in MyApp::CognitoGroup::"admins",
    action,
    resource
);
```

### avp-schema.json
```json
{
  "_notice": {
    "message": "THIS FILE IS A READ-ONLY COPY OF THE SCHEMA FROM AVP",
    "policyStoreId": "your-policy-store-id",
    "generated": "2024-01-15T12:00:00.000Z",
    "warning": "DO NOT EDIT THIS FILE DIRECTLY..."
  },
  "schema": { ... }
}
```

## Programmatic Usage

```typescript
import { CognitoAuthorizationClient, createClient } from 'cognito-authorization-client';

const config = {
  cognito: {
    region: 'us-east-1',
    userPoolId: 'us-east-1_XXXXXXXXX',
    clientId: 'your-app-client-id',
  },
  cedar: {
    namespace: 'MyApp',
    source: 'avp',
    policyStoreId: 'your-policy-store-id',
    loadSchemaFromAVP: true,
    refreshIntervalSeconds: 120,
  },
};

// Create client (async due to AVP policy loading)
const client = await createClient(config);

// Authorize a request
const result = await client.authorize({
  token: cognitoIdToken,
  action: 'REVIEW',
  resource: { type: 'Contract', id: 'contract-123' },
  additionalEntities: [
    {
      uid: { type: 'MyApp::Contract', id: 'contract-123' },
      attrs: { Region: 'US', Size: 'S' },
      parents: [],
    },
  ],
});

if (result.allowed) {
  console.log('Access granted');
} else {
  console.log('Access denied:', result.diagnostics.errors);
}

// Manually refresh policies
await client.refreshPoliciesFromAVP();

// Check for updates and refresh if needed
const wasRefreshed = await client.checkAndRefreshCache();

// Stop background cache checking
client.stopCacheCheck();
```

## Writing Cedar Policies

### Basic Group-Based Policy

```cedar
@id("admin-access")
permit (
    principal in MyApp::CognitoGroup::"admins",
    action,
    resource
);
```

### Attribute-Based Policy with Optional Attributes

When using optional attributes in conditions, use the `has` operator for safe access:

```cedar
@id("region-based-access")
permit (
    principal in MyApp::CognitoGroup::"regional-users",
    action in [MyApp::Action::"REVIEW", MyApp::Action::"EDIT"],
    resource is MyApp::Contract
)
when {
    principal has Region && principal.Region == resource.Region
};
```

### Resource Attribute Conditions

```cedar
@id("small-contract-review")
permit (
    principal in MyApp::CognitoGroup::"interns",
    action == MyApp::Action::"REVIEW",
    resource is MyApp::Contract
)
when {
    resource.Size == "S"
};
```

## Token Claims Mapping

### ID Token Claims

| Cognito Claim | Cedar Attribute |
|---------------|-----------------|
| `sub` | `sub` |
| `cognito:username` | `username` |
| `cognito:groups` | `groups` (Set) + parent entities |
| `email` | `email` |
| `email_verified` | `email_verified` |
| `name` | `name` |
| `custom:*` | Via `attributeMapping` or stripped prefix |

### Access Token Claims

| Cognito Claim | Cedar Attribute |
|---------------|-----------------|
| `sub` | `sub` |
| `username` | `username` |
| `cognito:groups` | `groups` (Set) + parent entities |
| `scope` | `scopes` |

## Entity Hierarchy

The client automatically creates a Cedar entity hierarchy from Cognito tokens:

```
MyApp::CognitoGroup::"admins"
    └── MyApp::User::"user-sub-123" (member of admins)

MyApp::CognitoGroup::"developers"
    └── MyApp::User::"user-sub-123" (member of developers)
```

This enables `principal in MyApp::CognitoGroup::"admins"` policies to work correctly.

## Architecture

```
┌─────────────────────┐     ┌─────────────────────────────────────┐
│   Your Application  │────▶│  Cognito Authorization Client       │
│                     │     │                                     │
│                     │     │  ┌─────────────────────────────┐    │
│                     │◀────│  │ Token Validator             │    │
│                     │     │  │ - Verify JWT signature      │    │
│                     │     │  │ - Check token expiry        │    │
│                     │     │  └─────────────────────────────┘    │
│                     │     │  ┌─────────────────────────────┐    │
│                     │     │  │ Entity Builder              │    │
│                     │     │  │ - Map claims to entities    │    │
│                     │     │  │ - Build group hierarchy     │    │
│                     │     │  └─────────────────────────────┘    │
│                     │     │  ┌─────────────────────────────┐    │
│                     │     │  │ Cedar Authorizer (WASM)     │    │
│                     │     │  │ - Evaluate policies         │    │
│                     │     │  │ - Strict schema validation  │    │
│                     │     │  └─────────────────────────────┘    │
│                     │     │  ┌─────────────────────────────┐    │
│                     │     │  │ AVP Policy Store            │    │
│                     │     │  │ - Load policies from AVP    │    │
│                     │     │  │ - Cache refresh mechanism   │    │
│                     │     │  └─────────────────────────────┘    │
└─────────────────────┘     └─────────────────────────────────────┘
         │                              │                │
         ▼                              ▼                ▼
┌─────────────────────┐     ┌─────────────────┐  ┌─────────────────┐
│  Cognito User Pool  │     │  Amazon Verified │  │  Local Policy   │
│  (JWKS validation)  │     │  Permissions     │  │  Files          │
└─────────────────────┘     └─────────────────┘  └─────────────────┘
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript |
| `npm run dev` | Start server in development mode |
| `npm run start` | Start production server |
| `npm run test` | Run tests |

## License

MIT
