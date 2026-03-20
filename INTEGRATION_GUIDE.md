# Cognito Authorization Client - Integration Guide for Coding Agents

This document provides everything a coding agent needs to integrate the Cognito Authorization Client (CAC) into an application. It includes technical specifications, integration patterns, and questions to ask the developer when information is ambiguous or missing.

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
3. The application has access to Cognito ID or access tokens
4. Cedar policies exist (either in AVP or as local files)
5. AWS credentials are configured (for AVP integration)

---

## Installation

### Option 1: Download Without Git (Recommended for Testing)

Use the included PowerShell script to download and run the project without cloning:

```powershell
# Create a new folder and navigate to it
mkdir cognito-authz-test
cd cognito-authz-test

# Download and run the install script
Invoke-WebRequest -Uri https://raw.githubusercontent.com/iamatjlovelock/cognito-authorizer-client/main/install-and-run.ps1 -OutFile install-and-run.ps1
.\install-and-run.ps1
```

Or to install without automatically starting:

```powershell
.\install-and-run.ps1 -SkipRun
```

### Option 2: Clone the Repository

```bash
git clone https://github.com/iamatjlovelock/cognito-authorizer-client.git
cd cognito-authorizer-client
npm install
npm run build
```

---

## Local Testing with Test-1.ps1

The repository includes a PowerShell test script (`Test-1.ps1`) that demonstrates authorization requests against various user roles. This script requires:

1. **AWS CLI** configured with credentials that can authenticate against Cognito
2. **The CAC server running** on `http://localhost:3000`
3. **A `config.json` file** configured for your Cognito User Pool and Amazon Verified Permissions policy store
4. **Environment variables defined with credentials to access the User pool and policy store

### Running the Tests

1. Start the CAC server in one terminal:
   ```bash
   npm start
   ```

2. In another terminal, run the test script:
   ```powershell
   .\Test-1.ps1
   ```

### Loading Test Policies

By default, the test script runs against whatever policies exist in your AVP policy store. To reset the policy store with the test policies defined in `avp-policies.txt`, use the `-ResetAvpPolicies` flag:

```powershell
.\Test-1.ps1 -ResetAvpPolicies
```

This will:
1. Read the policy store ID from `config.json`
2. Delete all existing static policies from the AVP policy store
3. Create new policies from `avp-policies.txt`
4. Run the tests

**Note:** This requires AWS credentials with `verifiedpermissions:ListPolicies`, `verifiedpermissions:DeletePolicy`, and `verifiedpermissions:CreatePolicy` permissions.

### What the Test Script Does

The script authenticates as different test users and makes authorization requests:

| User | Tests | Expected Results |
|------|-------|------------------|
| `intern@example.com` | REVIEW action on small vs medium contracts | Allowed for Size="S", Denied for Size="M" |
| `inhouse-counsel@example.com` | APPROVE vs ARCHIVE actions | APPROVE allowed, ARCHIVE denied |
| `outside-counsel@example.com` | EDIT action by region | Allowed for Region="IND", Denied for Region="US" |
| `matt@example.com` | EDIT action by client | Allowed for Client="Netflix", Denied for Client="Robinhood" |
| `clare@example.com` | EDIT action on government contracts | Allowed when Government="TRUE", Denied when Government="FALSE" |

Each test authenticates via `aws cognito-idp initiate-auth` and sends POST requests to `/authorize` with appropriate resource attributes.

---

### Step 4: Integration Method

Choose one of the following based on integration pattern:

#### Option A: HTTP API (Standalone Service)

The CAC runs as a separate service. Your application makes HTTP requests to it.

1. Create `config.json` in the CAC directory (see Configuration Template below)
2. Start the server:
   ```bash
   npm run start
   ```
3. The authorization API is now available at `http://localhost:3000` (or configured port)

#### Option B: Programmatic SDK (Direct Import)

Import the CAC directly into your Node.js/TypeScript application.

**Method 1: npm link (recommended for development)**

```bash
# In the cognito-authorization-client directory
npm link

# In your application directory
npm link cognito-authorization-client
```

**Method 2: Local path dependency**

Add to your application's `package.json`:
```json
{
  "dependencies": {
    "cognito-authorization-client": "file:../path/to/cognito-authorization-client"
  }
}
```

Then run:
```bash
npm install
```

**Method 3: Install from GitHub**

```bash
npm install github:iamatjlovelock/cognito-authorization-client
```

After installation, import in your application:
```typescript
import { createClient, CognitoAuthorizationClient } from 'cognito-authorization-client';
```

