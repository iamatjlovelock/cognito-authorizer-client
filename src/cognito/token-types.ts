/**
 * Cognito ID Token claims
 * https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-id-token.html
 */
export interface CognitoIdTokenClaims {
  // Standard OIDC claims
  sub: string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
  auth_time: number;
  token_use: 'id';

  // Cognito-specific claims
  'cognito:username': string;
  'cognito:groups'?: string[];

  // Optional standard claims
  email?: string;
  email_verified?: boolean;
  phone_number?: string;
  phone_number_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  locale?: string;
  zoneinfo?: string;

  // Custom attributes (prefixed with 'custom:')
  [key: `custom:${string}`]: string | number | boolean | undefined;
}

/**
 * Cognito Access Token claims
 * https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-access-token.html
 */
export interface CognitoAccessTokenClaims {
  // Standard claims
  sub: string;
  iss: string;
  exp: number;
  iat: number;
  auth_time: number;
  jti: string;
  token_use: 'access';

  // Cognito-specific claims
  client_id: string;
  username: string;
  'cognito:groups'?: string[];
  scope?: string;
  version?: number;
  origin_jti?: string;
  event_id?: string;
}

/**
 * Union type for both token types
 */
export type CognitoTokenClaims = CognitoIdTokenClaims | CognitoAccessTokenClaims;

/**
 * Validated token result
 */
export interface ValidatedToken<T extends CognitoTokenClaims = CognitoTokenClaims> {
  claims: T;
  header: {
    alg: string;
    kid: string;
  };
  raw: string;
}

/**
 * Extract user identifier from token claims
 */
export function getUserIdentifier(claims: CognitoTokenClaims): string {
  if (claims.token_use === 'id') {
    return claims['cognito:username'];
  }
  return claims.username;
}

/**
 * Extract groups from token claims
 */
export function getGroups(claims: CognitoTokenClaims): string[] {
  return claims['cognito:groups'] ?? [];
}

/**
 * Check if claims are from an ID token
 */
export function isIdToken(claims: CognitoTokenClaims): claims is CognitoIdTokenClaims {
  return claims.token_use === 'id';
}

/**
 * Check if claims are from an access token
 */
export function isAccessToken(claims: CognitoTokenClaims): claims is CognitoAccessTokenClaims {
  return claims.token_use === 'access';
}

/**
 * Extract custom attributes from ID token claims
 */
export function getCustomAttributes(claims: CognitoIdTokenClaims): Record<string, string | number | boolean> {
  const customAttrs: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(claims)) {
    if (key.startsWith('custom:') && value !== undefined) {
      const attrName = key.slice(7); // Remove 'custom:' prefix
      customAttrs[attrName] = value as string | number | boolean;
    }
  }
  return customAttrs;
}
