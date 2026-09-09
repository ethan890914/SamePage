import { patternDictionary } from '../lib/words/en/pattern-dictionary.js';
import {
  matchesPattern,
  normalizePatternRaceGuess,
  patternRaceWords,
  type PatternRacePattern,
  type PatternRaceGuessError,
} from '../lib/pattern-race';

// Keep the full answer dictionary out of browser bundles.
const words = new Set([...patternDictionary.split('\n'), ...patternRaceWords]);

export function validatePatternRaceGuess(
  word: string,
  pattern: PatternRacePattern,
): PatternRaceGuessError | null {
  const normalized = normalizePatternRaceGuess(word);
  if (!/^[a-z]+$/.test(normalized) || !matchesPattern(normalized, pattern))
    return 'pattern_mismatch';
  return words.has(normalized) ? null : 'not_in_dictionary';
}
