import { encodePng } from "./png";
import type { SignatureStatus } from "./signature";

const SIZE = 32;
const SS = 3;

const COLORS: Record<SignatureStatus, [number, number, number]> = {
  verified: [63, 185, 80],
  unverified: [139, 148, 158],
  bad: [248, 81, 73],
};

type Vec = [number, number];

function sdSegment(p: Vec, a: Vec, b: Vec): number {
  const pa: Vec = [p[0] - a[0], p[1] - a[1]];
  const ba: Vec = [b[0] - a[0], b[1] - a[1]];
  const h = Math.min(
    Math.max((pa[0] * ba[0] + pa[1] * ba[1]) / (ba[0] * ba[0] + ba[1] * ba[1]), 0),
    1,
  );
  return Math.hypot(pa[0] - ba[0] * h, pa[1] - ba[1] * h);
}

function glyph(status: SignatureStatus, p: Vec): boolean {
  if (status === "bad") {
    return (
      sdSegment(p, [16, 8], [16, 18]) - 2.2 < 0 || Math.hypot(p[0] - 16, p[1] - 23.5) - 2.4 < 0
    );
  }
  return (
    sdSegment(p, [9, 16.5], [14, 21.5]) - 2.2 < 0 || sdSegment(p, [14, 21.5], [23.5, 11]) - 2.2 < 0
  );
}

const cache = new Map<SignatureStatus, string>();

// 32px circle badge rendered once per status, shown at 14px in hovers
export function signatureBadgeUri(status: SignatureStatus): string {
  const cached = cache.get(status);
  if (cached) return cached;
  const [r, g, b] = COLORS[status];
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let fill = 0;
      let white = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const p: Vec = [x + (sx + 0.5) / SS, y + (sy + 0.5) / SS];
          if (Math.hypot(p[0] - 16, p[1] - 16) > 15.5) continue;
          fill++;
          if (glyph(status, p)) white++;
        }
      }
      if (fill === 0) continue;
      const offset = (y * SIZE + x) * 4;
      const t = white / fill;
      pixels[offset] = Math.round(r + (255 - r) * t);
      pixels[offset + 1] = Math.round(g + (255 - g) * t);
      pixels[offset + 2] = Math.round(b + (255 - b) * t);
      pixels[offset + 3] = Math.round((fill / (SS * SS)) * 255);
    }
  }
  const uri = `data:image/png;base64,${Buffer.from(encodePng(pixels, SIZE, SIZE)).toString("base64")}`;
  cache.set(status, uri);
  return uri;
}
