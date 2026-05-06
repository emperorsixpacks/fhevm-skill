# fhevm-setup

CLI tool to install the [FHEVM skill](../SKILL.md) for AI coding agents in any workspace.

## Usage

```bash
npx fhevm-setup install [options]
```

### Options

| Flag | Default | Description |
|---|---|---|
| `-a, --agent <agent>` | `all` | Agent to target: `kiro`, `cursor`, `windsurf`, `copilot`, `claude`, or `all` |
| `-w, --workspace <path>` | `cwd` | Path to the target workspace |
| `--scaffold` | — | Also copy the Hardhat project template into `fhevm-project/` |

## Examples

Install for all agents in the current directory:
```bash
npx fhevm-setup install
```

Install only for Kiro in a specific project:
```bash
npx fhevm-setup install --agent kiro --workspace ~/projects/my-dapp
```

Install for Cursor + scaffold a Hardhat project:
```bash
npx fhevm-setup install --agent cursor --scaffold
```

## What each agent gets

| Agent | File written |
|---|---|
| Kiro | `.kiro/skills/fhevm/` (full skill directory) |
| Cursor | `.cursorrules` |
| Windsurf | `.windsurfrules` (appended) |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Claude | Instructions printed to stdout for manual paste |

## Development

```bash
cd cli
npm install
npm run build
node dist/index.js install --help
```
