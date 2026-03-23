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
| **AWS credentials wrong format** | `Unable to parse config file` error | Use INI format with `[default]` header, not environment variable format |
| **Package not built after git install** | "Cannot find module" TypeScript errors | Run `npm run build` in the package's node_modules directory |
| **Missing `schemaOverrideIsInline`** | TypeScript error about missing property | Add `schemaOverrideIsInline: false` to AVP cedar config |
| **Stale local schema copy** | Integration uses wrong attribute names | Always fetch fresh schema from AVP with `aws verifiedpermissions get-schema` |
| **Renaming attributes in mapping** | `attributeMapping` transforms `user_region` to `Region` | Only strip `custom:` prefix - don't rename (e.g., `custom:user_region` → `user_region`) |
| **Placeholder entity for list authorization** | Error: `entity "...::any" does not exist` or policy denies with wildcard attributes | Don't use placeholder entities - authorize each resource individually (see "Authorizing Resource Lists") |
| **Schema attributes marked required but missing from token** | Authorization fails for users missing optional attributes | Mark user attributes as `"required": false` unless guaranteed present |
| **Namespace mismatch between schema and config** | Entity types not found during authorization | Ensure `cedar.namespace` in CAC config matches schema namespace exactly |
| **User not in memberOfTypes for CognitoGroup** | Group-based policies don't work | User entity must have `"memberOfTypes": ["CognitoGroup"]` |

---

## Overview

The Cognito Authorization Client is a local authorization solution that:
- Validates Amazon Cognito JWT tokens (ID and access tokens)
- Evaluates Cedar policies locally using WebAssembly
- Maps Cognito token claims to Cedar entities automatically
- Supports loading policies from Amazon Verified Permissions (AVP) or local files
- Provides HTTP API endpoints and programmatic SDK access

## Quick Start (Experienced Users)

For those familiar with AVP and Cedar, here's the condensed setup:

1. **Create policy store:**
   ```bash
   aws verifiedpermissions create-policy-store --validation-settings "mode=STRICT" \
     --description "Policy store for APP_NAME (Cognito User Pool: USER_POOL_ID)" --region us-east-1
   ```

2. **Fetch Cognito custom attributes:**
   ```bash
   aws cognito-idp describe-user-pool --user-pool-id USER_POOL_ID \
     --query 'UserPool.SchemaAttributes[?starts_with(Name, `custom:`)]' --region us-east-1
   ```

3. **Fetch Cognito groups:**
   ```bash
   aws cognito-idp list-groups --user-pool-id USER_POOL_ID --region us-east-1
   ```

4. **Build Cedar schema** with: User entity (from Cognito attrs, strip `custom:` prefix), Resource entity (from app data), CognitoGroup entity

5. **Upload schema:**
   ```bash
   aws verifiedpermissions put-schema --policy-store-id POLICY_STORE_ID \
     --definition file://schema-definition.json --region us-east-1
   ```

6. **Create policies** for each Cognito group

Detailed walkthrough follows below.

---

## Prerequisites

Before integration, ensure:
1. The target application uses Node.js/TypeScript
2. Users authenticate via Amazon Cognito
3. **The application can access Cognito ID tokens** (not just access tokens - see "Critical: ID Token vs Access Token" section)
4. Cedar policies exist (either in AVP or as local files) - **or create a new policy store using the "Creating an AVP Policy Store from Scratch" section below**
5. AWS credentials are configured (for AVP integration) - see "AWS Credentials Setup" below
6. **If a Pre-Token Generation Lambda exists**, it passes through custom attributes (see "Critical: Pre-Token Generation Lambda Triggers" section)

### AWS Credentials Setup

The AWS credentials file must be in INI format at `~/.aws/credentials` (Windows: `C:\Users\USERNAME\.aws\credentials`):

```ini
[default]
aws_access_key_id = YOUR_ACCESS_KEY
aws_secret_access_key = YOUR_SECRET_KEY
aws_session_token = YOUR_SESSION_TOKEN
```

**Note:** The `aws_session_token` line is only required when using temporary credentials (e.g., from AWS SSO, assumed roles, or federation).

**Common mistake:** Environment variable format (e.g., `AWS_ACCESS_KEY_ID=...` without INI structure) won't work - the file must use INI format with `[default]` section header.

---

## Creating an AVP Policy Store from Scratch

**Use this section when no policy store exists yet for the application.** If a policy store already exists, skip to "Pre-Integration Verification Steps".

