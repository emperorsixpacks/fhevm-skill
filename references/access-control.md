# Access Control (ACL) Reference

> Load when working with encrypted state that users or contracts need to access.
> This is THE most common source of silent bugs in FHEVM contracts.

---

## Why ACL exists

Every encrypted value (ciphertext handle) has an access list. Only addresses
on the list can decrypt or re-encrypt the value. This prevents unauthorized
users from reading other people's private data.

**The silent failure problem**: If you forget ACL calls, nothing reverts.
The contract compiles. Transactions succeed. But when a user tries to
decrypt their balance, they get nothing. No error — just empty results.
This is the #1 debugging headache in FHEVM development.

---

## ACL operations

### `FHE.allowThis(handle)` — Contract self-access
```solidity
_balance = FHE.add(_balance, amount);
FHE.allowThis(_balance);  // Contract can read _balance in future transactions
```
**WHEN**: After EVERY operation that produces a new ciphertext that will be
stored in contract state. This includes `FHE.add`, `FHE.sub`, `FHE.mul`,
`FHE.select`, `FHE.fromExternal`, and every other operation that returns
an encrypted type.

**WHY**: Operations create NEW handles. The old handle had permissions;
the new one starts with zero permissions. Without `allowThis`, the contract
cannot access its own state variable on the next call.

### `FHE.allow(handle, address)` — Permanent user access
```solidity
FHE.allow(_balance, msg.sender);  // msg.sender can decrypt _balance
```
**WHEN**: After storing a new ciphertext that a specific user should be
able to decrypt. Typically `msg.sender`.

**WHY**: Without this, the user can see they have an encrypted balance,
but they can never decrypt it to know the actual value.

### `FHE.allowTransient(handle, address)` — Transaction-only access
```solidity
FHE.allowTransient(intermediateResult, address(otherContract));
```
**WHEN**: Passing encrypted data between contracts within one transaction.
Cheaper than `allow` because it doesn't write to storage.

**WHY**: The receiving contract needs permission to operate on the handle,
but that permission only needs to last for the current transaction.

### `FHE.makePubliclyDecryptable(handle)` — Public decryption
```solidity
FHE.makePubliclyDecryptable(_totalVotes);  // Anyone can decrypt
```
**WHEN**: The encrypted value should become public (e.g., final vote tally,
auction winner determination).

**WHY**: Allows any address to submit a decryption request.

### `FHE.isSenderAllowed(handle)` — Check permissions
```solidity
require(FHE.isSenderAllowed(_balance[msg.sender]), "Not authorized");
```
**WHEN**: Before exposing a decryption path. This is a cleartext `bool`
(not `ebool`) so it CAN be used in `require`.

**WHY**: Prevents information leakage from unauthorized decryption attempts.

---

## Fluent syntax

Chain multiple ACL calls:
```solidity
euint64 newBalance = FHE.add(balance, amount);
newBalance.allowThis().allow(msg.sender);
// Equivalent to:
// FHE.allowThis(newBalance);
// FHE.allow(newBalance, msg.sender);
```

For enabling `using FHE for *`:
```solidity
using FHE for *;

euint64 newBalance = FHE.add(balance, amount);
newBalance.allowThis().allow(addr1).allow(addr2);
```

---

## Complete pattern: token balance update

```solidity
function _updateBalance(address user, euint64 newBalance) internal {
    _balances[user] = newBalance;

    // Contract needs to read this balance in future transactions
    FHE.allowThis(newBalance);

    // The user needs to decrypt their own balance
    FHE.allow(newBalance, user);

    // If an admin/owner also needs to see it:
    // FHE.allow(newBalance, owner());
}
```

---

## Complete pattern: transfer between users

```solidity
function _transfer(address from, address to, euint64 amount) internal {
    ebool canTransfer = FHE.ge(_balances[from], amount);
    euint64 transferAmount = FHE.select(canTransfer, amount, FHE.asEuint64(0));

    // Update sender balance
    euint64 newFromBalance = FHE.sub(_balances[from], transferAmount);
    _balances[from] = newFromBalance;
    FHE.allowThis(newFromBalance);     // Contract reads sender balance later
    FHE.allow(newFromBalance, from);   // Sender can decrypt their balance

    // Update receiver balance
    euint64 newToBalance = FHE.add(_balances[to], transferAmount);
    _balances[to] = newToBalance;
    FHE.allowThis(newToBalance);       // Contract reads receiver balance later
    FHE.allow(newToBalance, to);       // Receiver can decrypt their balance
}
```

---

## Debugging ACL issues

**Symptom**: User calls decrypt but gets empty/null result.
**Cause**: Missing `FHE.allow(handle, user)`.

**Symptom**: Contract reverts on second transaction touching same state.
**Cause**: Missing `FHE.allowThis(handle)` after the first update.

**Symptom**: Cross-contract call fails when passing encrypted value.
**Cause**: Missing `FHE.allowTransient(handle, targetContract)` or
`FHE.allow(handle, targetContract)`.

**Debug checklist**:
1. After every `FHE.add/sub/mul/select/fromExternal` — did you `allowThis`?
2. For every user who needs to read a value — did you `allow(handle, user)`?
3. For cross-contract encrypted data — did you `allowTransient`?
