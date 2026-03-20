import {
  VerifiedPermissionsClient,
  GetSchemaCommand,
  ListPoliciesCommand,
  GetPolicyCommand,
  GetPolicyStoreCommand,
} from '@aws-sdk/client-verifiedpermissions';
import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Configuration for the AVP policy store
 */
export interface PolicyStoreConfig {
  /**
   * AWS region
   */
  region: string;

  /**
   * Policy store ID
   */
  policyStoreId: string;

  /**
   * Optional AWS credentials (if not using default credential chain)
   */
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
}

/**
 * Loaded policy data
 */
export interface PolicyStoreData {
  /**
   * Combined Cedar policies as a single string
   */
  policies: string;

  /**
   * Cedar schema as JSON string
   */
  schema?: string;

  /**
   * Individual policy metadata
   */
  policyMetadata: Array<{
    policyId: string;
    policyType: string;
    createdDate?: Date;
    lastUpdatedDate?: Date;
  }>;
}

/**
 * Load AWS credentials from ~/.aws/credentials file
 */
function loadCredentialsFromFile(): { accessKeyId: string; secretAccessKey: string; sessionToken?: string } | null {
  const credentialsPath = join(homedir(), '.aws', 'credentials');

  try {
    const content = readFileSync(credentialsPath, 'utf-8');
    const credentials: { accessKeyId?: string; secretAccessKey?: string; sessionToken?: string } = {};

    for (const line of content.split('\n')) {
      const trimmed = line.trim().replace(/\r/g, '');
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;

      const key = trimmed.substring(0, eqIndex).trim().toLowerCase();
      const value = trimmed.substring(eqIndex + 1).trim();

      if (key === 'aws_access_key_id') {
        credentials.accessKeyId = value;
      } else if (key === 'aws_secret_access_key') {
        credentials.secretAccessKey = value;
      } else if (key === 'aws_session_token') {
        credentials.sessionToken = value;
      }
    }

    if (credentials.accessKeyId && credentials.secretAccessKey) {
      return credentials as { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
    }
  } catch {
    // Ignore file read errors
  }

  return null;
}

/**
 * Client for loading policies from Amazon Verified Permissions
 */
export class AVPPolicyStore {
  private client: VerifiedPermissionsClient;
  private policyStoreId: string;
  private lastKnownUpdatedDate?: Date;

  constructor(config: PolicyStoreConfig) {
    this.policyStoreId = config.policyStoreId;

    // Try to get credentials from config, file, or environment
    let credentials = config.credentials;
    if (!credentials) {
      credentials = loadCredentialsFromFile() ?? undefined;
    }

    this.client = new VerifiedPermissionsClient({
      region: config.region,
      credentials: credentials ? {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      } : undefined,
    });
  }

  /**
   * Load all policies and schema from the policy store
   */
  async loadPolicies(): Promise<PolicyStoreData> {
    console.log(`Loading policies from AVP policy store: ${this.policyStoreId}`);

    // Fetch schema
    let schema: string | undefined;
    try {
      const schemaResponse = await this.client.send(new GetSchemaCommand({
        policyStoreId: this.policyStoreId,
      }));
      if (schemaResponse.schema) {
        schema = schemaResponse.schema;
        console.log('  - Schema loaded');
      }
    } catch (error) {
      console.warn('  - No schema found or error loading schema:', error instanceof Error ? error.message : error);
    }

    // List all policies
    const listResponse = await this.client.send(new ListPoliciesCommand({
      policyStoreId: this.policyStoreId,
    }));

    const policyList = listResponse.policies || [];
    console.log(`  - Found ${policyList.length} policies`);

    // Fetch each policy's statement
    const policyStatements: string[] = [];
    const policyMetadata: PolicyStoreData['policyMetadata'] = [];

    for (const policy of policyList) {
      if (!policy.policyId) continue;

      try {
        const policyResponse = await this.client.send(new GetPolicyCommand({
          policyStoreId: this.policyStoreId,
          policyId: policy.policyId,
        }));

        // Get the policy statement based on type
        let statement: string | undefined;
        if (policyResponse.definition?.static?.statement) {
          statement = policyResponse.definition.static.statement;
        } else if (policyResponse.definition?.templateLinked) {
          // For template-linked policies, we'd need to resolve the template
          // For now, skip these as they require template resolution
          console.log(`    - Skipping template-linked policy: ${policy.policyId}`);
          continue;
        }

        if (statement) {
          policyStatements.push(statement);
          policyMetadata.push({
            policyId: policy.policyId,
            policyType: policy.policyType || 'STATIC',
            createdDate: policy.createdDate,
            lastUpdatedDate: policy.lastUpdatedDate,
          });
        }
      } catch (error) {
        console.warn(`    - Error loading policy ${policy.policyId}:`, error instanceof Error ? error.message : error);
      }
    }

    console.log(`  - Loaded ${policyStatements.length} policy statements`);

    // Combine all policies into a single string
    const policies = policyStatements.join('\n\n');

    // Debug: log all loaded policies
    console.log('\n=== Loaded Policies from AVP ===');
    console.log(policies);
    console.log('=== End Policies ===\n');

    return {
      policies,
      schema,
      policyMetadata,
    };
  }

  /**
   * Get the policy store ID
   */
  getPolicyStoreId(): string {
    return this.policyStoreId;
  }

  /**
   * Get the policy store's last updated date from AVP
   */
  async getPolicyStoreLastUpdatedDate(): Promise<Date | undefined> {
    try {
      const response = await this.client.send(new GetPolicyStoreCommand({
        policyStoreId: this.policyStoreId,
      }));
      return response.lastUpdatedDate;
    } catch (error) {
      console.warn('Error fetching policy store metadata:', error instanceof Error ? error.message : error);
      return undefined;
    }
  }

  /**
   * Check if the policy store has been updated since last load
   * Returns true if policies should be reloaded
   */
  async hasUpdates(): Promise<boolean> {
    const currentUpdatedDate = await this.getPolicyStoreLastUpdatedDate();

    if (!currentUpdatedDate) {
      return false; // Can't determine, don't reload
    }

    if (!this.lastKnownUpdatedDate) {
      return false; // First check after load, don't reload yet
    }

    const hasChanged = currentUpdatedDate.getTime() > this.lastKnownUpdatedDate.getTime();
    if (hasChanged) {
      console.log(`Policy store updated: ${this.lastKnownUpdatedDate.toISOString()} -> ${currentUpdatedDate.toISOString()}`);
    }
    return hasChanged;
  }

  /**
   * Update the last known updated date (call after loading policies)
   */
  async updateLastKnownDate(): Promise<void> {
    this.lastKnownUpdatedDate = await this.getPolicyStoreLastUpdatedDate();
    if (this.lastKnownUpdatedDate) {
      console.log(`Policy store lastUpdatedDate: ${this.lastKnownUpdatedDate.toISOString()}`);
    }
  }

  /**
   * Get the last known updated date
   */
  getLastKnownUpdatedDate(): Date | undefined {
    return this.lastKnownUpdatedDate;
  }
}

/**
 * Create an AVP policy store client
 */
export function createPolicyStore(config: PolicyStoreConfig): AVPPolicyStore {
  return new AVPPolicyStore(config);
}
