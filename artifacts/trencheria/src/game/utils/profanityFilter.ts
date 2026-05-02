/**
 * Profanity filter + display name validation for Trencheria.
 * Blocks slurs, offensive terms, reserved names, and enforces formatting rules.
 */

const BLOCKED_WORDS: string[] = [
  // Slurs & hate speech
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'retarded', 'tranny', 'kike', 'spic', 'chink', 'wetback', 'beaner',
  // Sexual
  'fuck', 'shit', 'ass', 'bitch', 'whore', 'slut', 'cunt', 'dick', 'cock', 'pussy', 'porn', 'hentai',
  // Harassment
  'kill yourself', 'kys', 'rape', 'nazi', 'hitler',
  // Scam/phishing
  'free nitro', 'free robux',
];

// Reserved names that cannot be used as display names
const RESERVED_NAMES: string[] = [
  'system', 'admin', 'administrator', 'moderator', 'mod',
  'support', 'developer', 'dev', 'official', 'staff',
  'trencheria', 'trencheri',
  'server', 'bot', 'ai', 'gm', 'gamemaster',
  'owner', 'founder', 'ceo',
];

// Build regex patterns - match whole words, case insensitive
function buildPattern(word: string): RegExp {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (word.includes(' ')) {
    return new RegExp(escaped, 'gi');
  }
  return new RegExp(`\\b${escaped}\\b`, 'gi');
}

// Leet-speak variants for worst offenders
function buildLeetPattern(word: string): RegExp {
  const leetMap: Record<string, string> = {
    'a': '[a@4]', 'e': '[e3]', 'i': '[i1!]', 'o': '[o0]',
    's': '[s$5]', 'l': '[l1]', 't': '[t7]',
  };
  const escaped = word
    .split('')
    .map(c => leetMap[c.toLowerCase()] || c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('');
  return new RegExp(`\\b${escaped}\\b`, 'gi');
}

const PATTERNS = BLOCKED_WORDS.map(buildPattern);
const LEET_WORDS = ['fuck', 'shit', 'nigger', 'nigga', 'faggot', 'retard', 'cunt'];
const LEET_PATTERNS = LEET_WORDS.map(buildLeetPattern);

/**
 * Returns true if text contains profanity.
 */
export function containsProfanity(text: string): boolean {
  const normalized = text.toLowerCase();
  const decameled = text.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  
  const check = (t: string) => 
    PATTERNS.some(p => { p.lastIndex = 0; return p.test(t); }) ||
    LEET_PATTERNS.some(p => { p.lastIndex = 0; return p.test(t); });
  
  return check(normalized) || check(decameled);
}

/**
 * Censors profane words with asterisks.
 */
export function censorText(text: string): string {
  let result = text;
  for (const pattern of [...PATTERNS, ...LEET_PATTERNS]) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, (match) => '*'.repeat(match.length));
  }
  return result;
}

/**
 * Check if a name is reserved (case-insensitive).
 */
export function isReservedName(name: string): boolean {
  const lower = name.toLowerCase().trim();
  return RESERVED_NAMES.includes(lower);
}

// Display name constraints
export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 20;
// Allowed: letters, numbers, spaces, hyphens, underscores, periods
const NAME_ALLOWED_REGEX = /^[\w\s\-_.]+$/;

export interface NameValidationResult {
  valid: boolean;
  cleaned: string;
  error: string | null;
}

/**
 * Validates a display name with detailed feedback.
 * Returns { valid, cleaned, error }.
 */
export function validateDisplayName(raw: string): NameValidationResult {
  // Strip HTML tags
  let cleaned = raw.replace(/<[^>]*>/g, '');
  // Remove non-allowed characters
  cleaned = cleaned.replace(/[^\w\s\-_.]/g, '');
  // Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  // Enforce max length
  cleaned = cleaned.slice(0, NAME_MAX_LENGTH);

  if (!cleaned || cleaned.length < NAME_MIN_LENGTH) {
    return { valid: false, cleaned, error: `Name must be at least ${NAME_MIN_LENGTH} characters` };
  }

  if (!NAME_ALLOWED_REGEX.test(cleaned)) {
    return { valid: false, cleaned, error: 'Name can only contain letters, numbers, spaces, hyphens, underscores, and periods' };
  }

  if (isReservedName(cleaned)) {
    return { valid: false, cleaned, error: 'This name is reserved and cannot be used' };
  }

  if (containsProfanity(cleaned)) {
    return { valid: false, cleaned, error: 'This name contains inappropriate content' };
  }

  return { valid: true, cleaned, error: null };
}

/**
 * Validates and sanitizes a display name. Returns cleaned name or fallback.
 * Use validateDisplayName() for detailed error feedback.
 */
export function sanitizeDisplayName(raw: string): string {
  const result = validateDisplayName(raw);
  return result.valid ? result.cleaned : 'Knight';
}
