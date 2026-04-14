# Troubleshooting Guide

> Load when the agent or user encounters errors during development,
> compilation, testing, or deployment. Organized by symptom → cause → fix.

---

## Compilation errors

### "TypeError: Operator + not compatible with types euint256 and euint256"
**Cause**: `euint256` does not support arithmetic operators.
**Fix**: Only `euint8` through `euint128` support `+`, `-`, `*`. For `euint256`,
use only bitwise operations, `FHE.eq`, `FHE.ne`, `FHE.select`.

### "TypeError: Type externalEuint64 is not implicitly convertible to euint64"
**Cause**: Passing an external input directly without converting.
**Fix**: Use `FHE.fromExternal(input, proof)`:
```solidity
// WRONG
euint64 amount = encAmount;
// CORRECT
euint64 amount = FHE.fromExternal(encAmount, inputProof);
```

### "DeclarationError: Identifier not found: TFHE"
**Cause**: Using the deprecated `TFHE` library name.
**Fix**: Replace all `TFHE.xxx()` with `FHE.xxx()` and update import:
```solidity
// WRONG
import "fhevm/lib/TFHE.sol";
// CORRECT
import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
```

### "TypeError: ebool is not implicitly convertible to bool"
**Cause**: Using encrypted boolean in `if`, `require`, or `assert`.
**Fix**: Use `FHE.select()` instead of branching:
```solidity
// WRONG
if (FHE.gt(a, b)) { ... }
// CORRECT
euint64 result = FHE.select(FHE.gt(a, b), valueIfTrue, valueIfFalse);
```

### "ParserError: Source file requires different compiler version"
**Cause**: Solidity version mismatch.
**Fix**: Set `pragma solidity ^0.8.24;` or higher (up to `0.8.27`) and
ensure `hardhat.config.ts` specifies:
```typescript
solidity: { version: "0.8.27" }
```

### "Error: Cannot find module '@fhevm/solidity/lib/FHE.sol'"
**Cause**: Missing dependency or wrong package name.
**Fix**:
```bash
npm install @fhevm/solidity@^0.11.1
```
Not `fhevm` (deprecated). Check `node_modules/@fhevm/solidity/lib/FHE.sol` exists.

### "Error HH606: The project cannot be compiled" with evmVersion errors
**Cause**: Missing or wrong `evmVersion` in hardhat config.
**Fix**: Must be `"cancun"`:
```typescript
solidity: {
    version: "0.8.27",
    settings: { evmVersion: "cancun" }
}
```

---

## Runtime / transaction errors

### Transaction reverts with no error message
**Possible causes** (check in order):
1. **Missing input proof**: Function expects `bytes calldata inputProof` but
   it wasn't passed or was empty.
2. **Wrong contract address in encrypted input**: The ciphertext was encrypted
   for contract A but sent to contract B. Each encrypted input is bound to a
   specific contract address.
3. **Uninitialized encrypted state**: Operating on a null handle. Check with
   `FHE.isInitialized(handle)` before using.

### "Contract can't read its own state on second call"
**Cause**: Missing `FHE.allowThis()` after computing a new ciphertext.
**Symptom**: First transaction works, second one reverts or produces wrong result.
**Fix**: After EVERY operation that produces a new handle:
```solidity
_counter = FHE.add(_counter, increment);
FHE.allowThis(_counter);  // THIS LINE IS REQUIRED
```

### User decryption returns empty/null/zero
**Cause**: Missing `FHE.allow(handle, userAddress)`.
**Symptom**: No error thrown — just empty result from `userDecrypt()`.
**Fix**: The contract must call `FHE.allow(handle, msg.sender)` (or the
specific user address) for every handle the user should be able to decrypt.

### "Execution reverted" on payable function with encrypted inputs
**Cause**: Likely the input proof verification failed.
**Debug steps**:
1. Verify the encrypted input was created with the correct contract address
2. Verify the signer address matches the sender
3. Verify the proof hasn't expired
4. Check that `externalEuint64` parameter type matches the `.add64()` call

---

## Test errors

### "Error: Cannot find module 'hardhat'" in test files
**Fix**:
```bash
npm install -D hardhat @fhevm/hardhat-plugin
```
And ensure `hardhat.config.ts` has:
```typescript
import "@fhevm/hardhat-plugin";
```

