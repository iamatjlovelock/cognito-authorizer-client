# Cognito Authorization Client - Integration Guide for Coding Agents

This document provides everything a coding agent needs to integrate the Cognito Authorization Client (CAC) into an application. It includes technical specifications, integration patterns, and questions to ask the developer when information is ambiguous or missing.

---

## ⚠️ Common Integration Mistakes - Read First!

**These are the most frequent errors. Check these before debugging:**

| Mistake | Symptom | Solution |
|---------|---------|----------|
| Using **access token** instead of **ID token** | Policies checking `principal.Region` or other custom attributes always deny | Use `session.tokens?.idToken` not `accessToken` |
| **Pre-Token Lambda** strips custom attributes | ID token missing `custom:user_region` even though it's set on user | Update Lambda to include custom attributes in `claimsToAddOrOverride` |
| **Batch requests** missing `additionalEntities` | Error: "entity does not exist" in batch but single authorize works | Include `additionalEntities` inside EACH request object, not at top level |
| **Attribute name mismatch** | Policy uses `Region`, but you send `region` (lowercase) | Cedar is case-sensitive - match exact attribute names from schema |
| **Token not refreshed** after Lambda update | Old token still missing claims | User must log out and log back in to get fresh token |
| **Translating attribute values** | Policy expects `"Y"` but app sends `"TRUE"` after translation | Pass raw data values - don't translate in the app |
| **Wrong GitHub repo URL** | 404 or SSH errors during npm install | Use `https://github.com/iamatjlovelock/cognito-authorizer-client` (not `cognito-authorization-client`) |
| **Package not built after git install** | "Cannot find module" TypeScript errors | Run `npm run build` in the package's node_modules directory |
| **Missing `schemaOverrideIsInline`** | TypeScript error about missing property | Add `schemaOverrideIsInline: false` to AVP cedar config |
| **Stale local schema copy** | Integration uses wrong attribute names | Always fetch fresh schema from AVP with `aws verifiedpermissions get-schema` |
| **Renaming attributes in mapping** | `attributeMapping` transforms `user_region` to `Region` | Only strip `custom:` prefix - don't rename (e.g., `custom:user_region` → `user_region`) |
| **Placeholder entity for list authorization** | Error: `entity "...::any" does not exist` or policy denies with wildcard attributes | Don't use placeholder entities - authorize each resource individually (see "Authorizing Resource Lists") |

---

## Overview

The Cognito Authorization Client is a local authorization solution that:
- Validates Amazon Cognito JWT tokens (ID and access tokens)
- Evaluates Cedar policies locally using WebAssembly
- Maps Cognito token claims to Cedar entities automatically
- Supports loading policies from Amazon Verified Permissions (AVP) or local files
- Provides HTTP API endpoints and programmatic SDK access

## Prerequisites

Before integration, ensure:
1. The target application uses Node.js/TypeScript
2. Users authenticate via Amazon Cognito
3. **The application can access Cognito ID tokens** (not just access tokens - see "Critical: ID Token vs Access Token" section)
4. Cedar policies exist (either in AVP or as local files)
5. AWS credentials are configured (for AVP integration)
6. **If a Pre-Token Generation Lambda exists**, it passes through custom attributes (see "Critical: Pre-Token Generation Lambda Triggers" section)

---

## Pre-Integration Verification Steps

**IMPORTANT: Always perform these verification steps before writing integration code.**

### Step 1: Fetch the Latest Schema from AVP

**Never rely on local schema copies - always fetch fresh from AVP:**

```bash
# Fetch schema from AVP policy store
aws verifiedpermissions get-schema \
  --policy-store-id YOUR_POLICY_STORE_ID \
  --region us-east-1 \
  --output json

# Save formatted schema locally for reference
aws verifiedpermissions get-schema \
  --policy-store-id YOUR_POLICY_STORE_ID \
  --region us-east-1 \
  --query 'schema' \
  --output text | jq '.' > avp-schema.json
```

