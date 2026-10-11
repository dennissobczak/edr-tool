import { box, c, gradient, settings, sleep, spinner, termWidth, truncate, wrapText } from "./term.js";

/** Output that differs between the rich interactive UI and the plain (pipe) UI. */

const FONT: Record<string, [string, string]> = {
  A: ["▄▀█", "█▀█"],
  D: ["█▀▄", "█▄▀"],
  R: ["█▀█", "█▀▄"],
  F: ["█▀▀", "█▀ "],
  C: ["█▀▀", "█▄▄"],
  E: ["█▀▀", "██▄"],
  T: ["▀█▀", " █ "],
  O: ["█▀█", "█▄█"],
  L: ["█  ", "█▄▄"],
  "-": ["▄▄", "  "],
  "/": [" ▄▀", "▄▀ "],
  " ": [" ", " "],
};

function logo(text: string): string[] {
  return [0, 1].map((row) => gradient([...text].map((ch) => FONT[ch][row]).join(" ")));
}

const VERBS = ["Composing", "Drafting", "Typesetting", "Distilling", "Polishing", "Crafting", "Weaving", "Assembling"];
const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

export function banner(fancy: boolean): void {
  if (!fancy) return;
  const W = Math.min(termWidth() - 1, 62);
  console.log();
  for (const l of logo("EDR-TOOL")) console.log("  " + l);
  console.log();
  const fit = (s: string) => truncate(s, W - 4); // measure plain text, colour afterwards
  const lines = [
    `${c.accent("✻")} Welcome to ${c.bold("edr-tool")}!`,
    "",
    c.muted(fit("  Architecture decisions and proposals, one question at a time.")),
    c.muted(fit("  ↑↓ choose · enter confirm · ctrl+c twice to exit")),
    "",
    c.muted(fit(`  cwd: ${process.cwd()}`)),
  ];
  for (const l of box(lines, { width: W, color: c.accent })) console.log(l);
}

export function documentHeader(fancy: boolean, label: string, short: string, number: number, dir: string): void {
  if (fancy) {
    console.log(`\n${c.accent("⏺")} ${c.bold(`New ${label}`)}`);
    console.log(`  ${c.muted("⎿")}  ${short} #${number} ${c.muted("→")} ${dir}/`);
  } else {
    console.log(c.bold(`\n📝  New ${label} – ${short} #${number}`));
    console.log(c.muted(`    Target directory: ${dir}  ·  Ctrl+C aborts at any time`));
  }
}

/** Colour one (already wrapped) segment of a Markdown line. */
function styleSegment(seg: string, line: string, first: boolean, inCode: boolean, fence: boolean): string {
  if (fence) return c.muted(seg);
  if (inCode) return c.info(seg);
  if (line.startsWith("# ")) return c.bold(c.accent(seg));
  if (line.startsWith("## ")) return c.bold(seg);
  if (line.startsWith("### ") || line.startsWith("#### ")) return c.bold(c.italic(seg));
  let s = seg
    .replace(/\*\*(.+?)\*\*/g, (_, t: string) => c.muted("**") + c.bold(t) + c.muted("**"))
    .replace(/https?:\/\/\S+/g, (u) => c.underline(c.info(u)));
  if (first) {
    s = s
      .replace(/^(\s*- )Good:/, (_, p: string) => p + c.success("Good:"))
      .replace(/^(\s*- )Bad:/, (_, p: string) => p + c.error("Bad:"))
      .replace(/^(\s*)([-*]|\d+\.) /, (_, sp: string, m: string) => sp + c.accent(m) + " ");
  }
  return s;
}

export async function preview(fancy: boolean, fileName: string, markdown: string): Promise<void> {
  if (!fancy) {
    const rule = "═".repeat(72);
    console.log(`\n${rule}\n Preview: ${fileName}\n${rule}\n`);
    console.log(markdown);
    console.log(rule + "\n");
    return;
  }

  console.log();
  await spinner(pick(VERBS), 1100);

  const W = Math.min(termWidth() - 1, 100);
  const lines = markdown.trimEnd().split("\n");
  const gutter = String(lines.length).length;
  const textW = W - 4 - gutter - 2;
  const rows: string[] = [];
  let inCode = false;

  lines.forEach((line, i) => {
    const fence = line.trimStart().startsWith("```");
    wrapText(line, textW).forEach((seg, j) => {
      const num = j === 0 ? c.subtle(String(i + 1).padStart(gutter)) : " ".repeat(gutter);
      rows.push(`${num}  ${styleSegment(seg, line, j === 0, inCode && !fence, fence)}`);
    });
    if (fence) inCode = !inCode;
  });

  const framed = box(rows, {
    width: W,
    color: c.subtle,
    title: `${c.accent("Preview")} ${c.muted("·")} ${c.bold(fileName)}`,
    footer: c.muted(`${lines.length} lines`),
  });
  const delay = Math.min(14, 700 / framed.length);
  for (const row of framed) {
    console.log(row);
    if (settings.animate) await sleep(delay);
  }
  console.log();
}

export function saved(fancy: boolean, path: string, markdown: string): void {
  if (!fancy) return void console.log(c.success(`\n✔ Saved to ${path}\n`));
  const lines = markdown.trimEnd().split("\n").length;
  const kb = (Buffer.byteLength(markdown) / 1024).toFixed(1);
  console.log(`${c.success("⏺")} ${c.bold("Saved")} ${path}`);
  console.log(`  ${c.muted("⎿")}  ${lines} lines · ${kb} KB\n`);
}

export function discarded(fancy: boolean): void {
  if (!fancy) return void console.log(c.warning("\n✖ Discarded. Nothing was written.\n"));
  console.log(`${c.warning("⏺")} ${c.bold("Discarded")}`);
  console.log(`  ${c.muted("⎿")}  Nothing was written\n`);
}

export function interrupted(fancy: boolean): void {
  if (!fancy) return void console.log(c.warning("\n✖ Aborted. Nothing was written."));
  console.log(`\n${c.error("⏺")} ${c.bold("Interrupted")}`);
  console.log(`  ${c.muted("⎿")}  Nothing was written\n`);
}