---

## Questions to Ask the Developer

### 1. Cognito Configuration

**Ask these questions first to establish the authentication context:**

```
Q1: What is your Cognito User Pool ID?
    Format: {region}_{poolId} (e.g., us-east-1_ABC123xyz)

Q2: What is your Cognito App Client ID?
    Format: alphanumeric string (e.g., 1abc2defg3hijklmno4pqrs5t)

Q3: What AWS region is your Cognito User Pool in?
    Format: e.g., us-east-1, eu-west-1
```

### 2. Policy Source

**Determine where Cedar policies are stored:**

```
Q4: Where are your Cedar policies stored?
    Options:
    a) Amazon Verified Permissions (AVP) - recommended for production
    b) Local files - suitable for development/testing
    c) I don't have policies yet - need help creating them

If AVP (option a):
    Q4a: What is your AVP Policy Store ID?
         Format: alphanumeric string (e.g., BWRtaygo7MkaFaBz8BbHHz)

    Q4b: Should the schema be loaded from AVP? (yes/no)

    Q4c: How often should the client check for policy updates? (in seconds, 0 to disable)
         Recommended: 120 seconds

If Local files (option b):
    Q4d: What is the path to your Cedar policies file?
         Format: relative or absolute path (e.g., ./policies.cedar)

    Q4e: Do you have a Cedar schema file? If yes, what is the path?
```

### 3. Cedar Namespace and Entity Types

**Understand the Cedar type system being used:**

```
Q5: What Cedar namespace do your policies use?
    Example: MyApp, ContractApp, NAMESPACE
    This appears in policy statements like: MyApp::User, MyApp::Action::"read"

Q6: What type name represents users in your Cedar schema?
    Default: User
    This creates entities like: {namespace}::User::"username"

Q7: What type name represents Cognito groups in your Cedar schema?
    Default: CognitoGroup
    This creates entities like: {namespace}::CognitoGroup::"admins"
```

### 4. Token Claims and Attribute Mapping

**Understand how token claims map to Cedar attributes:**

```
Q8: Do you use custom Cognito attributes that need to be mapped to Cedar attributes?
    Example: custom:user_region should become Region on the User entity

    If yes, provide the mapping:
    - Token claim name -> Cedar attribute name
    - e.g., custom:user_type -> type
    - e.g., custom:department -> department

Q9: Should standard profile claims (email, name, phone_number) be included on User entities?
    Default: yes

Q10: Should custom attributes (custom:*) be automatically included on User entities?
     Default: yes
```

### 5. Integration Pattern

**Determine how the application will use the CAC:**

```
Q11: How do you want to integrate the CAC?
     Options:
     a) HTTP API - CAC runs as a separate service, application makes HTTP calls
     b) Programmatic SDK - CAC is imported directly into the application
     c) Both - HTTP API for some services, SDK for others

Q12: If using HTTP API, what port should the CAC server run on?
     Default: 3000

Q13: If using HTTP API, what host should the CAC bind to?
     Default: localhost (use 0.0.0.0 for container deployments)
```

### 6. Resource Types and Actions

**Understand the authorization model:**

```
Q14: What resource types does your application authorize access to?
     Examples: Document, Contract, Project, Order, File
     List all resource types that appear in your policies.

Q15: What actions can be performed on these resources?
     Examples: read, write, delete, REVIEW, EDIT, APPROVE
     List all actions that appear in your policies.

Q16: Do resources have attributes that policies evaluate?
     Example: A Contract might have Region, Status, Size attributes
     If yes, list the resource types and their attributes.
```

### 7. Additional Entities

**Understand if the application needs to provide resource data:**

```
Q17: Do your Cedar policies reference resource attributes in conditions?
     Example: "when { resource.Region == principal.Region }"

     If yes, the application must provide additionalEntities in authorization requests
     containing the resource with its attributes.

Q18: Are there other entity types (beyond User, Group, and resources) that policies reference?
     Example: Organization, Team, Department entities
     If yes, these must also be provided as additionalEntities.
```

---

## Configuration Template

Once questions are answered, create a `config.json`:

### For AVP Source

