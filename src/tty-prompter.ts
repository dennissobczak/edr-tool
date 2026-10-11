import { emitKeypressEvents } from "node:readline";
import { AbortedError, validateDate, type ChoiceOptions, type Prompter, type TextOptions } from "./prompter.js";
import { box, c, Region, showCursor, strWidth, termHeight, termWidth, truncate, wrapText } from "./term.js";

interface Key {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  sequence?: string;
}

interface View {
  lines: string[];
  cursor?: { row: number; col: number };
}

interface Widget<T> {
  view(): View;
  /** Handle a key; return `{ value }` to finish. `paste` is true while a pasted chunk is being processed. */
  key(str: string | undefined, key: Key, paste: boolean): { value: T } | void;
  /** Lines that replace the widget once it's answered. */
  summary(value: T): string[];
}

const isEnter = (k: Key) => k.name === "return" || k.name === "enter";
const width = () => Math.min(termWidth() - 1, 100);

// ── line editor ─────────────────────────────────────────────────────────────

class Editor {
  lines: string[][] = [[]];
  row = 0;
  col = 0;

  constructor(private readonly multi: boolean) {}

  get value(): string {
    return this.lines.map((l) => l.join("")).join("\n");
  }
  get empty(): boolean {
    return this.lines.length === 1 && this.lines[0].length === 0;
  }
  get currentLine(): string {
    return this.lines[this.row].join("");
  }
  get atEnd(): boolean {
    return this.row === this.lines.length - 1 && this.col === this.lines[this.row].length;
  }

  set(text: string): void {
    this.lines = text.split("\n").map((l) => [...l]);
    this.row = this.lines.length - 1;
    this.col = this.lines[this.row].length;
  }

  removeLine(): void {
    if (this.lines.length === 1) return this.set("");
    this.lines.splice(this.row, 1);
    this.row = Math.min(this.row, this.lines.length - 1);
    this.col = this.lines[this.row].length;
  }

  insert(s: string): void {
    for (const ch of s) {
      if (ch === "\t") this.insert("  ");
      else if (ch.codePointAt(0)! >= 32) this.lines[this.row].splice(this.col++, 0, ch);
    }
  }

  newline(): void {
    const rest = this.lines[this.row].splice(this.col);
    this.lines.splice(++this.row, 0, rest);
    this.col = 0;
  }

  private backspace(): void {
    if (this.col > 0) this.lines[this.row].splice(--this.col, 1);
    else if (this.row > 0) {
      const line = this.lines.splice(this.row--, 1)[0];
      this.col = this.lines[this.row].length;
      this.lines[this.row].push(...line);
    }
  }

  private deleteForward(): void {
    const line = this.lines[this.row];
    if (this.col < line.length) line.splice(this.col, 1);
    else if (this.row < this.lines.length - 1) line.push(...this.lines.splice(this.row + 1, 1)[0]);
  }

  private deleteWord(): void {
    const line = this.lines[this.row];
    let i = this.col;
    while (i > 0 && line[i - 1] === " ") i--;
    while (i > 0 && line[i - 1] !== " ") i--;
    line.splice(i, this.col - i);
    this.col = i;
  }

  private wordJump(dir: -1 | 1): void {
    const line = this.lines[this.row];
    let i = this.col;
    if (dir < 0) {
      while (i > 0 && line[i - 1] === " ") i--;
      while (i > 0 && line[i - 1] !== " ") i--;
    } else {
      while (i < line.length && line[i] === " ") i++;
      while (i < line.length && line[i] !== " ") i++;
    }
    this.col = i;
  }

  /** Standard editing keys (emacs-style shortcuts included). Returns true if handled. */
  handle(str: string | undefined, key: Key): boolean {
    const line = this.lines[this.row];
    if (key.ctrl) {
      switch (key.name) {
        case "a": this.col = 0; return true;
        case "e": this.col = line.length; return true;
        case "u": line.splice(0, this.col); this.col = 0; return true;
        case "k": line.splice(this.col); return true;
        case "w": this.deleteWord(); return true;
        case "h": this.backspace(); return true;
        case "left": this.wordJump(-1); return true;
        case "right": this.wordJump(1); return true;
      }
      return false;
    }
    if (key.meta) {
      if (key.name === "backspace") this.deleteWord();
      else if (key.name === "b" || key.name === "left") this.wordJump(-1);
      else if (key.name === "f" || key.name === "right") this.wordJump(1);
      else return false;
      return true;
    }
    switch (key.name) {
      case "backspace": this.backspace(); return true;
      case "delete": this.deleteForward(); return true;
      case "left":
        if (this.col > 0) this.col--;
        else if (this.row > 0) this.col = this.lines[--this.row].length;
        return true;
      case "right":
        if (this.col < line.length) this.col++;
        else if (this.row < this.lines.length - 1) (this.row++, (this.col = 0));
        return true;
      case "up":
        if (!this.multi || this.row === 0) return false;
        this.col = Math.min(this.col, this.lines[--this.row].length);
        return true;
      case "down":
        if (!this.multi || this.row === this.lines.length - 1) return false;
        this.col = Math.min(this.col, this.lines[++this.row].length);
        return true;
      case "home": this.col = 0; return true;
      case "end": this.col = line.length; return true;
      case "escape": case "tab": case "pageup": case "pagedown": return false;
    }
    if (str && !str.startsWith("\x1b")) {
      this.insert(str);
      return true;
    }
    return false;
  }
}

