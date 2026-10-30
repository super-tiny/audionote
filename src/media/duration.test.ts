import assert from 'node:assert/strict';
import test from 'node:test';

import { readDurationMs } from './duration.ts';

function writeU32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

test('reads an M4A mvhd version 0 duration', () => {
  const bytes = new Uint8Array(64);
  bytes.set([0x6d, 0x76, 0x68, 0x64], 8);
  writeU32(bytes, 8 + 16, 44100);
  writeU32(bytes, 8 + 20, 44100 * 90);
  assert.equal(readDurationMs(bytes), 90_000);
});

test('reads an M4A mvhd version 1 duration', () => {
  const bytes = new Uint8Array(80);
  bytes.set([0x6d, 0x76, 0x68, 0x64], 0);
  bytes[4] = 1;
  writeU32(bytes, 24, 48000);
  writeU32(bytes, 32, 48000 * 12);
  assert.equal(readDurationMs(bytes), 12_000);
});

test('estimates CBR MP3 duration from bitrate and file size', () => {
  const bytes = new Uint8Array(8);
  bytes.set([0xff, 0xfb, 0x90, 0x00]);
  const frameBytes = Math.floor((144 * 128000) / 44100);
  const fileSize = frameBytes * 100;
  assert.equal(readDurationMs(bytes, fileSize), Math.round((100 * 1152 * 1000) / 44100));
});

test('reads an MP3 Xing frame count', () => {
  const bytes = new Uint8Array(64);
  bytes.set([0xff, 0xfb, 0x90, 0x00]);
  bytes.set([0x58, 0x69, 0x6e, 0x67], 36);
  writeU32(bytes, 40, 1);
  writeU32(bytes, 44, 383);
  assert.equal(readDurationMs(bytes, 999999), Math.round((383 * 1152 * 1000) / 44100));
});

test('returns null when the buffer has no duration metadata', () => {
  assert.equal(readDurationMs(new Uint8Array([1, 2, 3, 4])), null);
});