**Identify from the schema:**
- User entity attributes (these must match ID token claims after stripping `custom:` prefix)
- Resource entity attributes (these must match what your application provides)
- Action names (case-sensitive)

### Step 2: Check for Pre-Token Generation Lambda

```bash
# Check if User Pool has Lambda triggers
aws cognito-idp describe-user-pool \
  --user-pool-id YOUR_USER_POOL_ID \
  --region us-east-1 \
  --query 'UserPool.LambdaConfig'
```

**If a PreTokenGeneration trigger exists:**

```bash
# Download and inspect the Lambda code
aws lambda get-function \
  --function-name LAMBDA_FUNCTION_NAME \
  --region us-east-1 \
  --query 'Code.Location' \
  --output text
```

**Verify the Lambda:**
- Includes custom attributes in `claimsToAddOrOverride` for `idTokenGeneration`
- Does NOT filter out attributes needed for authorization
- Passes through `custom:user_type`, `custom:user_region`, etc.

**Example Pre-Token Lambda (V2_0) that correctly passes attributes:**

```python
event["response"] = {
    "claimsAndScopeOverrideDetails": {
        "idTokenGeneration": {
            "claimsToAddOrOverride": {
                "custom:user_type": user_type,
                "custom:user_region": user_region,  # Include all needed attributes
            },
            "claimsToSuppress": []
        },
        # ...
    }
}
```

### Step 3: Verify Attribute Correlation

Create a correlation table to verify alignment:

| Source | Attribute Name | AVP Schema Attribute | Notes |
|--------|---------------|---------------------|-------|
| ID Token | `custom:user_type` | `user_type` | Strip `custom:` prefix |
| ID Token | `custom:user_region` | `user_region` | Strip `custom:` prefix |
| ID Token | `email` | `email` | Standard claim, no change |
| App Data | `contract.region` | `Region` (Contract) | Resource attribute |
| App Data | `contract.client` | `Client` (Contract) | Resource attribute |

**If any mismatch exists, ask for clarification before proceeding.**

### Step 4: Configure attributeMapping

The `attributeMapping` in CAC config maps token claims to entity attributes. **Only strip the `custom:` prefix - do not rename attributes:**

```typescript
// CORRECT: Direct mapping (only strips prefix)
attributeMapping: {
  'custom:user_type': 'user_type',
  'custom:user_region': 'user_region',
}

// WRONG: Renaming attributes (causes misalignment)
attributeMapping: {
  'custom:user_region': 'Region',  // ❌ Don't rename to different attribute
}
```

**Important distinction:**
- **Principal attributes** (User): Come from ID token, use `attributeMapping`
- **Resource attributes** (Contract): Come from application data, set in `additionalEntities`

---

## Installation

### GitHub Repository

**IMPORTANT:** The repository URL is:
```
https://github.com/iamatjlovelock/cognito-authorizer-client
```

Note: The repo name is `cognito-authorizer-client` (with "authorizer"), but the npm package name is `cognito-authorization-client` (with "authorization").

### Option 1: SDK Integration (Recommended)

Install directly into your Node.js/TypeScript application as a dependency:

```bash
# Install from GitHub
npm install git+https://github.com/iamatjlovelock/cognito-authorizer-client.git

# IMPORTANT: Build the package after installation
cd node_modules/cognito-authorization-client
npm run build
cd ../..
```

**Why the build step?** When installing from git, npm doesn't run the build script automatically. The package ships as TypeScript source and needs to be compiled to JavaScript.

After installation, import in your application:
```typescript
import { createClient, CognitoAuthorizationClient } from 'cognito-authorization-client';
```

### Option 2: HTTP API (Standalone Service)

Clone and run as a separate service:

```bash
git clone https://github.com/iamatjlovelock/cognito-authorizer-client.git
cd cognito-authorizer-client
npm install
npm run build
npm start  # Runs on port 3000 by default
```

### Option 3: Local Path Dependency