### Step 1: Gather Required Information

Ask the developer:

```
Q1: What is your Cognito User Pool ID?
    Format: {region}_{poolId} (e.g., us-east-1_ABC123xyz)

Q2: What AWS region should the policy store be created in?
    (Should match your Cognito User Pool region)

Q3: What is the name of your application?
    (Used for the policy store description)

    IMPORTANT: This is the business application whose resources will be protected
    by authorization policies (e.g., "Contract Management System", "Document Portal").
    This is NOT the name of admin tools or policy management UIs that configure policies.

Q4: What Cedar namespace should be used?
    Example: MyApp, TaskManager, NAMESPACE
    This appears in policy statements like: MyApp::User, MyApp::Action::"VIEW"
```

### Step 2: Check for Existing Policy Store

List policy stores and look for one matching your User Pool in the description:

```bash
aws verifiedpermissions list-policy-stores \
  --region us-east-1 \
  --query 'policyStores[*].[policyStoreId,description]' \
  --output table
```

**If a matching policy store exists**, ask the developer:

```
A policy store already exists that appears to match your User Pool:
Policy Store ID: {EXISTING_POLICY_STORE_ID}
Description: {DESCRIPTION}

Do you want to:
a) Use the existing policy store (skip creation)
b) Delete the existing policy store and create a new one

WARNING: Option (b) will permanently delete all existing policies in that store.
```

If the developer chooses (b), delete the existing policy store:

```bash
aws verifiedpermissions delete-policy-store \
  --policy-store-id EXISTING_POLICY_STORE_ID \
  --region us-east-1
```

### Step 3: Create the Policy Store

Create a new policy store. Include the User Pool ID in the description for easy identification:

```bash
aws verifiedpermissions create-policy-store \
  --validation-settings "mode=STRICT" \
  --description "Policy store for APPLICATION_NAME (Cognito User Pool: USER_POOL_ID)" \
  --region us-east-1
```

Save the returned `policyStoreId` - you'll need it for subsequent commands.

**Note:** Including the User Pool ID in the description makes it easy to find the policy store later. The `tag-resource` API may not be available in all CLI versions.

### Step 4: Retrieve Cognito User Pool Schema Information

Fetch the user pool configuration to understand available attributes:

```bash
# Get user pool details including schema
aws cognito-idp describe-user-pool \
  --user-pool-id USER_POOL_ID \
  --region us-east-1 \
  --output json > cognito-user-pool.json

# Extract custom attributes
cat cognito-user-pool.json | jq '.UserPool.SchemaAttributes[] | select(.Name | startswith("custom:"))'

# Get app client configuration to check required attributes
aws cognito-idp describe-user-pool-client \
  --user-pool-id USER_POOL_ID \
  --client-id APP_CLIENT_ID \
  --region us-east-1 \
  --query 'UserPoolClient.ReadAttributes'
```

**From the user pool schema, identify:**
- Custom attributes (those starting with `custom:`)
- Which attributes are required vs optional
- Attribute data types (String, Number, etc.)

### Step 5: Build the Cedar Schema

The Cedar schema defines entity types, their attributes, and actions. Build it incrementally:

#### 5a: Define the CognitoGroup Entity Type

This entity represents Cognito user groups. It typically has no attributes of its own:

```json
{
  "NAMESPACE": {
    "entityTypes": {
      "CognitoGroup": {
        "shape": {
          "type": "Record",
          "attributes": {}
        }
      }
    }
  }
}
```

#### 5b: Define the User Entity Type

First, fetch the custom attributes defined in the Cognito User Pool:

```bash
aws cognito-idp describe-user-pool \
  --user-pool-id USER_POOL_ID \
  --region us-east-1 \
  --query 'UserPool.SchemaAttributes[?starts_with(Name, `custom:`)].[Name,AttributeDataType,Required]' \
  --output table
```

Map Cognito user attributes to Cedar User entity attributes. **Remove the `custom:` prefix** from custom attributes:

| Cognito Attribute | Cedar Attribute | Type | Required |
|-------------------|-----------------|------|----------|
| `sub` | `sub` | String | Yes |
| `email` | `email` | String | Based on app client |
| `cognito:groups` | (handled via parents) | - | - |
| `custom:user_type` | `user_type` | String | Based on app client |
| `custom:user_region` | `user_region` | String | Based on app client |

