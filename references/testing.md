# Testing Reference

> Load when writing tests for FHEVM contracts.

---

## Two testing modes

| Mode               | Command                                | FHE operations     | Speed    | Decryption        |
|--------------------|----------------------------------------|--------------------|----------|-------------------|
| **Mock (local)**   | `npx hardhat test`                     | Simulated (fast)   | Seconds  | Synchronous       |
| **Real (Sepolia)** | `npx hardhat test --network sepolia`   | Actual FHE         | Minutes  | Async (real flow) |

**Always develop and test in mock mode first.** Only test on Sepolia for
final integration validation.

---

## Project setup for testing

### hardhat.config.ts
```typescript
import "@fhevm/hardhat-plugin";        // This enables mock mode on hardhat network
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
// ... rest of config
```

The `@fhevm/hardhat-plugin` automatically sets up FHE mock mode when
`network === "hardhat"`.

---

## Encrypting inputs in tests

```typescript
import { fhevm } from "hardhat";

// Create encrypted input bound to contract + signer
const encrypted = await fhevm
    .createEncryptedInput(contractAddress, signerAddress)
    .add32(100)          // euint32
    .encrypt();

// Use in transaction
await contract.myFunction(
    encrypted.handles[0],      // externalEuint32
    encrypted.inputProof,      // bytes proof
);
```

### Multiple inputs
```typescript
const encrypted = await fhevm
    .createEncryptedInput(contractAddress, signerAddress)
    .add64(1000n)              // handles[0]
    .addBool(true)             // handles[1]
    .encrypt();

await contract.bidAndFlag(
    encrypted.handles[0],      // externalEuint64
    encrypted.handles[1],      // externalEbool
    encrypted.inputProof,
);
```

### Available methods
| Method            | Type        | Input      |
|-------------------|-------------|------------|
| `.addBool(val)`   | ebool       | `boolean`  |
| `.add8(val)`      | euint8      | `number`   |
| `.add16(val)`     | euint16     | `number`   |
| `.add32(val)`     | euint32     | `number`   |
| `.add64(val)`     | euint64     | `bigint`   |
| `.add128(val)`    | euint128    | `bigint`   |
| `.add256(val)`    | euint256    | `bigint`   |
| `.addAddress(val)`| eaddress    | `string`   |

---

## Decrypting results in tests

```typescript
import { FhevmType } from "@fhevm/hardhat-plugin";

// Get the encrypted handle from the contract
const encryptedHandle = await contract.getBalance(alice.address);

// Decrypt it (mock mode — synchronous)
const clearValue = await fhevm.userDecryptEuint(
    FhevmType.euint64,          // Type of the encrypted value
    encryptedHandle,             // The handle (bytes32)
    contractAddress,             // Contract that owns the handle
    alice,                       // Signer who has permission
);

expect(clearValue).to.equal(100n);
```

### Decrypt types
| FhevmType            | Returns     |
|----------------------|-------------|
| `FhevmType.ebool`   | `boolean`   |
| `FhevmType.euint8`  | `bigint`    |
| `FhevmType.euint16` | `bigint`    |
| `FhevmType.euint32` | `bigint`    |
| `FhevmType.euint64` | `bigint`    |
| `FhevmType.euint128`| `bigint`    |

---

## Complete test example

```typescript
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("ConfidentialCounter", function () {
    let contract: any;
    let contractAddress: string;
    let deployer: HardhatEthersSigner;
    let alice: HardhatEthersSigner;

    beforeEach(async function () {
        [deployer, alice] = await ethers.getSigners();
        const factory = await ethers.getContractFactory("ConfidentialCounter");
        contract = await factory.deploy();
        await contract.waitForDeployment();
        contractAddress = await contract.getAddress();
    });

    it("should increment by encrypted amount", async function () {
        // Encrypt the value 5
        const encrypted = await fhevm
            .createEncryptedInput(contractAddress, alice.address)
            .add32(5)
            .encrypt();

        // Call increment
        const tx = await contract
            .connect(alice)
            .increment(encrypted.handles[0], encrypted.inputProof);
        await tx.wait();

        // Decrypt and verify
        const handle = await contract.getCount();
        const clearCount = await fhevm.userDecryptEuint(
            FhevmType.euint32,
            handle,
            contractAddress,
            alice,
        );
        expect(clearCount).to.equal(5n);
    });

    it("should accumulate multiple increments", async function () {
        // First increment: 10
        let enc = await fhevm
            .createEncryptedInput(contractAddress, alice.address)
            .add32(10)
            .encrypt();
        await (await contract.connect(alice).increment(enc.handles[0], enc.inputProof)).wait();

        // Second increment: 20
        enc = await fhevm
            .createEncryptedInput(contractAddress, alice.address)
            .add32(20)
            .encrypt();
        await (await contract.connect(alice).increment(enc.handles[0], enc.inputProof)).wait();

        // Should be 30
        const handle = await contract.getCount();
        const clearCount = await fhevm.userDecryptEuint(
            FhevmType.euint32,
            handle,
            contractAddress,
            alice,
        );
        expect(clearCount).to.equal(30n);
    });
});
```

---

## Testing tips

### 1. Always use `await tx.wait()` after state-changing calls
```typescript
const tx = await contract.increment(enc.handles[0], enc.inputProof);
await tx.wait();  // Wait for the transaction to be mined
```

### 2. Access control in tests
The signer used for `userDecryptEuint` must have permission
(`FHE.allow` was called for them in the contract).

### 3. Testing without permission (negative test)
```typescript
it("should not allow unauthorized decryption", async function () {
    // Bob tries to decrypt Alice's balance
    await expect(
        fhevm.userDecryptEuint(
            FhevmType.euint64,
            handle,
            contractAddress,
            bob,    // Bob doesn't have permission
        )
    ).to.be.rejected;
});
```

### 4. Running tests
```bash
# Mock mode (fast, local)
npx hardhat test

# Specific test file
npx hardhat test test/ConfidentialCounter.test.ts

# On Sepolia (slow, real FHE)
npx hardhat test --network sepolia
```
