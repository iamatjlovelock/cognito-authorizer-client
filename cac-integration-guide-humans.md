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
| Missing `schemaOverrideIsInline` | TypeScript compilation error | Add `schemaOverrideIsInline: false` to config |
| Placeholder entities for list authorization | Wildcard attributes don't match policies | Authorize each resource individually |
| Schema missing CAC auto-generated attributes | Error: `attribute 'X' should not exist according to the schema` | Add all CAC auto-generated attributes to User and CognitoGroup entities (see below) |

---

## What CAC Does

The Cognito Authorization Client:
- Validates Amazon Cognito JWT tokens (ID and access tokens)
- Evaluates Cedar policies locally using WebAssembly
- Maps Cognito token claims to Cedar entities automatically
- Loads policies from Amazon Verified Permissions or local files
- Works as an SDK embedded in your app or as a standalone HTTP service

---

## Integration Workflow Overview

When working with a coding agent, integration follows three phases:

1. **Phase 1: Policy Store Setup** — Create the policy store, upload Cedar schema, create group-based policies
2. **Phase 2: Developer Review** — Review policies in the AWS Console before any code changes
3. **Phase 3: Code Integration** — Install CAC, update routes, configure frontend

**Important:** The coding agent will pause after Phase 1 and wait for you to review the policies in the AWS Console. This ensures authorization rules are correct before they're enforced in your application.

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

### CAC Auto-Generated Entity Attributes

The CAC automatically adds certain attributes to User and CognitoGroup entities. **Your Cedar schema must include these attributes** or authorization will fail with `attribute 'X' should not exist according to the schema`.

**User entity must include:**
- `sub` (String) — Cognito user subject ID
- `username` (String, optional) — Cognito username
- `email` (String, optional) — User email
- `email_verified` (Boolean, optional) — Whether email is verified
- `name` (String, optional) — Display name
- `scopes` (String, optional) — OAuth scopes
- `groups` (Set of Strings, optional) — Cognito groups

**CognitoGroup entity must include:**
- `name` (String, optional) — Group name

Plus any custom attributes from your Cognito User Pool (with `custom:` prefix stripped).

---

## Creating a Policy Store with a Coding Agent

If you don't have an AVP policy store yet, a coding agent can help you create one from scratch. Here's what to expect during that process:

### What the Agent Will Do

1. **Gather information** — The agent will ask for your Cognito User Pool ID, AWS region, application name, and desired Cedar namespace.

2. **Check for existing policy stores** — It will look for any policy store already associated with your user pool to avoid duplicates.

3. **Create the policy store** — A new AVP policy store will be created and tagged with your Cognito User Pool ID for easy identification.

4. **Build the Cedar schema** — The agent will:
   - Retrieve your Cognito user attributes
   - Scan your application code to identify resource types (e.g., Document, Report)
   - **Present a detailed list of resource attributes for your validation** (see "Resource Attribute Validation" below)
   - Define actions based on your API routes and business operations

5. **Upload and verify the schema** — The schema is uploaded to AVP and validated.

6. **Create sample authorization policies** — The agent walks you through creating initial policies to demonstrate how authorization works.

### Resource Attribute Validation

Before creating the schema, the agent will present a detailed table of resource attributes for your review:

```
For the resource type(s) you confirmed, here are the attributes I plan to include:

Document:
┌─────────────────┬─────────┬──────────┬─────────────────────────────────────┐
│ Attribute       │ Type    │ Required │ Source                              │
├─────────────────┼─────────┼──────────┼─────────────────────────────────────┤
│ department      │ String  │ Yes      │ document.department                 │
│ classification  │ String  │ Yes      │ document.classification             │
│ owner           │ String  │ Yes      │ document.owner                      │
│ status          │ String  │ Yes      │ document.status                     │
└─────────────────┴─────────┴──────────┴─────────────────────────────────────┘

Please review and confirm:
1. Are these the correct attributes for authorization decisions?
2. Should any attributes be added or removed?
3. Are the data types correct?
4. Should any attributes be marked as optional?
```

**Why this matters:**
- Attribute names must match exactly what your application provides
- Missing attributes can't be used in policy conditions
- Extra attributes clutter the policy authoring experience in the console
- Incorrect types cause authorization failures

Reply "confirmed" to proceed, or provide corrections before the schema is created.

### Sample Policy Creation Process

After the schema is set up, the agent helps you create sample policies:

1. **Group-based policies** — If your Cognito User Pool has groups defined (e.g., "Admins", "Reviewers", "ReadOnly"), the agent will ask if you want to create a policy for one of them. This uses the **Membership permissions** Cedar pattern—access is granted based on group membership.

2. **Attribute-based conditions** — The agent will show you the resource attributes from your schema and ask if you want to add conditions. For example: "Should Reviewers only be able to view documents with status 'Draft' or 'Review'?"

3. **Policy generation** — Based on your answers, the agent converts your requirements into Cedar policy syntax and creates the policy in AVP.

4. **Additional policies** — You can create more policies for other groups, owner-based access, or admin full access.

### Example Interaction

```
Agent: I found these groups in your Cognito User Pool:
       1. Admins
       2. Reviewers
       3. ReadOnly

       Which group would you like to create a policy for?

You:   Reviewers

Agent: Which actions should Reviewers be permitted to perform?
       Available: VIEW, EDIT, DELETE, CREATE

You:   VIEW and EDIT

Agent: Your Document resource has these attributes: department, status, owner.
       Should Reviewers only access documents with certain attribute values?
       Example: "status equals Draft"

You:   status equals Draft or Review

Agent: Creating policy:
       "Reviewers can VIEW and EDIT documents with status Draft or Review"

       [Policy created successfully]
```

