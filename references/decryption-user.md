# User Decryption (Re-encryption) Reference

> Load when users need to read their own encrypted data (balances, etc.).

---

## How user decryption works

A user cannot just "read" an encrypted value. They must:

1. **Have permission** — the contract called `FHE.allow(handle, userAddress)`
2. **Sign an EIP-712 message** — proves they own the address and want to decrypt
3. **Send the request to the relayer** — the relayer verifies and returns cleartext

This is NOT a blockchain transaction — it's an off-chain read operation.
No gas is spent on decryption itself.

---

## Frontend implementation

### Using `@zama-fhe/relayer-sdk`

```typescript
import { createInstance, SepoliaConfig } from '@zama-fhe/relayer-sdk';

// 1. Create SDK instance (once per page load)
const instance = await createInstance({
    ...SepoliaConfig,
    network: window.ethereum,
});

// 2. Generate a keypair for this decrypt session
const keypair = instance.generateKeypair();

// 3. Create EIP-712 typed data for the user to sign
const eip712 = instance.createEIP712(
    keypair.publicKey,
    [contractAddress],                                    // contracts to decrypt from
    Math.floor(Date.now() / 1000).toString(),             // timestamp
    '10',                                                 // validity period (seconds)
);

// 4. User signs (MetaMask popup)
const signature = await signer.signTypedData(
    eip712.domain,
    { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
    eip712.message,
);

// 5. Decrypt
const result = await instance.userDecrypt(
    [{ handle: ciphertextHandle, contractAddress }],      // what to decrypt
    keypair.privateKey,
    keypair.publicKey,
    signature.replace('0x', ''),                          // strip 0x prefix
    [contractAddress],
    signer.address,
    Math.floor(Date.now() / 1000).toString(),
    '10',
);

// 6. Read cleartext
const myBalance = result[ciphertextHandle];
console.log('My balance:', myBalance);
```

### Multiple values at once
```typescript
const result = await instance.userDecrypt(
    [
        { handle: balanceHandle, contractAddress },
        { handle: allowanceHandle, contractAddress },
    ],
    keypair.privateKey,
    keypair.publicKey,
    signature.replace('0x', ''),
    [contractAddress],
    signer.address,
    Math.floor(Date.now() / 1000).toString(),
    '10',
);

const balance = result[balanceHandle];
const allowance = result[allowanceHandle];
```

---

## Getting the handle from the contract

The contract exposes a `view` function that returns the encrypted handle:
```solidity
// In the contract
function getBalance(address user) external view returns (euint64) {
    return _balances[user];
}
```

In the frontend:
```typescript
// This returns a bytes32 handle, NOT the actual balance
const handle = await contract.getBalance(userAddress);

// Now decrypt it using the flow above
```

**Important**: The `view` function returns a `bytes32` handle. It does NOT
return the plaintext value. The handle is what you pass to `userDecrypt`.

---

## Contract-side requirements

For user decryption to work, the contract MUST have called:
```solidity
FHE.allow(encryptedValue, userAddress);
```

If the user doesn't have permission, decryption returns nothing.

### Pattern: allow on state update
```solidity
function deposit(externalEuint64 amount, bytes calldata proof) external {
    euint64 enc = FHE.fromExternal(amount, proof);
    _balances[msg.sender] = FHE.add(_balances[msg.sender], enc);
    FHE.allowThis(_balances[msg.sender]);
    FHE.allow(_balances[msg.sender], msg.sender);  // ← This enables decryption
}
```

---

## Testing user decryption

In Hardhat mock mode:
```typescript
import { fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";

const handle = await contract.getBalance(alice.address);
const clearBalance = await fhevm.userDecryptEuint(
    FhevmType.euint64,
    handle,
    contractAddress,
    alice,              // the signer who has permission
);
expect(clearBalance).to.equal(100n);
```

No EIP-712 dance needed in tests — the mock simplifies everything.

---

## Common mistakes

### Forgetting to get the handle first
```typescript
// WRONG — passing an address to decrypt
const balance = await instance.userDecrypt([{ handle: userAddress, contractAddress }], ...);

// CORRECT — get handle from contract, then decrypt
const handle = await contract.getBalance(userAddress);
const result = await instance.userDecrypt([{ handle, contractAddress }], ...);
```

### Not stripping 0x from signature
```typescript
// WRONG
signature  // "0xabc123..."

// CORRECT
signature.replace('0x', '')  // "abc123..."
```

### Trying to decrypt without permission
If `FHE.allow` was never called for this user + handle combination,
the decryption will return nothing. No error, just empty.
