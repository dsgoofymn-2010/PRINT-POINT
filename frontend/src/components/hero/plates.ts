// Artwork for the hero print, drawn as four separation plates (C, M, Y, K).
// Multiplied together the plates make the finished sheet; pulled apart they show how a colour print is built.

export type PlateId = 'C' | 'M' | 'Y' | 'K';

export const PLATE_INK: Record<PlateId, [number, number, number]> = {
  C: [0, 150, 214],
  M: [214, 0, 111],
  Y: [255, 212, 0],
  K: [20, 19, 26],
};

// Real halftone screen angles used on offset presses.
const ANGLE: Record<PlateId, number> = { C: 15, M: 75, Y: 0, K: 45 };
const NAME: Record<PlateId, string> = { C: 'Cyan 15°', M: 'Magenta 75°', Y: 'Yellow 0°', K: 'Black 45°' };
const ORDER: PlateId[] = ['C', 'M', 'Y', 'K'];

export const SHEET_W = 1024;
export const SHEET_H = 1448; // A4 proportion

const rgb = ([r, g, b]: [number, number, number], a = 1) => `rgba(${r},${g},${b},${a})`;

/** Wait for the poster type before drawing it into a canvas, but never more than 1.5 s on a slow network. */
export async function loadPlateFonts() {
  const fonts = Promise.all([document.fonts.load('700 200px Fraunces'), document.fonts.load('600 28px Archivo')]).catch(() => undefined);
  await Promise.race([fonts, new Promise((r) => setTimeout(r, 1500))]);
}

/** A shape's coverage (0..1) and the plate's tone at that point. */
type Coverage = (ctx: CanvasRenderingContext2D) => void;
type Tone = (x: number, y: number) => number;

function halftone(ctx: CanvasRenderingContext2D, s: number, id: PlateId, mask: Coverage, tone: Tone) {
  const w = Math.round(SHEET_W * s);
  const h = Math.round(SHEET_H * s);
  const m = document.createElement('canvas');
  m.width = w;
  m.height = h;
  const mc = m.getContext('2d')!;
  mc.scale(s, s);
  mc.fillStyle = '#000';
  mask(mc);
  const alpha = mc.getImageData(0, 0, w, h).data;

  const step = 15;
  const a = (ANGLE[id] * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const reach = Math.hypot(SHEET_W, SHEET_H);
  ctx.fillStyle = rgb(PLATE_INK[id]);
  ctx.beginPath();
  for (let u = -reach; u < reach; u += step) {
    for (let v = -reach; v < reach; v += step) {
      const x = SHEET_W / 2 + u * cos - v * sin;
      const y = SHEET_H / 2 + u * sin + v * cos;
      if (x < 0 || y < 0 || x >= SHEET_W || y >= SHEET_H) continue;
      const cov = alpha[(Math.floor(y * s) * w + Math.floor(x * s)) * 4 + 3] / 255;
      if (cov < 0.02) continue;
      const r = (step / 1.6) * Math.sqrt(cov * tone(x, y));
      if (r < 0.6) continue;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}

function registration(ctx: CanvasRenderingContext2D, ink: string) {
  const pts = [
    [56, 56],
    [SHEET_W - 56, 56],
    [56, SHEET_H - 56],
    [SHEET_W - 56, SHEET_H - 56],
  ];
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3;
  for (const [x, y] of pts) {
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.moveTo(x - 30, y);
    ctx.lineTo(x + 30, y);
    ctx.moveTo(x, y - 30);
    ctx.lineTo(x, y + 30);
    ctx.stroke();
  }
}

/** Draws one plate at `scale` (1 = 1024 px wide). White ground so it multiplies cleanly. */
export function drawPlate(id: PlateId, scale = 1): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(SHEET_W * scale);
  c.height = Math.round(SHEET_H * scale);
  const ctx = c.getContext('2d')!;
  ctx.scale(scale, scale);
  const ink = PLATE_INK[id];

  // Film: a faint tint and edge so a lifted plate still reads as a sheet.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, SHEET_W, SHEET_H);
  ctx.fillStyle = rgb(ink, id === 'Y' ? 0.07 : 0.035);
  ctx.fillRect(0, 0, SHEET_W, SHEET_H);
  ctx.strokeStyle = rgb(ink, 0.35);
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, SHEET_W - 4, SHEET_H - 4);

  if (id === 'C') {
    halftone(ctx, scale, id, (m) => { m.beginPath(); m.arc(390, 560, 300, 0, Math.PI * 2); m.fill(); }, (_x, y) => 1 - ((y - 260) / 600) * 0.5);
  } else if (id === 'M') {
    halftone(ctx, scale, id, (m) => { m.save(); m.translate(640, 800); m.rotate(-0.21); m.fillRect(-230, -230, 460, 460); m.restore(); }, (x) => 0.55 + ((x - 410) / 460) * 0.45);
  } else if (id === 'Y') {
    halftone(ctx, scale, id, (m) => { m.beginPath(); m.arc(560, 1010, 250, 0, Math.PI * 2); m.fill(); }, () => 1);
  } else {
    ctx.fillStyle = rgb(ink);
    ctx.font = '700 230px Fraunces, Georgia, serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Print', 84, 290);
    ctx.font = '700 128px Fraunces, Georgia, serif';
    ctx.fillText('it nearby.', 88, 1195);
    ctx.font = '600 30px Archivo, system-ui, sans-serif';
    ctx.fillText('PrintPoint, Chennai', 96, 1250);
  }

  registration(ctx, rgb(ink));

  // Colour bar: each plate owns one patch and label, so the finished sheet shows all four side by side.
  const bx = 96 + ORDER.indexOf(id) * 210;
  ctx.fillStyle = rgb(ink);
  ctx.fillRect(bx, 1300, 40, 40);
  // Labels stay black on every plate so yellow's name is still readable when its plate is lifted away.
  ctx.fillStyle = rgb(PLATE_INK.K);
  ctx.font = '600 22px Archivo, system-ui, sans-serif';
  ctx.fillText(NAME[id], bx + 52, 1328);
  return c;
}

/** All four plates multiplied together: the finished print. Used before WebGL is ready or when it's missing. */
export function drawComposite(scale = 0.5): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(SHEET_W * scale);
  c.height = Math.round(SHEET_H * scale);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'multiply';
  for (const id of ORDER) ctx.drawImage(drawPlate(id, scale), 0, 0);
  return c;
}

export const PLATES = ORDER;
