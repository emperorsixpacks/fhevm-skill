# Anti-Patterns Bible — Every Known FHEVM Mistake

> This is the comprehensive reference. The top-12 in SKILL.md is the
> abbreviated version. Load this when debugging or reviewing code.

---

## Category 1: Language-level mistakes

### AP-1: Branching on encrypted values
```solidity
// BROKEN — ebool is not bool
if (FHE.gt(a, b)) { ... }
require(FHE.ge(balance, amount), "Insufficient");
assert(FHE.eq(a, b));

// CORRECT
ebool condition = FHE.gt(a, b);
result = FHE.select(condition, valueIfTrue, valueIfFalse);
```
**Why it breaks**: `FHE.gt()` returns `ebool` (encrypted boolean), not `bool`.
Solidity `if`/`require`/`assert` need `bool`. The compiler will error, but
agents consistently generate this pattern.

### AP-2: Direct arithmetic on encrypted types
```solidity
// BROKEN — operator overloading doesn't exist
euint32 result = a + b;
euint32 result = a * 2;
bool isGreater = a > b;

// CORRECT
euint32 result = FHE.add(a, b);
euint32 result = FHE.mul(a, 2);
ebool isGreater = FHE.gt(a, b);
```

### AP-3: Comparing encrypted handles directly
```solidity
// BROKEN — compares memory references, not values
if (encryptedA == encryptedB) { ... }

// CORRECT
ebool isEqual = FHE.eq(encryptedA, encryptedB);
```

---

## Category 2: ACL mistakes (silent failures)

### AP-4: Missing `FHE.allowThis()` after state update
```solidity
// BROKEN — contract can't read _count on next tx
_count = FHE.add(_count, increment);
// Missing: FHE.allowThis(_count);

// CORRECT
_count = FHE.add(_count, increment);
FHE.allowThis(_count);
```

### AP-5: Missing `FHE.allow()` for user decryption
```solidity
// BROKEN — user can never decrypt their balance
_balances[msg.sender] = FHE.add(_balances[msg.sender], amount);
FHE.allowThis(_balances[msg.sender]);
// Missing: FHE.allow(_balances[msg.sender], msg.sender);

// CORRECT
_balances[msg.sender] = FHE.add(_balances[msg.sender], amount);
FHE.allowThis(_balances[msg.sender]);
FHE.allow(_balances[msg.sender], msg.sender);
```

### AP-6: ACL on old handle instead of new handle
```solidity
// BROKEN — allowThis on the OLD value before reassignment
FHE.allowThis(_count);
_count = FHE.add(_count, increment);

// CORRECT — allowThis on the NEW value after assignment
_count = FHE.add(_count, increment);
FHE.allowThis(_count);
```

---

## Category 3: Input handling mistakes

### AP-7: Missing input proof parameter
```solidity
// BROKEN — missing proof
function deposit(externalEuint64 amount) external {
    euint64 enc = FHE.fromExternal(amount, ???);
}

// CORRECT
function deposit(externalEuint64 amount, bytes calldata inputProof) external {
    euint64 enc = FHE.fromExternal(amount, inputProof);
}
```

### AP-8: Using FHE.asEuintXX for user input
```solidity
// BROKEN — amount is PUBLIC in calldata, not encrypted
function deposit(uint64 amount) external {
    euint64 enc = FHE.asEuint64(amount);
}

// CORRECT — amount is encrypted before reaching the contract
function deposit(externalEuint64 amount, bytes calldata inputProof) external {
    euint64 enc = FHE.fromExternal(amount, inputProof);
}
```
`FHE.asEuint64(plaintext)` is for encrypting KNOWN values on-chain
(like initializing a counter to 0). It does NOT provide privacy for user inputs.

### AP-9: Separate proofs for multiple inputs
```solidity
// BROKEN — one proof covers all inputs
function bid(
    externalEuint64 amount, bytes calldata proof1,
    externalEbool flag, bytes calldata proof2
) external { ... }

// CORRECT — single proof for all inputs
function bid(
    externalEuint64 amount,
    externalEbool flag,
    bytes calldata inputProof
) external {
    euint64 encAmount = FHE.fromExternal(amount, inputProof);
    ebool encFlag = FHE.fromExternal(flag, inputProof);
}
```

---

## Category 4: Decryption mistakes

### AP-10: Synchronous public decryption
```solidity
// BROKEN — decrypt is NOT synchronous
function getResult() external view returns (uint64) {
    return FHE.decrypt(_encryptedValue);  // This function doesn't exist
}

// CORRECT — async oracle pattern
function requestDecryption() external {
    FHE.makePubliclyDecryptable(_encryptedValue);
    emit DecryptionRequested(FHE.toBytes32(_encryptedValue));
}
function callback(uint64 clearValue, bytes calldata proof) external {
    FHE.checkSignatures(...);
    _result = clearValue;
}
```

### AP-11: Public decryption without access control
```solidity
// DANGEROUS — anyone can trigger decryption of any user's balance
function revealBalance(address user) external {
    FHE.makePubliclyDecryptable(_balances[user]);
}

// CORRECT — only the user can reveal their own balance
function revealMyBalance() external {
    FHE.makePubliclyDecryptable(_balances[msg.sender]);
}
```

