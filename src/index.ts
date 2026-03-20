// Main exports for the cognito-authorization-client library

// Cognito token handling
export {
  CognitoIdTokenClaims,
  CognitoAccessTokenClaims,
  CognitoTokenClaims,
  ValidatedToken,
  getUserIdentifier,
  getGroups,
  isIdToken,
  isAccessToken,
  getCustomAttributes,
} from './cognito/token-types.js';

export {
  TokenValidator,
  TokenValidatorConfig,
  TokenValidationError,
} from './cognito/token-validator.js';

export { JwksClient } from './cognito/jwks-client.js';

// Cedar entity and authorization
export {
  EntityBuilder,
  EntityBuilderConfig,
  CedarEntity,
  CedarValue,
} from './cedar/entity-builder.js';

export {
  CedarAuthorizer,
  AuthorizerConfig,
  AuthorizationRequest,
  AuthorizationResponse,
  Decision,
  createAuthorizer,
} from './cedar/authorizer.js';

// AVP Policy Store
export {
  AVPPolicyStore,
  PolicyStoreConfig,
  PolicyStoreData,
  createPolicyStore,
} from './avp/policy-store.js';

// Main client
export {
  CognitoAuthorizationClient,
  AuthzRequest,
  AuthzResponse,
  createClient,
} from './client.js';

// Configuration
export {
  Config,
  ConfigSchema,
  CedarFileConfig,
  CedarAVPConfig,
  isAVPConfig,
  isFileConfig,
  loadConfigFromEnv,
  validateConfig,
} from './config.js';

// Server
export { createServer } from './server/index.js';
