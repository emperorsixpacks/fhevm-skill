# FHEVM Architecture — How FHE Works On-Chain

> Load this reference when the user is new to FHE, non-technical, or asks
> "what is FHEVM?" / "how does encrypted computation work?"

---

## The problem FHEVM solves

On a normal blockchain (Ethereum, etc.), every piece of data is public.
Your token balance, your votes, your bids — anyone can read them.
This kills use cases that need privacy: salary payments, medical records,
sealed auctions, private voting, confidential DeFi.

**FHEVM** = Fully Homomorphic Encryption on the EVM.
It lets smart contracts compute on encrypted data without ever decrypting it.

---

## Mental model (no math required)

### The locked calculator analogy

Imagine a calculator sealed inside a locked glass box:

1. **You encrypt your number** (put it in a locked envelope)
2. **You slide the envelope into the box** (send encrypted input to the contract)
3. **The calculator does math on the locked envelope** (FHE operations)
4. **It produces a NEW locked envelope** (new ciphertext with the result)
5. **Only you can open the result** (decrypt with your key)

Nobody — not miners, not other users, not even the contract itself — ever
sees the actual numbers. They only see encrypted handles.

### What changes for a developer

| Normal Solidity             | FHEVM Solidity                                    |
|-----------------------------|---------------------------------------------------|
| `uint32 balance`            | `euint32 balance` (encrypted)                     |
| `balance + amount`          | `FHE.add(balance, amount)`                        |
| `if (balance > 0)`          | `ebool check = FHE.gt(balance, FHE.asEuint32(0))` then `FHE.select(check, a, b)` |
| `require(balance >= amount)`| Impossible — use silent failure pattern            |
| User reads balance directly | User must decrypt via EIP-712 signature flow       |
| Free to compute             | FHE ops cost 100-1000x more gas                   |

---

## System components

```
┌─────────────┐     encrypted input      ┌──────────────────┐
│   Browser    │ ─────────────────────►   │  Smart Contract   │
│  (fhevmjs/  │                          │  (uses FHE.sol)   │
│ relayer-sdk) │     encrypted handle     │                   │
│              │ ◄─────────────────────   │  Inherits         │
│              │                          │  ZamaEthereumConfig│
└──────┬───────┘                          └────────┬──────────┘
       │                                           │
       │ EIP-712 signed                            │ FHE ops executed by
       │ decrypt request                           │ coprocessor
       │                                           │
       ▼                                           ▼
┌─────────────┐                          ┌──────────────────┐
│   Relayer /  │                          │  FHE Coprocessor  │
│   Gateway    │                          │  (Zama's infra)   │
│              │                          │  Does the actual   │
│  Routes      │                          │  encrypted math    │
│  decrypt     │                          └──────────────────┘
│  requests    │
└─────────────┘
```

### Components explained

1. **`@fhevm/solidity` (FHE.sol)** — Solidity library your contracts import.
   Provides encrypted types (`euint32`, `ebool`, etc.) and operations
   (`FHE.add`, `FHE.select`, etc.). These calls are intercepted by the
   coprocessor which does the actual encrypted math.

2. **FHE Coprocessor** — Zama's infrastructure that processes FHE operations.
   Your contract sends it encrypted data, it performs homomorphic operations,
   and returns encrypted results. You never interact with it directly — the
   library handles everything.

3. **ACL (Access Control List)** — On-chain contract that tracks who is
   allowed to decrypt which ciphertext. When you call `FHE.allow(handle, user)`,
   it registers that `user` can decrypt `handle`. Without this, decryption
   requests are rejected.

4. **Relayer / Gateway** — Service that coordinates decryption requests.
   When a user wants to see their balance, they sign an EIP-712 message
   proving they're allowed, and the relayer facilitates the decryption.

5. **`@zama-fhe/relayer-sdk`** — JavaScript library for the browser/frontend.
   Encrypts inputs before sending to the contract, handles the decryption
   flow with EIP-712 signatures.

---

## Data lifecycle

```
Plaintext (user's browser)
    │
    ▼  relayer-sdk encrypts
Ciphertext input (externalEuint32 + proof)
    │
    ▼  sent as transaction calldata
Contract receives → FHE.fromExternal(input, proof)
    │
    ▼  contract stores
euint32 handle (opaque reference, stored on-chain)
    │
    ▼  FHE.add / FHE.select / etc.
New euint32 handle (result of computation)
    │
    ▼  FHE.allow(handle, user) + FHE.allowThis(handle)
ACL registers permissions
    │
    ▼  user requests decryption (EIP-712 signature)
Relayer verifies permission → returns plaintext to user only
```

Key insight: **encrypted handles are just `bytes32` references**. The actual
encrypted data lives in the coprocessor. The blockchain stores pointers, not
the encrypted blobs themselves. This is why FHE on-chain is feasible — you're
not storing megabytes of ciphertext in contract storage.

---

## Gas costs — the key constraint

FHE operations are expensive. Rough multipliers vs. normal Solidity:

| Operation          | Approximate gas cost | vs. normal |
|--------------------|---------------------|------------|
| `FHE.add`          | ~100,000            | ~100x      |
| `FHE.mul`          | ~200,000            | ~500x      |
| `FHE.lt` / `FHE.gt`| ~150,000           | ~300x      |
| `FHE.select`       | ~100,000            | ~200x      |
| `FHE.div` (scalar) | ~300,000            | ~500x      |
| `FHE.randEuint64`  | ~200,000            | N/A        |

**Design rule**: Minimize the number of FHE operations per transaction.
A loop doing `FHE.add` 100 times will almost certainly exceed gas limits.
If you need aggregation, redesign to accumulate across transactions.

---

## What's confidential vs. what's public

| Always public                           | Can be confidential              |
|-----------------------------------------|----------------------------------|
| Contract code / logic                   | Balances                         |
| Transaction sender (`msg.sender`)       | Transfer amounts                 |
| Function selectors                      | Vote choices                     |
| Gas usage (can leak information!)       | Bid amounts                      |
| That a transaction happened             | Any numeric/boolean state        |
| Block timestamps                        | Addresses (via `eaddress`)       |
| Total supply (by convention in ERC-7984)| Individual holdings              |

**Gas side-channel warning**: Different FHE code paths consume different gas.
If branch A does 3 operations and branch B does 5, an observer can infer
which branch was taken by looking at gas usage. The `FHE.select` pattern
(always execute both paths) mitigates this.