**Determining Required vs Optional:**
- Check the app client's `ReadAttributes` and `WriteAttributes`
- If an attribute is in `WriteAttributes` but not marked as required in the user pool schema, make it optional in Cedar
- When in doubt, make attributes optional (use `"required": false`) to avoid authorization failures

Example User entity:

```json
"User": {
  "memberOfTypes": ["CognitoGroup"],
  "shape": {
    "type": "Record",
    "attributes": {
      "sub": { "type": "String" },
      "email": { "type": "String" },
      "user_type": { "type": "String", "required": false },
      "user_region": { "type": "String", "required": false }
    }
  }
}
```

#### 5c: Ask About Resource Types

> **Note:** This guide uses "Document" as an example resource type. Replace with your actual resource type (e.g., "Contract", "Report", "Order", "Task").

Ask the developer:

```
What types of resources does your application manage access to?

Examples:
- Document, Report, File (for document management apps)
- Contract, Agreement, Amendment (for legal/contract management apps)
- Project, Task, Sprint (for project management apps)
- Order, Product, Customer (for e-commerce apps)
- Account, Transaction, Portfolio (for financial apps)

List the resource types that should be protected by authorization policies:
```

**Scan the application code** to identify candidate resource types:
- Look for database models/entities
- Look for API route patterns (e.g., `/documents/:id`, `/projects/:id`)
- Look for TypeScript/JavaScript interfaces or types
- Look for class definitions representing business objects

Present findings to the developer:

```
Based on scanning the application code, I found these potential resource types:

1. Document (found in: src/models/document.ts, src/routes/documents.ts)
   - Attributes: id, department, classification, owner, status

2. Report (found in: src/models/report.ts)
   - Attributes: id, type, author, department

Please confirm which resource types should be included in the authorization schema,
and which attributes should be available for policy conditions.

NOTE: Properties you include will appear in dropdown lists in the Amazon Verified
Permissions console when creating attribute-based policies. Only include attributes
that are relevant for authorization decisions.
```

#### 5d: Define Resource Entity Types

For each confirmed resource type, create an entity definition:

```json
"Document": {
  "shape": {
    "type": "Record",
    "attributes": {
      "department": { "type": "String" },
      "classification": { "type": "String" },
      "owner": { "type": "String" },
      "status": { "type": "String" }
    }
  }
}
```

**Important notes for the developer:**
- These attributes will appear in dropdown lists in the Cognito Console when creating attribute-based policies
- Only include attributes that are relevant for authorization decisions
- Attribute names are case-sensitive and must match exactly what the application provides in `additionalEntities`

#### 5e: Define Actions

Scan the application code to identify candidate actions:
- Look for route handlers (GET, POST, PUT, DELETE patterns)
- Look for method names suggesting operations (create, read, update, delete, approve, archive)
- Look for permission checks or role-based logic

Ask the developer:

```
Based on scanning the application code, I found these potential actions for each resource:

Document:
- VIEW (found: GET /documents/:id, viewDocument function)
- EDIT (found: PUT /documents/:id, updateDocument function)
- DELETE (found: DELETE /documents/:id)
- CREATE (found: POST /documents)

Report:
- VIEW (found: GET /reports/:id)
- GENERATE (found: POST /reports/generate)
- EXPORT (found: GET /reports/:id/export)

Please confirm which actions should be included for each resource type.
You can also add actions that aren't in the code yet but will be needed.
```

Define actions in the schema:

```json
"actions": {
  "VIEW": {
    "appliesTo": {
      "principalTypes": ["User"],
      "resourceTypes": ["Document", "Report"]
    }
  },
  "EDIT": {
    "appliesTo": {
      "principalTypes": ["User"],
      "resourceTypes": ["Document"]
    }
  },
  "DELETE": {
    "appliesTo": {
      "principalTypes": ["User"],
      "resourceTypes": ["Document"]
    }
  },
  "CREATE": {
    "appliesTo": {
      "principalTypes": ["User"],
      "resourceTypes": ["Document"]
    }
  },
  "GENERATE": {
    "appliesTo": {
      "principalTypes": ["User"],
      "resourceTypes": ["Report"]
    }
  },
  "EXPORT": {
    "appliesTo": {
      "principalTypes": ["User"],
      "resourceTypes": ["Report"]
    }
  }
}
```

### Step 6: Assemble the Complete Schema

Combine all entity types and actions into the complete schema:

