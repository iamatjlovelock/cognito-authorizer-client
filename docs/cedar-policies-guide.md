# Cedar Policies Guide for Cognito

This guide explains how to write Cedar policies that work with Cognito tokens.

## Understanding the Entity Model

When a Cognito token is validated, the client creates Cedar entities:

### User Entity

Created from the token's user information:

```
MyApp::User::"johndoe"
├── attrs
│   ├── sub: "abc-123-def"
│   ├── username: "johndoe"
│   ├── email: "john@example.com"
│   ├── email_verified: true
│   ├── department: "engineering"  (from custom:department)
│   └── groups: ["admins", "developers"]
└── parents
    ├── MyApp::CognitoGroup::"admins"
    └── MyApp::CognitoGroup::"developers"
```

### Group Entities

Created for each group the user belongs to:

```
MyApp::CognitoGroup::"admins"
├── attrs
│   └── name: "admins"
└── parents: []

MyApp::CognitoGroup::"developers"
├── attrs
│   └── name: "developers"
└── parents: []
```

## Policy Patterns

### 1. Group-Based Access

The most common pattern - grant access based on Cognito group membership:

```cedar
// Allow admins to do anything
permit (
    principal in MyApp::CognitoGroup::"admins",
    action,
    resource
);

// Allow developers to read and write code
permit (
    principal in MyApp::CognitoGroup::"developers",
    action in [MyApp::Action::"read", MyApp::Action::"write"],
    resource is MyApp::Repository
);

// Allow viewers read-only access
permit (
    principal in MyApp::CognitoGroup::"viewers",
    action == MyApp::Action::"read",
    resource
);
```

### 2. User-Specific Access

Grant access to specific users:

```cedar
// Allow a specific user full access
permit (
    principal == MyApp::User::"superadmin",
    action,
    resource
);
```

### 3. Owner-Based Access

Allow users to access their own resources:

```cedar
// Users can read and update their own profile
permit (
    principal,
    action in [MyApp::Action::"read", MyApp::Action::"update"],
    resource is MyApp::UserProfile
)
when {
    principal.sub == resource.ownerId
};

// Users can manage documents they created
permit (
    principal,
    action,
    resource is MyApp::Document
)
when {
    principal.sub == resource.createdBy
};
```

### 4. Attribute-Based Access

Use user attributes from the token:

```cedar
// Users can only access resources in their department
permit (
    principal,
    action == MyApp::Action::"read",
    resource is MyApp::Document
)
when {
    principal.department == resource.department
};

// Only managers can approve requests
permit (
    principal,
    action == MyApp::Action::"approve",
    resource is MyApp::Request
)
when {
    principal.role == "manager"
};
```

### 5. Email Verification

Require verified email for sensitive actions:

```cedar
// Only verified users can create resources
permit (
    principal,
    action == MyApp::Action::"create",
    resource
)
when {
    principal.email_verified == true
};

// Only verified users can send messages
permit (
    principal,
    action == MyApp::Action::"send",
    resource is MyApp::Message
)
when {
    principal.email_verified == true
};
```

### 6. Combining Conditions

Use multiple conditions together:

```cedar
// Department managers can approve their department's documents
permit (
    principal,
    action == MyApp::Action::"approve",
    resource is MyApp::Document
)
when {
    principal.role == "manager" &&
    principal.department == resource.department
};

// Admins with verified email can delete any resource
permit (
    principal in MyApp::CognitoGroup::"admins",
    action == MyApp::Action::"delete",
    resource
)
when {
    principal.email_verified == true
};
```

### 7. Forbid Policies

Explicitly deny access:

```cedar
// Never allow deletion of archived documents
forbid (
    principal,
    action == MyApp::Action::"delete",
    resource is MyApp::Document
)
when {
    resource.status == "archived"
};

// Suspended users cannot perform any action
forbid (
    principal,
    action,
    resource
)
when {
    principal.status == "suspended"
};
```

### 8. Context-Based Access

Use request context in policies:

```cedar
// Only allow access during business hours (context provided by app)
permit (
    principal,
    action,
    resource
)
when {
    context.hour >= 9 && context.hour <= 17
};

// Only allow access from specific IP ranges
permit (
    principal,
    action,
    resource
)
when {
    context.ipAddress.like("192.168.*")
};
```

## Resource Entities

Your application provides resource entities during authorization. Include relevant attributes:

```typescript
const response = await client.authorize({
  token: userToken,
  action: 'read',
  resource: { type: 'Document', id: 'doc-123' },
  additionalEntities: [
    {
      uid: { type: 'MyApp::Document', id: 'doc-123' },
      attrs: {
        ownerId: 'sub-456',
        department: 'engineering',
        status: 'published',
        createdBy: 'sub-456',
      },
      parents: [],
    },
  ],
});
```

## Using Custom Attributes

