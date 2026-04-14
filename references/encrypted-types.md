# Encrypted Types Reference

> Load when working with any encrypted state variables or function parameters.

---

## Available types

### Storage / computation types
| Type       | Plaintext equivalent | Bits | Operations supported                          |
|------------|---------------------|------|-----------------------------------------------|
| `ebool`    | `bool`              | 2    | and, or, xor, eq, ne, not, select, rand       |
| `euint8`   | `uint8`             | 8    | ALL: arithmetic, bitwise, comparison, rand     |
| `euint16`  | `uint16`            | 16   | ALL (same as euint8)                           |
| `euint32`  | `uint32`            | 32   | ALL (same as euint8)                           |
| `euint64`  | `uint64`            | 64   | ALL (same as euint8)                           |
| `euint128` | `uint128`           | 128  | ALL (same as euint8)                           |
| `euint256` | `uint256`           | 256  | **NO arithmetic** — bitwise, eq, ne, select, rand only |
| `eaddress` | `address`           | 160  | **eq, ne, select ONLY** — no arithmetic or bitwise     |

**Operator overloads**: `+`, `-`, `*`, `&`, `|`, `^`, `~` work on euint8-128.
But NOT for comparisons (`>`, `<`, `==` won't work) — use `FHE.gt()`, `FHE.eq()`, etc.

### External input types (for function parameters receiving user input)
| Type                | Accepts encrypted input for |
|---------------------|-----------------------------|
| `externalEbool`     | `ebool`                     |
| `externalEuint8`    | `euint8`                    |
| `externalEuint16`   | `euint16`                   |
| `externalEuint32`   | `euint32`                   |
| `externalEuint64`   | `euint64`                   |
| `externalEuint128`  | `euint128`                  |
| `externalEuint256`  | `euint256`                  |
| `externalEaddress`  | `eaddress`                  |

---

## Conversions

### Plaintext → Encrypted
```solidity
euint8   val8   = FHE.asEuint8(42);
euint16  val16  = FHE.asEuint16(1000);
euint32  val32  = FHE.asEuint32(100000);
euint64  val64  = FHE.asEuint64(1e18);
euint128 val128 = FHE.asEuint128(0);
euint256 val256 = FHE.asEuint256(0);
ebool    flag   = FHE.asEbool(true);
eaddress addr   = FHE.asEaddress(0x1234...);
```

### External input → Encrypted (requires proof)
```solidity
function myFunc(externalEuint64 input, bytes calldata proof) external {
    euint64 encrypted = FHE.fromExternal(input, proof);
}
```

### Cross-type casting
```solidity
euint32 small = FHE.asEuint32(100);
euint64 big   = FHE.asEuint64(small);   // Upcast: safe
euint16 tiny  = FHE.asEuint16(small);   // Downcast: truncates, be careful
```

### To bytes32 (for use as mapping keys or events)
```solidity
bytes32 raw = FHE.toBytes32(encryptedHandle);
```

---

## Critical rules

### 1. Default value is NOT zero
An uninitialized `euint32` variable is a null handle (`bytes32(0)`),
not an encrypted zero. Before first use, initialize:
```solidity
euint32 private _counter = FHE.asEuint32(0);  // Explicit zero
```
Or initialize in constructor/initializer.

### 2. Encrypted types are handles, not values
`euint32` is actually a `bytes32` under the hood — a reference to encrypted
data in the coprocessor. You cannot:
- Print or log the actual value
- Compare handles directly (`handle1 == handle2` compares references, not values)
- Use them in `abi.encode` expecting numeric behavior

### 3. Storage costs
Encrypted types cost the same as `bytes32` to store (one storage slot).
The expensive part is computation, not storage.

### 4. Check initialization
```solidity
if (!FHE.isInitialized(_counter)) {
    _counter = FHE.asEuint32(0);
}
```
`FHE.isInitialized(handle)` returns `bool` — checks if a handle has been set.
Useful for lazy initialization patterns.

### 5. Choosing the right type
- **Token balances**: `euint64` (matches ERC-7984 standard)
- **Counters/scores**: `euint32` (cheaper operations than larger types)
- **Flags/conditions**: `ebool`
- **Addresses**: `eaddress` (if the address itself must be private)
- **Large hashes**: `euint256` (BUT no arithmetic — bitwise only!)
- **General rule**: Use the smallest type that fits your data range.
  Smaller types = cheaper FHE operations (measured in HCU — Homomorphic
  Complexity Units). Range: 2 HCU (bool not) to 1,943,000 HCU (128-bit rem).

### 5. Import only what you need
```solidity
// Good — explicit imports
import {FHE, euint64, externalEuint64, ebool} from "@fhevm/solidity/lib/FHE.sol";

// Also fine — import everything
import {FHE, euint8, euint16, euint32, euint64, euint128, euint256,
        ebool, eaddress,
        externalEuint8, externalEuint16, externalEuint32, externalEuint64,
        externalEuint128, externalEuint256, externalEbool, externalEaddress
} from "@fhevm/solidity/lib/FHE.sol";
```
