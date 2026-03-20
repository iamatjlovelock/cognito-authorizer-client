import * as jose from 'jose';

/**
 * JWKS Client for fetching and caching Cognito public keys
 */
export class JwksClient {
  private jwksCache: Map<string, jose.JWTVerifyGetKey> = new Map();
  private readonly cacheTtlMs: number;

  constructor(options: { cacheTtlMs?: number } = {}) {
    this.cacheTtlMs = options.cacheTtlMs ?? 3600000; // 1 hour default
  }

  /**
   * Build the JWKS URL for a Cognito User Pool
   */
  static buildJwksUrl(region: string, userPoolId: string): string {
    return `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
  }

  /**
   * Build the issuer URL for a Cognito User Pool
   */
  static buildIssuerUrl(region: string, userPoolId: string): string {
    return `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  }

  /**
   * Extract region and user pool ID from an issuer URL
   */
  static parseIssuer(issuer: string): { region: string; userPoolId: string } | null {
    const match = issuer.match(/^https:\/\/cognito-idp\.([a-z0-9-]+)\.amazonaws\.com\/([a-zA-Z0-9_-]+)$/);
    if (!match) {
      return null;
    }
    return {
      region: match[1],
      userPoolId: match[2],
    };
  }

  /**
   * Get a JWKS key set for a given issuer URL
   * Caches the key set to avoid repeated network requests
   */
  async getKeySet(issuer: string): Promise<jose.JWTVerifyGetKey> {
    const cached = this.jwksCache.get(issuer);
    if (cached) {
      return cached;
    }

    const parsed = JwksClient.parseIssuer(issuer);
    if (!parsed) {
      throw new Error(`Invalid Cognito issuer URL: ${issuer}`);
    }

    const jwksUrl = JwksClient.buildJwksUrl(parsed.region, parsed.userPoolId);
    const jwks = jose.createRemoteJWKSet(new URL(jwksUrl), {
      cacheMaxAge: this.cacheTtlMs,
    });

    this.jwksCache.set(issuer, jwks);
    return jwks;
  }

  /**
   * Clear the JWKS cache
   */
  clearCache(): void {
    this.jwksCache.clear();
  }

  /**
   * Remove a specific issuer from the cache
   */
  invalidate(issuer: string): void {
    this.jwksCache.delete(issuer);
  }
}
