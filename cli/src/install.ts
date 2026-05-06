import * as path from "path";
import * as fs from "fs-extra";
import pc from "picocolors";

type Agent = "kiro" | "cursor" | "windsurf" | "copilot" | "claude";

interface AgentConfig {
  label: string;
  install: (workspace: string, skillSrc: string) => Promise<void>;
}

const agents: Record<Agent, AgentConfig> = {
  kiro: {
    label: "Kiro",
    async install(workspace, skillSrc) {
      const dest = path.join(workspace, ".kiro", "skills", "fhevm");
      await fs.ensureDir(dest);
      await fs.copy(skillSrc, dest, { overwrite: true });
      console.log(pc.cyan(`  [kiro] Copied skill → ${rel(workspace, dest)}`));
    },
  },

  cursor: {
    label: "Cursor",
    async install(workspace, skillSrc) {
      const dest = path.join(workspace, ".cursorrules");
      await fs.copy(path.join(skillSrc, "SKILL.md"), dest, { overwrite: true });
      console.log(pc.cyan(`  [cursor] Wrote → ${rel(workspace, dest)}`));
    },
  },

  windsurf: {
    label: "Windsurf",
    async install(workspace, skillSrc) {
      const dest = path.join(workspace, ".windsurfrules");
      const skill = await fs.readFile(path.join(skillSrc, "SKILL.md"), "utf8");
      await fs.appendFile(dest, `\n${skill}`);
      console.log(pc.cyan(`  [windsurf] Appended → ${rel(workspace, dest)}`));
    },
  },

  copilot: {
    label: "GitHub Copilot",
    async install(workspace, skillSrc) {
      const dest = path.join(workspace, ".github", "copilot-instructions.md");
      await fs.ensureDir(path.dirname(dest));
      await fs.copy(path.join(skillSrc, "SKILL.md"), dest, { overwrite: true });
      console.log(pc.cyan(`  [copilot] Wrote → ${rel(workspace, dest)}`));
    },
  },

  claude: {
    label: "Claude",
    async install(workspace, skillSrc) {
      const skill = await fs.readFile(path.join(skillSrc, "SKILL.md"), "utf8");
      console.log(pc.cyan(`  [claude] Paste the following into your Project Instructions:\n`));
      console.log(pc.dim("─".repeat(60)));
      console.log(skill.slice(0, 300) + "\n  ... (full content in SKILL.md)");
      console.log(pc.dim("─".repeat(60)));
    },
  },
};

export async function installSkill(
  agent: Agent,
  workspace: string,
  skillSrc: string
): Promise<void> {
  const cfg = agents[agent];
  console.log(pc.bold(`Installing for ${cfg.label}...`));
  await cfg.install(workspace, skillSrc);
}

function rel(base: string, full: string): string {
  return path.relative(base, full) || full;
}