If you've cloned the repo locally:

```json
{
  "dependencies": {
    "cognito-authorization-client": "file:../path/to/cognito-authorizer-client"
  }
}
```

Then run:
```bash
npm install
```

---

## SDK API Reference

### Key Types

```typescript
// Authorization request
interface AuthzRequest {
  token: string;                    // Cognito ID token (not access token!)
  action: string;                   // e.g., "REVIEW", "EDIT"
  resource: { type: string; id: string };
  context?: Record<string, unknown>;
  additionalEntities?: CedarEntity[];
}

// Authorization response
interface AuthzResponse {
  allowed: boolean;
  decision: 'Allow' | 'Deny';
  principal: { type: string; id: string };
  diagnostics: {
    reason: string[];   // Array of strings, not optional string
    errors: string[];
  };
  claims?: CognitoTokenClaims;
}

// Cedar entity for additionalEntities
interface CedarEntity {
  uid: { type: string; id: string };
  attrs: Record<string, unknown>;
  parents: Array<{ type: string; id: string }>;
}
```

### Client Methods

```typescript
// Create client (async)
const client = await createClient(config);

// Authorize a request
const result = await client.authorize(request: AuthzRequest): Promise<AuthzResponse>;

// Validate token without authorization
const validatedToken = await client.validateToken(token: string): Promise<ValidatedToken>;

// Manually refresh policies from AVP
await client.refreshPoliciesFromAVP(): Promise<void>;

// Get entity builder for custom entities
const builder = client.getEntityBuilder(): EntityBuilder;
```

### Important: No Batch Method in SDK

The SDK does **NOT** have a `batchAuthorize` method. For batch authorization, use `Promise.all`:

```typescript
// Check multiple actions in parallel
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

### Critical: Authorizing Resource Lists

When listing resources (e.g., "show all contracts the user can view"), you need a strategy for authorization. **Do NOT use placeholder entities with dummy attributes.**

#### Why Placeholder Entities Don't Work

```typescript
// ❌ WRONG: Using a placeholder entity
const result = await client.authorize({
  token: idToken,
  action: 'REVIEW',
  resource: { type: 'Contract', id: 'any' },
  additionalEntities: [{
    uid: { type: 'NAMESPACE::Contract', id: 'any' },
    attrs: { Region: '*', Size: '*', Government: '*', Client: '*', Status: 'Active' },
    parents: [],
  }],
});
```

**Problems:**
1. If policies check `principal.user_region == resource.Region`, the wildcard `*` won't match
2. Results don't reflect actual permissions for real resources
3. Users may see an empty list or get access to resources they shouldn't

#### Recommended: Authorize Each Resource Individually (Option A)

Authorize each resource in parallel and filter to only those the user can access:

```typescript
// ✅ CORRECT: Authorize each contract individually
router.get('/contracts', async (req, res) => {
  const idToken = getIdToken(req);

  // Get all resources (need full data for authorization)
  const allContracts = readContracts();

  // Authorize REVIEW for each contract in parallel
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

  // Filter to only contracts the user can REVIEW
  const authorizedContracts = allContracts.filter((_, i) => authResults[i].allowed);

  res.json({ contracts: authorizedContracts });
});
```

**Pros:**
- Policy changes are automatically reflected
- Application code doesn't know policy logic
- Accurate per-resource authorization

**Cons:**
- N authorization calls for N resources
- CAC evaluates locally via WASM, so performance is usually acceptable

#### Why NOT to Pre-Filter in Application Code (Option C)

You might be tempted to filter resources in application code based on user attributes:

```typescript
// ❌ AVOID: Hardcoding policy logic in application
const userRegion = claims['custom:user_region'];
const visibleContracts = allContracts.filter(c => c.region === userRegion);
```

**This defeats the purpose of externalized authorization:**
- If policies change, application code must also change
- Policy logic becomes duplicated and can drift
- Complex policies (multiple conditions, group-based access) are hard to replicate

**Rule:** The application should not know the authorization logic. Let the policy engine decide.

#### Alternative: Permissive List Policy (Option B)

If listing should be open to all authenticated users, create a permissive policy for the list action:

```cedar
// Policy: All authenticated users can REVIEW (list) contracts
permit(
  principal is NAMESPACE::User,
  action == NAMESPACE::Action::"REVIEW",
  resource is NAMESPACE::Contract
);
```

Then use stricter policies for modification actions (EDIT, APPROVE, ARCHIVE).

**Use this only if:**
- Listing is intentionally unrestricted
- Detailed authorization happens when accessing specific resources

---

## Configuration

### AVP Configuration (TypeScript-safe)

When using AVP with TypeScript, you **must** include `schemaOverrideIsInline` even though it has a default value:

```typescript
const config = {
  cognito: {
    region: 'us-east-1',
    userPoolId: 'us-east-1_ABC123xyz',
    clientId: '1abc2defg3hijklmno4pqrs5t',
  },
  cedar: {
    namespace: 'NAMESPACE',
    source: 'avp' as const,  // Must use 'as const' for TypeScript
    policyStoreId: 'BWRtaygo7MkaFaBz8BbHHz',
    loadSchemaFromAVP: true,
    schemaOverrideIsInline: false,  // REQUIRED for TypeScript even though it has a default
    refreshIntervalSeconds: 120,
  },
  entities: {
    userTypeName: 'User',
    groupTypeName: 'CognitoGroup',
    includeCustomAttributes: true,
    includeProfileClaims: true,
    // Map token attributes directly - only strip 'custom:' prefix, don't rename
    attributeMapping: {
      'custom:user_region': 'user_region',
      'custom:user_type': 'user_type',
    },
  },
};

