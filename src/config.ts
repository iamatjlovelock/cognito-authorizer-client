import { z } from 'zod';

/**
 * Configuration schema for file-based Cedar policies
 */
const CedarFileConfigSchema = z.object({
  /**
   * Namespace for Cedar types
   */
  namespace: z.string(),

  /**
   * Policy source: 'file' for local files
   */
  source: z.literal('file').default('file'),

  /**
   * Path to Cedar policies file, or inline policies
   */
  policies: z.string(),

  /**
   * Path to Cedar schema file, or inline schema (optional)
   */
  schema: z.string().optional(),

  /**
   * Whether policies/schema are file paths or inline content
   */
  policiesAreInline: z.boolean().default(false),
});

/**
 * Configuration schema for AVP-based Cedar policies
 */
const CedarAVPConfigSchema = z.object({
  /**
   * Namespace for Cedar types
   */
  namespace: z.string(),

  /**
   * Policy source: 'avp' for Amazon Verified Permissions
   */
  source: z.literal('avp'),

  /**
   * AVP Policy Store ID
   */
  policyStoreId: z.string(),

  /**
   * Whether to load schema from AVP (default: true)
   */
  loadSchemaFromAVP: z.boolean().default(true),

  /**
   * Optional local schema override (path or inline)
   */
  schemaOverride: z.string().optional(),

  /**
   * Whether schemaOverride is inline content
   */
  schemaOverrideIsInline: z.boolean().default(false),

  /**
   * Policy refresh interval in seconds (0 = no refresh)
   */
  refreshIntervalSeconds: z.number().default(0),
});

/**
 * Combined Cedar configuration (file or AVP)
 */
const CedarConfigSchema = z.union([CedarFileConfigSchema, CedarAVPConfigSchema]);

/**
 * Configuration schema for the authorization client
 */
export const ConfigSchema = z.object({
  /**
   * Cognito User Pool configuration
   */
  cognito: z.object({
    /**
     * AWS Region where the User Pool is located
     */
    region: z.string(),

    /**
     * Cognito User Pool ID
     */
    userPoolId: z.string(),

    /**
     * Cognito App Client ID (optional, for audience validation)
     */
    clientId: z.string().optional(),
  }),

  /**
   * Cedar configuration
   */
  cedar: CedarConfigSchema,

  /**
   * Server configuration
   */
  server: z.object({
    /**
     * Port to listen on
     */
    port: z.number().default(3000),

    /**
     * Host to bind to
     */
    host: z.string().default('localhost'),
  }).optional(),

  /**
   * Entity builder configuration
   */
  entities: z.object({
    /**
     * Type name for user entities
     */
    userTypeName: z.string().default('User'),

    /**
     * Type name for group entities
     */
    groupTypeName: z.string().default('CognitoGroup'),

    /**
     * Whether to include custom attributes from tokens
     */
    includeCustomAttributes: z.boolean().default(true),

    /**
     * Whether to include profile claims from ID tokens
     */
    includeProfileClaims: z.boolean().default(true),

    /**
     * Custom attribute mapping
     */
    attributeMapping: z.record(z.string()).optional(),
  }).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
export type CedarFileConfig = z.infer<typeof CedarFileConfigSchema>;
export type CedarAVPConfig = z.infer<typeof CedarAVPConfigSchema>;

/**
 * Check if cedar config is AVP-based
 */
export function isAVPConfig(cedar: Config['cedar']): cedar is CedarAVPConfig {
  return cedar.source === 'avp';
}

/**
 * Check if cedar config is file-based
 */
export function isFileConfig(cedar: Config['cedar']): cedar is CedarFileConfig {
  return cedar.source === 'file' || cedar.source === undefined;
}

/**
 * Load configuration from environment variables
 */
export function loadConfigFromEnv(): Partial<Config> {
  const source = process.env.CEDAR_SOURCE as 'file' | 'avp' | undefined;

  const cedarConfig = source === 'avp' ? {
    namespace: process.env.CEDAR_NAMESPACE ?? 'App',
    source: 'avp' as const,
    policyStoreId: process.env.AVP_POLICY_STORE_ID ?? '',
    loadSchemaFromAVP: process.env.AVP_LOAD_SCHEMA !== 'false',
    schemaOverrideIsInline: false,
    refreshIntervalSeconds: parseInt(process.env.AVP_REFRESH_INTERVAL ?? '0', 10),
  } : {
    namespace: process.env.CEDAR_NAMESPACE ?? 'App',
    source: 'file' as const,
    policies: process.env.CEDAR_POLICIES_PATH ?? './policies.cedar',
    schema: process.env.CEDAR_SCHEMA_PATH,
    policiesAreInline: false,
  };

  return {
    cognito: {
      region: process.env.COGNITO_REGION ?? process.env.AWS_REGION ?? '',
      userPoolId: process.env.COGNITO_USER_POOL_ID ?? '',
      clientId: process.env.COGNITO_CLIENT_ID,
    },
    cedar: cedarConfig,
    server: {
      port: parseInt(process.env.PORT ?? '3000', 10),
      host: process.env.HOST ?? 'localhost',
    },
  };
}

/**
 * Validate and parse configuration
 */
export function validateConfig(config: unknown): Config {
  return ConfigSchema.parse(config);
}