```json
{
  "NAMESPACE": {
    "entityTypes": {
      "CognitoGroup": {
        "shape": {
          "type": "Record",
          "attributes": {}
        }
      },
      "User": {
        "memberOfTypes": ["CognitoGroup"],
        "shape": {
          "type": "Record",
          "attributes": {
            "sub": { "type": "String" },
            "email": { "type": "String" },
            "user_type": { "type": "String", "required": false },
            "user_region": { "type": "String", "required": false }
          }
        }
      },
      "Document": {
        "shape": {
          "type": "Record",
          "attributes": {
            "department": { "type": "String" },
            "classification": { "type": "String" },
            "owner": { "type": "String" },
            "status": { "type": "String" }
          }
        }
      }
    },
    "actions": {
      "VIEW": {
        "appliesTo": {
          "principalTypes": ["User"],
          "resourceTypes": ["Document"]
        }
      },
      "EDIT": {
        "appliesTo": {
          "principalTypes": ["User"],
          "resourceTypes": ["Document"]
        }
      },
      "DELETE": {
        "appliesTo": {
          "principalTypes": ["User"],
          "resourceTypes": ["Document"]
        }
      },
      "CREATE": {
        "appliesTo": {
          "principalTypes": ["User"],
          "resourceTypes": ["Document"]
        }
      }
    }
  }
}
```

**Replace `NAMESPACE` with the actual namespace confirmed by the developer.**

### Step 7: Upload the Schema to AVP

Save the schema to a `cedar-schema.json` file, then create a definition file and upload it.

**Create the schema definition file:**

```bash
node -e "
const fs = require('fs');
const schema = JSON.parse(fs.readFileSync('cedar-schema.json', 'utf8'));
fs.writeFileSync('schema-definition.json', JSON.stringify({ cedarJson: JSON.stringify(schema) }));
console.log('Schema definition created');
"
```

**Upload to AVP:**

```bash
aws verifiedpermissions put-schema \
  --policy-store-id POLICY_STORE_ID \
  --definition file://schema-definition.json \
  --region us-east-1
```

> **Linux/Mac with jq:** You can alternatively use jq for JSON manipulation:
> ```bash
> echo "{\"cedarJson\": $(cat cedar-schema.json | jq -c '.' | jq -Rs '.')}" > schema-definition.json
> ```

### Step 8: Verify the Schema

Confirm the schema was uploaded correctly:

```bash
aws verifiedpermissions get-schema \
  --policy-store-id POLICY_STORE_ID \
  --region us-east-1 \
  --query 'schema' \
  --output text
```

To pretty-print the JSON output:

```bash
# Using Node.js (cross-platform)
aws verifiedpermissions get-schema --policy-store-id POLICY_STORE_ID --region us-east-1 \
  --query 'schema' --output text | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.stringify(JSON.parse(d),null,2)))"

# Using jq (Linux/Mac)
aws verifiedpermissions get-schema --policy-store-id POLICY_STORE_ID --region us-east-1 \
  --query 'schema' --output text | jq '.'
```

### Step 9: Create Sample Authorization Policies

After the schema is uploaded, help the developer create sample authorization policies. This demonstrates how policies work and provides a starting point for their authorization logic.

#### 9a: Check for Cognito User Pool Groups

First, check if the Cognito User Pool has any groups defined:

```bash
aws cognito-idp list-groups \
  --user-pool-id USER_POOL_ID \
  --region us-east-1 \
  --query 'Groups[*].[GroupName,Description]' \
  --output table
```

**If groups exist**, present them to the developer:

```
I found the following groups in your Cognito User Pool:

1. Admins - "Administrative users with full access"
2. Reviewers - "Users who can review documents"
3. ReadOnly - "Users with read-only access"

Would you like to create a group-based authorization policy for one of these groups?
This uses the "Membership permissions" Cedar pattern where access is granted based on group membership.

Which group would you like to create a policy for?
```

**If no groups exist**, skip to section 9d for attribute-based policies only.

#### 9b: Create Group-Based Policy (Membership Permissions Pattern)

The Membership permissions pattern derives access rights from a principal's inclusion in a group. This is the Cedar equivalent of Role-Based Access Control (RBAC).

Ask the developer:

```
For the "{GROUP_NAME}" group, which actions should members be permitted to perform?

Available actions (from your schema):
- VIEW
- EDIT
- DELETE
- CREATE

Select the actions members of "{GROUP_NAME}" should be allowed to perform:
```

