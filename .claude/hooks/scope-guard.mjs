// PreToolUse guard: keeps each WalFlow subagent's file writes inside its own folders.
// The main session (no agent_type) and unlisted agents are not restricted.
import path from "node:path";

const SCOPES = {
  "walflow-test-author": [
    /^backend\/tests\//,
    /^frontend\/src\/test\//,
    /^frontend\/src\/.*\.test\.jsx?$/,
  ],
  "walflow-frontend-dev": [
    /^frontend\/src\/(?!test\/)(?!.*\.test\.jsx?$)/,
    /^frontend\/public\//,
  ],
  // Read-only agents: no writes anywhere.
  "walflow-scout": [],
  "walflow-gate-runner": [],
  "walflow-physics-reviewer": [],
};

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const input = JSON.parse(raw || "{}");

const allowed = SCOPES[input.agent_type];
if (!allowed) process.exit(0);

const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? "";
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const rel = path.relative(root, path.resolve(root, target)).split(path.sep).join("/");

if (!rel.startsWith("..") && allowed.some((re) => re.test(rel))) process.exit(0);

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason:
      `${input.agent_type} may not write ${rel || target}. ` +
      "Report the needed change to the orchestrator instead.",
  },
}));