/** Draw an editor inside a rounded input box; returns lines and the caret position. */
function editorBox(ed: Editor, boxWidth: number, placeholder: string, maxRows: number) {
  const textW = boxWidth - 6; // "│ " + "> " + … + " │"
  let rows: string[] = [];
  let cur = { row: 0, col: 0 };

  if (ed.empty) {
    rows = [placeholder ? c.muted(c.italic(truncate(placeholder, textW))) : ""];
  } else {
    ed.lines.forEach((chars, li) => {
      let row = "";
      let w = 0;
      for (let k = 0; k <= chars.length; k++) {
        if (li === ed.row && k === ed.col) {
          if (w >= textW) (rows.push(row), (row = ""), (w = 0));
          cur = { row: rows.length, col: w };
        }
        if (k === chars.length) break;
        const cw = strWidth(chars[k]);
        if (w + cw > textW) (rows.push(row), (row = ""), (w = 0));
        row += chars[k];
        w += cw;
      }
      rows.push(row);
    });
  }

  // Scroll long input so the caret stays visible.
  const total = rows.length;
  const start = Math.max(0, Math.min(cur.row - Math.floor(maxRows / 2), total - maxRows));
  const visible = rows.slice(start, start + maxRows);
  const content = visible.map((r, i) => (i === 0 && start === 0 ? c.muted(">") + " " : "  ") + r);
  const footer = total > maxRows ? c.muted(`lines ${start + 1}–${start + visible.length} of ${total}`) : undefined;
  return {
    lines: box(content, { width: boxWidth, color: c.subtle, footer }),
    cursor: { row: 1 + cur.row - start, col: 4 + cur.col },
  };
}

// ── shared bits ─────────────────────────────────────────────────────────────

function header(question: string): string[] {
  const [first, ...rest] = wrapText(question, width() - 2);
  return [`${c.accent("◆")} ${c.bold(first)}`, ...rest.map((l) => "  " + c.bold(l))];
}

/** Collapsed transcript entry:  ✔ Question / ⎿ answer. */
function answered(question: string, answers: string[], emptyLabel = "(skipped)"): string[] {
  const W = width();
  const lines = [`${c.success("✔")} ${truncate(question, W - 2)}`];
  if (answers.length === 0) return [...lines, `  ${c.muted("⎿")}  ${c.muted(emptyLabel)}`];
  answers.forEach((a, i) => lines.push((i === 0 ? `  ${c.muted("⎿")}  ` : "     ") + truncate(a, W - 5)));
  return lines;
}

function moreLines(lines: string[], max: number, noun: string): string[] {
  if (lines.length <= max) return lines;
  const rest = lines.length - max;
  return [...lines.slice(0, max), c.muted(`… +${rest} ${noun}${rest === 1 ? "" : "s"}`)];
}

const hint = (s: string) => c.muted(truncate(`  ${s}`, width()));
const errorLine = (s: string) => c.error(truncate(`  ✗ ${s}`, width()));

// ── prompter ────────────────────────────────────────────────────────────────

/** Rich, raw-mode prompter for interactive terminals. */
export class TtyPrompter implements Prompter {
  readonly interactive = true;
  private handler: ((str: string | undefined, key: Key) => void) | null = null;
  private pasting = false;

  private readonly onData = (chunk: Buffer | string) => {
    const s = chunk.toString();
    // More than one character that isn't an escape sequence → pasted text.
    this.pasting = [...s].length > 1 && !s.startsWith("\x1b");
    if (this.pasting) setImmediate(() => (this.pasting = false));
  };
  private readonly onKeypress = (str: string | undefined, key: Key | undefined) => this.handler?.(str, key ?? { sequence: str });
  private readonly restore = () => {
    try {
      process.stdin.setRawMode(false);
    } catch {
      /* stdin already closed */
    }
    showCursor();
  };