Cognito custom attributes (prefixed with `custom:` in the token) are available without the prefix:

**Token claim:** `custom:department` = "engineering"
**Cedar attribute:** `principal.department`

**Token claim:** `custom:employee_id` = "E12345"
**Cedar attribute:** `principal.employee_id`

Configure attribute mapping for different names:

```json
{
  "entities": {
    "attributeMapping": {
      "custom:dept": "department",
      "custom:emp_id": "employeeId"
    }
  }
}
```

## Schema Validation

Define a schema to catch policy errors early:

```json
{
  "MyApp": {
    "entityTypes": {
      "User": {
        "shape": {
          "type": "Record",
          "attributes": {
            "sub": { "type": "String", "required": true },
            "username": { "type": "String", "required": true },
            "email": { "type": "String" },
            "email_verified": { "type": "Boolean" },
            "department": { "type": "String" },
            "role": { "type": "String" },
            "groups": {
              "type": "Set",
              "element": { "type": "String" }
            }
          }
        },
        "memberOfTypes": ["CognitoGroup"]
      },
      "CognitoGroup": {
        "shape": {
          "type": "Record",
          "attributes": {
            "name": { "type": "String", "required": true }
          }
        }
      },
      "Document": {
        "shape": {
          "type": "Record",
          "attributes": {
            "ownerId": { "type": "String" },
            "department": { "type": "String" },
            "status": { "type": "String" },
            "createdBy": { "type": "String" }
          }
        }
      }
    },
    "actions": {
      "read": {
        "appliesTo": {
          "principalTypes": ["User"],
          "resourceTypes": ["Document", "UserProfile"]
        }
      },
      "write": {
        "appliesTo": {
          "principalTypes": ["User"],
          "resourceTypes": ["Document"]
        }
      },
      "delete": {
        "appliesTo": {
          "principalTypes": ["User"],
          "resourceTypes": ["Document"]
        }
      },
      "approve": {
        "appliesTo": {
          "principalTypes": ["User"],
          "resourceTypes": ["Document", "Request"]
        }
      }
    }
  }
}
```

## Best Practices

### 1. Use Groups for Role-Based Access

```cedar
// Good: Use Cognito groups
permit (
    principal in MyApp::CognitoGroup::"admins",
    action,
    resource
);

// Avoid: Hardcoding user IDs
permit (
    principal == MyApp::User::"user123",
    action,
    resource
);
```

### 2. Prefer Specific Actions Over Wildcards

```cedar
// Good: Explicit actions
permit (
    principal in MyApp::CognitoGroup::"editors",
    action in [MyApp::Action::"read", MyApp::Action::"write"],
    resource is MyApp::Document
);

// Avoid: Wildcard actions (use sparingly)
permit (
    principal in MyApp::CognitoGroup::"admins",
    action,
    resource
);
```

### 3. Use Forbid Policies for Security Boundaries

```cedar
// Always deny access to sensitive resources for non-admins
forbid (
    principal,
    action,
    resource is MyApp::AuditLog
)
unless {
    principal in MyApp::CognitoGroup::"security-admins"
};
```

### 4. Add Policy Annotations

```cedar
@id("allow-admins-all")
@description("Administrators have full access to all resources")
permit (
    principal in MyApp::CognitoGroup::"admins",
    action,
    resource
);
```

### 5. Test Policies Before Deployment

Use the test suite to verify policies work as expected:

```typescript
describe('Admin policies', () => {
  it('should allow admins to delete documents', () => {
    const result = authorizer.isAuthorized({
      principal: { type: 'MyApp::User', id: 'admin' },
      action: { type: 'MyApp::Action', id: 'delete' },
      resource: { type: 'MyApp::Document', id: 'doc-1' },
      entities: [adminUserEntity, adminGroupEntity],
    });
    expect(result.decision).toBe('Allow');
  });
});
```

## Common Pitfalls

### 1. Forgetting Group Entities

Always include group entities when the user has group memberships:

```typescript
// Wrong: Missing group entity
const entities = [userEntity];

// Correct: Include both user and group entities
const entities = entityBuilder.buildEntities(claims);
// This returns both the user entity AND all group entities
```

### 2. Case Sensitivity

Cedar is case-sensitive. Ensure consistency:

```cedar
// These are DIFFERENT groups
MyApp::CognitoGroup::"Admins"
MyApp::CognitoGroup::"admins"
```

### 3. Missing Attributes

If a policy references an attribute that doesn't exist, the condition evaluates to false:

```cedar
// If principal.department is undefined, this denies access
permit (
    principal,
    action,
    resource
)
when {
    principal.department == resource.department
};
```

Use `has` to check for attribute existence:

```cedar
permit (
    principal,
    action,
    resource
)
when {
    principal has department &&
    resource has department &&
    principal.department == resource.department
};
```
