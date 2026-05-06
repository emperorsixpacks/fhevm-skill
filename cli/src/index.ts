#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import * as path from "path";
import * as fs from "fs-extra";
import { installSkill } from "./install";
import { scaffoldTemplate } from "./scaffold";

const AGENTS = ["kiro", "cursor", "windsurf", "copilot", "claude"] as const;
type Agent = (typeof AGENTS)[number];

const program = new Command();

program
  .name("fhevm-setup")
  .description("Install the FHEVM skill for AI coding agents")
  .version("1.0.0");

program
  .command("install")
  .description("Install the FHEVM skill into a workspace")
  .option(
    "-a, --agent <agent>",
    `Target agent: ${AGENTS.join(", ")} (or "all")`,
    "all"
  )
  .option("-w, --workspace <path>", "Target workspace directory", process.cwd())
  .option("--scaffold", "Also copy the Hardhat project template")
  .action(async (opts) => {
    const workspace = path.resolve(opts.workspace);

    if (!fs.existsSync(workspace)) {
      console.error(pc.red(`Workspace not found: ${workspace}`));
      process.exit(1);
    }

    // Resolve skill source — two levels up from dist/src when installed via npm,
    // or from the repo root when running locally.
    const skillSrc = resolveSkillSrc();

    const agents: Agent[] =
      opts.agent === "all" ? [...AGENTS] : [opts.agent as Agent];

    for (const agent of agents) {
      if (!AGENTS.includes(agent)) {
        console.error(pc.red(`Unknown agent: ${agent}. Choose from: ${AGENTS.join(", ")}`));
        process.exit(1);
      }
      await installSkill(agent, workspace, skillSrc);
    }

    if (opts.scaffold) {
      await scaffoldTemplate(workspace, skillSrc);
    }

    console.log(pc.green("\n✓ Done!"));
  });

program.parse();

function resolveSkillSrc(): string {
  // When published: cli/dist/index.js → go up to repo root
  // Repo layout: SKILL.md lives two dirs above dist/
  const candidates = [
    path.resolve(__dirname, "../../"),   // published: cli/dist → cli → repo root
    path.resolve(__dirname, "../../../"), // fallback
    process.cwd(),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "SKILL.md"))) return c;
  }
  console.error(pc.red("Could not locate SKILL.md. Run from the fhevm-skill repo root."));
  process.exit(1);
}
