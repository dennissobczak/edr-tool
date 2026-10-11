import { STATUSES, type Adr, type Option, type Status } from "./adr.js";
import { today, type Prompter } from "./prompter.js";

const STEPS = 6;

export async function interviewAdr(p: Prompter, number: number): Promise<Adr> {
  p.section(1, STEPS, "Basics");
  const title = await p.text("Title of the decision", { required: true, hint: "e.g. Use PostgreSQL as primary database" });
  const status = await p.choice<Status>("Status", STATUSES, 0);
  const supersedes =
    status === "Superseded" ? (await p.text("Superseded by / related ADR", { hint: "e.g. ADR-0012" })) || undefined : undefined;
  const date = await p.date("Date", { default: today() });
  const deciders = await p.list("Who was involved in the decision?");

  p.section(2, STEPS, "Context");
  const context = await p.multiline("What is the context and problem that motivates this decision?", { required: true });
  const drivers = await p.list("Decision drivers (forces, requirements, constraints)");

  p.section(3, STEPS, "Options");
  const names = await p.list("Which options were considered?", { min: 1 });
  const options: Option[] = names.map((name) => ({ name, description: "", pros: [], cons: [] }));
  if (await p.confirm("Describe pros and cons for each option?", true)) {
    for (const o of options) {
      p.subheading(`Option: ${o.name}`);
      o.description = await p.text("Short description", { hint: "optional" });
      o.pros = await p.list(`Pros of "${o.name}"`);
      o.cons = await p.list(`Cons of "${o.name}"`);
    }
  }

  p.section(4, STEPS, "Decision");
  const chosenOption = options.length === 1 ? options[0].name : await p.choice("Which option was chosen?", names, 0);
  if (options.length === 1) p.note(`Only one option given, chosen: ${chosenOption}`);
  const justification = await p.text("Why was this option chosen?", { required: true });

  p.section(5, STEPS, "Consequences");
  const positiveConsequences = await p.list("Positive consequences");
  const negativeConsequences = await p.list("Negative consequences / trade-offs");

  p.section(6, STEPS, "References");
  const links = await p.list("Links, related ADRs or further information");

  return {
    number,
    title,
    date,
    status,
    supersedes,
    deciders,
    context,
    drivers,
    options,
    chosenOption,
    justification,
    positiveConsequences,
    negativeConsequences,
    links,
  };
}
