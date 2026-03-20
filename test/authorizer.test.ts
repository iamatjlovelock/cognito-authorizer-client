import { describe, it, expect } from 'vitest';
import { CedarAuthorizer, EntityBuilder } from '../src/index.js';

describe('CedarAuthorizer', () => {
  const policies = `
    // Allow admins to do anything
    permit (
        principal in TestApp::CognitoGroup::"admins",
        action,
        resource
    );

    // Allow users to read their own profile
    permit (
        principal,
        action == TestApp::Action::"read",
        resource is TestApp::UserProfile
    )
    when {
        principal.sub == resource.ownerId
    };
  `;

  it('should allow admin users', () => {
    const authorizer = new CedarAuthorizer({ policies });
    const entityBuilder = new EntityBuilder({ namespace: 'TestApp' });

    // Build entities for an admin user
    const userEntity = {
      uid: { type: 'TestApp::User', id: 'admin-user' },
      attrs: { sub: 'sub-123', username: 'admin-user', groups: ['admins'] },
      parents: [{ type: 'TestApp::CognitoGroup', id: 'admins' }],
    };

    const groupEntity = {
      uid: { type: 'TestApp::CognitoGroup', id: 'admins' },
      attrs: { name: 'admins' },
      parents: [],
    };

    const result = authorizer.isAuthorized({
      principal: { type: 'TestApp::User', id: 'admin-user' },
      action: { type: 'TestApp::Action', id: 'delete' },
      resource: { type: 'TestApp::Document', id: 'doc-123' },
      entities: [userEntity, groupEntity],
    });

    expect(result.decision).toBe('Allow');
  });

  it('should deny non-admin users for restricted actions', () => {
    const authorizer = new CedarAuthorizer({ policies });

    const userEntity = {
      uid: { type: 'TestApp::User', id: 'regular-user' },
      attrs: { sub: 'sub-456', username: 'regular-user', groups: ['viewers'] },
      parents: [{ type: 'TestApp::CognitoGroup', id: 'viewers' }],
    };

    const groupEntity = {
      uid: { type: 'TestApp::CognitoGroup', id: 'viewers' },
      attrs: { name: 'viewers' },
      parents: [],
    };

    const result = authorizer.isAuthorized({
      principal: { type: 'TestApp::User', id: 'regular-user' },
      action: { type: 'TestApp::Action', id: 'delete' },
      resource: { type: 'TestApp::Document', id: 'doc-123' },
      entities: [userEntity, groupEntity],
    });

    expect(result.decision).toBe('Deny');
  });

  it('should allow users to read their own profile', () => {
    const authorizer = new CedarAuthorizer({ policies });

    const userEntity = {
      uid: { type: 'TestApp::User', id: 'john' },
      attrs: { sub: 'sub-john', username: 'john', groups: [] },
      parents: [],
    };

    const profileEntity = {
      uid: { type: 'TestApp::UserProfile', id: 'profile-john' },
      attrs: { ownerId: 'sub-john' },
      parents: [],
    };

    const result = authorizer.isAuthorized({
      principal: { type: 'TestApp::User', id: 'john' },
      action: { type: 'TestApp::Action', id: 'read' },
      resource: { type: 'TestApp::UserProfile', id: 'profile-john' },
      entities: [userEntity, profileEntity],
    });

    expect(result.decision).toBe('Allow');
  });

  it('should deny users from reading other profiles', () => {
    const authorizer = new CedarAuthorizer({ policies });

    const userEntity = {
      uid: { type: 'TestApp::User', id: 'john' },
      attrs: { sub: 'sub-john', username: 'john', groups: [] },
      parents: [],
    };

    const profileEntity = {
      uid: { type: 'TestApp::UserProfile', id: 'profile-jane' },
      attrs: { ownerId: 'sub-jane' },
      parents: [],
    };

    const result = authorizer.isAuthorized({
      principal: { type: 'TestApp::User', id: 'john' },
      action: { type: 'TestApp::Action', id: 'read' },
      resource: { type: 'TestApp::UserProfile', id: 'profile-jane' },
      entities: [userEntity, profileEntity],
    });

    expect(result.decision).toBe('Deny');
  });
});

describe('EntityBuilder', () => {
  it('should build user and group entities from token claims', () => {
    const entityBuilder = new EntityBuilder({
      namespace: 'TestApp',
      userTypeName: 'User',
      groupTypeName: 'CognitoGroup',
    });

    // Simulate Cognito ID token claims
    const claims = {
      sub: 'sub-123',
      'cognito:username': 'testuser',
      'cognito:groups': ['developers', 'viewers'],
      email: 'test@example.com',
      email_verified: true,
      token_use: 'id' as const,
      aud: 'client-id',
      iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_xxx',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      auth_time: Math.floor(Date.now() / 1000),
    };

    const entities = entityBuilder.buildEntities(claims);

    // Should have 3 entities: 2 groups + 1 user
    expect(entities.length).toBe(3);

    // Check group entities
    const devGroup = entities.find((e) => e.uid.id === 'developers');
    expect(devGroup).toBeDefined();
    expect(devGroup?.uid.type).toBe('TestApp::CognitoGroup');

    // Check user entity
    const user = entities.find((e) => e.uid.type === 'TestApp::User');
    expect(user).toBeDefined();
    expect(user?.uid.id).toBe('testuser');
    expect(user?.attrs.email).toBe('test@example.com');
    expect(user?.parents).toHaveLength(2);
  });

  it('should get principal from claims', () => {
    const entityBuilder = new EntityBuilder({ namespace: 'MyApp' });

    const claims = {
      sub: 'sub-456',
      'cognito:username': 'alice',
      token_use: 'id' as const,
      aud: 'client-id',
      iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_xxx',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      auth_time: Math.floor(Date.now() / 1000),
    };

    const principal = entityBuilder.getPrincipal(claims);

    expect(principal.type).toBe('MyApp::User');
    expect(principal.id).toBe('alice');
  });
});
