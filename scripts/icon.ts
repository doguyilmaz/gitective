import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const SIZE = 128;
const SS = 4;

type Vec = [number, number];
type Rgba = [number, number, number, number];

const BG: Rgba = [24, 22, 36, 255];
const GLASS: Rgba = [230, 225, 244, 255];
const ACCENT: Rgba = [246, 193, 119, 255];

const LENS: Vec = [55, 55];
const LENS_RADIUS = 30;

function sub(a: Vec, b: Vec): Vec {
  return [a[0] - b[0], a[1] - b[1]];
}

function len(a: Vec): number {
  return Math.hypot(a[0], a[1]);
}

function sdRoundRect(p: Vec, center: Vec, half: Vec, radius: number): number {
  const d: Vec = [
    Math.abs(p[0] - center[0]) - half[0] + radius,
    Math.abs(p[1] - center[1]) - half[1] + radius,
  ];
  const outside = len([Math.max(d[0], 0), Math.max(d[1], 0)]);
  return outside + Math.min(Math.max(d[0], d[1]), 0) - radius;
}

function sdSegment(p: Vec, a: Vec, b: Vec): number {
  const pa = sub(p, a);
  const ba = sub(b, a);
  const h = Math.min(Math.max((pa[0] * ba[0] + pa[1] * ba[1]) / (ba[0] * ba[0] + ba[1] * ba[1]), 0), 1);
  return len([pa[0] - ba[0] * h, pa[1] - ba[1] * h]);
}

function colorAt(p: Vec): Rgba {
  let color: Rgba = [0, 0, 0, 0];

  if (sdRoundRect(p, [64, 64], [60, 60], 28) < 0) color = BG;

  const inLens = len(sub(p, LENS)) < LENS_RADIUS - 4;
  if (inLens) {
    if (sdSegment(p, [55, 38], [55, 72]) - 3 < 0) color = ACCENT;
    if (len(sub(p, LENS)) - 7.5 < 0) color = ACCENT;
    if (len(sub(p, [55, 55])) - 3.5 < 0) color = BG;
  }

  const ring = Math.abs(len(sub(p, LENS)) - LENS_RADIUS) - 3.5;
  const toHandle = 1 / Math.SQRT2;
  const handleStart: Vec = [LENS[0] + LENS_RADIUS * toHandle, LENS[1] + LENS_RADIUS * toHandle];
  const handle = sdSegment(p, handleStart, [102, 102]) - 6;
  if (Math.min(ring, handle) < 0) color = GLASS;

  return color;
}

function render(): Uint8Array {
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const sample = colorAt([x + (sx + 0.5) / SS, y + (sy + 0.5) / SS]);
          const alpha = sample[3] / 255;
          r += sample[0] * alpha;
          g += sample[1] * alpha;
          b += sample[2] * alpha;
          a += alpha;
        }
      }
      const count = SS * SS;
      const offset = (y * SIZE + x) * 4;
      if (a > 0) {
        pixels[offset] = Math.round(r / a);
        pixels[offset + 1] = Math.round(g / a);
        pixels[offset + 2] = Math.round(b / a);
      }
      pixels[offset + 3] = Math.round((a / count) * 255);
    }
  }
  return pixels;
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function encodePng(pixels: Uint8Array): Uint8Array {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, SIZE);
  view.setUint32(4, SIZE);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const raw = new Uint8Array(SIZE * (SIZE * 4 + 1));
  for (let y = 0; y < SIZE; y++) {
    raw.set(pixels.subarray(y * SIZE * 4, (y + 1) * SIZE * 4), y * (SIZE * 4 + 1) + 1);
  }

  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", new Uint8Array(deflateSync(raw))),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

mkdirSync("media", { recursive: true });
writeFileSync("media/icon.png", encodePng(render()));