const client = await createClient(config);
```

### File-Based Configuration

```typescript
const config = {
  cognito: {
    region: 'us-east-1',
    userPoolId: 'us-east-1_ABC123xyz',
    clientId: '1abc2defg3hijklmno4pqrs5t',
  },
  cedar: {
    namespace: 'NAMESPACE',
    source: 'file' as const,
    policies: './policies.cedar',      // Path to policies file
    policiesAreInline: false,          // false = file path, true = inline content
    schema: './schema.cedarschema.json', // Optional
  },
  entities: {
    // ... same as above
  },
};
```

---

## Complete SDK Integration Example

Here's a complete example for an Express backend:

### 1. Create the CAC Client Module

```typescript
// src/lib/cac-client.ts
import { createClient, CognitoAuthorizationClient, AuthzResponse } from 'cognito-authorization-client';

const NAMESPACE = 'NAMESPACE';

export type ContractAction = 'REVIEW' | 'EDIT' | 'APPROVE' | 'ARCHIVE';

export interface ContractPermissions {
  review: boolean;
  edit: boolean;
  approve: boolean;
  archive: boolean;
}

// Singleton client
let authClient: CognitoAuthorizationClient | null = null;

export async function initializeCACClient(): Promise<void> {
  if (authClient) return;

  const config = {
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
      schemaOverrideIsInline: false,  // Required for TypeScript
      refreshIntervalSeconds: 120,
    },
    entities: {
      userTypeName: 'User',
      groupTypeName: 'CognitoGroup',
      includeCustomAttributes: true,
      includeProfileClaims: true,
      // Map token attributes directly - only strip 'custom:' prefix
      attributeMapping: {
        'custom:user_region': 'user_region',
        'custom:user_type': 'user_type',
      },
    },
  };

  console.log('Initializing CAC client...');
  authClient = await createClient(config);
  console.log('CAC client ready');
}

function getClient(): CognitoAuthorizationClient {
  if (!authClient) throw new Error('CAC client not initialized');
  return authClient;
}

