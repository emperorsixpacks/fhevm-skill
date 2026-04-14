// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title ConfidentialCounter
/// @notice Simplest FHEVM contract — an encrypted counter that only the
///         caller can read. Demonstrates: encrypted state, input proofs,
///         ACL permissions, and the complete FHE lifecycle.
contract ConfidentialCounter is ZamaEthereumConfig {
    /// @dev The encrypted count. Only addresses with FHE.allow permission can decrypt.
    euint32 private _count;

    /// @notice Returns the encrypted handle of the current count.
    ///         The caller must decrypt this off-chain using the relayer SDK.
    function getCount() external view returns (euint32) {
        return _count;
    }

    /// @notice Increment the counter by an encrypted amount.
    /// @param encryptedAmount The encrypted value to add (from relayer SDK)
    /// @param inputProof Proof that the encryption is valid
    function increment(externalEuint32 encryptedAmount, bytes calldata inputProof) external {
        // Convert external input to usable encrypted type
        euint32 amount = FHE.fromExternal(encryptedAmount, inputProof);

        // Add to current count (produces a NEW encrypted handle)
        _count = FHE.add(_count, amount);

        // CRITICAL: Allow the contract to read its own state next transaction
        FHE.allowThis(_count);

        // CRITICAL: Allow the caller to decrypt the result
        FHE.allow(_count, msg.sender);
    }

    /// @notice Decrement the counter by an encrypted amount.
    /// @param encryptedAmount The encrypted value to subtract
    /// @param inputProof Proof that the encryption is valid
    function decrement(externalEuint32 encryptedAmount, bytes calldata inputProof) external {
        euint32 amount = FHE.fromExternal(encryptedAmount, inputProof);
        _count = FHE.sub(_count, amount);
        FHE.allowThis(_count);
        FHE.allow(_count, msg.sender);
    }

    /// @notice Reset counter to encrypted zero. Only allows caller to decrypt.
    function reset() external {
        _count = FHE.asEuint32(0);
        FHE.allowThis(_count);
        FHE.allow(_count, msg.sender);
    }
}