**Policy Annotation Convention:**

Group-based policies should include the `@id` annotation with the group name. This makes policies easier to identify and manage:

```cedar
@id("group-name")
permit (...)
```

**Basic group policy example (no conditions):**

```cedar
@id("Reviewers")
// Members of the Reviewers group can VIEW and EDIT documents
permit (
  principal in NAMESPACE::CognitoGroup::"Reviewers",
  action in [NAMESPACE::Action::"VIEW", NAMESPACE::Action::"EDIT"],
  resource is NAMESPACE::Document
);
```

#### 9c: Add Attribute-Based Conditions to Group Policy

After defining the basic group policy, prompt the developer to add attribute-based conditions. This combines RBAC with Attribute-Based Access Control (ABAC).

Present the resource attributes from the schema:

```
Your "{RESOURCE_TYPE}" resource type has these attributes available for policy conditions:
- department (String)
- classification (String)
- status (String)
- owner (String)

Would you like to restrict what members of "{GROUP_NAME}" can access based on one of these attributes?

For example:
- Only allow access to documents with status = "Active"
- Only allow access to documents in a specific department
- Only allow access to documents with classification = "Internal"

Enter an attribute-based condition, or type "none" to skip:
Example: "status equals Active" or "classification equals Internal"
```

**If the developer provides a condition**, convert it to a Cedar `when` clause:

| Developer Input | Cedar Condition |
|-----------------|-----------------|
| "status equals Active" | `when { resource.status == "Active" }` |
| "status equals Draft or Review" | `when { resource.status == "Draft" \|\| resource.status == "Review" }` |
| "classification equals Internal" | `when { resource.classification == "Internal" }` |
| "department equals Engineering" | `when { resource.department == "Engineering" }` |

**Complete policy with attribute condition:**

```cedar
@id("Reviewers")
// Members of the Reviewers group can VIEW documents with status "Draft" or "Review"
permit (
  principal in NAMESPACE::CognitoGroup::"Reviewers",
  action == NAMESPACE::Action::"VIEW",
  resource is NAMESPACE::Document
) when {
  resource.status == "Draft" || resource.status == "Review"
};
```

**More advanced: Combine multiple conditions:**

```cedar
@id("Reviewers")
// Reviewers can EDIT documents that are in Draft status AND in their department
permit (
  principal in NAMESPACE::CognitoGroup::"Reviewers",
  action == NAMESPACE::Action::"EDIT",
  resource is NAMESPACE::Document
) when {
  resource.status == "Draft" &&
  resource.department == principal.user_region
};
```

#### 9d: Create the Policy in AVP

Once the developer confirms the policy, create it in the policy store:

```bash
# Create a static policy
aws verifiedpermissions create-policy \
  --policy-store-id POLICY_STORE_ID \
  --definition '{
    "static": {
      "description": "Reviewers can view documents in Draft or Review status",
      "statement": "@id(\"Reviewers\")\npermit (\n  principal in NAMESPACE::CognitoGroup::\"Reviewers\",\n  action == NAMESPACE::Action::\"VIEW\",\n  resource is NAMESPACE::Document\n) when {\n  resource.status == \"Draft\" || resource.status == \"Review\"\n};"
    }
  }' \
  --region us-east-1
```

**Alternative using a file (recommended for complex policies):**

```bash
# Save policy to file
cat > sample-policy.json << 'EOF'
{
  "static": {
    "description": "Reviewers can view documents in Draft or Review status",
    "statement": "@id(\"Reviewers\")\npermit (\n  principal in NAMESPACE::CognitoGroup::\"Reviewers\",\n  action == NAMESPACE::Action::\"VIEW\",\n  resource is NAMESPACE::Document\n) when {\n  resource.status == \"Draft\" || resource.status == \"Review\"\n};"
  }
}
EOF

# Create the policy
aws verifiedpermissions create-policy \
  --policy-store-id POLICY_STORE_ID \
  --definition file://sample-policy.json \
  --region us-east-1
```

**Alternative using Node.js (when complex escaping is needed):**