// Build Cedar entity for a contract
function buildContractEntity(contract: { id: string; region: string; size: string; government: string; client: string; status: string }) {
  return {
    uid: { type: `${NAMESPACE}::Contract`, id: contract.id },
    attrs: {
      Region: contract.region,      // Pass raw values!
      Size: contract.size,
      Government: contract.government,
      Client: contract.client,
      Status: contract.status,
    },
    parents: [],
  };
}

// Authorize single action
export async function authorizeContractAction(
  idToken: string,
  action: ContractAction,
  contract: { id: string; region: string; size: string; government: string; client: string; status: string }
): Promise<{ allowed: boolean; diagnostics: { reason: string[]; errors: string[] } }> {
  try {
    const result = await getClient().authorize({
      token: idToken,
      action,
      resource: { type: 'Contract', id: contract.id },
      additionalEntities: [buildContractEntity(contract)],
    });
    return { allowed: result.allowed, diagnostics: result.diagnostics };
  } catch (error) {
    console.error('Authorization error:', error);
    return { allowed: false, diagnostics: { reason: ['Authorization service error'], errors: [] } };
  }
}

// Get all permissions for a contract (parallel calls)
export async function getContractPermissions(
  idToken: string,
  contract: { id: string; region: string; size: string; government: string; client: string; status: string }
): Promise<ContractPermissions> {
  const actions: ContractAction[] = ['REVIEW', 'EDIT', 'APPROVE', 'ARCHIVE'];
  const contractEntity = buildContractEntity(contract);

  try {
    const results = await Promise.all(
      actions.map(action =>
        getClient().authorize({
          token: idToken,
          action,
          resource: { type: 'Contract', id: contract.id },
          additionalEntities: [contractEntity],
        })
      )
    );

    return {
      review: results[0]?.allowed ?? false,
      edit: results[1]?.allowed ?? false,
      approve: results[2]?.allowed ?? false,
      archive: results[3]?.allowed ?? false,
    };
  } catch (error) {
    console.error('Batch authorization error:', error);
    return { review: false, edit: false, approve: false, archive: false };
  }
}
```

### 2. Initialize at Server Startup

```typescript
// src/index.ts
import express from 'express';
import { initializeCACClient } from './lib/cac-client';

const app = express();

async function start() {
  try {
    await initializeCACClient();
  } catch (error) {
    console.error('Failed to initialize CAC:', error);
    console.warn('Server starting without CAC - authorization will fail');
  }

  app.listen(3001, () => {
    console.log('Server running on port 3001');
  });
}

start();
```

### 3. Use in Routes

```typescript
// src/routes/contracts.ts
import { Router, Request, Response } from 'express';
import { authorizeContractAction, getContractPermissions } from '../lib/cac-client';
import { getContractById } from '../lib/contracts';

const router = Router();

// Helper to get ID token from request headers
function getIdToken(req: Request): string | null {
  return req.headers['x-id-token'] as string | null;
}

router.get('/:id', async (req: Request, res: Response) => {
  const idToken = getIdToken(req);
  if (!idToken) {
    return res.status(401).json({ error: 'Missing ID token' });
  }

  const contract = getContractById(req.params.id);
  if (!contract) {
    return res.status(404).json({ error: 'Contract not found' });
  }

  // Check REVIEW permission
  const authResult = await authorizeContractAction(idToken, 'REVIEW', contract);
  if (!authResult.allowed) {
    return res.status(403).json({ error: 'Access denied', diagnostics: authResult.diagnostics });
  }

  // Get all permissions for this contract
  const permissions = await getContractPermissions(idToken, contract);

  res.json({ contract, permissions });
});

export default router;
```

### 4. Frontend: Send ID Token

```typescript
// Frontend AuthContext
const getAuthHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;  // For backend auth
  }
  if (idToken) {
    headers['X-Id-Token'] = idToken;  // For CAC authorization
  }
  return headers;
};
```

---

## Questions to Ask the Developer

### 1. Cognito Configuration

```
Q1: What is your Cognito User Pool ID?
    Format: {region}_{poolId} (e.g., us-east-1_ABC123xyz)

