# Public Decryption (Oracle / Gateway) Reference

> Load when a contract needs to reveal an encrypted value to everyone
> (e.g., final vote tally, auction winner, game result).

---

## How public decryption works

Public decryption is a **3-step process** using the relayer SDK (since v0.9):

1. **On-chain**: Contract calls `FHE.makePubliclyDecryptable(handle)`
2. **Off-chain**: Anyone calls `instance.publicDecrypt([handle])` via the relayer SDK
3. **On-chain**: Submit the cleartext + proof back via `FHE.checkSignatures()`

This is NOT synchronous. You CANNOT decrypt and use the result in the same
transaction. The old `FHE.requestDecryption()` / `GatewayCaller` oracle
pattern was **removed in v0.9** — do not use it.

---

## On-chain pattern

### Step 1: Mark as publicly decryptable and emit event
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

contract VotingResult is ZamaEthereumConfig {
    euint64 private _encryptedTally;
    uint64 public finalTally;
    bool public isRevealed;

    event DecryptionRequested(bytes32 indexed handle);

    function requestReveal() external {
        require(!isRevealed, "Already revealed");
        FHE.makePubliclyDecryptable(_encryptedTally);
        emit DecryptionRequested(FHE.toBytes32(_encryptedTally));
    }

    function fulfilDecryption(uint64 clearValue, bytes calldata proof) external {
        // Verify the decryption proof
        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(_encryptedTally);
        FHE.checkSignatures(handles, abi.encode(clearValue), proof);

        // Store the plaintext result
        finalTally = clearValue;
        isRevealed = true;
    }
}
```

### Step 2: Off-chain relayer calls `fulfilDecryption`

The relayer watches for `DecryptionRequested` events, performs decryption,
and calls `fulfilDecryption` with the cleartext and a cryptographic proof.

---

## Frontend: triggering public decryption

Using `@zama-fhe/relayer-sdk`:
```typescript
// Public decryption (no user signature needed)
const results = await instance.publicDecrypt([handle1, handle2]);
const clearValue = results.values[handle1];
const proof = results.decryptionProof;

// Submit proof on-chain
await contract.fulfilDecryption(clearValue, proof);
```

---

## Multiple values

```solidity
event DecryptionRequested(bytes32[] handles);

function revealResults() external {
    FHE.makePubliclyDecryptable(_totalYes);
    FHE.makePubliclyDecryptable(_totalNo);

    bytes32[] memory handles = new bytes32[](2);
    handles[0] = FHE.toBytes32(_totalYes);
    handles[1] = FHE.toBytes32(_totalNo);
    emit DecryptionRequested(handles);
}

function fulfilResults(
    uint64 yesCount,
    uint64 noCount,
    bytes calldata proof
) external {
    bytes32[] memory handles = new bytes32[](2);
    handles[0] = FHE.toBytes32(_totalYes);
    handles[1] = FHE.toBytes32(_totalNo);
    FHE.checkSignatures(handles, abi.encode(yesCount, noCount), proof);

    finalYesCount = yesCount;
    finalNoCount = noCount;
}
```

---

## Common mistakes

### WRONG: Trying to decrypt synchronously
```solidity
// IMPOSSIBLE — decryption is async
function getResult() external view returns (uint64) {
    return FHE.decrypt(_encryptedValue);  // This function doesn't exist
}
```

### WRONG: Using the cleartext without verifying the proof
```solidity
// DANGEROUS — anyone could submit fake values
function fulfilDecryption(uint64 value) external {
    finalTally = value;  // No proof verification!
}
```

### WRONG: Forgetting `makePubliclyDecryptable`
```solidity
// The relayer won't be able to decrypt without public permission
function reveal() external {
    // Missing: FHE.makePubliclyDecryptable(_value);
    emit DecryptionRequested(FHE.toBytes32(_value));
}
```

---

## User decryption vs. public decryption

| Aspect              | User decryption                  | Public decryption               |
|---------------------|----------------------------------|---------------------------------|
| Who sees the value? | Only the authorized user         | Everyone                        |
| Permission needed   | `FHE.allow(handle, user)`        | `FHE.makePubliclyDecryptable()` |
| Mechanism           | EIP-712 signature + relayer SDK  | Oracle callback with proof      |
| On-chain tx needed? | No (off-chain read)              | Yes (callback writes to chain)  |
| Use case            | Reading own balance              | Revealing vote results, winners |
| Synchronous?        | Sort of (off-chain)              | No (two separate transactions)  |
