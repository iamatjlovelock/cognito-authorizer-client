import * as jose from 'jose';
import { JwksClient } from './jwks-client.js';
import {
  CognitoIdTokenClaims,
  CognitoAccessTokenClaims,
  CognitoTokenClaims,
  ValidatedToken,
} from './token-types.js';

export interface TokenValidatorConfig {
  /**
   * Expected issuer URL (Cognito User Pool URL)
   * Format: https://cognito-idp.{region}.amazonaws.com/{userPoolId}
   */
  issuer: string;

  /**
   * Expected audience (Client ID) - required for ID tokens
   */
  audience?: string;

  /**
   * Expected client ID - required for access tokens
   */
  clientId?: string;

  /**
   * Clock tolerance in seconds for exp/iat validation
   */
  clockTolerance?: number;
}

export class TokenValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'TokenValidationError';
  }
}

export class TokenValidator {
  private readonly jwksClient: JwksClient;
  private readonly config: TokenValidatorConfig;

  constructor(config: TokenValidatorConfig, jwksClient?: JwksClient) {
    this.config = config;
    this.jwksClient = jwksClient ?? new JwksClient();
  }

  /**
   * Validate a Cognito ID token
   */
  async validateIdToken(token: string): Promise<ValidatedToken<CognitoIdTokenClaims>> {
    const result = await this.validateToken(token);

    if (result.claims.token_use !== 'id') {
      throw new TokenValidationError(
        `Expected ID token but got ${result.claims.token_use} token`,
        'INVALID_TOKEN_USE'
      );
    }

    // Validate audience for ID tokens
    if (this.config.audience) {
      const claims = result.claims as CognitoIdTokenClaims;
      if (claims.aud !== this.config.audience) {
        throw new TokenValidationError(
          `Token audience mismatch: expected ${this.config.audience}, got ${claims.aud}`,
          'INVALID_AUDIENCE'
        );
      }
    }

    return result as ValidatedToken<CognitoIdTokenClaims>;
  }

  /**
   * Validate a Cognito Access token
   */
  async validateAccessToken(token: string): Promise<ValidatedToken<CognitoAccessTokenClaims>> {
    const result = await this.validateToken(token);

    if (result.claims.token_use !== 'access') {
      throw new TokenValidationError(
        `Expected access token but got ${result.claims.token_use} token`,
        'INVALID_TOKEN_USE'
      );
    }

    // Validate client_id for access tokens
    if (this.config.clientId) {
      const claims = result.claims as CognitoAccessTokenClaims;
      if (claims.client_id !== this.config.clientId) {
        throw new TokenValidationError(
          `Token client_id mismatch: expected ${this.config.clientId}, got ${claims.client_id}`,
          'INVALID_CLIENT_ID'
        );
      }
    }

    return result as ValidatedToken<CognitoAccessTokenClaims>;
  }

  /**
   * Validate any Cognito token (ID or access)
   */
  async validateToken(token: string): Promise<ValidatedToken<CognitoTokenClaims>> {
    try {
      const jwks = await this.jwksClient.getKeySet(this.config.issuer);

      const { payload, protectedHeader } = await jose.jwtVerify(token, jwks, {
        issuer: this.config.issuer,
        clockTolerance: this.config.clockTolerance ?? 60,
      });

      // Validate token_use claim exists
      const tokenUse = payload.token_use as string | undefined;
      if (tokenUse !== 'id' && tokenUse !== 'access') {
        throw new TokenValidationError(
          `Invalid or missing token_use claim: ${tokenUse}`,
          'INVALID_TOKEN_USE'
        );
      }

      return {
        claims: payload as unknown as CognitoTokenClaims,
        header: {
          alg: protectedHeader.alg,
          kid: protectedHeader.kid ?? '',
        },
        raw: token,
      };
    } catch (error) {
      if (error instanceof TokenValidationError) {
        throw error;
      }
      if (error instanceof jose.errors.JWTExpired) {
        throw new TokenValidationError('Token has expired', 'TOKEN_EXPIRED', error);
      }
      if (error instanceof jose.errors.JWTClaimValidationFailed) {
        throw new TokenValidationError(
          `Token claim validation failed: ${error.message}`,
          'CLAIM_VALIDATION_FAILED',
          error
        );
      }
      if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
        throw new TokenValidationError(
          'Token signature verification failed',
          'INVALID_SIGNATURE',
          error
        );
      }
      throw new TokenValidationError(
        `Token validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'VALIDATION_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }
}