### AP-12: Callback without proof verification
```solidity
// DANGEROUS — anyone can call with fake values
function callback(uint64 value) external {
    _result = value;
}

// CORRECT
function callback(uint64 value, bytes calldata proof) external {
    bytes32[] memory handles = new bytes32[](1);
    handles[0] = FHE.toBytes32(_encryptedValue);
    FHE.checkSignatures(handles, abi.encode(value), proof);
    _result = value;
}
```

---

## Category 5: Performance mistakes

### AP-13: Unbounded loops with FHE operations
```solidity
// DANGEROUS — can exceed gas limits
for (uint i = 0; i < voters.length; i++) {
    _totalVotes = FHE.add(_totalVotes, _votes[voters[i]]);
}

// BETTER — accumulate incrementally per transaction
function castVote(externalEuint32 vote, bytes calldata proof) external {
    euint32 encVote = FHE.fromExternal(vote, proof);
    _totalVotes = FHE.add(_totalVotes, encVote);
    FHE.allowThis(_totalVotes);
}
```

### AP-14: Unnecessary encrypted operations
```solidity
// WASTEFUL — public data doesn't need encryption
euint32 encTimestamp = FHE.asEuint32(block.timestamp);

// CORRECT — only encrypt what needs to be private
uint256 deadline = block.timestamp + 1 hours;
```

---

## Category 6: Configuration mistakes

### AP-15: Wrong Solidity version or EVM target
```typescript
// BROKEN
solidity: { version: "0.8.20" }  // Too old
// or
settings: { evmVersion: "shanghai" }  // Wrong EVM version

// CORRECT
solidity: {
    version: "0.8.27",
    settings: { evmVersion: "cancun" }
}
```

### AP-16: Missing ZamaEthereumConfig inheritance
```solidity
// BROKEN — contract doesn't know where coprocessor is
contract MyToken {
    euint64 _balance;
}

// CORRECT
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
contract MyToken is ZamaEthereumConfig {
    euint64 _balance;
}
```

### AP-17: Using deprecated packages
```json
// BROKEN — deprecated
"fhevm": "^0.6.0",
"fhevmjs": "^0.6.0"

// CORRECT — current packages
"@fhevm/solidity": "^0.11.1",
"@zama-fhe/relayer-sdk": "^0.4.1"
```

### AP-18: Odd Node.js version
```bash
# BROKEN — odd versions cause native module failures
node --version  # v21.x or v23.x

# CORRECT
node --version  # v20.x or v22.x (even versions only)
```

### AP-18b: Using arithmetic on euint256
```solidity
// BROKEN — euint256 has NO arithmetic operations
euint256 result = FHE.add(a256, b256);   // Will not compile

// euint256 only supports: bitwise (and/or/xor/shl/shr/rotl/rotr),
// eq, ne, neg, not, select, rand, randBounded
```

### AP-18c: Using arithmetic/bitwise on eaddress
```solidity
// BROKEN — eaddress only supports eq, ne, select
eaddress result = FHE.add(addr1, addr2);   // Will not compile

// CORRECT — only comparisons and select
ebool isSame = FHE.eq(addr1, addr2);
eaddress chosen = FHE.select(condition, addr1, addr2);
```

### AP-18d: Non-power-of-2 bound for random
```solidity
// BROKEN — 100 is not a power of 2
euint8 roll = FHE.randEuint8(100);

// CORRECT — use 128 (nearest power of 2 above 100)
euint8 roll = FHE.randEuint8(128);  // Returns [0, 127]
```

### AP-18e: Random in view/pure functions
```solidity
// BROKEN — PRNG state must mutate on-chain
function getRandom() external view returns (euint8) {
    return FHE.randEuint8();  // Will fail — no state mutation allowed
}

// CORRECT — must be a state-changing function
function generateRandom() external returns (euint8) {
    euint8 r = FHE.randEuint8();
    FHE.allowThis(r);
    FHE.allow(r, msg.sender);
    return r;
}
```

---

## Category 7: Information leakage

### AP-19: Revert leaks balance information
```solidity
// LEAKS INFO — observer knows balance < amount if tx reverts
require(FHE.ge(balance, amount));  // Can't even compile, but the INTENT is wrong

// CORRECT — silent failure leaks nothing
euint64 transferAmount = FHE.select(
    FHE.ge(balance, amount),
    amount,
    FHE.asEuint64(0)
);
```

### AP-20: Gas side-channel leaks branch info
```solidity
// LEAKS INFO — different gas costs reveal which path was taken
if (somePublicCondition) {
    result = FHE.add(a, b);     // 1 FHE op
} else {
    result = FHE.mul(a, b);     // 1 FHE op but different cost
    result = FHE.add(result, c); // 2 FHE ops total
}

// BETTER — constant gas regardless of condition
euint64 pathA = FHE.add(a, b);
euint64 pathB = FHE.add(FHE.mul(a, b), c);
result = FHE.select(condition, pathA, pathB);  // Both paths always computed
```

### AP-21: Event parameters leak encrypted data
```solidity
// LEAKS INFO — logging the encrypted handle in an event is fine,
// but logging associated metadata can leak info
event Transfer(address indexed from, address indexed to, uint256 amount);
// ↑ amount is public! Use encrypted events or omit the amount.

// BETTER
event ConfidentialTransfer(address indexed from, address indexed to);
// Amount is intentionally omitted — it's confidential
```
