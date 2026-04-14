// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {FHE, externalEuint64, euint64, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";

/// @title ConfidentialERC20
/// @notice ERC-7984 confidential token with encrypted balances and private
///         transfers. Demonstrates: the ERC-7984 standard, OpenZeppelin
///         confidential contracts, encrypted mint/burn, and silent transfer
///         failure pattern.
/// @dev Requires: npm install @openzeppelin/contracts @openzeppelin/confidential-contracts
contract ConfidentialERC20 is ZamaEthereumConfig, ERC7984, Ownable2Step {

    constructor(
        address owner_,
        uint64 initialSupply,
        string memory name_,
        string memory symbol_,
        string memory contractURI_
    ) ERC7984(name_, symbol_, contractURI_) Ownable(owner_) {
        // Mint initial supply to owner (plaintext value encrypted on-chain)
        _mint(owner_, FHE.asEuint64(initialSupply));
    }

    /// @notice Mint tokens with a plaintext amount (only owner)
    function mint(address to, uint64 amount) external onlyOwner {
        _mint(to, FHE.asEuint64(amount));
    }

    /// @notice Mint tokens with an encrypted amount (only owner)
    function confidentialMint(
        address to,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external onlyOwner returns (euint64) {
        return _mint(to, FHE.fromExternal(encryptedAmount, inputProof));
    }

    /// @notice Burn tokens with a plaintext amount (only owner)
    function burn(address from, uint64 amount) external onlyOwner {
        _burn(from, FHE.asEuint64(amount));
    }

    /// @notice Override _update to grant owner access to total supply handle.
    ///         This is required so the owner can decrypt the confidential total supply.
    function _update(
        address from,
        address to,
        euint64 amount
    ) internal virtual override returns (euint64 transferred) {
        transferred = super._update(from, to, amount);
        // Allow owner to decrypt the total supply
        FHE.allow(confidentialTotalSupply(), owner());
    }
}
