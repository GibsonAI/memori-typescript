import { v4 as uuidv4 } from 'uuid';

/**
 * Centralized ID generation utility for consistent UUID usage across the application
 *
 * This class provides a single source of truth for all ID generation needs,
 * ensuring consistency and making it easy to modify ID formats or add new types.
 */
export class IdGenerator {
  /**
   * Generate a standard UUID v4
   */
  static generateId(): string {
    return uuidv4();
  }

  /**
   * Generate a session ID for Memori/MemoriAI instances
   */
  static generateSessionId(): string {
    return uuidv4();
  }

  /**
   * Generate a chat/conversation ID
   */
  static generateChatId(): string {
    return uuidv4();
  }

  /**
   * Generate a memory record ID
   */
  static generateMemoryId(): string {
    return uuidv4();
  }

  /**
   * Generate a request ID for API operations
   */
  static generateRequestId(): string {
    return uuidv4();
  }

  /**
   * Generate a conversation ID for tracking conversations
   */
  static generateConversationId(): string {
    return uuidv4();
  }

  /**
   * Generate a prefixed ID for better debugging and organization
   * Format: prefix_timestamp_uuid
   */
  static generatePrefixedId(prefix: string): string {
    return `${prefix}_${Date.now()}_${uuidv4()}`;
  }

  /**
   * Generate a record ID with specific type prefix
   * @param type - The type of record ('chat' | 'embedding')
   */
  static generateRecordId(type: 'chat' | 'embedding'): string {
    const prefix = type === 'chat' ? 'record' : 'embedding_record';
    return this.generatePrefixedId(prefix);
  }

  /**
   * Generate multiple IDs at once for batch operations
   * @param count - Number of IDs to generate
   */
  static generateBatchIds(count: number): string[] {
    return Array.from({ length: count }, () => this.generateId());
  }

  /**
   * Generate a timestamp-prefixed ID for debugging
   * Format: timestamp_uuid
   */
  static generateTimestampedId(prefix?: string): string {
    const timestamp = Date.now();
    const uuid = uuidv4();
    return prefix ? `${prefix}_${timestamp}_${uuid}` : `${timestamp}_${uuid}`;
  }

  /**
   * Validate if a string is a valid UUID format
   */
  static isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Extract timestamp from a prefixed ID if present
   * Useful for debugging and sorting by creation time
   */
  static extractTimestampFromId(id: string): number | null {
    const parts = id.split('_');
    if (parts.length >= 2) {
      const timestampStr = parts[parts.length - 2]; // Second to last part should be timestamp
      const timestamp = parseInt(timestampStr, 10);
      return isNaN(timestamp) ? null : timestamp;
    }
    return null;
  }
}