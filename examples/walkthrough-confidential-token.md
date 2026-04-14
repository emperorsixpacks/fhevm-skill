# End-to-End Walkthrough: Confidential ERC-20 Token

> Build an ERC-7984 token where balances and transfer amounts are fully
> encrypted. Nobody can see how much anyone holds or transfers.

---

## What we're building

- **Smart contract**: ERC-7984 token with encrypted balances, confidential
  transfers, plaintext and encrypted minting/burning
- **Tests**: Mint, burn, balance verification using FHE mock mode
- **Key patterns**: Silent transfer failure, ACL for balance visibility,
  OpenZeppelin confidential-contracts integration

---

## Step 1: Project setup

```bash
mkdir confidential-token && cd confidential-token

# Copy templates/package.json, templates/hardhat.config.ts, templates/tsconfig.json
# Then install:
npm install
```

Or from scratch:
```bash
npm init -y
npm install @fhevm/solidity@^0.11.1 @fhevm/mock-utils@^0.4.2 \
  @openzeppelin/contracts@^5.1.0 @openzeppelin/confidential-contracts@^0.1.0 \
  encrypted-types@^0.0.4
npm install -D @fhevm/hardhat-plugin@^0.4.2 hardhat@^2.28.4 \
  @nomicfoundation/hardhat-chai-matchers@^2.1.0 \
  @nomicfoundation/hardhat-ethers@^3.1.3 \
  ts-node@^10.9.2 typescript@^5.9.3 chai@^4.5.0 ethers@^6.16.0
```

---

## Step 2: Understand ERC-7984 vs ERC-20

| Feature        | ERC-20                    | ERC-7984                         |
|----------------|---------------------------|----------------------------------|
| Balance type   | `uint256` (public)        | `euint64` (encrypted)            |
| Transfer       | Reverts on insufficient   | Silent failure (transfers 0)     |
| Approval       | `approve(spender, amount)`| `confidentialApprove(spender, encAmount)` |
| Events         | `Transfer(from, to, amount)` | `Transfer(from, to)` (no amount) |
| Total supply   | Public `uint256`          | Encrypted `euint64`              |

**Key insight**: ERC-7984 transfers use the silent failure pattern — if the
sender doesn't have enough balance, the transfer amount becomes 0 instead of
reverting. This prevents balance information leakage through failed transactions.

---

## Step 3: Write the contract

```solidity
// contracts/ConfidentialERC20.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {FHE, externalEuint64, euint64, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";

contract ConfidentialERC20 is ZamaEthereumConfig, ERC7984, Ownable2Step {

    constructor(
        address owner_,
        uint64 initialSupply,
        string memory name_,
        string memory symbol_,
        string memory contractURI_
    ) ERC7984(name_, symbol_, contractURI_) Ownable(owner_) {
        _mint(owner_, FHE.asEuint64(initialSupply));
    }

    function mint(address to, uint64 amount) external onlyOwner {
        _mint(to, FHE.asEuint64(amount));
    }

    function confidentialMint(
        address to,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external onlyOwner returns (euint64) {
        return _mint(to, FHE.fromExternal(encryptedAmount, inputProof));
    }

    function burn(address from, uint64 amount) external onlyOwner {
        _burn(from, FHE.asEuint64(amount));
    }

    function _update(
        address from,
        address to,
        euint64 amount
    ) internal virtual override returns (euint64 transferred) {
        transferred = super._update(from, to, amount);
        FHE.allow(confidentialTotalSupply(), owner());
    }
}
```

### Design decisions explained:

**Why `Ownable2Step` instead of `Ownable`?**
Two-step ownership transfer prevents accidental ownership loss. The new owner
must explicitly accept. Critical for a token contract.

**Why override `_update`?**
The base ERC7984 handles all the encrypted balance logic. We override `_update`
only to grant the owner permission to decrypt the total supply — a common
need for token issuers.

**Where is the transfer logic?**
It's in the ERC7984 base contract from OpenZeppelin. The base provides:
- `confidentialTransfer(to, encAmount, proof)` — encrypted transfer
- `confidentialApprove(spender, encAmount, proof)` — encrypted approval
- `confidentialTransferFrom(from, to, encAmount, proof)` — delegated transfer
- `confidentialBalanceOf(address)` — returns encrypted balance handle

---

## Step 4: Write tests

```typescript
// test/ConfidentialERC20.test.ts
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";

describe("ConfidentialERC20", function () {
  let contract: any;
  let contractAddress: string;
  let owner: any, alice: any, bob: any;

  const SUPPLY = 1_000_000n;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("ConfidentialERC20");
    contract = await factory.deploy(
      owner.address, SUPPLY, "Token", "TKN", "https://example.com"
    );
    await contract.waitForDeployment();
    contractAddress = await contract.getAddress();
  });

  it("owner has initial supply", async function () {
    const handle = await contract.confidentialBalanceOf(owner.address);
    const balance = await fhevm.userDecryptEuint(
      FhevmType.euint64, handle, contractAddress, owner,
    );
    expect(balance).to.equal(SUPPLY);
  });

  it("plaintext mint", async function () {
    await (await contract.mint(alice.address, 500n)).wait();
    const handle = await contract.confidentialBalanceOf(alice.address);
    const balance = await fhevm.userDecryptEuint(
      FhevmType.euint64, handle, contractAddress, alice,
    );
    expect(balance).to.equal(500n);
  });

  it("encrypted mint", async function () {
    const enc = await fhevm
      .createEncryptedInput(contractAddress, owner.address)
      .add64(1000n).encrypt();
    await (
      await contract.confidentialMint(alice.address, enc.handles[0], enc.inputProof)
    ).wait();

    const handle = await contract.confidentialBalanceOf(alice.address);
    const balance = await fhevm.userDecryptEuint(
      FhevmType.euint64, handle, contractAddress, alice,
    );
    expect(balance).to.equal(1000n);
  });

  it("non-owner cannot mint", async function () {
    await expect(contract.connect(alice).mint(alice.address, 100n)).to.be.reverted;
  });
});
```

---

## Step 5: Deploy and verify

```bash
npx hardhat compile
npx hardhat test

# Deploy to Sepolia
npx hardhat vars set MNEMONIC "your mnemonic here"
npx hardhat vars set INFURA_API_KEY "your_key"
npx hardhat deploy --network sepolia
```

---

## What the skill prevented

Without the FHEVM skill, an agent would:

1. Use `balanceOf` returning `uint256` — **wrong, balances are encrypted**
2. Write `require(balance >= amount)` in transfer — **leaks balance info**
3. Forget ACL permissions on balance handles — **users can't see balances**
4. Import from `fhevm` package — **deprecated, won't resolve**
5. Use `TFHE.add` — **library renamed to `FHE`**
6. Miss `ZamaEthereumConfig` inheritance — **FHE operations fail at runtime**
