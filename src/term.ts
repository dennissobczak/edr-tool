/**
 * Tiny terminal toolkit: colors (truecolor → 256 → 16 → none), gradients, shimmer,
 * width-aware wrapping, rounded boxes, redrawable screen regions and a spinner.
 * No dependencies.
 */

const env = process.env;
const out = process.stdout;

type RGB = readonly [number, number, number];

function detectColorLevel(): 0 | 1 | 2 | 3 {
  if (env.NO_COLOR || env.FORCE_COLOR === "0") return 0;
  if (!out.isTTY && !env.FORCE_COLOR) return 0;
  if (env.COLORTERM === "truecolor" || env.COLORTERM === "24bit" || env.FORCE_COLOR === "3") return 3;
  if (/256/.test(env.TERM ?? "") || env.FORCE_COLOR === "2") return 2;
  return 1;
}

export const level = detectColorLevel();

/** Runtime switches, set once by the CLI. */
export const settings = {
  animate: Boolean(out.isTTY) && !env.EDR_NO_ANIM && !env.CI,
};

// ── colors ──────────────────────────────────────────────────────────────────

function to256([r, g, b]: RGB): number {
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 24) + 232;
  }
  const q = (v: number) => Math.round((v / 255) * 5);
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

function fgCode(rgb: RGB, basic: number): string {
  if (level === 3) return `38;2;${rgb[0]};${rgb[1]};${rgb[2]}`;
  if (level === 2) return `38;5;${to256(rgb)}`;
  return String(basic);
}

const sgr = (open: string, close: string) => (s: string) => (level ? `\x1b[${open}m${s}\x1b[${close}m` : s);
const paint = (rgb: RGB, basic: number) => (s: string) => (level ? `\x1b[${fgCode(rgb, basic)}m${s}\x1b[39m` : s);

export const palette = {
  accent: [215, 119, 87],
  accentLight: [255, 196, 168],
  pink: [235, 110, 150],
  muted: [140, 140, 140],
  subtle: [85, 85, 85],
  success: [78, 186, 101],
  error: [255, 107, 128],
  warning: [255, 193, 7],
  info: [147, 165, 255],
} as const satisfies Record<string, RGB>;

export const c = {
  bold: sgr("1", "22"),
  dim: sgr("2", "22"),
  italic: sgr("3", "23"),
  underline: sgr("4", "24"),
  accent: paint(palette.accent, 33),
  muted: paint(palette.muted, 90),
  subtle: paint(palette.subtle, 90),
  success: paint(palette.success, 32),
  error: paint(palette.error, 31),
  warning: paint(palette.warning, 33),
  info: paint(palette.info, 34),
};

const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

/** Horizontal color gradient across the characters of `text`. */
export function gradient(text: string, from: RGB = palette.accent, to: RGB = palette.pink): string {
  if (level < 2) return c.accent(text);
  const chars = [...text];
  const n = Math.max(1, chars.length - 1);
  return chars.map((ch, i) => (ch === " " ? ch : `\x1b[${fgCode(mix(from, to, i / n), 33)}m${ch}`)).join("") + "\x1b[39m";
}

/** A bright band sweeping across the text; `phase` advances it. */
export function shimmer(text: string, phase: number): string {
  if (level < 2) return c.accent(text);
  const chars = [...text];
  const pos = (phase % (chars.length + 8)) - 4;
  return (
    chars
      .map((ch, i) => {
        const t = Math.max(0, 1 - Math.abs(i - pos) / 3);
        return `\x1b[${fgCode(mix(palette.accent, palette.accentLight, t), 33)}m${ch}`;
      })
      .join("") + "\x1b[39m"
  );
}

// ── measuring and wrapping ──────────────────────────────────────────────────

export const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");

function cpWidth(cp: number): number {
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0xfe00 && cp <= 0xfe0f)) return 0;
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f680 && cp <= 0x1f6ff) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  )
    return 2;
  return 1;
}

/** Display width in terminal cells (ANSI codes ignored, wide chars count 2). */
export function strWidth(s: string): number {
  let w = 0;
  for (const ch of stripAnsi(s)) w += cpWidth(ch.codePointAt(0)!);
  return w;
}

/** Cut plain text to at most `max` cells, adding "…" when shortened. */
export function truncate(s: string, max: number): string {
  if (strWidth(s) <= max) return s;
  let w = 0;
  let res = "";
  for (const ch of s) {
    const cw = cpWidth(ch.codePointAt(0)!);
    if (w + cw > max - 1) break;
    res += ch;
    w += cw;
  }
  return res + "…";
}

/** Split plain text into [head, tail] where head fits into `max` cells. */
function sliceWidth(s: string, max: number): [string, string] {
  let w = 0;
  let i = 0;
  const chars = [...s];
  for (; i < chars.length; i++) {
    const cw = cpWidth(chars[i].codePointAt(0)!);
    if (w + cw > max) break;
    w += cw;
  }
  return [chars.slice(0, Math.max(i, 1)).join(""), chars.slice(Math.max(i, 1)).join("")];
}

