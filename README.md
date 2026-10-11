# edr-tool

Interactive TypeScript CLI that interviews you and writes either an
**Architectural Decision Record (ADR)** or a **Request for Comments (RFC)**.
The finished document is shown in the terminal first; then you decide whether to **save** or **discard** it.

No runtime dependencies — only Node.js (≥ 18.3).

## Install & run

```bash
npm install
npm run build
node dist/cli.js            # asks: ADR or RFC?
node dist/cli.js adr        # start the ADR interview directly
node dist/cli.js rfc        # start the RFC interview directly
node dist/rfc-cli.js        # same as `edr rfc`

npm link                    # optional: installs the `edr` and `rfc` commands globally
npm run dev -- rfc          # run straight from TypeScript via tsx
```

Options:

| Flag               | Meaning |
|--------------------|---------|
| `-d, --dir <path>` | Target directory. ADRs default to an existing `docs/adr`, `doc/adr`, `docs/decisions` or `adr`, else `docs/adr`. RFCs default to an existing `docs/rfc`, `doc/rfc`, `docs/rfcs`, `rfcs` or `rfc`, else `docs/rfc`. |
| `--plain`          | Simple line-based prompts (used automatically when input or output is piped) |
| `--no-anim`        | No spinner or streaming animations |
| `-h, --help`       | Show help |

Environment: `NO_COLOR=1` disables colors, `EDR_NO_ANIM=1` disables animations, `EDR_PLAIN=1` forces plain mode.

## The interactive UI

In a real terminal the tool uses a Claude Code–inspired interface (zero dependencies, raw-mode input):

- Gradient block logo and a framed welcome box
- Questions typed into a rounded input box with placeholder text; long input wraps and scrolls
- Arrow-key menus with a `❯` pointer, number shortcuts (1–9) and first-letter shortcuts
- Answered questions collapse into a compact transcript (`✔ Question` / `⎿ answer`)
- Step progress bar (`▰▰▱▱▱▱ Context  step 2 of 6`)
- Sparkle spinner with shimmering text, then a streamed, syntax-coloured preview with line numbers
- Save/discard as a framed dialog; `⏺ Saved … ⎿ 39 lines · 0.6 KB`
- Ctrl-C asks "Press Ctrl-C again to exit" before quitting

Editing keys: ←/→, Home/End, Ctrl+A/E, Ctrl+U/K (clear before/after cursor), Ctrl+W or Alt+Backspace (delete word),
Alt+←/→ (word jump), ↑/↓ between lines in multi-line fields. Pasting several lines into a list adds one item per line.

Colours use truecolor when available and fall back to 256 or 16 colours.

## The ADR interview (6 steps)

1. **Basics** – title, status (Proposed / Accepted / Rejected / Deprecated / Superseded), date, deciders
2. **Context** – problem statement, decision drivers
3. **Options** – considered options, optionally with description, pros and cons
4. **Decision** – chosen option and justification
5. **Consequences** – positive and negative
6. **References**

Output follows a [MADR](https://adr.github.io/madr/)-style layout.

## The RFC interview (7 steps)

1. **Basics** – title, status (Draft / In Review / Accepted / Rejected / Withdrawn / Implemented), authors, reviewers, created date, optional feedback deadline
2. **Summary** – a few sentences
3. **Motivation** – the problem and who has it, goals, non-goals
4. **Proposed design** – long-form Markdown (paragraphs, headings, code blocks)
5. **Alternatives** – each with a short description and why it isn't the proposal
6. **Risks and rollout** – drawbacks/risks, rollout or migration plan, open questions for reviewers
7. **References**

Empty optional sections are left out of the document. Headings you type inside long-form answers are
nested under the section they belong to (`## Foo` becomes `#### Foo`), so the RFC outline stays intact.

## Input conventions

- Lists and short multi-line answers end with an **empty line** (interactive mode: also **Ctrl+D**).
- Long-form answers (RFC motivation, design, rollout) may contain blank lines and end with **Ctrl+D**
  (interactive) or a line containing only **`.`** (both modes).
- Choices accept a number or a unique prefix; Enter takes the default.
- Ctrl+C aborts without writing anything (twice in interactive mode).

## Preview, then save or discard

- **Save** → `<dir>/NNNN-slugified-title.md`, numbered after the highest existing document of that type. Existing files are never overwritten.
- **Discard** → asks for confirmation, then exits without writing.

## Project layout

```
src/
  cli.ts            `edr` command (optional type argument)
  rfc-cli.ts        `rfc` command (shortcut for `edr rfc`)
  run.ts            shared flow: type selection, preview, save/discard
  kinds.ts          registry of document types (add new ones here)
  adr.ts            ADR model + Markdown rendering
  adr-interview.ts  ADR questions
  rfc.ts            RFC model + Markdown rendering
  rfc-interview.ts  RFC questions
  prompter.ts       Prompter interface + plain line-based prompter (pipes, CI, --plain)
  tty-prompter.ts   interactive prompter: line editor, input boxes, menus, transcript
  term.ts           terminal toolkit: colours, gradient, shimmer, wrapping, boxes, live regions, spinner
  ui.ts             banner, headers, preview, result messages
  store.ts          directory detection, numbering, writing
```

To add another document type, write a model/renderer and an interview, then register it in `kinds.ts`.
