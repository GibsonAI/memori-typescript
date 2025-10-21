import { v4 as uuidv4 } from 'uuid';

/**
 * Centralized ID generation utility for consistent UUID usage across the application
 */
export class IdGenerator {
  /**
   * Generate a standard UUID v4
   */
  static generateId(): string {
    return uuidv4();
  }

  /**
   * Generate a chat record ID with timestamp prefix for better organization
   */
  static generateChatId(): string {
    return uuidv4();
  }

  /**
   * Generate a session ID
   */
  static generateSessionId(): string {
    return uuidv4();
  }

  /**
   * Generate a memory ID
   */
  static generateMemoryId(): string {
    return uuidv4();
  }

  /**
   * Generate a prefixed ID for better debugging and organization
   */
  static generatePrefixedId(prefix: string): string {
    return `${prefix}_${Date.now()}_${uuidv4()}`;
  }

  /**
   * Validate if a string is a valid UUID format
   */
  static isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }
}