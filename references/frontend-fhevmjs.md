# Frontend SDK Reference (`@zama-fhe/relayer-sdk`)

> Load when building browser/frontend code that interacts with FHEVM contracts.
> Note: The old `fhevmjs` package is DEPRECATED. Use `@zama-fhe/relayer-sdk`.

---

## Installation

```bash
npm install @zama-fhe/relayer-sdk ethers
```

---

## Instance setup

### Sepolia testnet
```typescript
import { createInstance, SepoliaConfig } from '@zama-fhe/relayer-sdk';

const instance = await createInstance({
    ...SepoliaConfig,
    network: window.ethereum,  // MetaMask or any EIP-1193 provider
});
```

### Custom network
```typescript
import { createInstance } from '@zama-fhe/relayer-sdk';

const instance = await createInstance({
    chainId: 11155111,
    relayerUrl: 'https://relayer.testnet.zama.org',
    aclAddress: '0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D',
    kmsAddress: '0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A',
    gatewayChainId: 10901,
    network: window.ethereum,
});
```

---

## Encrypting inputs

### Single value
```typescript
const encrypted = await instance
    .createEncryptedInput(contractAddress, userAddress)
    .add64(BigInt(amount))       // euint64
    .encrypt();

// Send transaction
const tx = await contract.deposit(
    encrypted.handles[0],         // externalEuint64
    encrypted.inputProof,         // bytes proof
);
await tx.wait();
```

### Multiple values
```typescript
const encrypted = await instance
    .createEncryptedInput(contractAddress, userAddress)
    .add64(BigInt(100))           // handles[0] → euint64
    .addBool(true)                // handles[1] → ebool
    .add32(42)                    // handles[2] → euint32
    .encrypt();

const tx = await contract.myFunction(
    encrypted.handles[0],         // first encrypted param
    encrypted.handles[1],         // second encrypted param
    encrypted.handles[2],         // third encrypted param
    encrypted.inputProof,         // single proof for all
);
```

### Encryption methods

| Method            | Type              | Input            |
|-------------------|-------------------|------------------|
| `.addBool(val)`   | `externalEbool`   | `boolean`        |
| `.add8(val)`      | `externalEuint8`  | `number`         |
| `.add16(val)`     | `externalEuint16` | `number`         |
| `.add32(val)`     | `externalEuint32` | `number`         |
| `.add64(val)`     | `externalEuint64` | `bigint`         |
| `.add128(val)`    | `externalEuint128`| `bigint`         |
| `.add256(val)`    | `externalEuint256`| `bigint`         |
| `.addAddress(val)`| `externalEaddress`| `string` (0x...) |

---

## User decryption

See `references/decryption-user.md` for full flow. Quick version:

```typescript
// 1. Get handle from contract
const handle = await contract.getBalance(userAddress);

// 2. Generate keypair
const keypair = instance.generateKeypair();

// 3. Create EIP-712 message
const eip712 = instance.createEIP712(
    keypair.publicKey,
    [contractAddress],
    Math.floor(Date.now() / 1000).toString(),
    '10',
);

// 4. User signs
const signature = await signer.signTypedData(
    eip712.domain,
    { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
    eip712.message,
);

// 5. Decrypt
const result = await instance.userDecrypt(
    [{ handle, contractAddress }],
    keypair.privateKey,
    keypair.publicKey,
    signature.replace('0x', ''),
    [contractAddress],
    signer.address,
    Math.floor(Date.now() / 1000).toString(),
    '10',
);

const clearBalance = result[handle];
```

---

## Public decryption

```typescript
const results = await instance.publicDecrypt([handle1, handle2]);
const clearValue1 = results.values[handle1];
const clearValue2 = results.values[handle2];
const proof = results.decryptionProof;
```

---

## React integration pattern

```typescript
import { createInstance, SepoliaConfig } from '@zama-fhe/relayer-sdk';
import { useEffect, useState } from 'react';

function useFhevm() {
    const [instance, setInstance] = useState(null);

    useEffect(() => {
        async function init() {
            if (!window.ethereum) return;
            const inst = await createInstance({
                ...SepoliaConfig,
                network: window.ethereum,
            });
            setInstance(inst);
        }
        init();
    }, []);

    return instance;
}

// Usage in component
function DepositForm({ contractAddress }) {
    const instance = useFhevm();

    async function handleDeposit(amount) {
        if (!instance) return;
        const signer = await provider.getSigner();
        const address = await signer.getAddress();

        const encrypted = await instance
            .createEncryptedInput(contractAddress, address)
            .add64(BigInt(amount))
            .encrypt();

        const tx = await contract.deposit(
            encrypted.handles[0],
            encrypted.inputProof,
        );
        await tx.wait();
    }
}
```

---

## Common mistakes

### WRONG: Creating instance without network
```typescript
// Missing network parameter
const instance = await createInstance({ ...SepoliaConfig });
```

### WRONG: Using deprecated fhevmjs
```typescript
// DEPRECATED — do not use
import { createInstance } from 'fhevmjs';
```

### WRONG: Forgetting BigInt for 64-bit values
```typescript
// May overflow or lose precision
encrypted.add64(100);           // WRONG for large values
encrypted.add64(BigInt(100));   // CORRECT
encrypted.add64(100n);          // CORRECT (literal BigInt)
```

### WRONG: Reusing encrypted input across contracts
```typescript
// Each encrypted input is bound to a specific contract address
const enc = await instance.createEncryptedInput(contractA, user).add64(100n).encrypt();
await contractB.deposit(enc.handles[0], enc.inputProof);  // FAILS — wrong contract
```
