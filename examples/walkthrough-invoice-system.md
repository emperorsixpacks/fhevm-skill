# End-to-End Walkthrough: Confidential Invoice System

> Build a privacy-preserving invoice and payment system where amounts,
> merchant identities, and payment status are fully encrypted on-chain.
> This is the most complex template — demonstrates real-world patterns.

---

## What we're building

- **Smart contract**: Create invoices with encrypted amounts, pay with
  encrypted matching, claim funds via commitment scheme
- **Privacy**: Events emit only salts/hashes (no addresses or amounts)
- **Patterns used**: Commitment scheme, silent failure, receipt hashes,
  encrypted status with plaintext proxy, multi-value encrypted inputs

---

## Step 1: Understand the privacy model

### What's encrypted (private)
- Invoice amount (`euint64`)
- Merchant address (`eaddress`)
- Payer address (`eaddress`)
- Payment status ground truth (`ebool`)

### What's plaintext (public by design)
- Invoice salt (opaque identifier — reveals nothing)
- Status proxy (`uint8`: 0/1/2 for open/paid/cancelled)
- Timestamp (when invoice was created)
- Receipt hash (proves payment without revealing details)

### Why the status proxy?
The contract needs plaintext `require(_invoices[salt].status == 0)` to
check if an invoice is open. This is a deliberate tradeoff: knowing that
an invoice changed from "open" to "paid" is acceptable for the control
flow, while the encrypted `isPaid` ebool is the cryptographic ground truth.

If even the payment status is sensitive, you'd remove the plaintext proxy
and use `FHE.select` for all branching — at the cost of higher gas and
more complex logic.

---

## Step 2: The commitment scheme

The merchant's address is never stored in plaintext on-chain. Instead:

```
Off-chain (invoice creation):
  claimSecret = random 32 bytes
  claimHash = keccak256(merchantAddress, salt, claimSecret)
  → claimHash is stored on-chain
  → claimSecret is sent privately to the merchant

On-chain (fund claiming):
  merchant calls claimFunds(salt, claimSecret)
  contract verifies: keccak256(msg.sender, salt, claimSecret) == claimHash
  → proves identity without ever comparing addresses on-chain
```

**Why not just store the merchant address?**
Even though the merchant address is stored as `eaddress` (encrypted),
the commitment scheme adds a second layer: the merchant proves they're
authorized to claim without any on-chain address lookup or comparison.

---

## Step 3: The silent failure pattern

When paying an invoice, the contract checks if the payment amount matches
the invoice amount. But it does NOT revert on mismatch:

```solidity
// If amounts don't match, effectivePayment becomes 0
ebool amountMatches = FHE.eq(payment, _invoices[salt].amount);
euint64 effectivePayment = FHE.select(
    amountMatches,
    payment,
    FHE.asEuint64(0)
);
```

**Why?** If the contract reverted on mismatch, an observer could:
1. Watch for reverted `payInvoice` transactions
2. Learn that the payment amount didn't match the invoice amount
3. Use this to narrow down what the invoice amount might be

With silent failure, every `payInvoice` transaction looks identical from
the outside — success or failure, the gas cost and transaction outcome
are the same.

---

## Step 4: Multi-value encrypted inputs

Creating an invoice encrypts both the amount and merchant address in a
single encrypted input (one proof):

```typescript
// Frontend: one input, one proof, two encrypted values
const enc = await fhevmInstance
    .createEncryptedInput(contractAddress, userAddress)
    .add64(invoiceAmount)         // handles[0]
    .addAddress(merchantAddress)  // handles[1]
    .encrypt();

// Solidity: same proof validates both
function createInvoice(
    bytes32 salt,
    externalEuint64 encAmount,      // enc.handles[0]
    externalEaddress encMerchant,   // enc.handles[1]
    bytes calldata inputProof,       // enc.inputProof (covers both)
    bytes32 claimHash
) external {
    euint64 amount = FHE.fromExternal(encAmount, inputProof);
    eaddress merchant = FHE.fromExternal(encMerchant, inputProof);
}
```

This saves gas compared to two separate encrypted inputs with two proofs.

---

## Step 5: Receipt hashes

After payment, a receipt hash is generated on-chain:

```solidity
bytes32 receiptHash = keccak256(
    abi.encodePacked(salt, block.timestamp, invoiceCount)
);
receiptExists[receiptHash] = true;
emit PaymentMade(salt, receiptHash);
```

Anyone can verify a payment happened without knowing who paid or how much:
```solidity
function verifyReceipt(bytes32 receiptHash) external view returns (bool) {
    return receiptExists[receiptHash];
}
```

---

## Step 6: Testing the full lifecycle

```bash
npx hardhat test test/ConfidentialInvoice.test.ts
```

The test suite covers:
1. **Creation**: Encrypted amount + merchant, duplicate salt rejection
2. **Payment**: Matching amount acceptance, receipt generation
3. **Claiming**: Valid commitment, wrong secret rejection, wrong address rejection
4. **Cancellation**: Only open invoices
5. **Privacy**: Events contain only salts, no addresses or amounts

---

## Privacy checklist for this contract

- [x] No addresses in events (only salts and receipt hashes)
- [x] No amounts in events
- [x] Silent failure for payment matching (no balance leakage)
- [x] Commitment scheme for claiming (no plaintext address storage)
- [x] Receipt hash for verifiable proof-of-payment
- [x] Status proxy documented as acceptable tradeoff
- [x] ACL permissions set for creator (can decrypt their invoice)

---

## What the skill prevented

Without the FHEVM skill, an agent would:

1. Emit `event PaymentMade(address payer, uint256 amount)` — **leaks everything**
2. Use `require(payment == invoiceAmount)` — **leaks whether amounts match**
3. Store merchant address as `address` (plaintext) — **defeats privacy**
4. Forget `FHE.allowThis` on updated encrypted state — **contract breaks on second use**
5. Use two separate proofs where one suffices — **wastes gas**
6. Skip the commitment scheme — **merchant identity exposed**
7. Use `if (isPaid)` — **ebool can't be used in conditionals**
