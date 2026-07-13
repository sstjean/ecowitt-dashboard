// Minimal PNG reader for the PWA icon structural tests. Test-only helper (not
// under src/, so outside the coverage gate). Supports the non-interlaced 8-bit
// RGB (color type 2) and RGBA (color type 6) images that make-icons.py emits.
import { inflateSync } from "node:zlib";

export interface DecodedPng {
  width: number;
  height: number;
  colorType: number;
  hasAlpha: boolean;
  /** Returns [r, g, b, a]; a is 255 for images with no alpha channel. */
  pixel(x: number, y: number): [number, number, number, number];
}

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePng(buf: Buffer): DecodedPng {
  // Arrange: validate signature and walk the chunk stream.
  if (!buf.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error("not a PNG");
  }
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  let pos = 8;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      interlace = data.readUInt8(12);
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len; // length + type + data + CRC
  }

  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(
      `unsupported PNG (bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace})`,
    );
  }

  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);

  // Reverse the per-scanline PNG filters.
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const inRow = y * (stride + 1) + 1;
    const outRow = y * stride;
    for (let i = 0; i < stride; i++) {
      const value = raw[inRow + i] ?? 0;
      const a = i >= channels ? (out[outRow + i - channels] ?? 0) : 0;
      const b = y > 0 ? (out[outRow - stride + i] ?? 0) : 0;
      const c = y > 0 && i >= channels ? (out[outRow - stride + i - channels] ?? 0) : 0;
      let recon: number;
      switch (filter) {
        case 0:
          recon = value;
          break;
        case 1:
          recon = value + a;
          break;
        case 2:
          recon = value + b;
          break;
        case 3:
          recon = value + Math.floor((a + b) / 2);
          break;
        case 4:
          recon = value + paeth(a, b, c);
          break;
        default:
          throw new Error(`bad filter ${filter}`);
      }
      out[outRow + i] = recon & 0xff;
    }
  }

  const hasAlpha = channels === 4;
  return {
    width,
    height,
    colorType,
    hasAlpha,
    pixel(x, y) {
      const off = y * stride + x * channels;
      return [
        out[off] ?? 0,
        out[off + 1] ?? 0,
        out[off + 2] ?? 0,
        hasAlpha ? (out[off + 3] ?? 0) : 255,
      ];
    },
  };
}
