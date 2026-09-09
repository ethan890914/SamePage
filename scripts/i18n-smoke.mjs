import assert from 'node:assert/strict';
import { convergeWordsMatch, isConvergeCommand, normalizeConvergeWord } from '../lib/converge.ts';
import { commonTraditionalChineseWords } from '../lib/i18n/zh-TW.ts';

assert.equal(isConvergeCommand({ kind: 'submit', round: 1, word: '心有靈犀' }), true);
assert.equal(convergeWordsMatch('海洋', '海洋'), true);
assert.equal(convergeWordsMatch('海洋', '山峰'), false);
assert.equal(convergeWordsMatch('貓', '猫'), false, 'Different spellings are not semantic matches');
assert.equal(convergeWordsMatch('running', 'run'), true);
assert.equal(normalizeConvergeWord(' ＣＡＴ '), 'cat');
assert.equal(convergeWordsMatch('天空', 'SKY'), false, 'Matching does not translate answers');
for (const word of commonTraditionalChineseWords) {
  assert.equal(isConvergeCommand({ kind: 'submit', round: 1, word }), true);
  assert.equal(convergeWordsMatch(word, word), true);
}
console.log('Traditional Chinese Converge input, matching, suggestions, and English compatibility passed.');
