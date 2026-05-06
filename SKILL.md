---
name: fhevm-development
description: >
  Use when building, testing, or deploying confidential smart contracts with
  Zama's FHEVM (Fully Homomorphic Encryption on EVM). Triggers on: FHE,
  FHEVM, encrypted types (euint, ebool, eaddress), fhevmjs, relayer-sdk,
  ERC-7984, confidential tokens/voting/auctions, Zama, homomorphic encryption,
  private smart contracts, encrypted balances, sealed-bid, or any mention of
  on-chain encryption/confidentiality.
---

# FHEVM Development Skill

> Build confidential smart contracts where data stays encrypted on-chain.
> Users see "Build me a private voting contract" — the agent ships working,
> tested, deployable Solidity + frontend code on the first try.

---

## STOP — Read before writing ANY code

### The 15 fatal mistakes agents always make

These are not suggestions. Violating ANY of these produces broken code.

1. **NEVER branch on encrypted values.**
   `if (FHE.gt(a, b))` does NOT work. Encrypted comparisons return `ebool`,
   not `bool`. Use `FHE.select(condition, ifTrue, ifFalse)` ALWAYS.

2. **NEVER use `require()` or `revert()` on encrypted values.**
   `require(FHE.gt(balance, amount))` is impossible — the result is `ebool`.
   Instead, use silent failure: `FHE.select(canTransfer, amount, FHE.asEuint64(0))`.

3. **ALWAYS call `FHE.allowThis()` after EVERY operation that produces a new ciphertext.**
   `FHE.add`, `FHE.sub`, `FHE.select`, etc. all return NEW handles.
   Without `FHE.allowThis(result)`, the contract cannot read its own state
   on the next transaction. This fails SILENTLY.

4. **ALWAYS call `FHE.allow(handle, userAddress)` for any user who needs to decrypt.**
   Without this, the user's decrypt call fails silently. No error, just no data.

5. **NEVER mix encrypted and plaintext with raw operators for comparisons.**
   `encrypted > 5` does not compile. Arithmetic operators (`+`, `-`, `*`) DO
   work on euint8-128 via overloads, but comparison operators DO NOT.
   Always use `FHE.gt()`, `FHE.eq()`, etc. for comparisons.
   For clarity, prefer `FHE.add(a, b)` syntax over `a + b` in all FHE code.

6. **NEVER use the old `TFHE` library or `fhevm` npm package.**
   The library is `FHE` (from `@fhevm/solidity/lib/FHE.sol`).
   The old `TFHE` from `fhevm/lib/TFHE.sol` is DEPRECATED.
   The old `fhevmjs` npm package is DEPRECATED — use `@zama-fhe/relayer-sdk`.

7. **NEVER forget input proofs.**
   Encrypted inputs arrive as `(externalEuint32 input, bytes calldata inputProof)`.
   Convert with `FHE.fromExternal(input, inputProof)`. Missing the proof = revert.

8. **NEVER use `FHE.div()` or `FHE.rem()` with encrypted divisors.**
   Only plaintext divisors are supported. `FHE.div(encrypted, encrypted)` won't compile.

9. **NEVER loop over encrypted arrays with unbounded length.**
   FHE operations cost 100-1000x more gas than normal ops. A loop over 100
   encrypted values can exceed block gas limits. Design for O(1) encrypted ops.

10. **NEVER return encrypted handles from `view` functions expecting users to read them directly.**
    A `view` returning `euint32` gives a handle (bytes32), not a value. Users must
    go through the decrypt flow (EIP-712 signature → relayer) to get cleartext.

11. **NEVER expose decryption without access control.**
    If anyone can call a function that triggers decryption of a user's balance,
    that balance is no longer confidential. Always check `msg.sender` permissions.

12. **ALWAYS inherit `ZamaEthereumConfig` (or the appropriate network config).**
    Without it, the contract doesn't know where the FHE coprocessor lives.
    ```solidity
    import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
    contract MyContract is ZamaEthereumConfig { ... }
    ```

13. **NEVER use `euint256` for arithmetic.**
    `euint256` only supports bitwise, eq, ne, select, and rand. No add/sub/mul.
    `eaddress` only supports eq, ne, select. Use the smallest type that fits.

14. **NEVER use `FHE.requestDecryption()` — it was removed in v0.9.**
    The old oracle/GatewayCaller pattern is gone. Decryption is now done via
    the relayer SDK (`instance.publicDecrypt()` or `instance.userDecrypt()`).
    On-chain, use `FHE.makePubliclyDecryptable()` + `FHE.checkSignatures()`.

