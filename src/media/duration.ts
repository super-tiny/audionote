const MAX_DURATION_MS = 48 * 60 * 60 * 1000;
const MPEG1_L3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG1_SAMPLE_RATES = [44100, 48000, 32000];

function u32(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.length) {
    return null;
  }
  return (
    bytes[offset]! * 16777216 +
    bytes[offset + 1]! * 65536 +
    bytes[offset + 2]! * 256 +
    bytes[offset + 3]!
  );
}

function u64(bytes: Uint8Array, offset: number): number | null {
  const high = u32(bytes, offset);
  const low = u32(bytes, offset + 4);
  if (high === null || low === null) {
    return null;
  }
  return high * 4294967296 + low;
}

function accept(durationMs: number): number | null {
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_DURATION_MS) {
    return null;
  }
  return Math.round(durationMs);
}

function readMvhd(bytes: Uint8Array): number | null {
  const token = [0x6d, 0x76, 0x68, 0x64];
  for (let index = 0; index <= bytes.length - 32; index += 1) {
    if (
      bytes[index] !== token[0] ||
      bytes[index + 1] !== token[1] ||
      bytes[index + 2] !== token[2] ||
      bytes[index + 3] !== token[3]
    ) {
      continue;
    }
    const version = bytes[index + 4];
    if (version === 0) {
      const timescale = u32(bytes, index + 16);
      const duration = u32(bytes, index + 20);
      if (timescale && duration) {
        const parsed = accept((duration / timescale) * 1000);
        if (parsed) {
          return parsed;
        }
      }
    } else if (version === 1) {
      const timescale = u32(bytes, index + 24);
      const duration = u64(bytes, index + 28);
      if (timescale && duration) {
        const parsed = accept((duration / timescale) * 1000);
        if (parsed) {
          return parsed;
        }
      }
    }
  }
  return null;
}

function skipId3(bytes: Uint8Array): number {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) {
    return 0;
  }
  const size =
    ((bytes[6]! & 0x7f) << 21) |
    ((bytes[7]! & 0x7f) << 14) |
    ((bytes[8]! & 0x7f) << 7) |
    (bytes[9]! & 0x7f);
  return Math.min(bytes.length, 10 + size);
}

function readMp3(bytes: Uint8Array, fileSize: number | null): number | null {
  const start = skipId3(bytes);
  const limit = Math.min(bytes.length - 4, start + 1024 * 1024);
  for (let index = start; index < limit; index += 1) {
    if (bytes[index] !== 0xff || (bytes[index + 1]! & 0xe0) !== 0xe0) {
      continue;
    }
    const header = u32(bytes, index);
    if (header === null) {
      continue;
    }
    const version = (header >> 19) & 0x3;
    const layer = (header >> 17) & 0x3;
    const bitrateIndex = (header >> 12) & 0xf;
    const sampleIndex = (header >> 10) & 0x3;
    if (version !== 3 || layer !== 1 || sampleIndex === 3) {
      continue;
    }
    const bitrateKbps = MPEG1_L3_BITRATES[bitrateIndex] ?? 0;
    const sampleRate = MPEG1_SAMPLE_RATES[sampleIndex] ?? 0;
    if (!bitrateKbps || !sampleRate) {
      continue;
    }

    const sideInfo = 32;
    const marker = index + 4 + sideInfo;
    const tag =
      marker + 3 < bytes.length
        ? String.fromCharCode(bytes[marker]!, bytes[marker + 1]!, bytes[marker + 2]!, bytes[marker + 3]!)
        : '';
    if (tag === 'Xing' || tag === 'Info') {
      const flags = u32(bytes, marker + 4);
      const frames = flags !== null && (flags & 0x1) === 1 ? u32(bytes, marker + 8) : null;
      if (frames) {
        return accept((frames * 1152 * 1000) / sampleRate);
      }
    }

    if (fileSize && fileSize > index) {
      const bitrate = bitrateKbps * 1000;
      return accept(((fileSize - index) * 8 * 1000) / bitrate);
    }
    return null;
  }
  return null;
}

/**
 * Reads a duration hint from the start or end of an audio file.
 * M4A uses the mvhd atom. MP3 prefers a Xing frame count and otherwise estimates CBR from the file size.
 * VBR MP3 without a Xing header can be inaccurate, which is why M4A/AAC is preferred for long lessons.
 */
export function readDurationMs(bytes: Uint8Array, fileSize: number | null = null): number | null {
  return readMvhd(bytes) ?? readMp3(bytes, fileSize);
}
