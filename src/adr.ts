export const STATUSES = ["Proposed", "Accepted", "Rejected", "Deprecated", "Superseded"] as const;
export type Status = (typeof STATUSES)[number];

export interface Option {
  name: string;
  description: string;
  pros: string[];
  cons: string[];
}

export interface Adr {
  number: number;
  title: string;
  date: string; // YYYY-MM-DD
  status: Status;
  supersedes?: string;
  deciders: string[];
  context: string;
  drivers: string[];
  options: Option[];
  chosenOption: string;
  justification: string;
  positiveConsequences: string[];
  negativeConsequences: string[];
  links: string[];
}

export function slugify(title: string): string {
  return (
    title
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "decision"
  );
}

export const pad = (n: number) => String(n).padStart(4, "0");

export function fileNameFor(adr: Adr): string {
  return `${pad(adr.number)}-${slugify(adr.title)}.md`;
}

const bullets = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

/** Render the ADR as Markdown (MADR-inspired layout). */
export function renderMarkdown(adr: Adr): string {
  const out: string[] = [];
  out.push(`# ${adr.number}. ${adr.title}`, "");
  out.push(`- **Status:** ${adr.status}${adr.supersedes ? ` (supersedes ${adr.supersedes})` : ""}`);
  out.push(`- **Date:** ${adr.date}`);
  if (adr.deciders.length) out.push(`- **Deciders:** ${adr.deciders.join(", ")}`);
  out.push("");

  out.push("## Context and Problem Statement", "", adr.context, "");

  if (adr.drivers.length) out.push("## Decision Drivers", "", bullets(adr.drivers), "");

  out.push("## Considered Options", "", bullets(adr.options.map((o) => o.name)), "");

  out.push("## Decision Outcome", "");
  out.push(`Chosen option: **${adr.chosenOption}**${adr.justification ? `, because ${lowerFirst(adr.justification)}` : "."}`);
  out.push("");

  if (adr.positiveConsequences.length || adr.negativeConsequences.length) {
    out.push("### Consequences", "");
    for (const p of adr.positiveConsequences) out.push(`- Good: ${p}`);
    for (const n of adr.negativeConsequences) out.push(`- Bad: ${n}`);
    out.push("");
  }

  const detailed = adr.options.filter((o) => o.description || o.pros.length || o.cons.length);
  if (detailed.length) {
    out.push("## Pros and Cons of the Options", "");
    for (const o of detailed) {
      out.push(`### ${o.name}${o.name === adr.chosenOption ? " (chosen)" : ""}`, "");
      if (o.description) out.push(o.description, "");
      for (const p of o.pros) out.push(`- Good: ${p}`);
      for (const c of o.cons) out.push(`- Bad: ${c}`);
      if (o.pros.length || o.cons.length) out.push("");
    }
  }

  if (adr.links.length) out.push("## More Information", "", bullets(adr.links), "");

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function lowerFirst(s: string): string {
  const t = s.trim().replace(/\.?$/, ".");
  // Keep acronyms / proper nouns ("API", "PostgreSQL") as they are.
  if (/^[A-Z][a-z]/.test(t) && !/^[A-Z][a-z]*[A-Z]/.test(t.split(/\s/)[0])) return t[0].toLowerCase() + t.slice(1);
  return t;
}
