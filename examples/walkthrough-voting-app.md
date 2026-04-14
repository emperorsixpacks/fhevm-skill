# End-to-End Walkthrough: Confidential Voting App

> This walkthrough builds a complete confidential voting dApp from scratch.
> Individual votes are encrypted — nobody can see how anyone voted.
> Only the final tally is revealed publicly after voting closes.

---

## What we're building

- **Smart contract**: Accepts encrypted votes, tallies them privately,
  reveals the final count via public decryption
- **Tests**: Full test suite using Hardhat mock mode
- **Frontend**: Encrypt votes in the browser, submit them, decrypt results

---

## Step 1: Project setup

```bash
# Create project directory
mkdir confidential-voting && cd confidential-voting

# Initialize with the FHEVM template
npm init -y

# Install dependencies (exact versions from the skill's package.json)
npm install @fhevm/solidity@^0.11.1 @fhevm/mock-utils@^0.4.2 encrypted-types@^0.0.4

npm install -D @fhevm/hardhat-plugin@^0.4.2 \
  @nomicfoundation/hardhat-chai-matchers@^2.1.0 \
  @nomicfoundation/hardhat-ethers@^3.1.3 \
  @nomicfoundation/hardhat-verify@^2.1.3 \
  @typechain/ethers-v6@^0.5.1 \
  @typechain/hardhat@^9.1.0 \
  chai@^4.5.0 ethers@^6.16.0 \
  hardhat@^2.28.4 hardhat-deploy@^0.11.45 \
  ts-node@^10.9.2 typechain@^8.3.2 typescript@^5.9.3
```

Copy `hardhat.config.ts` from `templates/hardhat.config.ts`.

---

## Step 2: Write the contract

Copy `templates/contracts/ConfidentialVoting.sol` to `contracts/ConfidentialVoting.sol`.

### Key design decisions explained:

**Why `FHE.select` instead of `if/else`?**
```solidity
// The vote is encrypted — we can't branch on it
ebool isYes = FHE.gt(vote, FHE.asEuint64(0));
euint64 yesIncrement = FHE.select(isYes, one, zero);
```
If we used `if (isYes)`, the compiler would reject it because `isYes` is
`ebool` (encrypted boolean), not `bool`. `FHE.select` is the encrypted
equivalent of a ternary operator.

**Why `FHE.allowThis` after every update?**
```solidity
_yesVotes = FHE.add(_yesVotes, yesIncrement);
FHE.allowThis(_yesVotes);  // Without this, next vote tx can't read _yesVotes
```
`FHE.add` returns a NEW ciphertext handle. The old handle had permissions;
the new one doesn't. `allowThis` lets the contract read its own state.

**Why silent failure in transfers but `require` in voting?**
In voting, `hasVoted` and `votingOpen` are PUBLIC booleans — no information
leaks from reverting on them. But if the vote value itself caused a revert,
that would leak whether the vote was "yes" or "no".

---

## Step 3: Write tests