### Tests hang or timeout
**Cause**: Not awaiting transactions properly.
**Fix**: Always `await tx.wait()` after state-changing calls:
```typescript
const tx = await contract.increment(enc.handles[0], enc.inputProof);
await tx.wait();  // Don't skip this
```

### "Error: user is not allowed to decrypt this ciphertext"
**Cause**: The contract didn't call `FHE.allow(handle, signerAddress)`.
**Fix**: Ensure the contract grants decrypt permission to the test signer:
```solidity
FHE.allow(_state, msg.sender);
```

### Mock mode returns different results than Sepolia
**Cause**: Mock mode is simplified — some edge cases behave differently.
**Common differences**:
- Overflow behavior may differ
- Random values are deterministic in mock
- Gas costs are not representative
- Timing/block behavior differs

---

## Frontend / SDK errors

### "Error: FHE SDK initialization failed" or WASM load failure
**Causes**:
1. Missing COOP/COEP headers (required for SharedArrayBuffer/WASM)
2. Network failure downloading WASM binary (~4.7MB)
3. Odd Node.js version (use v20 or v22)

**Fix for Vite**:
```typescript
// vite.config.ts
export default defineConfig({
    server: {
        headers: {
            "Cross-Origin-Embedder-Policy": "require-corp",
            "Cross-Origin-Opener-Policy": "same-origin",
        },
    },
});
```

### "Error: network" or "Bad JSON" during encryption
**Cause**: Zama's testnet relayer is temporarily down or unreachable.
**Fix**: Implement retry logic:
```typescript
const MAX_RETRIES = 3;
for (let i = 1; i <= MAX_RETRIES; i++) {
    try {
        return await encrypt();
    } catch (err) {
        if (i === MAX_RETRIES) throw err;
        await new Promise(r => setTimeout(r, 1000 * i));
    }
}
```

### MetaMask shows wrong nonce / transactions stuck
**Cause**: Restarted local Hardhat node but MetaMask cached old state.
**Fix**: MetaMask → Settings → Advanced → Clear activity tab data.

### "Cannot encrypt for address 0x..." — wrong contract address
**Cause**: `createEncryptedInput(contractAddress, userAddress)` was called
with the wrong contract address. Each encrypted input is bound to a specific
contract.
**Fix**: Ensure `contractAddress` matches the deployed contract you're calling.

---

## Deployment errors

### "Error: insufficient funds for gas"
**Cause**: FHE operations cost 100-1000x more gas than normal. A single
FHE transaction can cost 1-5M gas.
**Fix**: Get more testnet ETH from faucets:
- https://sepoliafaucet.com
- https://www.alchemy.com/faucets/ethereum-sepolia
- https://www.infura.io/faucet/sepolia

### "Error: nonce too low" on Sepolia
**Cause**: Previous transaction pending or MetaMask nonce desync.
**Fix**: Wait for pending tx to confirm, or reset MetaMask activity data.

### Contract deploys but FHE operations fail
**Cause**: Contract doesn't inherit `ZamaEthereumConfig`.
**Fix**: Add inheritance:
```solidity
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
contract MyContract is ZamaEthereumConfig { ... }
```

---

## Quick diagnostic checklist

When something doesn't work, check these in order:

1. **Compiler**: Solidity `^0.8.24` or higher, `evmVersion: "cancun"`
2. **Imports**: `@fhevm/solidity/lib/FHE.sol` (not `fhevm/lib/TFHE.sol`)
3. **Config**: Contract inherits `ZamaEthereumConfig`
4. **Inputs**: Using `externalEuintXX` + `bytes calldata proof` + `FHE.fromExternal()`
5. **ACL**: `FHE.allowThis()` on every new ciphertext, `FHE.allow()` for users
6. **Branching**: No `if`/`require` on encrypted values
7. **Packages**: `@fhevm/solidity` not `fhevm`, `@zama-fhe/relayer-sdk` not `fhevmjs`
8. **Node.js**: Even version (v20, v22), not odd (v21, v23)
9. **Frontend**: COOP/COEP headers set for WASM
10. **Network**: Correct chain ID (Sepolia: 11155111)