Q2: What is your Cognito App Client ID?
    Format: alphanumeric string (e.g., 1abc2defg3hijklmno4pqrs5t)

Q3: What AWS region is your Cognito User Pool in?
    Format: e.g., us-east-1, eu-west-1
```

### 2. Policy Source

```
Q4: Where are your Cedar policies stored?
    Options:
    a) Amazon Verified Permissions (AVP) - recommended for production
    b) Local files - suitable for development/testing

If AVP (option a):
    Q4a: What is your AVP Policy Store ID?
         Format: alphanumeric string (e.g., BWRtaygo7MkaFaBz8BbHHz)

If Local files (option b):
    Q4b: What is the path to your Cedar policies file?
```

### 3. Cedar Namespace

```
Q5: What Cedar namespace do your policies use?
    Example: MyApp, ContractApp, NAMESPACE
    This appears in policy statements like: MyApp::User, MyApp::Action::"read"
```

### 4. Integration Pattern

```
Q6: How do you want to integrate the CAC?
    Options:
    a) SDK - Import directly into the application (recommended, simpler)
    b) HTTP API - Run as a separate service
```

---

## Critical: ID Token vs Access Token

**THIS IS THE MOST COMMON INTEGRATION MISTAKE.**

| Claim Type | ID Token | Access Token |
|------------|----------|--------------|
| Custom attributes (`custom:*`) | ✅ YES | ❌ NO |
| Cognito groups (`cognito:groups`) | ✅ YES | ✅ YES |
| OAuth scopes (`scope`) | ❌ NO | ✅ YES |

**Always use the ID token for CAC authorization when policies evaluate principal attributes.**

```typescript
// Frontend: Get both tokens
const session = await fetchAuthSession();
const accessToken = session.tokens?.accessToken?.toString(); // For your API auth
const idToken = session.tokens?.idToken?.toString();         // For CAC authorization

// Send ID token in a separate header
headers['Authorization'] = `Bearer ${accessToken}`;
headers['X-Id-Token'] = idToken;  // CAC uses this
```

---

## Critical: Don't Translate Attribute Values

**Pass raw data values to the authorizer. Do NOT translate them.**

```typescript
// WRONG
attrs: {
  Government: contract.government === 'Y' ? 'TRUE' : 'FALSE',  // ❌
}

// CORRECT
attrs: {
  Government: contract.government,  // ✅ Pass "Y" or "N" as stored
}
```

---

## Critical: Attribute Mapping from ID Token to Authorization Request

**Attributes should be mapped directly from the Cognito ID token to the authorization request.** The attribute name in the token should match the attribute name in the authorization request, with one transformation:

### Mapping Rule

**Strip the `custom:` prefix** from any custom attribute in the token. The rest of the attribute name remains unchanged. Do NOT rename attributes.

| ID Token Attribute | Authorization Request Attribute |
|--------------------|--------------------------------|
| `custom:user_type` | `user_type` |
| `custom:user_region` | `user_region` |
| `email` | `email` |
| `cognito:groups` | `cognito:groups` |

### Principal vs Resource Attributes

**Important distinction:**
- **Principal attributes** (User entity): Sourced from ID token, mapped via `attributeMapping`
- **Resource attributes** (e.g., Contract entity): Sourced from application data, provided in `additionalEntities`

These may have different names. For example:
- User has `user_region` (from token `custom:user_region`)
- Contract has `Region` (from application data)

Policies can compare them: `principal.user_region == resource.Region`

### Integration Checklist

Before integrating with the authorization client, verify the following:

1. **Determine what attributes appear in the ID token**
   - Decode a sample ID token (use jwt.io) to see available claims
   - Note which are standard claims vs custom attributes (`custom:*`)

2. **Check for Pre-Token Generation Lambda Trigger**
   - In the Cognito User Pool console, check Lambda triggers
   - If a pre-token generation trigger exists, review its code
   - Verify it includes custom attributes in `claimsToAddOrOverride`
   - The Lambda may add, modify, or filter attributes before they appear in the token

3. **Verify AVP Policy Store Schema matches ID Token attributes**
   - **Always fetch the latest schema from AVP** (see Pre-Integration Verification Steps)
   - Check the **User entity** has attributes defined that correspond to ID token claims
   - Attribute names must match exactly (after stripping `custom:` prefix)
   - **If they do not correlate, ask for clarification on the correct mapping**

4. **Verify Resource attributes match Policy Store Schema**
   - Check the resource type attributes provided by the application
   - Verify they correlate with resource attributes defined in the policy store schema
   - **If they do not correlate, ask for clarification**

### Example: Verifying Attribute Alignment

```
ID Token claims:
  - custom:user_type: "REVIEWER"
  - custom:user_region: "US"
  - email: "user@example.com"

