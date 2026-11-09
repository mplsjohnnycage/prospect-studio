/**
 * Closed CommandKind union — derived from lifecycle/ machine entry+trigger commands.
 * Do not invent kinds outside this set (AGENTS.md / graph P1).
 */

export const COMMAND_KINDS = [
  "discovery.start",
  "place.upsert",
  "place.normalize",
  "place.merge",
  "score.compute1",
  "enrichment.start",
  "score.compute2",
  "qualify.decide",
  "image.request",
  "approval.decide",
  "image.run",
  "concept.generate",
  "image.complete",
  "concept.select",
  "design.proposePatch",
  "design.commit",
  "build.run",
  "build.complete",
  "qa.evaluate",
  "artifact.approve",
  "handoff.publish",
  "outreach.draft",
  "outreach.approveSend",
  "outreach.send",
  "convert.record",
  "production.request",
  "production.deploy",
] as const;

export type CommandKind = (typeof COMMAND_KINDS)[number];

const KIND_SET = new Set<string>(COMMAND_KINDS);

export function isCommandKind(value: string): value is CommandKind {
  return KIND_SET.has(value);
}

export function parseCommandKind(value: string): CommandKind {
  if (!isCommandKind(value)) {
    throw new Error(`unknown CommandKind: ${value}`);
  }
  return value;
}

/** UI / legacy verbs — aliases only; never a second authority vocabulary. */
export const LEGACY_COMMAND_ALIASES = {
  qualify: "qualify.decide",
  extract: "enrichment.start",
  design: "design.proposePatch",
  approve_concept: "concept.select",
  draft_outreach: "outreach.draft",
  approve_outreach: "outreach.approveSend",
  request_publish: "production.request",
  pause: null,
  resume: null,
} as const satisfies Record<string, CommandKind | null>;

export type LegacyCommandVerb = keyof typeof LEGACY_COMMAND_ALIASES;

export function resolveLegacyCommand(verb: string): CommandKind | null {
  if (verb in LEGACY_COMMAND_ALIASES) {
    return LEGACY_COMMAND_ALIASES[verb as LegacyCommandVerb];
  }
  if (isCommandKind(verb)) return verb;
  return null;
}