```json
{
  "cognito": {
    "region": "{Q3_ANSWER}",
    "userPoolId": "{Q1_ANSWER}",
    "clientId": "{Q2_ANSWER}"
  },
  "cedar": {
    "namespace": "{Q5_ANSWER}",
    "source": "avp",
    "policyStoreId": "{Q4a_ANSWER}",
    "loadSchemaFromAVP": {Q4b_ANSWER},
    "refreshIntervalSeconds": {Q4c_ANSWER}
  },
  "server": {
    "port": {Q12_ANSWER},
    "host": "{Q13_ANSWER}"
  },
  "entities": {
    "userTypeName": "{Q6_ANSWER}",
    "groupTypeName": "{Q7_ANSWER}",
    "includeCustomAttributes": {Q10_ANSWER},
    "includeProfileClaims": {Q9_ANSWER},
    "attributeMapping": {
      // From Q8 answers
    }
  }
}
```

### For File Source

```json
{
  "cognito": {
    "region": "{Q3_ANSWER}",
    "userPoolId": "{Q1_ANSWER}",
    "clientId": "{Q2_ANSWER}"
  },
  "cedar": {
    "namespace": "{Q5_ANSWER}",
    "source": "file",
    "policies": "{Q4d_ANSWER}",
    "schema": "{Q4e_ANSWER}"
  },
  "server": {
    "port": {Q12_ANSWER},
    "host": "{Q13_ANSWER}"
  },
  "entities": {
    "userTypeName": "{Q6_ANSWER}",
    "groupTypeName": "{Q7_ANSWER}",
    "includeCustomAttributes": {Q10_ANSWER},
    "includeProfileClaims": {Q9_ANSWER},
    "attributeMapping": {
      // From Q8 answers
    }
  }
}
```

---

## Integration Code Patterns

### Pattern A: HTTP API Integration

Start the CAC server:
```bash
cd cognito-authorization-client
npm install
npm run build
npm run start
```

Make authorization requests from the application:

```typescript
// In your application code
async function checkAuthorization(
  token: string,
  action: string,
  resourceType: string,
  resourceId: string,
  resourceAttrs?: Record<string, unknown>
): Promise<boolean> {
  const request: any = {
    token,
    action,
    resource: { type: resourceType, id: resourceId },
  };

  // If policies evaluate resource attributes, include additionalEntities
  if (resourceAttrs) {
    request.additionalEntities = [
      {
        uid: { type: `{NAMESPACE}::${resourceType}`, id: resourceId },
        attrs: resourceAttrs,
        parents: [],
      },
    ];
  }

  const response = await fetch('http://localhost:3000/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  const result = await response.json();
  return result.allowed;
}

// Usage example
const canReview = await checkAuthorization(
  cognitoIdToken,
  'REVIEW',
  'Contract',
  'contract-123',
  { Region: 'US', Status: 'Draft', Size: 'S' }
);
```

### Pattern B: Programmatic SDK Integration

```typescript
import { createClient, CognitoAuthorizationClient } from 'cognito-authorization-client';

// Initialize once at application startup
let authClient: CognitoAuthorizationClient;

async function initializeAuthClient() {
  const config = {
    cognito: {
      region: '{REGION}',
      userPoolId: '{USER_POOL_ID}',
      clientId: '{CLIENT_ID}',
    },
    cedar: {
      namespace: '{NAMESPACE}',
      source: 'avp',
      policyStoreId: '{POLICY_STORE_ID}',
      loadSchemaFromAVP: true,
      refreshIntervalSeconds: 120,
    },
    entities: {
      userTypeName: 'User',
      groupTypeName: 'CognitoGroup',
      includeCustomAttributes: true,
      includeProfileClaims: true,
      attributeMapping: {
        // Map custom claims to Cedar attributes
      },
    },
  };

  authClient = await createClient(config);
}

// Authorization function
async function checkAuthorization(
  token: string,
  action: string,
  resourceType: string,
  resourceId: string,
  resourceAttrs?: Record<string, unknown>
): Promise<boolean> {
  const request: any = {
    token,
    action,
    resource: { type: resourceType, id: resourceId },
  };

  if (resourceAttrs) {
    request.additionalEntities = [
      {
        uid: { type: `{NAMESPACE}::${resourceType}`, id: resourceId },
        attrs: resourceAttrs,
        parents: [],
      },
    ];
  }

  const result = await authClient.authorize(request);
  return result.allowed;
}
```

### Pattern C: Express Middleware

