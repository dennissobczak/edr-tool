import { today, type Prompter } from "./prompter.js";
import { RFC_STATUSES, type Alternative, type Rfc, type RfcStatus } from "./rfc.js";

const STEPS = 7;

export async function interviewRfc(p: Prompter, number: number): Promise<Rfc> {
  p.section(1, STEPS, "Basics");
  const title = await p.text("Title of the proposal", { required: true, hint: "e.g. Introduce an event bus for order processing" });
  const status = await p.choice<RfcStatus>("Status", RFC_STATUSES, 0);
  const authors = await p.list("Author(s)", { min: 1 });
  const reviewers = await p.list("Reviewers / stakeholders whose feedback is needed");
  const created = await p.date("Created on", { default: today() });
  const feedbackDeadline = await p.date("Feedback deadline (optional)");

  p.section(2, STEPS, "Summary");
  const summary = await p.multiline("Summarize the proposal in a few sentences", { required: true });

  p.section(3, STEPS, "Motivation");
  const motivation = await p.multiline("Why is this needed? What problem does it solve, and for whom?", { required: true, long: true });
  const goals = await p.list("Goals (what must be achieved)");
  const nonGoals = await p.list("Non-goals (what is explicitly out of scope)");

  p.section(4, STEPS, "Proposed design");
  const design = await p.multiline("Describe the proposed solution in detail (Markdown allowed)", { required: true, long: true });

  p.section(5, STEPS, "Alternatives");
  const names = await p.list("Which alternatives were considered?");
  const alternatives: Alternative[] = [];
  for (const name of names) {
    p.subheading(`Alternative: ${name}`);
    const description = await p.text("Short description", { hint: "optional" });
    const whyNot = await p.text("Why is it not the proposed solution?");
    alternatives.push({ name, description, whyNot });
  }

  p.section(6, STEPS, "Risks and rollout");
  const drawbacks = await p.list("Drawbacks and risks");
  const rollout = await p.multiline("Rollout / migration plan (optional)", { long: true });
  const openQuestions = await p.list("Open questions for reviewers");

  p.section(7, STEPS, "References");
  const references = await p.list("Links, related RFCs/ADRs, prior art");

  return {
    number,
    title,
    status,
    authors,
    reviewers,
    created,
    feedbackDeadline,
    summary,
    motivation,
    goals,
    nonGoals,
    design,
    alternatives,
    drawbacks,
    rollout,
    openQuestions,
    references,
  };
}
