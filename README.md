# FHEVM Development Skill

A skill that teaches AI agents to build confidential smart contracts using [Zama's FHEVM](https://docs.zama.ai/fhevm) — where data stays encrypted on-chain.

Works with **Kiro**, **Claude**, **Cursor**, **Windsurf**, **Copilot**, and any agent that supports custom instructions or context files.

---

## What the agent learns

- Write Solidity using the `FHE` library with correct patterns (no silent failures)
- Handle encrypted types: `euint8`–`euint256`, `ebool`, `eaddress`
- Manage access control for encrypted values (`FHE.allow`, `FHE.allowThis`)
- Encrypt inputs from the frontend using `@zama-fhe/relayer-sdk`
- Implement user decryption via EIP-712 signatures
- Deploy and test on local Hardhat and Sepolia testnet
- Build confidential tokens (ERC-7984), voting systems, auctions, and invoicing

---

## Setup by agent

Start by cloning the repo:

```bash
git clone https://github.com/your-org/fhevm-skill
```

Then follow the setup for your agent below.

---

### Kiro

```bash
mkdir -p .kiro/skills
cp -r fhevm-skill .kiro/skills/fhevm
```

Kiro auto-loads all skills in `.kiro/skills/` — no further config needed.

---

### Claude (claude.ai Projects / API system prompt)

Paste the contents of `SKILL.md` into your **Project Instructions** (claude.ai) or as the `system` message in your API calls.

For the API:
```python
with open("fhevm-skill/SKILL.md") as f:
    skill = f.read()

client.messages.create(
    model="claude-opus-4-5",
    system=skill,
    messages=[{"role": "user", "content": "Build me a confidential ERC20 token"}]
)
```

---

### Cursor

```bash
cp fhevm-skill/SKILL.md your-project/.cursorrules
```

Or paste the contents into **Cursor Settings → Rules for AI**.

---

### Windsurf

```bash
cat fhevm-skill/SKILL.md >> your-project/.windsurfrules
```

Windsurf reads `.windsurfrules` automatically for every conversation in that workspace.

---

### GitHub Copilot (VS Code)

```bash
cp fhevm-skill/SKILL.md your-project/.github/copilot-instructions.md
```

Copilot picks this up automatically for the workspace.

---

### Any other agent (generic)

```bash
cat fhevm-skill/SKILL.md  # paste into your agent's system prompt or context
```

Any agent that accepts a system prompt or custom instructions file will work — just inject `SKILL.md` as the context.

---

## Project scaffold

The `templates/` directory is a ready-to-use Hardhat project:

```bash
cp -r templates/ my-fhevm-project
cd my-fhevm-project
cp .env.example .env   # add your private key + RPC URL
npm install
npm run compile
npm test
```

| Command | Description |
|---|---|
| `npm run compile` | Compile contracts |
| `npm test` | Run tests locally |
| `npm run deploy` | Deploy locally |
| `npm run deploy:sepolia` | Deploy to Sepolia testnet |
| `npm run verify` | Verify on Etherscan |

---

## What's included

```
SKILL.md                        # The skill — inject this into your agent
templates/
  contracts/                    # ConfidentialERC20, Voting, Auction, Invoice, Counter
  test/                         # Hardhat tests for each contract
  deploy/                       # Deployment scripts
  frontend/                     # encrypt-input.ts, user-decrypt.ts
  hardhat.config.ts
  package.json
  .env.example
references/                     # Deep-dive docs the agent can reference
  architecture.md
  encrypted-types.md
  fhe-operations.md
  access-control.md
  input-proofs.md
  decryption-user.md
  decryption-public.md
  frontend-fhevmjs.md
  erc7984.md
  testing.md
  deployment.md
  anti-patterns.md
  privacy-patterns.md
  troubleshooting.md
examples/
  walkthrough-confidential-token.md
  walkthrough-voting-app.md
  walkthrough-invoice-system.md
  benchmark-prompts.md
```

## Requirements

- Node.js >= 20
- Sepolia ETH + RPC URL (for testnet deployment)