AVP Schema (User entity attributes):
  - user_type: String       ✅ Matches (after stripping custom:)
  - user_region: String     ✅ Matches (after stripping custom:)
  - email: String           ✅ Matches

AVP Schema (Contract entity attributes):
  - Region: String          (different from user_region - this is OK)
  - Client: String
  - Status: String

Authorization Request:
  Principal attributes (from token):
    - user_type: "REVIEWER"   ✅ Correct
    - user_region: "US"       ✅ Correct
  Resource attributes (from app data):
    - Region: "US"            ✅ Correct (matches Contract schema)
    - Client: "Acme Corp"     ✅ Correct
```

### Common Misalignment Issues

| Issue | Symptom | Solution |
|-------|---------|----------|
| Schema uses `Region` for User but token has `custom:user_region` | Policy evaluations fail silently | Schema should use `user_region` for User entity |
| Pre-token Lambda filters out attributes | Token missing expected claims | Update Lambda to pass through required attributes |
| Schema attribute is `userType` but token has `custom:user_type` | Attribute not found in authorization | Update schema to use `user_type` (matching token) |
| Local schema copy is stale | Integration uses wrong attribute names | Always fetch fresh schema from AVP before integration |

---

## Troubleshooting

### "Cannot find module 'cognito-authorization-client'"

The package needs to be built after git installation:
```bash
cd node_modules/cognito-authorization-client
npm run build
```

### TypeScript error: "Property 'schemaOverrideIsInline' is missing"

Add it to your AVP config even though it has a default:
```typescript
cedar: {
  source: 'avp' as const,
  // ... other fields
  schemaOverrideIsInline: false,  // Add this
}
```

### Authorization always denies

1. Check you're using **ID token**, not access token
2. Verify custom attributes exist in the token (decode at jwt.io)
3. Check attribute names are case-sensitive matches
4. Ensure `additionalEntities` includes the resource with correct attributes

### "entity does not exist" error

Include `additionalEntities` with the resource:
```typescript
await client.authorize({
  token: idToken,
  action: 'REVIEW',
  resource: { type: 'Contract', id: 'contract-123' },
  additionalEntities: [{
    uid: { type: 'NAMESPACE::Contract', id: 'contract-123' },
    attrs: { Region: 'US', Size: 'M' },
    parents: [],
  }],
});
```

---

## HTTP API Reference (if using standalone service)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/authorize` | POST | Single authorization request |
| `/batch-authorize` | POST | Multiple authorization requests |
| `/validate-token` | POST | Validate token without authorization |
| `/refresh-policies` | POST | Force reload policies from AVP |
| `/health` | GET | Health check |

---

## Environment Variables

```bash
# Required
AWS_REGION=us-east-1
USER_POOL_ID=us-east-1_ABC123xyz
USER_POOL_CLIENT_ID=1abc2defg3hijklmno4pqrs5t
AVP_POLICY_STORE_ID=BWRtaygo7MkaFaBz8BbHHz

# For AWS SDK (AVP access)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
# Or use IAM role/instance profile
```
