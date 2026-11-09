/** Scoped MCP tool surface that shares UI typed-command dispatch. */

import type { AuthActor } from "../contracts/auth-matrix";
import {
  dispatchTypedCommand,
  type TypedCommandInput,
  type TypedCommandResult,
} from "./command";

export const OPERATOR_MCP_TOOLS = [
  {
    name: "run_typed_command",
    title: "Run typed command",
    description:
      "Dispatch a Prospect Studio CommandKind envelope. Same typed command as the in-app operator UI.",
    scope: "pipeline:write" as const,
    write: true,
  },
  {
    name: "pipeline_summary",
    title: "Pipeline summary",
    description: "Read-only pipeline summary (existing agent tool).",
    scope: "pipeline:read" as const,
    write: false,
  },
] as const;

export type OperatorMcpToolName = (typeof OPERATOR_MCP_TOOLS)[number]["name"];

export function runTypedCommandFromMcp(
  actor: AuthActor,
  input: TypedCommandInput,
  issuedAt?: number,
): TypedCommandResult {
  return dispatchTypedCommand({
    channel: "mcp",
    actor,
    input,
    issuedAt,
  });
}

export function runTypedCommandFromUi(
  actor: AuthActor,
  input: TypedCommandInput,
  issuedAt?: number,
): TypedCommandResult {
  return dispatchTypedCommand({
    channel: "ui",
    actor,
    input,
    issuedAt,
  });
}