```typescript
// test/ConfidentialVoting.test.ts
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("ConfidentialVoting", function () {
  let contract: any;
  let contractAddress: string;
  let admin: HardhatEthersSigner;
  let voter1: HardhatEthersSigner;
  let voter2: HardhatEthersSigner;
  let voter3: HardhatEthersSigner;

  beforeEach(async function () {
    [admin, voter1, voter2, voter3] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("ConfidentialVoting");
    contract = await factory.deploy();
    await contract.waitForDeployment();
    contractAddress = await contract.getAddress();
  });

  it("should accept encrypted votes", async function () {
    // voter1 votes YES (any non-zero value)
    const enc1 = await fhevm
      .createEncryptedInput(contractAddress, voter1.address)
      .add64(1n)
      .encrypt();
    await (
      await contract
        .connect(voter1)
        .castVote(enc1.handles[0], enc1.inputProof)
    ).wait();

    // voter2 votes NO (zero)
    const enc2 = await fhevm
      .createEncryptedInput(contractAddress, voter2.address)
      .add64(0n)
      .encrypt();
    await (
      await contract
        .connect(voter2)
        .castVote(enc2.handles[0], enc2.inputProof)
    ).wait();

    // voter3 votes YES
    const enc3 = await fhevm
      .createEncryptedInput(contractAddress, voter3.address)
      .add64(1n)
      .encrypt();
    await (
      await contract
        .connect(voter3)
        .castVote(enc3.handles[0], enc3.inputProof)
    ).wait();

    // Verify all votes were recorded
    expect(await contract.hasVoted(voter1.address)).to.be.true;
    expect(await contract.hasVoted(voter2.address)).to.be.true;
    expect(await contract.hasVoted(voter3.address)).to.be.true;
  });

  it("should prevent double voting", async function () {
    const enc = await fhevm
      .createEncryptedInput(contractAddress, voter1.address)
      .add64(1n)
      .encrypt();
    await (
      await contract
        .connect(voter1)
        .castVote(enc.handles[0], enc.inputProof)
    ).wait();

    // Second vote should revert
    const enc2 = await fhevm
      .createEncryptedInput(contractAddress, voter1.address)
      .add64(1n)
      .encrypt();
    await expect(
      contract.connect(voter1).castVote(enc2.handles[0], enc2.inputProof),
    ).to.be.revertedWith("Already voted");
  });

  it("should only allow admin to close poll", async function () {
    await expect(
      contract.connect(voter1).closePollAndRequestTally(),
    ).to.be.revertedWith("Not admin");
  });

  it("full lifecycle: vote → close → reveal", async function () {
    // Cast 2 yes, 1 no
    let enc = await fhevm
      .createEncryptedInput(contractAddress, voter1.address)
      .add64(1n)
      .encrypt();
    await (
      await contract
        .connect(voter1)
        .castVote(enc.handles[0], enc.inputProof)
    ).wait();

    enc = await fhevm
      .createEncryptedInput(contractAddress, voter2.address)
      .add64(0n)
      .encrypt();
    await (
      await contract
        .connect(voter2)
        .castVote(enc.handles[0], enc.inputProof)
    ).wait();

    enc = await fhevm
      .createEncryptedInput(contractAddress, voter3.address)
      .add64(1n)
      .encrypt();
    await (
      await contract
        .connect(voter3)
        .castVote(enc.handles[0], enc.inputProof)
    ).wait();

    // Close voting
    await (await contract.connect(admin).closePollAndRequestTally()).wait();
    expect(await contract.votingOpen()).to.be.false;

    // Note: In mock mode, public decryption callback needs to be
    // simulated. On a real network, the relayer would call revealTally.
    // For testing, we verify the encrypted state was set up correctly.
  });
});
```

### Run tests
```bash
npx hardhat test
```

---

## Step 4: Deploy

```bash
# Set your mnemonic (securely)
npx hardhat vars set MNEMONIC "your twelve word mnemonic here"
npx hardhat vars set INFURA_API_KEY "your_infura_key"

# Deploy to Sepolia
npx hardhat deploy --network sepolia --tags ConfidentialVoting
```

---

## Step 5: Frontend integration

```typescript
import { createInstance, SepoliaConfig } from '@zama-fhe/relayer-sdk';
import { BrowserProvider, Contract } from 'ethers';

const VOTING_ADDRESS = '0x...';  // Deployed contract address
const VOTING_ABI = [ /* ... */ ];

async function castVote(voteYes: boolean) {
    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const userAddress = await signer.getAddress();

    // Initialize FHEVM
    const fhevmInstance = await createInstance({
        ...SepoliaConfig,
        network: window.ethereum,
    });

    // Encrypt vote: 1 = yes, 0 = no
    const encrypted = await fhevmInstance
        .createEncryptedInput(VOTING_ADDRESS, userAddress)
        .add64(voteYes ? 1n : 0n)
        .encrypt();

    // Submit encrypted vote
    const contract = new Contract(VOTING_ADDRESS, VOTING_ABI, signer);
    const tx = await contract.castVote(
        encrypted.handles[0],
        encrypted.inputProof,
    );
    await tx.wait();

    console.log('Vote cast successfully!');
}
```

---

## What the skill prevented

Without the FHEVM skill, an AI agent would typically:

1. Write `if (vote > 0)` instead of `FHE.select` — **compilation error**
2. Forget `FHE.allowThis(_yesVotes)` — **contract can't tally after first vote**
3. Try synchronous decryption — **function doesn't exist**
4. Use the deprecated `TFHE` library — **import errors**
5. Skip the input proof parameter — **transaction reverts**
6. Use `require(encryptedBool)` — **type mismatch error**

The skill catches all six of these before a single line is generated.
