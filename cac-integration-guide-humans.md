# Cognito Authorization Client - Integration Guide

This guide walks you through integrating the Cognito Authorization Client (CAC) into your application. CAC provides local Cedar policy evaluation using WebAssembly, with policies loaded from Amazon Verified Permissions (AVP) or local files.

---

## Quick Reference: Common Pitfalls

Before diving in, here are the mistakes that trip up most integrations:

| Issue | What Goes Wrong | Fix |
|-------|-----------------|-----|
| Using access token instead of ID token | Policies checking custom attributes always deny | Use `session.tokens?.idToken` |
| Pre-Token Lambda strips custom attributes | ID token missing `custom:user_region` | Update Lambda to include attributes in `claimsToAddOrOverride` |
| Attribute name case mismatch | Policy uses `Region`, code sends `region` | Cedar is case-sensitive—match exactly |
| Translating attribute values | Policy expects `"Y"`, app sends `"TRUE"` | Pass raw values as stored |
| Wrong GitHub repo URL | 404 during npm install | Use `cognito-authorizer-client` (not `cognito-authorization-client`) |
| Missing `schemaOverrideIsInline` | TypeScript compilation error | Add `schemaOverrideIsInline: false` to AVP config |
| Placeholder entities for list authorization | Wildcard attributes don't match policies | Authorize each resource individually |

---

## What CAC Does

The Cognito Authorization Client:
- Validates Amazon Cognito JWT tokens (ID and access tokens)
- Evaluates Cedar policies locally using WebAssembly
- Maps Cognito token claims to Cedar entities automatically
- Loads policies from Amazon Verified Permissions or local files
- Works as an SDK embedded in your app or as a standalone HTTP service

---

## Before You Start

### Verify Your ID Token Contains the Right Claims

Decode a sample ID token (use jwt.io) and confirm it includes the custom attributes your policies need. If you have a Pre-Token Generation Lambda trigger, check that it passes through these attributes in `claimsToAddOrOverride`.

### Fetch Your AVP Schema

Always work from the live schema, not a cached copy:

```bash
aws verifiedpermissions get-schema \
  --policy-store-id YOUR_POLICY_STORE_ID \
  --region us-east-1 \
  --query 'schema' \
  --output text | jq '.' > avp-schema.json
```

Compare the User entity attributes in the schema with your ID token claims. The attribute names must match after stripping the `custom:` prefix.

---

## Installation

**Repository URL:** `https://github.com/iamatjlovelock/cognito-authorizer-client`

Note the naming: the repo is `cognito-authorizer-client` but the npm package is `cognito-authorization-client`.

### SDK Installation (Recommended)

```bash
npm install git+https://github.com/iamatjlovelock/cognito-authorizer-client.git

# Build after installation (required for git installs)
cd node_modules/cognito-authorization-client && npm run build && cd ../..
```

### Standalone HTTP Service

```bash
git clone https://github.com/iamatjlovelock/cognito-authorizer-client.git
cd cognito-authorizer-client
npm install && npm run build && npm start
```

---

## Configuration

### Using Amazon Verified Permissions

```typescript
import { createClient } from 'cognito-authorization-client';

const client = await createClient({
  cognito: {
    region: 'us-east-1',
    userPoolId: 'us-east-1_ABC123xyz',
    clientId: '1abc2defg3hijklmno4pqrs5t',
  },
  cedar: {
    namespace: 'MyApp',
    source: 'avp' as const,
    policyStoreId: 'BWRtaygo7MkaFaBz8BbHHz',
    loadSchemaFromAVP: true,
    schemaOverrideIsInline: false,  // Required for TypeScript
    refreshIntervalSeconds: 120,
  },
  entities: {
    userTypeName: 'User',
    groupTypeName: 'CognitoGroup',
    includeCustomAttributes: true,
    includeProfileClaims: true,
    attributeMapping: {
      'custom:user_region': 'user_region',
      'custom:user_type': 'user_type',
    },
  },
});
```

### Using Local Policy Files

