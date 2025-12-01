/**
 * Generates a unique teen code
 * Format: 4-5 uppercase alphanumeric characters (excluding confusing characters)
 * Excludes: 0, O, I, 1 to avoid confusion
 */
export function generateTeenCode(): string {
  // Use characters that are easy to distinguish
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  
  // Generate 4 character code by default
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return code;
}

/**
 * Validates a teen code format
 */
export function isValidTeenCode(code: string): boolean {
  // Must be 4-5 uppercase alphanumeric characters
  // Excluding confusing characters: 0, O, I, 1
  const pattern = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4,5}$/;
  return pattern.test(code);
}