  constructor() {
    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.prependListener("data", this.onData);
    process.stdin.on("keypress", this.onKeypress);
    process.stdin.resume();
    process.on("exit", this.restore);
  }

  close(): void {
    process.stdin.off("keypress", this.onKeypress);
    process.stdin.off("data", this.onData);
    this.restore();
    process.stdin.pause();
    process.off("exit", this.restore);
  }

  /** Drive one widget until it produces a value; Ctrl-C twice aborts. */
  private run<T>(w: Widget<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const region = new Region();
      let finished = false;
      let scheduled = false;
      let ctrlC = false;
      let ctrlCTimer: NodeJS.Timeout | undefined;

      const draw = () => {
        scheduled = false;
        if (finished) return;
        const v = w.view();
        region.render(ctrlC ? [...v.lines, c.warning("  Press Ctrl-C again to exit")] : v.lines, v.cursor);
      };
      const schedule = () => {
        if (!scheduled) (scheduled = true), setImmediate(draw);
      };
      const end = () => {
        finished = true;
        this.handler = null;
        clearTimeout(ctrlCTimer);
        process.stdout.off("resize", schedule);
      };

      process.stdout.on("resize", schedule);
      this.handler = (str, key) => {
        if (key.ctrl && key.name === "c") {
          if (ctrlC) {
            end();
            region.finish([]);
            reject(new AbortedError());
            return;
          }
          ctrlC = true;
          ctrlCTimer = setTimeout(() => ((ctrlC = false), schedule()), 2000);
          schedule();
          return;
        }
        if (ctrlC) (ctrlC = false), clearTimeout(ctrlCTimer);
        const result = w.key(str, key, this.pasting);
        if (result) {
          end();
          region.finish(w.summary(result.value));
          resolve(result.value);
        } else schedule();
      };
      draw();
    });
  }

  section(step: number, total: number, title: string): void {
    const bar = c.accent("▰".repeat(step)) + c.subtle("▱".repeat(Math.max(0, total - step)));
    console.log(`\n${bar}  ${c.bold(title)}  ${c.muted(`step ${step} of ${total}`)}`);
  }

  subheading(text: string): void {
    console.log(`\n${c.accent("▸")} ${c.bold(text)}`);
  }

  note(text: string): void {
    console.log(`  ${c.muted(text)}`);
  }

  text(question: string, opts: TextOptions = {}): Promise<string> {
    const ed = new Editor(false);
    let error = "";
    const placeholder = opts.default ?? opts.hint ?? (opts.required ? "" : "optional · press enter to skip");
    const footer = opts.default ? `enter ↵ to use ${opts.default}` : `enter ↵ to submit${opts.required ? "" : " · optional"}`;

    return this.run<string>({
      view: () => {
        const head = header(question);
        const input = editorBox(ed, width(), placeholder, 6);
        return {
          lines: [...head, ...input.lines, error ? errorLine(error) : hint(footer)],
          cursor: { row: head.length + input.cursor.row, col: input.cursor.col },
        };
      },
      key: (str, key, paste) => {
        if (isEnter(key)) {
          if (paste) return void ed.insert(" "); // keep pasted multi-line text on one line
          let v = ed.value.trim();
          if (!v && opts.default !== undefined) v = opts.default;
          if (!v && opts.required) return void (error = "This field is required.");
          const invalid = opts.validate?.(v);
          if (invalid) return void (error = invalid);
          return { value: v };
        }
        error = "";
        ed.handle(str, key);
      },
      summary: (v) => answered(question, v ? [v] : []),
    });
  }

  date(question: string, opts: { default?: string; required?: boolean } = {}): Promise<string> {
    return this.text(question, { ...opts, hint: "YYYY-MM-DD", validate: validateDate });
  }

  multiline(question: string, opts: { required?: boolean; long?: boolean } = {}): Promise<string> {
    const ed = new Editor(true);
    let error = "";
    const placeholder = opts.long ? "Markdown welcome – paragraphs, lists, code blocks…" : opts.required ? "" : "optional · press enter to skip";
    const footer = opts.long
      ? "enter ↵ new line · ctrl+d to submit"
      : "enter ↵ new line · enter on an empty line or ctrl+d to submit";

    const submit = (): { value: string } | void => {
      const text = ed.value.replace(/\s+$/g, "").replace(/^\s*\n/g, "");
      if (!text && opts.required) return void (error = "This field is required.");
      return { value: text };
    };

    return this.run<string>({
      view: () => {
        const head = header(question);
        const input = editorBox(ed, width(), placeholder, Math.max(4, termHeight() - 10));
        return {
          lines: [...head, ...input.lines, error ? errorLine(error) : hint(footer)],
          cursor: { row: head.length + input.cursor.row, col: input.cursor.col },
        };
      },
      key: (str, key, paste) => {
        error = "";
        if (key.ctrl && key.name === "d") return submit();
        if (isEnter(key)) {
          const line = ed.currentLine.trim();
          if (!paste && ed.atEnd) {
            if (opts.long && line === ".") return ed.removeLine(), submit();
            if (!opts.long && line === "") {
              if (!ed.empty) ed.removeLine();
              return submit();
            }
          }
          return void ed.newline();
        }
        ed.handle(str, key);
      },
      summary: (v) => answered(question, moreLines(v ? v.split("\n") : [], 3, "line")),
    });
  }

  list(question: string, opts: { required?: boolean; min?: number } = {}): Promise<string[]> {
    const min = opts.min ?? (opts.required ? 1 : 0);
    const items: string[] = [];
    const ed = new Editor(false);
    let error = "";
    const SHOWN = 8;

    return this.run<string[]>({
      view: () => {
        const W = width();
        const head = header(question);
        const shown = items.slice(-SHOWN);
        const offset = items.length - shown.length;
        const itemLines = [
          ...(offset ? [c.muted(`    … ${offset} more above`)] : []),
          ...shown.map((it, i) => `  ${c.muted(`${String(offset + i + 1).padStart(2)}.`)} ${truncate(it, W - 7)}`),
        ];
        const placeholder = items.length
          ? items.length >= min ? "add another, or press enter to finish" : "add another"
          : min > 0 ? "add an item" : "add an item, or press enter to skip";
        const input = editorBox(ed, W, placeholder, 4);
        const footer = "enter ↵ to add · empty enter to finish · ⌫ edits last item";
        const top = head.length + itemLines.length;
        return {
          lines: [...head, ...itemLines, ...input.lines, error ? errorLine(error) : hint(footer)],
          cursor: { row: top + input.cursor.row, col: input.cursor.col },
        };
      },
      key: (str, key, paste) => {
        if (isEnter(key)) {
          const v = ed.value.trim();
          if (v) return void (items.push(v), ed.set(""), (error = ""));
          if (paste) return; // blank lines inside pasted text
          if (items.length >= min) return { value: items };
          return void (error = `Please add at least ${min} item${min === 1 ? "" : "s"}.`);
        }
        error = "";
        if (key.name === "backspace" && !key.ctrl && !key.meta && ed.empty && items.length) return void ed.set(items.pop()!);
        ed.handle(str, key);
      },
      summary: (v) => {
        const joined = v.join(", ");
        return answered(question, strWidth(joined) <= width() - 5 ? (v.length ? [joined] : []) : moreLines(v, 4, "more item"), "(none)");
      },
    });
  }

  choice<T extends string>(question: string, options: readonly T[], defaultIndex = 0, opts: ChoiceOptions = {}): Promise<T> {
    let idx = defaultIndex;
    const n = options.length;

    return this.run<T>({
      view: () => {
        const rows = options.map((o, i) =>
          i === idx ? c.accent(`❯ ${i + 1}. ${o}`) : `  ${c.muted(`${i + 1}.`)} ${o}`,
        );
        const footer = hint(`↑↓ to navigate · enter to select${n <= 9 ? ` · 1-${n} shortcut` : ""}`);
        if (opts.dialog) {
          const W = Math.min(width(), 76);
          const details = (opts.dialog.details ?? []).map((d) => truncate(d, W - 4));
          const content = [c.bold(opts.dialog.title), ...(details.length ? ["", ...details] : []), "", c.muted(question), ...rows];
          return { lines: [...box(content, { width: W, color: c.accent }), footer] };
        }
        return { lines: [...header(question), ...rows.map((r) => "  " + r), footer] };
      },
      key: (str, key) => {
        if (key.name === "up" || (key.shift && key.name === "tab")) idx = (idx - 1 + n) % n;
        else if (key.name === "down" || key.name === "tab") idx = (idx + 1) % n;
        else if (isEnter(key)) return { value: options[idx] };
        else if (str && /^[1-9]$/.test(str) && Number(str) <= n) return { value: options[Number(str) - 1] };
        else if (str && /^\p{L}$/u.test(str)) {
          const hits = options.filter((o) => o.toLowerCase().startsWith(str.toLowerCase()));
          if (hits.length === 1) return { value: hits[0] };
        }
      },
      summary: (v) => (opts.dialog ? [] : answered(question, [v])),
    });
  }

  async confirm(question: string, defaultYes = false): Promise<boolean> {
    return (await this.choice(question, ["Yes", "No"] as const, defaultYes ? 0 : 1)) === "Yes";
  }
}