```typescript
const client = await createClient({
  cognito: { /* same as above */ },
  cedar: {
    namespace: 'MyApp',
    source: 'file' as const,
    policies: './policies.cedar',
    policiesAreInline: false,
    schema: './schema.cedarschema.json',
  },
  entities: { /* same as above */ },
});
```

---

## Making Authorization Requests

### Basic Authorization

```typescript
const result = await client.authorize({
  token: idToken,  // Must be ID token, not access token
  action: 'REVIEW',
  resource: { type: 'Contract', id: 'contract-123' },
  additionalEntities: [{
    uid: { type: 'MyApp::Contract', id: 'contract-123' },
    attrs: {
      Region: contract.region,    // Pass raw values
      Client: contract.client,
      Status: contract.status,
    },
    parents: [],
  }],
});

if (result.allowed) {
  // User can perform this action
}
```

### Checking Multiple Actions

There's no batch method in the SDK. Use `Promise.all` for parallel authorization:

```typescript
const actions = ['REVIEW', 'EDIT', 'APPROVE', 'ARCHIVE'];
const results = await Promise.all(
  actions.map(action => client.authorize({
    token: idToken,
    action,
    resource: { type: 'Contract', id: contractId },
    additionalEntities: [contractEntity],
  }))
);

const permissions = {
  review: results[0].allowed,
  edit: results[1].allowed,
  approve: results[2].allowed,
  archive: results[3].allowed,
};
```

---

## Authorizing Resource Lists

When showing a list of resources (e.g., "all contracts the user can view"), you need to authorize access to each one. Don't use placeholder entities with wildcard attributes—they won't match real policy conditions.

### Authorize Each Resource Individually

```typescript
router.get('/contracts', async (req, res) => {
  const idToken = getIdToken(req);
  const allContracts = getContracts();

  const authResults = await Promise.all(
    allContracts.map(contract =>
      client.authorize({
        token: idToken,
        action: 'REVIEW',
        resource: { type: 'Contract', id: contract.id },
        additionalEntities: [buildContractEntity(contract)],
      })
    )
  );

  const authorizedContracts = allContracts.filter((_, i) => authResults[i].allowed);
  res.json({ contracts: authorizedContracts });
});
```

Since CAC evaluates policies locally via WebAssembly, this performs well even with many resources.

### Avoid Hardcoding Policy Logic

Don't filter resources in application code based on user attributes:

```typescript
// Avoid this—it duplicates policy logic
const userRegion = claims['custom:user_region'];
const visibleContracts = allContracts.filter(c => c.region === userRegion);
```

Let the policy engine make authorization decisions. This keeps policy changes from requiring code changes.

---

## ID Token vs Access Token

This is the most common integration mistake. Custom attributes only appear in ID tokens:

| Claim Type | ID Token | Access Token |
|------------|----------|--------------|
| Custom attributes (`custom:*`) | Yes | No |
| Cognito groups | Yes | Yes |
| OAuth scopes | No | Yes |

Your frontend should send both tokens:

```typescript
const session = await fetchAuthSession();
const accessToken = session.tokens?.accessToken?.toString();
const idToken = session.tokens?.idToken?.toString();

// Send both
headers['Authorization'] = `Bearer ${accessToken}`;  // API auth
headers['X-Id-Token'] = idToken;                      // CAC authorization
```

---

## Attribute Mapping

### Principal Attributes (from ID Token)

Strip the `custom:` prefix. Don't rename attributes:

```typescript
attributeMapping: {
  'custom:user_region': 'user_region',  // Correct
  'custom:user_type': 'user_type',
}

// Don't do this:
attributeMapping: {
  'custom:user_region': 'Region',  // Wrong—this renames the attribute
}
```

### Resource Attributes (from Application Data)

Pass raw values. Don't translate:

```typescript
// Correct
attrs: { Government: contract.government }  // Passes "Y" or "N" as stored

// Wrong
attrs: { Government: contract.government === 'Y' ? 'TRUE' : 'FALSE' }
```

