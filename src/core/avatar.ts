import { encodePng } from "./png";

const SIZE = 64;
const SS = 2;
const RADIUS = 31;
const GLYPH_SCALE = 4;
const GLYPH_GAP = 4;

const PALETTE: Array<[number, number, number]> = [
  [224, 108, 117],
  [209, 154, 102],
  [229, 192, 123],
  [152, 195, 121],
  [86, 182, 194],
  [97, 175, 239],
  [198, 120, 221],
  [190, 132, 100],
];

// 5x7 bitmap font, one 5-bit row per byte, MSB = leftmost pixel
const FONT: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1c, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1c],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  "?": [0x0e, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
};

export function initialsFor(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase())
    .filter((char) => char in FONT)
    .slice(0, 2)
    .join("");
  return letters || "?";
}

function hashString(text: string): number {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  return hash;
}

function glyphMask(initials: string): boolean[][] {
  const width = initials.length * 5 * GLYPH_SCALE + (initials.length - 1) * GLYPH_GAP;
  const height = 7 * GLYPH_SCALE;
  const mask: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false));
  let offsetX = 0;
  for (const char of initials) {
    const rows = FONT[char] as number[];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (!((rows[row] as number) & (1 << (4 - col)))) continue;
        for (let dy = 0; dy < GLYPH_SCALE; dy++) {
          for (let dx = 0; dx < GLYPH_SCALE; dx++) {
            (mask[row * GLYPH_SCALE + dy] as boolean[])[offsetX + col * GLYPH_SCALE + dx] = true;
          }
        }
      }
    }
    offsetX += 5 * GLYPH_SCALE + GLYPH_GAP;
  }
  return mask;
}

export function avatarDataUri(name: string, email: string): string {
  const [red, green, blue] = PALETTE[hashString(email || name) % PALETTE.length] as [
    number,
    number,
    number,
  ];
  const mask = glyphMask(initialsFor(name));
  const maskHeight = mask.length;
  const maskWidth = (mask[0] as boolean[]).length;
  const originX = (SIZE - maskWidth) / 2;
  const originY = (SIZE - maskHeight) / 2;

  const pixels = new Uint8Array(SIZE * SIZE * 4);
  const center = SIZE / 2;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let coverage = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS - center;
          const py = y + (sy + 0.5) / SS - center;
          if (Math.hypot(px, py) <= RADIUS) coverage++;
        }
      }
      if (coverage === 0) continue;
      const maskX = Math.floor(x - originX);
      const maskY = Math.floor(y - originY);
      const onGlyph =
        maskY >= 0 && maskY < maskHeight && maskX >= 0 && maskX < maskWidth
          ? ((mask[maskY] as boolean[])[maskX] as boolean)
          : false;
      const offset = (y * SIZE + x) * 4;
      pixels[offset] = onGlyph ? 255 : red;
      pixels[offset + 1] = onGlyph ? 255 : green;
      pixels[offset + 2] = onGlyph ? 255 : blue;
      pixels[offset + 3] = Math.round((coverage / (SS * SS)) * 255);
    }
  }

  return `data:image/png;base64,${Buffer.from(encodePng(pixels, SIZE, SIZE)).toString("base64")}`;
}
