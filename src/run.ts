import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { findKind, KINDS, type DocumentKind } from "./kinds.js";
import { AbortedError, PlainPrompter, type Prompter } from "./prompter.js";
import { nextNumber, resolveDir, saveDocument } from "./store.js";
import { c, settings, spinner } from "./term.js";
import { TtyPrompter } from "./tty-prompter.js";
import * as ui from "./ui.js";

const helpText = (cmd: string, fixedKind?: string) => `
${c.bold(cmd)} – create ${fixedKind ? `an ${fixedKind.toUpperCase()}` : "an ADR or RFC"} through a short interview

${c.bold("Usage:")} ${cmd} ${fixedKind ? "" : "[adr|rfc] "}[options]
${fixedKind ? "" : `\n  Without a type you are asked which document to create.\n`}
${c.bold("Options:")}
  -d, --dir <path>   Target directory. Defaults to an existing folder such as
                     ${KINDS.filter((k) => !fixedKind || k.id === fixedKind).map((k) => k.dirs[0]).join(" or ")}, otherwise that path is created.
      --plain        Simple line-based prompts (automatic when input is piped)
      --no-anim      Disable spinners and streaming animations
  -h, --help         Show this help

${c.bold("Environment:")} NO_COLOR disables colors, EDR_NO_ANIM=1 disables animations, EDR_PLAIN=1 forces plain mode.
`;

/**
 * Runs the interview → preview → save/discard flow.
 * @param fixedKind  document type preset by the command (e.g. the `rfc` binary)
 */
export async function run(cmd: string, fixedKind?: string): Promise<number> {
  const { values, positionals } = parseArgs({
    options: {
      dir: { type: "string", short: "d" },
      help: { type: "boolean", short: "h" },
      plain: { type: "boolean" },
      "no-anim": { type: "boolean" },
    },
    allowPositionals: !fixedKind,
  });
  if (values.help) {
    console.log(helpText(cmd, fixedKind));
    return 0;
  }

  const requested = fixedKind ?? positionals[0];
  let kind: DocumentKind | undefined;
  if (requested) {
    kind = findKind(requested);
    if (!kind) {
      console.error(c.error(`Unknown document type "${requested}". Use one of: ${KINDS.map((k) => k.id).join(", ")}`));
      return 2;
    }
  }

  const fancy = !values.plain && !process.env.EDR_PLAIN && Boolean(process.stdin.isTTY && process.stdout.isTTY);
  settings.animate &&= fancy && !values["no-anim"];
  const p: Prompter = fancy ? new TtyPrompter() : new PlainPrompter();

  try {
    ui.banner(fancy);
    if (!kind) {
      const label = await p.choice("What do you want to create?", KINDS.map((k) => k.label), 0);
      kind = KINDS.find((k) => k.label === label)!;
    }

    const dir = resolveDir(process.cwd(), kind.dirs, values.dir);
    const dirRel = relative(process.cwd(), dir) || ".";
    const number = nextNumber(dir);
    const short = kind.id.toUpperCase();
    ui.documentHeader(fancy, kind.label.split(" – ")[1], short, number, dirRel);

    const { fileName, markdown } = await kind.interview(p, number);
    await ui.preview(fancy, fileName, markdown);

    const target = join(dirRel, fileName);
    const SAVE = "Yes, save it";
    for (;;) {
      const action = await p.choice(`Save this ${short}?`, [SAVE, "No, discard it"] as const, 0, {
        dialog: { title: `Save ${short} #${number}?`, details: [`→ ${target}`] },
      });
      if (action === SAVE) {
        await spinner("Writing", 450);
        const path = saveDocument(dir, fileName, markdown);
        ui.saved(fancy, relative(process.cwd(), path), markdown);
        return 0;
      }
      if (await p.confirm("Really discard? All answers will be lost.", false)) {
        ui.discarded(fancy);
        return 0;
      }
    }
  } catch (err) {
    if (err instanceof AbortedError) {
      ui.interrupted(fancy);
      return 130;
    }
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      console.error(c.error("\nA file with this name already exists – nothing was overwritten."));
      return 1;
    }
    throw err;
  } finally {
    p.close();
  }
}

export function main(cmd: string, fixedKind?: string): void {
  // Output piped into something that closed early (e.g. `| head`): stop quietly.
  process.stdout.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") process.exit(0);
    throw err;
  });
  run(cmd, fixedKind).then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(c.error(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    },
  );
}