---

## Managing Policies in the AWS Console

Once your policy store is created, you don't need a coding agent to maintain policies. You can manage authorization policies directly in the AWS Console:

1. **Navigate to Amazon Verified Permissions** in the AWS Console
2. **Select your policy store** (tagged with your Cognito User Pool ID)
3. **Create and edit policies** using the visual policy editor or Cedar syntax

### Group-Based Policies in the Console

The console makes it easy to create policies for Cognito groups:

1. Click **Create policy**
2. Select **Static policy** and choose **Permit**
3. For **Principal scope**, select "Specific principal" and choose your group (e.g., `CognitoGroup::"Reviewers"`)
4. For **Action scope**, select the actions to permit
5. For **Resource scope**, select your resource type
6. Optionally add **Conditions** using resource attributes from your schema

This visual approach is ideal for:
- Business administrators who need to adjust permissions without code changes
- Quick policy updates that don't require a development cycle
- Experimenting with different authorization rules

The CAC automatically picks up policy changes from AVP based on the `refreshIntervalSeconds` configuration (default: 120 seconds).

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
  action: 'VIEW',
  resource: { type: 'Document', id: 'doc-123' },
  additionalEntities: [{
    uid: { type: 'MyApp::Document', id: 'doc-123' },
    attrs: {
      department: document.department,    // Pass raw values
      classification: document.classification,
      status: document.status,
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
const actions = ['VIEW', 'EDIT', 'DELETE'];
const results = await Promise.all(
  actions.map(action => client.authorize({
    token: idToken,
    action,
    resource: { type: 'Document', id: resourceId },
    additionalEntities: [resourceEntity],
  }))
);

const permissions = {
  view: results[0].allowed,
  edit: results[1].allowed,
  delete: results[2].allowed,
};
```

---

## Authorizing Resource Lists

When showing a list of resources (e.g., "all documents the user can view"), you need to authorize access to each one. Don't use placeholder entities with wildcard attributes—they won't match real policy conditions.

### Authorize Each Resource Individually

```typescript
router.get('/documents', async (req, res) => {
  const idToken = getIdToken(req);
  const allDocuments = getDocuments();

  const authResults = await Promise.all(
    allDocuments.map(doc =>
      client.authorize({
        token: idToken,
        action: 'VIEW',
        resource: { type: 'Document', id: doc.id },
        additionalEntities: [buildDocumentEntity(doc)],
      })
    )
  );

  const authorizedDocuments = allDocuments.filter((_, i) => authResults[i].allowed);
  res.json({ documents: authorizedDocuments });
});
```

Since CAC evaluates policies locally via WebAssembly, this performs well even with many resources.

### Avoid Hardcoding Policy Logic

Don't filter resources in application code based on user attributes:

```typescript
// Avoid this—it duplicates policy logic
const userDepartment = claims['custom:department'];
const visibleDocs = allDocuments.filter(d => d.department === userDepartment);
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
attrs: { classification: resource.classification }  // Passes "Y" or "N" as stored

// Wrong
attrs: { classification: resource.classification === 'Y' ? 'TRUE' : 'FALSE' }
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
      policyStoreId: process.env.POLICY_STORE_ID!,
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

export function buildDocumentEntity(document: Document) {
  return {
    uid: { type: `${NAMESPACE}::Document`, id: document.id },
    attrs: {
      department: document.department,
      classification: document.classification,
      owner: document.owner,
      status: document.status,
    },
    parents: [],
  };
}

export async function authorizeDocumentAction(
  idToken: string,
  action: string,
  document: Document
): Promise<boolean> {
  if (!authClient) throw new Error('CAC client not initialized');

  const result = await authClient.authorize({
    token: idToken,
    action,
    resource: { type: 'Document', id: document.id },
    additionalEntities: [buildDocumentEntity(document)],
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
// src/routes/documents.ts
import { authorizeDocumentAction } from '../lib/cac-client';

router.get('/:id', async (req, res) => {
  const idToken = req.headers['x-id-token'] as string;
  if (!idToken) return res.status(401).json({ error: 'Missing ID token' });

  const document = getDocumentById(req.params.id);
  if (!document) return res.status(404).json({ error: 'Document not found' });

  const allowed = await authorizeDocumentAction(idToken, 'VIEW', document);
  if (!allowed) return res.status(403).json({ error: 'Access denied' });

  res.json({ document });
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
  uid: { type: 'MyApp::Document', id: 'doc-123' },
  attrs: { department: 'Engineering', status: 'Active' },
  parents: [],
}]
```

### Error: "attribute 'X' should not exist according to the schema"

This means the CAC is sending attributes that aren't in your Cedar schema. Update your schema to include all CAC auto-generated attributes (see "CAC Auto-Generated Entity Attributes" above), then re-upload to the policy store:

```bash
# Update schema-definition.json and re-upload
aws verifiedpermissions put-schema --policy-store-id POLICY_STORE_ID \
  --definition file://schema-definition.json --region us-east-1
```

Restart your backend server after updating the schema.

---

## Environment Variables

```bash
AWS_REGION=us-east-1
USER_POOL_ID=us-east-1_ABC123xyz
USER_POOL_CLIENT_ID=1abc2defg3hijklmno4pqrs5t
POLICY_STORE_ID=BWRtaygo7MkaFaBz8BbHHz

# AWS credentials (or use IAM role)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```