```typescript
import { Request, Response, NextFunction } from 'express';
import { createClient, CognitoAuthorizationClient } from 'cognito-authorization-client';

let authClient: CognitoAuthorizationClient;

// Initialize at startup
export async function initAuth(config: any) {
  authClient = await createClient(config);
}

// Middleware factory
export function authorize(
  action: string,
  getResource: (req: Request) => { type: string; id: string; attrs?: Record<string, unknown> }
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const resource = getResource(req);
    const request: any = {
      token,
      action,
      resource: { type: resource.type, id: resource.id },
    };

    if (resource.attrs) {
      request.additionalEntities = [
        {
          uid: { type: `{NAMESPACE}::${resource.type}`, id: resource.id },
          attrs: resource.attrs,
          parents: [],
        },
      ];
    }

    const result = await authClient.authorize(request);

    if (!result.allowed) {
      return res.status(403).json({
        error: 'Forbidden',
        diagnostics: result.diagnostics,
      });
    }

    next();
  };
}

// Usage in routes
app.get('/contracts/:id',
  authorize('REVIEW', (req) => ({
    type: 'Contract',
    id: req.params.id,
    attrs: { /* load from database */ },
  })),
  contractController.get
);
```

---

## Common Integration Scenarios

### Scenario 1: Simple Group-Based Authorization

**Policies check only group membership, no resource attributes.**

Questions to confirm:
- Do policies only use `principal in Namespace::Group::"groupname"` patterns?
- Are there no `when` clauses referencing `resource.*` attributes?

If yes, integration is simpler - no `additionalEntities` needed:

```typescript
const result = await authClient.authorize({
  token: cognitoIdToken,
  action: 'REVIEW',
  resource: { type: 'Contract', id: 'contract-123' },
});
```

### Scenario 2: Attribute-Based Authorization

**Policies evaluate resource and/or principal attributes.**

Questions to confirm:
- Do policies have `when` clauses like `resource.Region == principal.Region`?
- What attributes does each resource type have?
- Where does the application get these attribute values (database, API, etc.)?

Integration requires fetching resource data and including it:

```typescript
// Fetch resource from database
const contract = await db.contracts.findById('contract-123');

const result = await authClient.authorize({
  token: cognitoIdToken,
  action: 'REVIEW',
  resource: { type: 'Contract', id: 'contract-123' },
  additionalEntities: [
    {
      uid: { type: 'MyApp::Contract', id: 'contract-123' },
      attrs: {
        Region: contract.region,
        Status: contract.status,
        Size: contract.size,
        Client: contract.clientName,
      },
      parents: [],
    },
  ],
});
```

### Scenario 3: Batch Authorization

**Need to check multiple resources at once (e.g., filtering a list).**

```typescript
const result = await fetch('http://localhost:3000/batch-authorize', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: cognitoIdToken,
    requests: contracts.map(contract => ({
      action: 'REVIEW',
      resource: { type: 'Contract', id: contract.id },
      additionalEntities: [
        {
          uid: { type: 'MyApp::Contract', id: contract.id },
          attrs: {
            Region: contract.region,
            Status: contract.status,
            Size: contract.size,
          },
          parents: [],
        },
      ],
    })),
  }),
});
```

---

## Troubleshooting Checklist

When authorization fails unexpectedly, check:

1. **Token Issues**
   - Is the token expired?
   - Is the token from the correct User Pool?
   - Is the audience (client ID) correct?

2. **Entity Mismatch**
   - Does the namespace in config match the namespace in policies?
   - Are User and Group type names correct?
   - Is the principal ID (username/sub) what policies expect?

3. **Missing Entities**
   - If policies reference resource attributes, are `additionalEntities` provided?
   - Do entity UIDs use the fully qualified type name (`Namespace::Type`)?
   - Are all required attributes present on entities?

4. **Schema Validation Errors**
   - Do entity attributes match the Cedar schema?
   - Are optional attributes accessed with `has` checks in policies?
   - Is attribute mapping creating duplicates?

5. **Policy Issues**
   - Are policies loaded correctly? Check `avp-policies.txt` for transparency.
   - Do any policies have syntax errors?
   - Are action names exact matches (case-sensitive)?

---

## Files Generated by CAC

When using AVP, the CAC generates these transparency files in the working directory:

- `avp-policies.txt` - Read-only copy of all policies from AVP
- `avp-schema.json` - Read-only copy of the schema from AVP

These files are for debugging only. Do not edit them - changes must be made in AVP.

---

## API Reference Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/authorize` | POST | Single authorization request |
| `/batch-authorize` | POST | Multiple authorization requests |
| `/validate-token` | POST | Validate token without authorization |
| `/refresh-policies` | POST | Force reload policies from AVP |
| `/health` | GET | Health check |

---

## Next Steps After Integration

1. Test with various user roles and groups
2. Verify all resource types and actions work correctly
3. Set up monitoring for authorization failures
4. Configure appropriate `refreshIntervalSeconds` for production
5. Consider caching authorization results for frequently accessed resources
