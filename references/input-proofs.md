# Input Proofs Reference

> Load when writing functions that accept encrypted values from users.

---

## How encrypted inputs work

Users encrypt values in the browser using the relayer SDK. The encrypted
data includes a **proof** that the encryption was done correctly. The
contract must verify this proof before using the encrypted value.

### The flow

```
Browser                          Contract
───────                          ────────
1. User types "100"
2. SDK encrypts → ciphertext + proof
3. Sends tx with (ciphertext, proof)
                                 4. FHE.fromExternal(ciphertext, proof)
                                 5. Returns euint64 handle
                                 6. Contract uses handle normally
```

---

## Function signature pattern

### Single encrypted input
```solidity
function deposit(
    externalEuint64 encryptedAmount,
    bytes calldata inputProof
) external {
    euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
    // Use amount...
    _balances[msg.sender] = FHE.add(_balances[msg.sender], amount);
    FHE.allowThis(_balances[msg.sender]);
    FHE.allow(_balances[msg.sender], msg.sender);
}
```

### Multiple encrypted inputs
```solidity
function placeBid(
    externalEuint64 encryptedBid,
    externalEbool encryptedIsPublic,
    bytes calldata inputProof        // ONE proof covers ALL inputs
) external {
    euint64 bid = FHE.fromExternal(encryptedBid, inputProof);
    ebool isPublic = FHE.fromExternal(encryptedIsPublic, inputProof);
    // Use bid and isPublic...
}
```

**Key**: Multiple encrypted inputs share a SINGLE `bytes calldata inputProof`.
The SDK bundles all inputs into one proof. Do NOT add a separate proof
parameter for each input.

---

## External types mapping

| You want to receive | Parameter type       | Convert with                        |
|---------------------|----------------------|-------------------------------------|
| `euint8`            | `externalEuint8`     | `FHE.fromExternal(input, proof)`    |
| `euint16`           | `externalEuint16`    | `FHE.fromExternal(input, proof)`    |
| `euint32`           | `externalEuint32`    | `FHE.fromExternal(input, proof)`    |
| `euint64`           | `externalEuint64`    | `FHE.fromExternal(input, proof)`    |
| `euint128`          | `externalEuint128`   | `FHE.fromExternal(input, proof)`    |
| `euint256`          | `externalEuint256`   | `FHE.fromExternal(input, proof)`    |
| `ebool`             | `externalEbool`      | `FHE.fromExternal(input, proof)`    |
| `eaddress`          | `externalEaddress`   | `FHE.fromExternal(input, proof)`    |

---

## Common mistakes

### WRONG: Using FHE.asEuintXX for user input
```solidity
// WRONG — this encrypts a plaintext on-chain, not from user
function deposit(uint64 amount) external {
    euint64 enc = FHE.asEuint64(amount);  // amount is PUBLIC in calldata!
}
```
`FHE.asEuintXX(plaintext)` encrypts a **known** value on-chain. It does NOT
accept encrypted user input. The plaintext is visible in the transaction.

### WRONG: Missing the proof parameter
```solidity
// WRONG — no proof, will revert
function deposit(externalEuint64 amount) external {
    euint64 enc = FHE.fromExternal(amount, ???);  // Missing proof!
}
```

### WRONG: Separate proofs per input
```solidity
// WRONG — one proof covers all inputs
function bid(
    externalEuint64 amount, bytes calldata proof1,
    externalEbool flag, bytes calldata proof2     // Don't do this!
) external { ... }
```

### CORRECT
```solidity
function bid(
    externalEuint64 amount,
    externalEbool flag,
    bytes calldata inputProof     // Single proof for all inputs
) external {
    euint64 encAmount = FHE.fromExternal(amount, inputProof);
    ebool encFlag = FHE.fromExternal(flag, inputProof);
}
```

---

## Frontend: creating encrypted inputs

Using `@zama-fhe/relayer-sdk` in the browser:
```typescript
// Single input
const encrypted = await instance
    .createEncryptedInput(contractAddress, userAddress)
    .add64(BigInt(100))
    .encrypt();

await contract.deposit(encrypted.handles[0], encrypted.inputProof);

// Multiple inputs
const encrypted = await instance
    .createEncryptedInput(contractAddress, userAddress)
    .add64(BigInt(100))      // First input → handles[0]
    .addBool(true)           // Second input → handles[1]
    .encrypt();

await contract.bid(encrypted.handles[0], encrypted.handles[1], encrypted.inputProof);
```

Using Hardhat test helpers:
```typescript
import { fhevm } from "hardhat";

const encrypted = await fhevm
    .createEncryptedInput(contractAddress, signerAddress)
    .add64(100n)
    .encrypt();

await contract.deposit(encrypted.handles[0], encrypted.inputProof);
```