---

## Example Integration

### CAC Client Module

```typescript
// src/lib/cac-client.ts
import { createClient, CognitoAuthorizationClient } from 'cognito-authorization-client';

const NAMESPACE = 'MyApp';
let authClient: CognitoAuthorizationClient | null = null;

export async function initializeCACClient(): Promise<void> {
  if (authClient) return;

  authClient = await createClient({
    cognito: {
      region: process.env.AWS_REGION || 'us-east-1',
      userPoolId: process.env.USER_POOL_ID!,
      clientId: process.env.USER_POOL_CLIENT_ID!,
    },
    cedar: {
      namespace: NAMESPACE,
      source: 'avp' as const,
      policyStoreId: process.env.AVP_POLICY_STORE_ID!,
      loadSchemaFromAVP: true,
      schemaOverrideIsInline: false,
      refreshIntervalSeconds: 120,
    },
    entities: {
      userTypeName: 'User',
      groupTypeName: 'CognitoGroup',
      includeCustomAttributes: true,
      includeProfileClaims: true,
      attributeMapping: {
        'custom:user_region': 'user_region',
        'custom:user_type': 'user_type',
      },
    },
  });
}

export function buildContractEntity(contract: Contract) {
  return {
    uid: { type: `${NAMESPACE}::Contract`, id: contract.id },
    attrs: {
      Region: contract.region,
      Size: contract.size,
      Client: contract.client,
      Status: contract.status,
    },
    parents: [],
  };
}

export async function authorizeContractAction(
  idToken: string,
  action: string,
  contract: Contract
): Promise<boolean> {
  if (!authClient) throw new Error('CAC client not initialized');

  const result = await authClient.authorize({
    token: idToken,
    action,
    resource: { type: 'Contract', id: contract.id },
    additionalEntities: [buildContractEntity(contract)],
  });

  return result.allowed;
}
```

### Server Initialization

```typescript
// src/index.ts
import express from 'express';
import { initializeCACClient } from './lib/cac-client';

const app = express();

async function start() {
  await initializeCACClient();
  app.listen(3001);
}

start();
```

### Route Handler

```typescript
// src/routes/contracts.ts
import { authorizeContractAction } from '../lib/cac-client';

router.get('/:id', async (req, res) => {
  const idToken = req.headers['x-id-token'] as string;
  if (!idToken) return res.status(401).json({ error: 'Missing ID token' });

  const contract = getContractById(req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contract not found' });

  const allowed = await authorizeContractAction(idToken, 'REVIEW', contract);
  if (!allowed) return res.status(403).json({ error: 'Access denied' });

  res.json({ contract });
});
```

---

## HTTP API Reference

If running CAC as a standalone service:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/authorize` | POST | Single authorization request |
| `/batch-authorize` | POST | Multiple authorization requests |
| `/validate-token` | POST | Validate token without authorization |
| `/refresh-policies` | POST | Force reload policies from AVP |
| `/health` | GET | Health check |

---

## Troubleshooting

### "Cannot find module 'cognito-authorization-client'"

Build the package after git installation:
```bash
cd node_modules/cognito-authorization-client && npm run build
```

### Authorization always denies

1. Confirm you're using the ID token, not the access token
2. Decode the token at jwt.io—verify custom attributes are present
3. Check attribute name case matches exactly
4. Ensure `additionalEntities` includes the resource

### "entity does not exist" error

Include the resource in `additionalEntities`:
```typescript
additionalEntities: [{
  uid: { type: 'MyApp::Contract', id: 'contract-123' },
  attrs: { Region: 'US', Status: 'Active' },
  parents: [],
}]
```

---

## Environment Variables

```bash
AWS_REGION=us-east-1
USER_POOL_ID=us-east-1_ABC123xyz
USER_POOL_CLIENT_ID=1abc2defg3hijklmno4pqrs5t
AVP_POLICY_STORE_ID=BWRtaygo7MkaFaBz8BbHHz

# AWS credentials (or use IAM role)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```