```bash
node -e "
const { execSync } = require('child_process');

const policy = {
  static: {
    description: 'Reviewers can view documents in Draft or Review status',
    statement: \`@id(\"Reviewers\")
permit (
  principal in NAMESPACE::CognitoGroup::\"Reviewers\",
  action == NAMESPACE::Action::\"VIEW\",
  resource is NAMESPACE::Document
) when {
  resource.status == \"Draft\" || resource.status == \"Review\"
};\`
  }
};

require('fs').writeFileSync('sample-policy.json', JSON.stringify(policy, null, 2));
console.log('Policy file created');
"

aws verifiedpermissions create-policy \
  --policy-store-id POLICY_STORE_ID \
  --definition file://sample-policy.json \
  --region us-east-1
```

#### 9e: Verify the Policy Was Created

```bash
# List policies in the store
aws verifiedpermissions list-policies \
  --policy-store-id POLICY_STORE_ID \
  --region us-east-1 \
  --query 'policies[*].[policyId,policyType,definition.static.description]' \
  --output table
```

#### 9f: Offer to Create Additional Policies

After creating the first policy, ask the developer:

```
Policy created successfully!

Would you like to create additional policies? Common patterns include:

1. **Admin full access** - Admins group can perform all actions on all resources
   Example: permit(principal in CognitoGroup::"Admins", action, resource);

2. **Owner-based access** - Users can edit resources they own
   Example: permit(...) when { resource.owner == principal.sub };

3. **Another group policy** - Create policy for a different group

Enter a number (1-3) or "done" to finish:
```

**Admin full access policy:**

```cedar
@id("Admins")
// Administrators have full access to all documents
permit (
  principal in NAMESPACE::CognitoGroup::"Admins",
  action,
  resource is NAMESPACE::Document
);
```

**Owner-based access policy:**

```cedar
// Users can edit documents they own
permit (
  principal is NAMESPACE::User,
  action == NAMESPACE::Action::"EDIT",
  resource is NAMESPACE::Document
) when {
  resource.owner == principal.sub
};
```

#### Cedar Policy Quick Reference

| Pattern | Cedar Syntax |
|---------|--------------|
| Group membership | `principal in NAMESPACE::CognitoGroup::"GroupName"` |
| Any user | `principal is NAMESPACE::User` |
| Single action | `action == NAMESPACE::Action::"VIEW"` |
| Multiple actions | `action in [NAMESPACE::Action::"VIEW", NAMESPACE::Action::"EDIT"]` |
| Any action | `action` |
| Resource type | `resource is NAMESPACE::Document` |
| String equality | `resource.status == "Active"` |
| OR condition | `resource.status == "A" \|\| resource.status == "B"` |
| AND condition | `resource.status == "A" && resource.department == "Eng"` |
| Principal-resource match | `resource.department == principal.user_region` |
| Owner check | `resource.owner == principal.sub` |

#### Creating Multiple Policies Programmatically

When creating policies for multiple Cognito groups, use a script to generate and upload them:

```javascript
// create-policies.js
const { execSync } = require('child_process');
const fs = require('fs');

const POLICY_STORE_ID = 'YOUR_POLICY_STORE_ID';
const REGION = 'us-east-1';
const NAMESPACE = 'NAMESPACE';
const RESOURCE_TYPE = 'Contract'; // Change to your resource type

const policies = [
  { group: 'legal-interns', actions: ['REVIEW'] },
  { group: 'outside-counsel', actions: ['REVIEW', 'EDIT'] },
  { group: 'inhouse-counsel', actions: ['REVIEW', 'EDIT', 'APPROVE'] },
  { group: 'operations-team', actions: ['REVIEW', 'EDIT', 'ARCHIVE'] },
];

policies.forEach(p => {
  const actionClause = p.actions.length === 1
    ? `== ${NAMESPACE}::Action::"${p.actions[0]}"`
    : `in [${p.actions.map(a => `${NAMESPACE}::Action::"${a}"`).join(', ')}]`;

  const statement = `@id("${p.group}")\npermit (principal in ${NAMESPACE}::CognitoGroup::"${p.group}", action ${actionClause}, resource is ${NAMESPACE}::${RESOURCE_TYPE});`;

  const policy = {
    static: {
      description: `${p.group} can ${p.actions.join(', ')} ${RESOURCE_TYPE.toLowerCase()}s`,
      statement: statement
    }
  };

  const filename = `policy-${p.group}.json`;
  fs.writeFileSync(filename, JSON.stringify(policy, null, 2));

  try {
    execSync(`aws verifiedpermissions create-policy --policy-store-id ${POLICY_STORE_ID} --definition file://${filename} --region ${REGION}`);
    console.log(`Created policy for ${p.group}`);
  } catch (err) {
    console.error(`Failed to create policy for ${p.group}:`, err.message);
  }
});
```

Run with: `node create-policies.js`

### Summary: Questions to Ask When Creating Policy Store

| Step | Question |
|------|----------|
| 1 | What is your Cognito User Pool ID? |
| 1 | What AWS region? |
| 1 | What is the application name? |
| 1 | What Cedar namespace? |
| 2 | (If exists) Delete existing policy store or use it? |
| 5c | What resource types does the application manage? |
| 5c | Which resource attributes should be usable in policies? |
| 5e | Which actions should be defined for each resource? |
| 9a | Which Cognito group should have a policy? |
| 9b | Which actions should the group be permitted to perform? |
| 9c | Should access be restricted by a resource attribute condition? |
| 9f | Would you like to create additional policies? |

### Cedar Schema Reference

**Supported attribute types:**
- `String` - Text values
- `Long` - Integer numbers
- `Boolean` - true/false
- `Set` - Collection of values (requires `element` type)
- `Record` - Nested object with attributes
- `Entity` - Reference to another entity type (requires `name`)

**Making attributes optional:**
```json
"attributeName": { "type": "String", "required": false }
```

**Entity parent relationships:**
```json
"User": {
  "memberOfTypes": ["CognitoGroup", "Department"],
  ...
}
```

**Action groups (for related actions):**
```json
"actions": {
  "readOnly": {
    "appliesTo": {
      "principalTypes": [],
      "resourceTypes": []
    }
  },
  "VIEW": {
    "memberOf": [{ "id": "readOnly" }],
    "appliesTo": {
      "principalTypes": ["User"],
      "resourceTypes": ["Document"]
    }
  }
}
```

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
| App Data | `resource.department` | `department` (Resource) | Resource attribute |
| App Data | `resource.status` | `status` (Resource) | Resource attribute |

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
- **Resource attributes** (e.g., Document): Come from application data, set in `additionalEntities`

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

### Critical: Authorizing Resource Lists

When listing resources (e.g., "show all documents the user can view"), you need a strategy for authorization. **Do NOT use placeholder entities with dummy attributes.**

#### Why Placeholder Entities Don't Work

```typescript
// ❌ WRONG: Using a placeholder entity
const result = await client.authorize({
  token: idToken,
  action: 'VIEW',
  resource: { type: 'Document', id: 'any' },
  additionalEntities: [{
    uid: { type: 'NAMESPACE::Document', id: 'any' },
    attrs: { department: '*', classification: '*', owner: '*', status: 'Active' },
    parents: [],
  }],
});
```

**Problems:**
1. If policies check `principal.user_region == resource.department`, the wildcard `*` won't match
2. Results don't reflect actual permissions for real resources
3. Users may see an empty list or get access to resources they shouldn't

#### Recommended: Authorize Each Resource Individually (Option A)

Authorize each resource in parallel and filter to only those the user can access:

```typescript
// ✅ CORRECT: Authorize each resource individually
router.get('/documents', async (req, res) => {
  const idToken = getIdToken(req);

  // Get all resources (need full data for authorization)
  const allDocuments = readDocuments();

  // Authorize VIEW for each document in parallel
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

  // Filter to only documents the user can VIEW
  const authorizedDocuments = allDocuments.filter((_, i) => authResults[i].allowed);

  res.json({ documents: authorizedDocuments });
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
const userDepartment = claims['custom:department'];
const visibleDocs = allDocuments.filter(d => d.department === userDepartment);
```

**This defeats the purpose of externalized authorization:**
- If policies change, application code must also change
- Policy logic becomes duplicated and can drift
- Complex policies (multiple conditions, group-based access) are hard to replicate

**Rule:** The application should not know the authorization logic. Let the policy engine decide.

#### Alternative: Permissive List Policy (Option B)

If listing should be open to all authenticated users, create a permissive policy for the list action:

```cedar
// Policy: All authenticated users can VIEW (list) documents
permit(
  principal is NAMESPACE::User,
  action == NAMESPACE::Action::"VIEW",
  resource is NAMESPACE::Document
);
```

Then use stricter policies for modification actions (EDIT, DELETE).

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

export type ResourceAction = 'VIEW' | 'EDIT' | 'DELETE';

export interface ResourcePermissions {
  view: boolean;
  edit: boolean;
  delete: boolean;
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

// Build Cedar entity for a resource
function buildResourceEntity(resource: { id: string; department: string; classification: string; owner: string; status: string }) {
  return {
    uid: { type: `${NAMESPACE}::Document`, id: resource.id },
    attrs: {
      department: resource.department,      // Pass raw values!
      classification: resource.classification,
      owner: resource.owner,
      status: resource.status,
    },
    parents: [],
  };
}

// Authorize single action
export async function authorizeResourceAction(
  idToken: string,
  action: ResourceAction,
  resource: { id: string; department: string; classification: string; owner: string; status: string }
): Promise<{ allowed: boolean; diagnostics: { reason: string[]; errors: string[] } }> {
  try {
    const result = await getClient().authorize({
      token: idToken,
      action,
      resource: { type: 'Document', id: resource.id },
      additionalEntities: [buildResourceEntity(resource)],
    });
    return { allowed: result.allowed, diagnostics: result.diagnostics };
  } catch (error) {
    console.error('Authorization error:', error);
    return { allowed: false, diagnostics: { reason: ['Authorization service error'], errors: [] } };
  }
}

// Get all permissions for a resource (parallel calls)
export async function getResourcePermissions(
  idToken: string,
  resource: { id: string; department: string; classification: string; owner: string; status: string }
): Promise<ResourcePermissions> {
  const actions: ResourceAction[] = ['VIEW', 'EDIT', 'DELETE'];
  const resourceEntity = buildResourceEntity(resource);

  try {
    const results = await Promise.all(
      actions.map(action =>
        getClient().authorize({
          token: idToken,
          action,
          resource: { type: 'Document', id: resource.id },
          additionalEntities: [resourceEntity],
        })
      )
    );

    return {
      view: results[0]?.allowed ?? false,
      edit: results[1]?.allowed ?? false,
      delete: results[2]?.allowed ?? false,
    };
  } catch (error) {
    console.error('Batch authorization error:', error);
    return { view: false, edit: false, delete: false };
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
// src/routes/documents.ts
import { Router, Request, Response } from 'express';
import { authorizeResourceAction, getResourcePermissions } from '../lib/cac-client';
import { getDocumentById } from '../lib/documents';

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

  const document = getDocumentById(req.params.id);
  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
  }

  // Check VIEW permission
  const authResult = await authorizeResourceAction(idToken, 'VIEW', document);
  if (!authResult.allowed) {
    return res.status(403).json({ error: 'Access denied', diagnostics: authResult.diagnostics });
  }

  // Get all permissions for this document
  const permissions = await getResourcePermissions(idToken, document);

  res.json({ document, permissions });
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
    c) No policy store exists yet - need to create one

If AVP (option a):
    Q4a: What is your AVP Policy Store ID?
         Format: alphanumeric string (e.g., BWRtaygo7MkaFaBz8BbHHz)

If Local files (option b):
    Q4b: What is the path to your Cedar policies file?

If No policy store (option c):
    → Follow the "Creating an AVP Policy Store from Scratch" section above
    → This will guide you through creating the policy store and Cedar schema
```

### 3. Cedar Namespace

```
Q5: What Cedar namespace do your policies use?
    Example: MyApp, DocManager, NAMESPACE
    This appears in policy statements like: MyApp::User, MyApp::Action::"VIEW"
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
  classification: resource.classification === 'Y' ? 'TRUE' : 'FALSE',  // ❌
}

// CORRECT
attrs: {
  classification: resource.classification,  // ✅ Pass "Y" or "N" as stored
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
- **Resource attributes** (e.g., Document entity): Sourced from application data, provided in `additionalEntities`

These may have different names. For example:
- User has `user_region` (from token `custom:user_region`)
- Document has `department` (from application data)

Policies can compare them: `principal.user_region == resource.department`

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

AVP Schema (Document entity attributes):
  - department: String      (different from user_region - this is OK)
  - classification: String
  - status: String

Authorization Request:
  Principal attributes (from token):
    - user_type: "REVIEWER"   ✅ Correct
    - user_region: "US"       ✅ Correct
  Resource attributes (from app data):
    - department: "Engineering"  ✅ Correct (matches Document schema)
    - classification: "Internal" ✅ Correct
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
  action: 'VIEW',
  resource: { type: 'Document', id: 'doc-123' },
  additionalEntities: [{
    uid: { type: 'NAMESPACE::Document', id: 'doc-123' },
    attrs: { department: 'Engineering', status: 'Active' },
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
