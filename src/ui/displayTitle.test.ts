import assert from 'node:assert/strict';
import test from 'node:test';

import { displayTitle, titleInitials } from './displayTitle.ts';

test('shortens opaque import ids in the middle', () => {
  const id = '4nrpeH2IXYJiRWjR1yJg+AwGPijgQBYw';
  assert.equal(displayTitle(id), '4nrpeH2IXYJiRWjR…+AwGPijgQBYw');
});

test('keeps short human titles intact', () => {
  assert.equal(displayTitle('Hasbi Allah'), 'Hasbi Allah');
});

test('derives initials from words or ids', () => {
  assert.equal(titleInitials('Hasbi Allah'), 'HA');
  assert.equal(titleInitials('4nrpeH2IXYJiRWjR1yJg'), '4N');
});
