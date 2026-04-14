# FHE Operations Reference

> Load when writing contract logic that operates on encrypted values.

---

## Operation matrix

### Arithmetic
| Operation     | Syntax                        | Notes                                       |
|---------------|-------------------------------|---------------------------------------------|
| Addition      | `FHE.add(a, b)`              | Both encrypted, or one can be plaintext      |
| Subtraction   | `FHE.sub(a, b)`              | Both encrypted, or one can be plaintext      |
| Multiplication| `FHE.mul(a, b)`              | Both encrypted, or one can be plaintext      |
| Division      | `FHE.div(a, plainB)`         | **Divisor MUST be plaintext**                |
| Remainder     | `FHE.rem(a, plainB)`         | **Divisor MUST be plaintext**                |
| Minimum       | `FHE.min(a, b)`              | Both encrypted, or one can be plaintext      |
| Maximum       | `FHE.max(a, b)`              | Both encrypted, or one can be plaintext      |
| Negation      | `FHE.neg(a)`                 | Two's complement negation                    |

### Comparison (all return `ebool`)
| Operation        | Syntax                     |
|------------------|----------------------------|
| Equal            | `FHE.eq(a, b)`            |
| Not equal        | `FHE.ne(a, b)`            |
| Greater than     | `FHE.gt(a, b)`            |
| Greater or equal | `FHE.ge(a, b)`            |
| Less than        | `FHE.lt(a, b)`            |
| Less or equal    | `FHE.le(a, b)`            |

### Bitwise
| Operation     | Syntax                        |
|---------------|-------------------------------|
| AND           | `FHE.and(a, b)`              |
| OR            | `FHE.or(a, b)`               |
| XOR           | `FHE.xor(a, b)`              |
| NOT           | `FHE.not(a)`                 |
| Shift left    | `FHE.shl(a, b)`              |
| Shift right   | `FHE.shr(a, b)`              |
| Rotate left   | `FHE.rotl(a, b)`             |
| Rotate right  | `FHE.rotr(a, b)`             |

### Conditional
| Operation | Syntax                                  | Notes                        |
|-----------|-----------------------------------------|------------------------------|
| Select    | `FHE.select(eboolCond, ifTrue, ifFalse)`| THE replacement for if/else  |

### Random generation
| Operation      | Syntax                        |
|----------------|-------------------------------|
| Random ebool   | `FHE.randEbool()`             |
| Random euint8  | `FHE.randEuint8()`            |
| Random euint16 | `FHE.randEuint16()`           |
| Random euint32 | `FHE.randEuint32()`           |
| Random euint64 | `FHE.randEuint64()`           |
| Bounded random | `FHE.randEuint8(upperBound)`  |

**CRITICAL**: Bounded random upper bound MUST be a power of 2.
```solidity
FHE.randEuint8(32);    // OK — returns [0, 31]
FHE.randEuint8(100);   // WRONG — 100 is not a power of 2
FHE.randEuint16(512);  // OK — returns [0, 511]
```

**CRITICAL**: Random ONLY works in transactions, NOT in `view`/`pure` functions
or `eth_call`. The PRNG state must mutate on-chain.

---

## Scalar overloads

Many operations accept a plaintext second argument:
```solidity
euint32 result = FHE.add(encrypted, 5);        // encrypted + plaintext
euint32 result = FHE.mul(encrypted, 2);        // encrypted * plaintext
ebool check    = FHE.gt(encrypted, 100);       // encrypted > plaintext
euint32 result = FHE.div(encrypted, 10);       // encrypted / plaintext (ONLY scalar)
```

This is cheaper than converting the plaintext to encrypted first.

---

## The `FHE.select` pattern — replacing if/else

### WRONG (will not compile)
```solidity
// NEVER DO THIS
if (FHE.gt(balance, amount)) {   // ebool is not bool!
    balance = FHE.sub(balance, amount);
}
```

### CORRECT
```solidity
ebool hasEnough = FHE.ge(balance, amount);
euint64 newBalance = FHE.select(
    hasEnough,
    FHE.sub(balance, amount),   // if true: subtract
    balance                      // if false: keep unchanged
);
```

### Multi-condition example (if/else if/else)
```solidity
// Tiered pricing: amount < 10 → price A, amount < 100 → price B, else → price C
ebool isSmall  = FHE.lt(amount, FHE.asEuint32(10));
ebool isMedium = FHE.lt(amount, FHE.asEuint32(100));

euint32 price = FHE.select(
    isSmall,
    priceA,
    FHE.select(isMedium, priceB, priceC)
);
```

### Silent failure pattern (replacing require)
```solidity
// Instead of: require(balance >= amount, "Insufficient balance");
ebool canTransfer = FHE.ge(senderBalance, amount);
euint64 transferAmount = FHE.select(canTransfer, amount, FHE.asEuint64(0));
// Transfer proceeds with 0 if insufficient — no information leaked
```

---

## Operation costs (approximate gas)

| Operation                   | Gas estimate | Relative cost |
|-----------------------------|-------------|---------------|
| `FHE.add` / `FHE.sub`      | ~100,000    | Low           |
| `FHE.mul`                   | ~200,000    | Medium        |
| `FHE.div` / `FHE.rem`      | ~300,000    | High          |
| `FHE.lt` / `FHE.gt` / etc. | ~150,000    | Medium        |
| `FHE.select`                | ~100,000    | Low           |
| `FHE.and` / `FHE.or`       | ~50,000     | Low           |
| `FHE.randEuint64`           | ~200,000    | Medium        |
| `FHE.fromExternal`          | ~150,000    | Medium        |

**Design implications:**
- A single function with 5 FHE operations costs ~500K-1M gas
- Loops with FHE ops are dangerous — design for constant-count operations
- Prefer scalar overloads when one operand is known at compile time
- Batch updates across transactions when possible
