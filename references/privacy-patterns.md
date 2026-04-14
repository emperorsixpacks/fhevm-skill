# Privacy-Preserving Design Patterns

> Load when designing contracts that need to minimize information leakage.
> FHE encrypts the data, but metadata (events, gas, control flow) can still leak.

---

## Pattern 1: Privacy-preserving events

### WRONG — events leak sensitive data
```solidity
// These events reveal who paid whom and how much
event PaymentMade(address indexed from, address indexed to, uint256 amount);
event InvoiceCreated(address indexed merchant, uint256 amount);
```

### CORRECT — events use opaque identifiers only
```solidity
// Only emit non-sensitive identifiers
event InvoiceCreated(bytes32 indexed salt);
event PaymentMade(bytes32 indexed salt, bytes32 receiptHash);
event FundsClaimed(bytes32 indexed salt);
```

**Rule**: Never emit `address` or `uint256` amounts in events if those
values are supposed to be confidential. Use salts, hashes, or counters.

---

## Pattern 2: Receipt hashes for verifiable proof

Instead of emitting payment details, generate an on-chain receipt hash:

```solidity
// Receipt proves payment happened without revealing who or how much
bytes32 receiptHash = keccak256(
    abi.encodePacked(salt, block.timestamp, paymentCount)
);
receiptExists[receiptHash] = true;
emit PaymentMade(salt, receiptHash);
```

Users can verify a payment happened by calling:
```solidity
function verifyReceipt(bytes32 receiptHash) external view returns (bool) {
    return receiptExists[receiptHash];
}
```

---

## Pattern 3: Commitment schemes for trustless claims

Instead of storing merchant addresses in plaintext for fund claiming:

```solidity
// At creation time (off-chain):
// claimSecret = random bytes32
// claimHash = keccak256(abi.encodePacked(merchantAddress, salt, claimSecret))

// On-chain storage:
mapping(bytes32 => bytes32) private claimHashes;

// At claim time — proves identity without revealing address in storage:
function claimFunds(bytes32 salt, bytes32 claimSecret) external {
    require(
        keccak256(abi.encodePacked(msg.sender, salt, claimSecret)) == claimHashes[salt],
        "Invalid claim"
    );
    // Transfer funds to msg.sender...
}
```

**Why**: The merchant's address is never stored in plaintext on-chain.
The commitment hash proves identity at claim time without any on-chain
address comparison or lookup.

---

## Pattern 4: Silent failure for confidential transfers

### WRONG — revert leaks balance information
```solidity
// If this reverts, observer knows balance < amount
require(balance >= amount, "Insufficient balance");
```

### CORRECT — transfer 0 on failure, leak nothing
```solidity
ebool canTransfer = FHE.ge(senderBalance, amount);
euint64 transferAmount = FHE.select(canTransfer, amount, FHE.asEuint64(0));

// Always update both balances (even if amount is 0)
newSenderBalance = FHE.sub(senderBalance, transferAmount);
newReceiverBalance = FHE.add(receiverBalance, transferAmount);
```

The transaction always succeeds. An observer cannot distinguish between
a successful transfer and a failed one.

---

## Pattern 5: Constant-gas execution paths

### WRONG — different gas reveals which path was taken
```solidity
if (publicCondition) {
    result = FHE.add(a, b);               // 1 FHE op
} else {
    result = FHE.mul(a, b);               // 1 FHE op
    result = FHE.add(result, c);          // 2 FHE ops total
}
```

### CORRECT — both paths always execute
```solidity
euint64 pathA = FHE.add(a, b);
euint64 pathB = FHE.add(FHE.mul(a, b), c);
result = FHE.select(condition, pathA, pathB);
```

Both paths consume the same gas regardless of the condition, preventing
gas-based side-channel information leakage.

---

## Pattern 6: Encrypted status with plaintext proxy

Store encrypted status for privacy, but keep a plaintext proxy for control flow:

```solidity
struct Invoice {
    ebool    isPaid;        // Encrypted ground truth
    uint256  paymentCount;  // Plaintext proxy (0 = no payments, >0 = has payments)
    uint8    invoiceType;   // Plaintext (needed for branching: standard vs multipay)
}
```

**Why**: The contract needs to branch on invoice type (`if (type == MULTIPAY)`)
which is fine because invoice type isn't sensitive. But the actual paid/unpaid
status is encrypted because knowing _whether_ a specific invoice was paid
could be sensitive.

**Rule**: Encrypt what's sensitive, keep plaintext what's needed for logic
branching. Document why each field is plaintext vs encrypted.

---

## Pattern 7: Separation of encrypted input creation

When encrypting multiple values of different types, you can either bundle
them into one encrypted input or create separate inputs:

### Single input (one proof, more efficient)
```typescript
const enc = await instance
    .createEncryptedInput(contractAddress, userAddress)
    .add64(amount)
    .addAddress(merchantAddress)
    .encrypt();
// enc.handles[0] = amount, enc.handles[1] = address
// enc.inputProof = single shared proof
```

```solidity
function create(
    externalEuint64 amount,
    externalEaddress merchant,
    bytes calldata inputProof       // Single proof
) external {
    euint64 enc = FHE.fromExternal(amount, inputProof);
    eaddress addr = FHE.fromExternal(merchant, inputProof);
}
```

### Separate inputs (two proofs, more modular)
```typescript
const encAmount = await instance
    .createEncryptedInput(contractAddress, userAddress)
    .add64(amount).encrypt();
const encAddr = await instance
    .createEncryptedInput(contractAddress, userAddress)
    .addAddress(merchantAddress).encrypt();
```

```solidity
function create(
    externalEuint64 amount,
    bytes calldata proofAmount,
    externalEaddress merchant,
    bytes calldata proofMerchant    // Separate proof
) external {
    euint64 enc = FHE.fromExternal(amount, proofAmount);
    eaddress addr = FHE.fromExternal(merchant, proofMerchant);
}
```

Both approaches are valid. Single proof is cheaper on gas. Separate proofs
give more flexibility (can encrypt at different times or in different contexts).

---

## Pattern 8: Off-chain encrypted storage

For data that doesn't need on-chain computation but still needs privacy:

```
On-chain:  euint64 amount (FHE-encrypted, for computation)
Off-chain: AES-256-GCM encrypted merchant address (for lookup/indexing)
```

Use AES-256-GCM for backend database storage:
```javascript
const crypto = require('crypto');

function encrypt(plaintext, key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}
```

**Rule**: FHE is for on-chain computation. AES is for off-chain storage.
Use the right encryption for the right layer.

---

## Checklist: privacy audit before deployment

- [ ] No `address` or `uint256` amounts in events
- [ ] Receipt/proof mechanism for payment verification
- [ ] Silent failure pattern for insufficient balance (no reverts that leak info)
- [ ] Constant-gas paths for sensitive branches
- [ ] Commitment scheme for fund claiming (no plaintext address storage)
- [ ] Document which fields are plaintext and why (token type, invoice type)
- [ ] Off-chain data encrypted at rest (AES-256-GCM)
- [ ] No view functions that return decrypted values directly
- [ ] ERC-20 Transfer events acknowledged as a privacy limitation
- [ ] ETH msg.value acknowledged as a privacy limitation