15. **NEVER use non-power-of-2 bounds for random.**
    `FHE.randEuint8(100)` is WRONG. Use `FHE.randEuint8(128)` — bounds
    MUST be powers of 2. Random also ONLY works in state-changing functions
    (not `view`/`pure`).

---

## How this skill works

This skill uses **progressive disclosure** to stay within context limits.
The main file (what you're reading now) contains:
- Anti-patterns (above) — always loaded
- Decision tree — routes to the right reference
- Minimal syntax cheatsheet — covers 80% of use cases
- Templates — copy-paste starting points

Deep reference lives in separate files. **Only load what you need:**

| Building...                        | Load these references                                    |
|------------------------------------|----------------------------------------------------------|
| Any contract                       | `references/encrypted-types.md`, `references/anti-patterns.md` |
| Contract with user input           | + `references/input-proofs.md`                           |
| Contract with user-visible output  | + `references/decryption-user.md`                        |
| Contract with public reveals       | + `references/decryption-public.md`                      |
| Access-controlled state            | + `references/access-control.md`                         |
| ERC-7984 / confidential token      | + `references/erc7984.md`                                |
| Privacy-sensitive design           | + `references/privacy-patterns.md`                       |
| Frontend / dApp                    | + `references/frontend-fhevmjs.md`                       |
| Tests                              | + `references/testing.md`                                |
| Deploying to Sepolia / mainnet     | + `references/deployment.md`                             |
| Understanding FHE concepts         | + `references/architecture.md`                           |
| Debugging / errors                 | + `references/troubleshooting.md`                        |

---

## FHE gas costs — always keep in mind

Every FHE operation costs 50,000–300,000 gas. A function with 5 FHE ops
costs ~500K–1M gas. Design for the minimum number of encrypted operations:
- Prefer scalar overloads: `FHE.add(enc, 5)` over `FHE.add(enc, FHE.asEuint32(5))`
- Never loop over encrypted values — design for O(1) FHE ops per transaction
- Batch plaintext logic; only encrypt what must stay private

---

## Common errors → fixes (quick reference)

| Error / Symptom | Cause | Fix |
|---|---|---|
| `ebool is not implicitly convertible to bool` | `if`/`require` on encrypted value | Use `FHE.select()` |
| `Operator + not compatible with euint256` | `euint256` has no arithmetic | Use `euint128` or smaller |
| `Identifier not found: TFHE` | Deprecated library | Replace with `FHE`, update import |
| `externalEuint64 not convertible to euint64` | Missing `fromExternal` | `FHE.fromExternal(input, proof)` |
| Contract reverts on 2nd call to same state | Missing `FHE.allowThis()` | Add after every new ciphertext |
| User decrypt returns empty/null | Missing `FHE.allow(handle, user)` | Add after every state update |
| Cross-contract encrypted call fails | Missing `allowTransient` | `FHE.allowTransient(handle, targetContract)` |
| Transaction reverts, no message | Wrong contract address in proof | Re-encrypt with correct `contractAddress` |
| `evmVersion` compile error | Wrong EVM target | Set `evmVersion: "cancun"` in hardhat config |
| FHE ops fail on deploy, not locally | Missing `ZamaEthereumConfig` | Inherit it in every contract |
| WASM load failure in browser | Missing COOP/COEP headers | Add headers in `vite.config.ts` |
| `randEuintX(N)` wrong results | N is not a power of 2 | Use 2, 4, 8, 16, 32, 64, 128, 256... |

> Full details with code examples: `references/troubleshooting.md`

---

## Note for Claude / API agents (no file access)

If you are an agent that only received `SKILL.md` (no access to `references/`),
the cheatsheet and anti-patterns above cover 80% of use cases. For the remaining
20%, the key rules are:
- **ACL**: `FHE.allowThis()` after every new ciphertext; `FHE.allow(h, user)` for every user
- **Inputs**: always `externalEuintXX` + `bytes calldata inputProof` + `FHE.fromExternal()`
- **Branching**: always `FHE.select(ebool, a, b)` — never `if`/`require` on encrypted values
- **Decryption**: user decryption is off-chain via EIP-712 + relayer SDK; public decryption uses `makePubliclyDecryptable()` + `checkSignatures()` callback

---

## Detect user context

Before generating code, determine the user's situation:

**New to FHE / non-technical?**
→ Start with `references/architecture.md` to explain concepts.
→ Use the simplest template (`templates/contracts/ConfidentialCounter.sol`).
→ Explain every FHE-specific line with inline comments.

**Solidity developer, new to FHEVM?**
→ Skip basics. Focus on: encrypted types differ from normal types,
  ACL permissions are mandatory, branching uses `FHE.select`.
→ Point them to a template closest to their goal.

**Experienced FHEVM developer?**
→ Skip explanations. Generate clean code, trust they know the model.

**Just wants a working project?**
→ Use the scaffolding commands below, then modify the contract.

---

## Scaffold a new project from scratch

Run these commands to create a fully configured FHEVM project:

```bash
mkdir my-fhevm-project && cd my-fhevm-project

# Copy the templates directory structure
mkdir -p contracts test deploy frontend

# Initialize and install (versions are pinned — do not change)
npm init -y
npm install @fhevm/solidity@^0.11.1 @fhevm/mock-utils@^0.4.2 \
  @openzeppelin/contracts@^5.1.0 @openzeppelin/confidential-contracts@^0.4.0 \
  @zama-fhe/relayer-sdk@^0.4.1 fhevm-contracts@^0.2.4 \
  encrypted-types@^0.0.4
npm install -D @fhevm/hardhat-plugin@^0.4.2 hardhat@^2.28.4 \
  @nomicfoundation/hardhat-chai-matchers@^2.1.0 \
  @nomicfoundation/hardhat-ethers@^3.1.3 \
  @nomicfoundation/hardhat-verify@^2.1.3 \
  @typechain/ethers-v6@^0.5.1 @typechain/hardhat@^9.1.0 \
  chai@^4.5.0 ethers@^6.16.0 \
  hardhat-deploy@^0.11.45 ts-node@^10.9.2 typechain@^8.3.2 \
  typescript@^5.9.3
```

Then copy these template files into the project:
1. `templates/hardhat.config.ts` → `hardhat.config.ts`
2. `templates/tsconfig.json` → `tsconfig.json`
3. `templates/.env.example` → `.env.example`
4. Pick a contract template → `contracts/`
5. Pick the matching test template → `test/`

Verify setup:
```bash
npx hardhat compile    # Should compile with 0 errors
npx hardhat test       # Should pass all tests in mock mode
```

---

## Version matrix (pinned — do not deviate)

| Package                          | Version    | Purpose                          |
|----------------------------------|------------|----------------------------------|
| `@fhevm/solidity`                | `^0.11.1`  | Solidity FHE library             |
| `@fhevm/hardhat-plugin`          | `^0.4.2`   | Hardhat integration + mock mode  |
| `@fhevm/mock-utils`              | `^0.4.2`   | Mock FHE for local testing       |
| `@zama-fhe/relayer-sdk`          | `^0.4.1`   | Frontend SDK (encrypt/decrypt)   |
| `fhevm-contracts`                | `^0.2.4`   | Pre-built contracts (ERC-7984)   |
| `encrypted-types`                | `^0.0.4`   | TypeScript types                 |
| Solidity compiler                | `0.8.27`   | Required version                 |
| EVM version                      | `cancun`   | Required EVM target              |
| Hardhat                          | `^2.28.4`  | Build framework                  |
| Node.js                          | `>=20`     | Even-numbered versions ONLY      |

**DEPRECATED packages (NEVER use):**
- `fhevm` → replaced by `@fhevm/solidity`
- `fhevmjs` → replaced by `@zama-fhe/relayer-sdk`
- `TFHE` library → replaced by `FHE` library

---

## Quick-reference cheatsheet

### Imports
```solidity
pragma solidity ^0.8.27;

import {FHE, euint8, euint16, euint32, euint64, euint128, euint256,
        ebool, eaddress,
        externalEuint8, externalEuint16, externalEuint32, externalEuint64,
        externalEuint128, externalEuint256, externalEbool, externalEaddress
} from "@fhevm/solidity/lib/FHE.sol";

import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
```

### Encrypted types
`ebool`, `euint8`, `euint16`, `euint32`, `euint64`, `euint128`, `euint256`, `eaddress`

### Convert plaintext → encrypted
```solidity
euint32 encrypted = FHE.asEuint32(42);
ebool flag = FHE.asEbool(true);
```

### Accept encrypted user input
```solidity
function deposit(externalEuint64 amount, bytes calldata proof) external {
    euint64 encAmount = FHE.fromExternal(amount, proof);
    // ... use encAmount
}
```

### Arithmetic (encrypted ↔ encrypted)
```solidity
euint32 sum  = FHE.add(a, b);
euint32 diff = FHE.sub(a, b);
euint32 prod = FHE.mul(a, b);
euint32 mn   = FHE.min(a, b);
euint32 mx   = FHE.max(a, b);
euint32 neg  = FHE.neg(a);
```

### Comparison → ebool (NEVER use in `if` or `require`)
```solidity
ebool isGreater = FHE.gt(a, b);
ebool isEqual   = FHE.eq(a, b);
ebool isLess    = FHE.lt(a, b);
// Also: FHE.ge, FHE.le, FHE.ne
```

### Conditional (replaces if/else)
```solidity
euint32 result = FHE.select(condition, valueIfTrue, valueIfFalse);
```

### Bitwise
```solidity
FHE.and(a, b)  FHE.or(a, b)  FHE.xor(a, b)  FHE.not(a)
FHE.shl(a, b)  FHE.shr(a, b) FHE.rotl(a, b)  FHE.rotr(a, b)
```

### Random values
```solidity
euint8  r8  = FHE.randEuint8();
euint16 r16 = FHE.randEuint16();
euint32 r32 = FHE.randEuint32();
euint64 r64 = FHE.randEuint64();
```

### ACL — MANDATORY after every new ciphertext
```solidity
FHE.allowThis(newHandle);                  // Contract can use it next tx
FHE.allow(newHandle, msg.sender);          // User can decrypt it
FHE.allowTransient(newHandle, address);    // Access for this tx only
FHE.makePubliclyDecryptable(newHandle);    // Anyone can decrypt

// Fluent syntax:
newHandle.allowThis().allow(msg.sender);

// Check permissions:
bool ok = FHE.isSenderAllowed(handle);
```

### The complete pattern for any state-modifying operation
```solidity
function doSomething(externalEuint32 input, bytes calldata proof) external {
    euint32 encInput = FHE.fromExternal(input, proof);    // 1. Convert input
    euint32 result = FHE.add(_state, encInput);            // 2. Compute
    _state = result;                                       // 3. Store
    FHE.allowThis(_state);                                 // 4. Allow contract
    FHE.allow(_state, msg.sender);                         // 5. Allow user
}
```

---

## Templates

Ready-to-use project files. Copy the entire `templates/` directory to start a project.

| Template                                       | What it demonstrates                           |
|------------------------------------------------|------------------------------------------------|
| `templates/hardhat.config.ts`                  | Full Hardhat config with FHEVM plugin           |
| `templates/package.json`                       | All dependencies, pinned                        |
| `templates/tsconfig.json`                      | TypeScript config for Hardhat projects          |
| `templates/.env.example`                       | Required environment variables                  |
| `templates/contracts/ConfidentialCounter.sol`  | Simplest FHE contract — start here             |
| `templates/contracts/ConfidentialERC20.sol`    | ERC-7984 confidential token                     |
| `templates/contracts/ConfidentialVoting.sol`   | Private votes, public tally                     |
| `templates/contracts/SealedBidAuction.sol`     | Sealed bids with encrypted comparisons          |
| `templates/contracts/ConfidentialInvoice.sol`  | Invoice/payment with commitment scheme + escrow |
| `templates/test/ConfidentialCounter.test.ts`   | Test with encrypted inputs + decryption         |
| `templates/test/ConfidentialVoting.test.ts`    | Voting lifecycle tests                          |
| `templates/test/ConfidentialERC20.test.ts`     | Token mint/burn/balance tests                   |
| `templates/test/ConfidentialInvoice.test.ts`   | Invoice creation, payment, claiming tests       |
| `templates/deploy/01_deploy.ts`               | Deploy script pattern                           |
| `templates/frontend/encrypt-input.ts`         | Client-side encryption                          |
| `templates/frontend/user-decrypt.ts`          | User decryption (EIP-712)                       |

### Walkthroughs (examples/)

| Example                                       | Complexity | Patterns covered                               |
|-----------------------------------------------|------------|-------------------------------------------------|
| `examples/walkthrough-voting-app.md`          | Beginner   | FHE.select, ACL, public decryption             |
| `examples/walkthrough-confidential-token.md`  | Moderate   | ERC-7984, silent failure, OZ integration        |
| `examples/walkthrough-invoice-system.md`      | Advanced   | Commitment scheme, receipts, multi-input, escrow|
| `examples/benchmark-prompts.md`               | Evaluation | 7 test prompts with scoring criteria            |

---

## When the user says "explain FHE" or is confused

Load `references/architecture.md` and use this mental model:

> **FHE in one sentence**: Math on encrypted data without ever decrypting it.
>
> Normal blockchain: everyone sees your balance (public `uint256`).
> FHEVM blockchain: your balance is encrypted (`euint64`). The chain can
> add/subtract/compare it WITHOUT seeing the actual number. Only you
> (with your key) can decrypt and see the result.
>
> Think of it like a locked safe that can do math inside itself.

---

## Output quality checklist

Before presenting ANY generated code, verify:

- [ ] Every contract inherits `ZamaEthereumConfig`
- [ ] Import uses `@fhevm/solidity/lib/FHE.sol`, NOT `fhevm/lib/TFHE.sol`
- [ ] Library calls use `FHE.xxx()`, NOT `TFHE.xxx()`
- [ ] No `if` / `require` / `revert` on encrypted values
- [ ] Every new ciphertext has `FHE.allowThis()` called
- [ ] Every user-facing ciphertext has `FHE.allow(handle, user)`
- [ ] Encrypted inputs use `externalEuintXX` + `bytes calldata proof`
- [ ] `FHE.fromExternal(input, proof)` converts inputs (not `FHE.asEuintXX`)
- [ ] `FHE.div` / `FHE.rem` only used with plaintext divisors
- [ ] No unbounded loops over encrypted values
- [ ] Solidity version is `^0.8.27` with `evmVersion: "cancun"`
- [ ] All npm packages match the version matrix above

---

## Preflight validation (run BEFORE writing any code)

This skill was built and verified against specific package versions. Before
generating code for a user, run these checks to detect staleness:

```bash
# Check if pinned versions are still current
npm view @fhevm/solidity version          # Skill expects: 0.11.x
npm view @fhevm/hardhat-plugin version    # Skill expects: 0.4.x
npm view @zama-fhe/relayer-sdk version    # Skill expects: 0.4.x
npm view @openzeppelin/confidential-contracts version  # Skill expects: 0.4.x
```

### If versions match (0.11.x, 0.4.x, 0.4.x, 0.4.x)
→ Proceed normally. The skill is current.

### If a MINOR version bumped (e.g., 0.11.x → 0.12.x)
→ Warn the user:
  "This skill was built for @fhevm/solidity v0.11.1. Version X.Y.Z is now
  available. The code generated will work with v0.11.1 but may not use
  newer features. Check https://docs.zama.ai/fhevm for breaking changes."
→ Still generate code using the pinned versions — they're known-good.

### If a MAJOR version bumped (e.g., 0.x → 1.x)
→ Stop and warn:
  "A major version change was detected for [package]. This skill's patterns
  may no longer be correct. Do not generate code until the skill is updated.
  See the Skill Maintenance section below."

### What to watch for in new versions
These are the areas most likely to break between FHEVM releases:
- **Library renames**: `TFHE` → `FHE` happened once, could happen again
- **Function signature changes**: `fromExternal`, `allowThis`, `checkSignatures`
- **Decryption model changes**: v0.9 removed `requestDecryption` entirely
- **Config inheritance**: `ZamaEthereumConfig` could be renamed or restructured
- **Input proof format**: The `externalEuintXX` + `bytes calldata` pattern
- **ACL functions**: `allow`, `allowThis`, `allowTransient`, `makePubliclyDecryptable`

---

## Skill maintenance guide

When updating this skill for a new FHEVM version, follow this checklist:

### Sources to check
1. **Zama docs**: https://docs.zama.ai/fhevm — check for new/changed APIs
2. **npm changelogs**: `npm view @fhevm/solidity` — check for breaking changes
3. **GitHub releases**: https://github.com/zama-ai/fhevm — release notes
4. **OZ confidential-contracts**: https://github.com/OpenZeppelin/openzeppelin-contracts — changelog

### Update sequence
1. **Version matrix** — Update pinned versions in the table and `templates/package.json`
2. **Anti-patterns** — Check if any of the 15 fatal mistakes are outdated or new ones emerged
3. **Cheatsheet** — Verify import paths, function names, and type names still exist
4. **Templates** — Recompile all 5 contracts with `npx hardhat compile` on new versions
5. **Test templates** — Run `npx hardhat test` to verify tests still pass
6. **References** — Update any reference files that cover changed APIs
7. **Troubleshooting** — Add new error messages from the updated version
8. **Scaffolding** — Update the npm install commands with new versions
9. **Preflight** — Update the expected version numbers in the section above
10. **This section** — Update the source URLs if they've moved

### How to verify the update
```bash
mkdir /tmp/skill-verify && cd /tmp/skill-verify
# Copy updated templates/
npm install
npx hardhat compile   # Must compile with 0 errors
npx hardhat test      # Must pass all tests
rm -rf /tmp/skill-verify
```

If all contracts compile and tests pass, the update is safe to ship.
