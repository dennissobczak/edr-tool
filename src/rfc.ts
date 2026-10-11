import { pad, slugify } from "./adr.js";

export const RFC_STATUSES = ["Draft", "In Review", "Accepted", "Rejected", "Withdrawn", "Implemented"] as const;
export type RfcStatus = (typeof RFC_STATUSES)[number];

export interface Alternative {
  name: string;
  description: string;
  whyNot: string;
}

export interface Rfc {
  number: number;
  title: string;
  status: RfcStatus;
  authors: string[];
  reviewers: string[];
  created: string; // YYYY-MM-DD
  feedbackDeadline: string; // YYYY-MM-DD or ""
  summary: string;
  motivation: string;
  goals: string[];
  nonGoals: string[];
  design: string;
  alternatives: Alternative[];
  drawbacks: string[];
  rollout: string;
  openQuestions: string[];
  references: string[];
}

export function rfcFileName(rfc: Rfc): string {
  return `${pad(rfc.number)}-${slugify(rfc.title)}.md`;
}

const bullets = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

/** Push Markdown headings in free text below the enclosing "##" section (code blocks untouched). */
function nestHeadings(text: string): string {
  let inCode = false;
  return text
    .split("\n")
    .map((l) => {
      if (l.trimStart().startsWith("```")) inCode = !inCode;
      return !inCode && /^#{1,4} /.test(l) ? "##" + l : l;
    })
    .join("\n");
}

/** Render the RFC as Markdown. Empty optional sections are left out. */
export function renderRfc(rfc: Rfc): string {
  const out: string[] = [];
  out.push(`# RFC ${pad(rfc.number)}: ${rfc.title}`, "");
  out.push(`- **Status:** ${rfc.status}`);
  out.push(`- **Author(s):** ${rfc.authors.join(", ")}`);
  if (rfc.reviewers.length) out.push(`- **Reviewers:** ${rfc.reviewers.join(", ")}`);
  out.push(`- **Created:** ${rfc.created}`);
  if (rfc.feedbackDeadline) out.push(`- **Feedback deadline:** ${rfc.feedbackDeadline}`);
  out.push("");

  out.push("## Summary", "", rfc.summary, "");
  out.push("## Motivation", "", nestHeadings(rfc.motivation), "");
  if (rfc.goals.length) out.push("## Goals", "", bullets(rfc.goals), "");
  if (rfc.nonGoals.length) out.push("## Non-Goals", "", bullets(rfc.nonGoals), "");
  out.push("## Proposed Design", "", nestHeadings(rfc.design), "");

  if (rfc.alternatives.length) {
    out.push("## Alternatives Considered", "");
    for (const a of rfc.alternatives) {
      out.push(`### ${a.name}`, "");
      if (a.description) out.push(a.description, "");
      if (a.whyNot) out.push(`**Why not:** ${a.whyNot}`, "");
    }
  }

  if (rfc.drawbacks.length) out.push("## Drawbacks and Risks", "", bullets(rfc.drawbacks), "");
  if (rfc.rollout) out.push("## Rollout and Migration Plan", "", nestHeadings(rfc.rollout), "");
  if (rfc.openQuestions.length) out.push("## Open Questions", "", bullets(rfc.openQuestions), "");
  if (rfc.references.length) out.push("## References", "", bullets(rfc.references), "");

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
