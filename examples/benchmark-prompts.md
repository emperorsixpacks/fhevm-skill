# Benchmark Prompts & Expected Outputs

> Use these prompts to evaluate how well the skill guides an AI agent.
> Each prompt describes what a user might ask, what the agent should
> produce, and what mistakes to look for.

---

## Prompt 1: "Build me a private voting contract"

### What the agent should produce
- A Solidity contract using `euint64` for encrypted vote tallies
- `FHE.select` for vote counting (never `if/else` on encrypted values)
- `FHE.allowThis` on both `_yesVotes` and `_noVotes` after every update
- `FHE.makePubliclyDecryptable` for tally reveal
- Events that don't leak individual vote values
- A full test file with encrypted input creation

### Red flags (skill should prevent these)
- `if (vote > 0)` or `require(vote == 1)` — branching on encrypted values
- Missing `FHE.allowThis` — contract state breaks after first vote
- `import "fhevm/lib/TFHE.sol"` — deprecated import
- `TFHE.add()` — deprecated library name
- No `ZamaEthereumConfig` inheritance
- `function getVotes() view returns (uint64)` — returning decrypted value from view
- Using `fhevmjs` instead of `@zama-fhe/relayer-sdk` in frontend code

### Closest template
`templates/contracts/ConfidentialVoting.sol`

---

## Prompt 2: "Create a confidential ERC-20 token"

### What the agent should produce
- Contract inheriting `ERC7984` from `@openzeppelin/confidential-contracts`
- `ZamaEthereumConfig` inheritance
- Plaintext and encrypted mint functions
- `_update` override for ACL on total supply
- Test file verifying encrypted balances via `fhevm.userDecryptEuint`

### Red flags
- Using `mapping(address => uint256) balances` — not encrypted
- `require(balance >= amount)` in transfer — leaks balance info
- Missing `@openzeppelin/confidential-contracts` dependency
- Not using `confidentialBalanceOf()` — using regular `balanceOf()`
- `Transfer(from, to, amount)` event with plaintext amount
- Using `FHE.requestDecryption()` — removed in v0.9

### Closest template
`templates/contracts/ConfidentialERC20.sol`

---

## Prompt 3: "Build a sealed-bid auction"

### What the agent should produce
- Encrypted bid storage using `euint64`
- `eaddress` for tracking the highest bidder privately
- `FHE.gt` + `FHE.select` for bid comparison (never `if/else`)
- `FHE.makePubliclyDecryptable` for winner reveal
- `FHE.checkSignatures` for decryption proof verification
- Test file with multiple bidders

### Red flags
- `if (bid > highestBid)` — branching on encrypted comparison
- Storing winner as plaintext `address` before reveal — defeats privacy
- Missing `FHE.allowThis` on `_highestBid` and `_highestBidder`
- Using `euint256` for bid amounts with arithmetic — euint256 has no arithmetic
- Forgetting to `FHE.asEaddress(msg.sender)` when updating winner

### Closest template
`templates/contracts/SealedBidAuction.sol`

---

## Prompt 4: "Build a private payroll contract"

### What the agent should produce
- Encrypted salary storage per employee (`mapping(address => euint64)`)
- Owner-only salary setting with encrypted inputs
- Batch or individual payment function
- `FHE.allowThis` and `FHE.allow` for each salary handle
- ACL: only the employee can decrypt their own salary
- Privacy-preserving events (no salary amounts)

### Red flags
- `mapping(address => uint256) salaries` — salaries are public
- `event SalaryPaid(address employee, uint256 amount)` — leaks salary
- Missing ACL for employee decryption access
- `for (uint i = 0; i < employees.length; i++)` with FHE ops — gas bomb
- `require(salary > 0)` — branching on encrypted salary

### Expected structure (no template — agent must synthesize)
```solidity
contract ConfidentialPayroll is ZamaEthereumConfig, Ownable {
    mapping(address => euint64) private _salaries;

    function setSalary(
        address employee,
        externalEuint64 encSalary,
        bytes calldata proof
    ) external onlyOwner {
        _salaries[employee] = FHE.fromExternal(encSalary, proof);
        FHE.allowThis(_salaries[employee]);
        FHE.allow(_salaries[employee], employee);
    }

    function getSalary() external view returns (euint64) {
        return _salaries[msg.sender];
    }
}
```

---

## Prompt 5: "Help me set up a new FHEVM project from scratch"

### What the agent should produce
- Step-by-step shell commands for project initialization
- `package.json` with all pinned dependencies
- `hardhat.config.ts` with FHEVM plugin and cancun EVM
- `tsconfig.json` for TypeScript
- `.env.example` with required variables
- A simple starter contract (ConfidentialCounter)
- Instructions to run `npx hardhat compile` and `npx hardhat test`

### Red flags
- Missing `evmVersion: "cancun"` in hardhat config
- Using `fhevm` package instead of `@fhevm/solidity`
- Missing `@fhevm/hardhat-plugin` import
- Wrong Solidity version (must be `^0.8.24` or higher, recommend `0.8.27`)
- Missing `ZamaEthereumConfig` in starter contract
- Not pinning dependency versions

### Closest template
Entire `templates/` directory

---

## Prompt 6: "Add encrypted inputs to my existing contract"

### What the agent should produce
- Change function signature: add `externalEuintXX` + `bytes calldata inputProof`
- Add `FHE.fromExternal(input, proof)` conversion inside the function
- Add `FHE.allowThis` on any new ciphertext produced
- Add `FHE.allow` for the caller if they need to decrypt results
- Updated test showing `fhevm.createEncryptedInput(contractAddress, userAddress)`
- Frontend snippet showing encryption via relayer SDK

### Red flags
- Using `FHE.asEuint64(plaintext)` instead of `FHE.fromExternal` for user inputs
- Forgetting `inputProof` parameter in function signature
- Encrypting with wrong contract address in test/frontend
- Missing `await tx.wait()` after state-changing call in test
- Using `fhevmjs` instead of `@zama-fhe/relayer-sdk`

### Relevant references
`references/input-proofs.md`, `references/testing.md`

---

## Prompt 7: "Explain FHE to me, I'm new to this"

### What the agent should produce
- The "locked safe that does math" analogy
- Comparison: normal blockchain (public) vs FHEVM (encrypted)
- What stays private vs what's still public (gas, events, control flow)
- Simple example using ConfidentialCounter
- No code generation — just explanations with illustrative snippets

### Red flags
- Jumping straight to code without explanation
- Technical jargon without analogies
- Not mentioning what ISN'T private (gas costs, events, msg.sender)
- Not loading `references/architecture.md`

### Closest reference
`references/architecture.md`

---

## Scoring guide

For each prompt, evaluate:

| Criterion           | Weight | What to check                                    |
|---------------------|--------|--------------------------------------------------|
| **Compiles**        | 30%    | Does the code actually compile with solc 0.8.27? |
| **Correct FHE**     | 25%    | FHE.select not if/else, ACL, input proofs        |
| **No anti-patterns**| 20%    | None of the 15 fatal mistakes present            |
| **Complete**        | 15%    | Tests, deploy script, frontend snippet included  |
| **Clean**           | 10%    | Good naming, comments, structure                 |

**Pass**: Score >= 80% across all prompts
**Fail**: Any prompt scores < 60%, or any fatal anti-pattern present
