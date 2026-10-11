import { createInterface, type Interface } from "node:readline";
import { c } from "./term.js";

/** Thrown when input ends (Ctrl+D / closed pipe) or the user presses Ctrl+C. */
export class AbortedError extends Error {
  constructor() {
    super("Interview aborted");
  }
}

export interface TextOptions {
  required?: boolean;
  default?: string;
  hint?: string;
  /** Returns an error message for invalid input. */
  validate?: (value: string) => string | undefined;
}

export interface ChoiceOptions {
  /** Render as a framed dialog (interactive mode); `details` are shown above the options. */
  dialog?: { title: string; details?: string[] };
}

/** Everything an interview needs; implemented for interactive terminals and for pipes. */
export interface Prompter {
  readonly interactive: boolean;
  text(question: string, opts?: TextOptions): Promise<string>;
  date(question: string, opts?: { default?: string; required?: boolean }): Promise<string>;
  multiline(question: string, opts?: { required?: boolean; long?: boolean }): Promise<string>;
  list(question: string, opts?: { required?: boolean; min?: number }): Promise<string[]>;
  choice<T extends string>(question: string, options: readonly T[], defaultIndex?: number, opts?: ChoiceOptions): Promise<T>;
  confirm(question: string, defaultYes?: boolean): Promise<boolean>;
  section(step: number, total: number, title: string): void;
  subheading(text: string): void;
  note(text: string): void;
  close(): void;
}

/** Today's local date as YYYY-MM-DD. */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function validateDate(v: string): string | undefined {
  if (v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)))) return undefined;
  return "Please use the format YYYY-MM-DD.";
}

/**
 * Plain line-based prompter for pipes, CI and `--plain`.
 * Lines are queued as they arrive so none are lost when stdin is a pipe.
 */
export class PlainPrompter implements Prompter {
  readonly interactive = false;
  private readonly rl: Interface;
  private readonly queue: string[] = [];
  private readonly waiters: Array<(line: string | null) => void> = [];
  private closed = false;

  constructor() {
    this.rl = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
    this.rl.on("line", (line) => {
      const waiter = this.waiters.shift();
      if (waiter) waiter(line);
      else this.queue.push(line);
    });
    this.rl.on("close", () => {
      this.closed = true;
      for (const waiter of this.waiters.splice(0)) waiter(null);
    });
    this.rl.on("SIGINT", () => {
      process.stdout.write("\n");
      this.rl.close();
    });
  }

  close(): void {
    this.rl.close();
  }

  private async line(prompt: string): Promise<string> {
    this.rl.setPrompt(prompt);
    this.rl.prompt();
    let line: string | null;
    if (this.queue.length > 0) line = this.queue.shift()!;
    else if (this.closed) line = null;
    else line = await new Promise<string | null>((resolve) => this.waiters.push(resolve));
    if (line === null) throw new AbortedError();
    if (!process.stdin.isTTY) process.stdout.write(line + "\n"); // echo piped input
    return line;
  }

  section(step: number, total: number, title: string): void {
    console.log("\n" + c.accent(c.bold(`── Step ${step}/${total}: ${title} `)) + c.accent("─".repeat(Math.max(0, 40 - title.length))));
  }

  subheading(text: string): void {
    console.log("\n" + c.bold(`  ${text}`));
  }

  note(text: string): void {
    console.log(c.muted(`  ${text}`));
  }

  async text(question: string, opts: TextOptions = {}): Promise<string> {
    const def = opts.default ? c.muted(` [${opts.default}]`) : "";
    const hint = opts.hint ? c.muted(` (${opts.hint})`) : "";
    for (;;) {
      let answer = (await this.line(`${c.accent("?")} ${c.bold(question)}${hint}${def} `)).trim();
      if (!answer && opts.default !== undefined) answer = opts.default;
      if (!answer && opts.required) {
        console.log(c.error("  This field is required."));
        continue;
      }
      const err = opts.validate?.(answer);
      if (err) {
        console.log(c.error(`  ${err}`));
        continue;
      }
      return answer;
    }
  }

  date(question: string, opts: { default?: string; required?: boolean } = {}): Promise<string> {
    return this.text(question, { ...opts, hint: "YYYY-MM-DD", validate: validateDate });
  }

  async multiline(question: string, opts: { required?: boolean; long?: boolean } = {}): Promise<string> {
    const howToFinish = opts.long ? 'finish with a line containing only "."' : "finish with an empty line";
    console.log(`${c.accent("?")} ${c.bold(question)} ${c.muted(`(${howToFinish})`)}`);
    for (;;) {
      const lines: string[] = [];
      for (;;) {
        const l = await this.line(c.muted("  │ "));
        if (opts.long ? l.trim() === "." : l.trim() === "") break;
        lines.push(l.trimEnd());
      }
      const text = lines.join("\n").replace(/^\n+|\n+$/g, "");
      if (text || !opts.required) return text;
      console.log(c.error("  This field is required."));
    }
  }

  async list(question: string, opts: { required?: boolean; min?: number } = {}): Promise<string[]> {
    const min = opts.min ?? (opts.required ? 1 : 0);
    console.log(`${c.accent("?")} ${c.bold(question)} ${c.muted("(one per line, empty line to finish)")}`);
    const items: string[] = [];
    for (;;) {
      const l = (await this.line(c.muted(`  ${items.length + 1}. `))).trim();
      if (l) {
        items.push(l);
        continue;
      }
      if (items.length >= min) return items;
      console.log(c.error(`  Please enter at least ${min} item${min === 1 ? "" : "s"}.`));
    }
  }

  async choice<T extends string>(question: string, options: readonly T[], defaultIndex = 0, opts: ChoiceOptions = {}): Promise<T> {
    if (opts.dialog) {
      console.log(c.bold(opts.dialog.title));
      for (const d of opts.dialog.details ?? []) console.log(`  ${d}`);
    }
    console.log(`${c.accent("?")} ${c.bold(question)}`);
    options.forEach((o, i) => console.log(`  ${c.warning(String(i + 1))}) ${o}${i === defaultIndex ? c.muted(" (default)") : ""}`));
    for (;;) {
      const raw = (await this.line(c.muted(`  Choose 1-${options.length}: `))).trim();
      if (raw === "") return options[defaultIndex];
      const n = Number(raw);
      if (Number.isInteger(n) && n >= 1 && n <= options.length) return options[n - 1];
      const matches = options.filter((o) => o.toLowerCase().startsWith(raw.toLowerCase()));
      if (matches.length === 1) return matches[0];
      console.log(c.error("  Invalid choice, try again."));
    }
  }

  async confirm(question: string, defaultYes = false): Promise<boolean> {
    const suffix = defaultYes ? "(Y/n)" : "(y/N)";
    for (;;) {
      const a = (await this.line(`${c.accent("?")} ${c.bold(question)} ${c.muted(suffix)} `)).trim().toLowerCase();
      if (a === "") return defaultYes;
      if (["y", "yes", "j", "ja"].includes(a)) return true;
      if (["n", "no", "nein"].includes(a)) return false;
      console.log(c.error("  Please answer y or n."));
    }
  }
}
