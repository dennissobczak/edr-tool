import { fileNameFor, renderMarkdown } from "./adr.js";
import { interviewAdr } from "./adr-interview.js";
import type { Prompter } from "./prompter.js";
import { renderRfc, rfcFileName } from "./rfc.js";
import { interviewRfc } from "./rfc-interview.js";

/** The result of an interview, ready to preview and save. */
export interface Draft {
  fileName: string;
  markdown: string;
}

/** Everything the CLI needs to know about one type of document. */
export interface DocumentKind {
  id: string;
  label: string;
  /** Directories searched (in order) for an existing folder; the first is the default. */
  dirs: string[];
  interview(p: Prompter, number: number): Promise<Draft>;
}

export const KINDS: DocumentKind[] = [
  {
    id: "adr",
    label: "ADR – Architectural Decision Record",
    dirs: ["docs/adr", "doc/adr", "docs/decisions", "adr"],
    async interview(p, number) {
      const adr = await interviewAdr(p, number);
      return { fileName: fileNameFor(adr), markdown: renderMarkdown(adr) };
    },
  },
  {
    id: "rfc",
    label: "RFC – Request for Comments",
    dirs: ["docs/rfc", "doc/rfc", "docs/rfcs", "rfcs", "rfc"],
    async interview(p, number) {
      const rfc = await interviewRfc(p, number);
      return { fileName: rfcFileName(rfc), markdown: renderRfc(rfc) };
    },
  },
];

export function findKind(id: string): DocumentKind | undefined {
  return KINDS.find((k) => k.id === id.toLowerCase());
}