/** Word-wrap plain text; bullets and indentation get a hanging indent. */
export function wrapText(text: string, width: number): string[] {
  if (width < 4 || strWidth(text) <= width) return [text];
  const prefix = /^\s*(?:[-*] |\d+\. )?/.exec(text)![0];
  const hang = strWidth(prefix) < width / 2 ? " ".repeat(strWidth(prefix)) : "";
  const tokens = text.match(/\S+\s*|\s+/g) ?? [text];
  const lines: string[] = [];
  let line = "";
  for (const token of tokens) {
    if (strWidth(line + token.trimEnd()) <= width) {
      line += token;
      continue;
    }
    if (line.trim()) lines.push(line.trimEnd());
    line = hang + token.trimStart();
    while (strWidth(line.trimEnd()) > width) {
      const [head, tail] = sliceWidth(line, width);
      lines.push(head);
      line = hang + tail;
    }
  }
  lines.push(line.trimEnd());
  return lines;
}

/** Pad a (possibly colored) string with spaces to exactly `width` cells. */
export const padEnd = (s: string, width: number) => s + " ".repeat(Math.max(0, width - strWidth(s)));

// ── layout ──────────────────────────────────────────────────────────────────

export const termWidth = () => Math.max(40, out.columns || 80);
export const termHeight = () => Math.max(12, out.rows || 24);

export interface BoxOptions {
  width: number;
  color?: (s: string) => string;
  title?: string;
  footer?: string;
  padding?: number;
}

/** Rounded box around already-fitted lines. Title/footer are embedded in the border. */
export function box(lines: string[], o: BoxOptions): string[] {
  const col = o.color ?? c.subtle;
  const pad = o.padding ?? 1;
  const inner = o.width - 2;
  const content = inner - 2 * pad;

  const edge = (left: string, right: string, label: string | undefined, alignRight: boolean) => {
    if (!label) return col(left + "─".repeat(inner) + right);
    const lw = strWidth(label);
    const rest = Math.max(1, inner - lw - 3);
    return alignRight
      ? col(left + "─".repeat(rest) + " ") + label + col(" ─" + right)
      : col(left + "─ ") + label + col(" " + "─".repeat(rest) + right);
  };

  const sp = " ".repeat(pad);
  return [
    edge("╭", "╮", o.title, false),
    ...lines.map((l) => col("│") + sp + padEnd(l, content) + sp + col("│")),
    edge("╰", "╯", o.footer, true),
  ];
}

// ── live regions ────────────────────────────────────────────────────────────

const write = (s: string) => out.write(s);
export const hideCursor = () => write("\x1b[?25l");
export const showCursor = () => write("\x1b[?25h");

/**
 * A block of lines at the bottom of the screen that can be redrawn in place.
 * Every line must be narrower than the terminal (callers wrap/truncate).
 */
export class Region {
  /** Physical screen rows between the region's top and the cursor. */
  private cursorRow = 0;

  render(lines: string[], cursor?: { row: number; col: number }): void {
    // Count rows as the terminal does, so a line that wraps can't break the redraw.
    const cols = termWidth();
    const phys = lines.map((l) => Math.max(1, Math.ceil(strWidth(l) / cols)));
    const rowOf = (i: number) => phys.slice(0, i).reduce((a, b) => a + b, 0);
    const endRow = Math.max(0, rowOf(lines.length) - 1);

    let s = "";
    if (this.cursorRow > 0) s += `\x1b[${this.cursorRow}A`;
    s += "\r\x1b[J" + lines.join("\n");
    if (cursor) {
      const target = rowOf(cursor.row) + Math.floor(cursor.col / cols);
      const up = endRow - target;
      if (up > 0) s += `\x1b[${up}A`;
      const col = cursor.col % cols;
      s += "\r" + (col > 0 ? `\x1b[${col}C` : "") + "\x1b[?25h";
      this.cursorRow = target;
    } else {
      this.cursorRow = endRow;
      s += "\x1b[?25l";
    }
    write(s);
  }

  /** Replace the region with its final lines and release it. */
  finish(lines: string[]): void {
    this.render(lines);
    if (lines.length) write("\n");
    this.cursorRow = 0;
    showCursor();
  }
}

// ── animation ───────────────────────────────────────────────────────────────

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const FRAMES = ["·", "✢", "✳", "✶", "✻", "✽"];
const SPIN = [...FRAMES, ...FRAMES.slice(1, -1).reverse()];

/** Sparkle spinner with a shimmering label, shown for `ms` milliseconds. */
export async function spinner(label: string, ms: number): Promise<void> {
  if (!settings.animate) return;
  const region = new Region();
  const start = Date.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = Date.now() - start;
      const frame = SPIN[Math.floor(t / 110) % SPIN.length];
      region.render([`${c.accent(frame)} ${shimmer(label + "…", t / 55)} ${c.muted(`(${(t / 1000).toFixed(1)}s)`)}`]);
      if (t >= ms) {
        clearInterval(timer);
        region.render([]);
        showCursor();
        resolve();
      }
    };
    const timer = setInterval(tick, 40);
    tick();
  });
}
