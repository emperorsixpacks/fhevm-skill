import * as path from "path";
import * as fs from "fs-extra";
import pc from "picocolors";

export async function scaffoldTemplate(
  workspace: string,
  skillSrc: string
): Promise<void> {
  const src = path.join(skillSrc, "templates");
  if (!fs.existsSync(src)) {
    console.warn(pc.yellow("  [scaffold] templates/ not found — skipping."));
    return;
  }
  const dest = path.join(workspace, "fhevm-project");
  await fs.copy(src, dest, { overwrite: false, errorOnExist: false });
  console.log(pc.cyan(`  [scaffold] Hardhat template → ${path.relative(workspace, dest)}`));
  console.log(pc.dim("  cd fhevm-project && cp .env.example .env && npm install"));
}
