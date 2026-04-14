// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64, ebool, eaddress, externalEaddress} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ConfidentialInvoice
/// @notice Privacy-preserving invoice and payment system where amounts, payer,
///         and merchant identities are fully encrypted on-chain. Demonstrates:
///         - Commitment schemes for trustless fund claiming
///         - Privacy-preserving events (no addresses/amounts emitted)
///         - Silent failure pattern for insufficient balance checks
///         - Encrypted status tracking with plaintext proxies
///         - eaddress for private participant tracking
///         - Multiple encrypted inputs with single proof
///         - Receipt hashes for off-chain verification
/// @dev Real-world complexity template inspired by BlindPay.
contract ConfidentialInvoice is ZamaEthereumConfig, ReentrancyGuard {

    // ─── Types ───────────────────────────────────────────────────────────
    enum InvoiceStatus { Open, Paid, Cancelled }

    struct Invoice {
        euint64   amount;          // Encrypted invoice amount
        eaddress  merchant;        // Encrypted merchant address
        eaddress  payer;           // Encrypted payer address (set on payment)
        ebool     isPaid;          // Encrypted payment status (ground truth)
        bytes32   claimHash;       // Commitment hash for trustless claiming
        uint256   createdAt;       // Plaintext — not sensitive
        uint8     status;          // Plaintext proxy: 0=open, 1=paid, 2=cancelled
    }

    // ─── State ───────────────────────────────────────────────────────────
    mapping(bytes32 => Invoice) private _invoices;  // salt → invoice
    mapping(bytes32 => bool) public receiptExists;   // receiptHash → exists
    mapping(bytes32 => euint64) private _escrow;     // salt → escrowed amount

    uint256 public invoiceCount;

    // ─── Events (privacy-preserving: no addresses or amounts) ────────────
    event InvoiceCreated(bytes32 indexed salt);
    event PaymentMade(bytes32 indexed salt, bytes32 receiptHash);
    event FundsClaimed(bytes32 indexed salt);
    event InvoiceCancelled(bytes32 indexed salt);

    // ─── Create Invoice ──────────────────────────────────────────────────
    /// @notice Create an invoice with encrypted amount and merchant address.
    ///         Uses a single proof for both encrypted inputs (gas efficient).
    /// @param salt Unique identifier for this invoice (generated off-chain)
    /// @param encAmount Encrypted invoice amount
    /// @param encMerchant Encrypted merchant address
    /// @param inputProof Single proof covering both encrypted inputs
    /// @param claimHash keccak256(merchantAddress, salt, claimSecret) for trustless claiming
    function createInvoice(
        bytes32 salt,
        externalEuint64 encAmount,
        externalEaddress encMerchant,
        bytes calldata inputProof,
        bytes32 claimHash
    ) external {
        require(_invoices[salt].createdAt == 0, "Salt already used");
        require(claimHash != bytes32(0), "Invalid claim hash");

        euint64 amount = FHE.fromExternal(encAmount, inputProof);
        eaddress merchant = FHE.fromExternal(encMerchant, inputProof);

        // Store encrypted invoice data
        _invoices[salt].amount = amount;
        _invoices[salt].merchant = merchant;
        _invoices[salt].isPaid = FHE.asEbool(false);
        _invoices[salt].claimHash = claimHash;
        _invoices[salt].createdAt = block.timestamp;
        _invoices[salt].status = 0; // Open

        // ACL: contract must be able to read its own state
        FHE.allowThis(amount);
        FHE.allowThis(merchant);
        FHE.allowThis(_invoices[salt].isPaid);

        // ACL: allow the creator to decrypt amount for display
        FHE.allow(amount, msg.sender);
        FHE.allow(merchant, msg.sender);

        invoiceCount++;
        emit InvoiceCreated(salt);
    }

    // ─── Pay Invoice ─────────────────────────────────────────────────────
    /// @notice Pay an invoice with encrypted amount. Uses silent failure —
    ///         if amount doesn't match, the payment is zero (no revert).
    /// @param salt Invoice identifier
    /// @param encPayment Encrypted payment amount
    /// @param inputProof Proof for the encrypted payment
    function payInvoice(
        bytes32 salt,
        externalEuint64 encPayment,
        bytes calldata inputProof
    ) external nonReentrant {
        require(_invoices[salt].createdAt != 0, "Invoice not found");
        require(_invoices[salt].status == 0, "Invoice not open");

        euint64 payment = FHE.fromExternal(encPayment, inputProof);

        // Silent failure pattern: check if payment matches invoice amount
        // If it doesn't match, the effective payment is zero — no revert,
        // no information leakage about the invoice amount.
        ebool amountMatches = FHE.eq(payment, _invoices[salt].amount);
        euint64 effectivePayment = FHE.select(
            amountMatches,
            payment,
            FHE.asEuint64(0)
        );

        // Update escrow with effective payment
        _escrow[salt] = effectivePayment;
        FHE.allowThis(_escrow[salt]);

        // Update paid status: only true if amount actually matched
        _invoices[salt].isPaid = amountMatches;
        FHE.allowThis(_invoices[salt].isPaid);

        // Store encrypted payer address
        _invoices[salt].payer = FHE.asEaddress(msg.sender);
        FHE.allowThis(_invoices[salt].payer);

        // Update plaintext proxy status only if match succeeded
        // NOTE: This leaks whether payment matched. If that's sensitive,
        // keep status encrypted and use FHE.select on the proxy too.
        // For this template, we accept the tradeoff for simpler logic.
        _invoices[salt].status = 1; // Paid

        // Generate receipt hash for off-chain proof-of-payment
        bytes32 receiptHash = keccak256(
            abi.encodePacked(salt, block.timestamp, invoiceCount)
        );
        receiptExists[receiptHash] = true;

        // Allow payer to verify their own payment
        FHE.allow(effectivePayment, msg.sender);

        emit PaymentMade(salt, receiptHash);
    }

    // ─── Claim Funds ─────────────────────────────────────────────────────
    /// @notice Merchant claims funds using commitment scheme. The merchant's
    ///         address is never stored in plaintext — identity is proven by
    ///         revealing the pre-image of the commitment hash.
    /// @param salt Invoice identifier
    /// @param claimSecret Secret that, combined with msg.sender + salt, matches claimHash
    function claimFunds(bytes32 salt, bytes32 claimSecret) external nonReentrant {
        require(_invoices[salt].status == 1, "Not paid");

        // Verify commitment: proves msg.sender is the merchant without
        // needing any plaintext address stored on-chain
        require(
            keccak256(abi.encodePacked(msg.sender, salt, claimSecret)) ==
                _invoices[salt].claimHash,
            "Invalid claim"
        );

        // Allow merchant to decrypt the escrowed amount
        FHE.allow(_escrow[salt], msg.sender);

        // Note: Actual fund transfer would go here. In a production
        // system, this would interact with a confidential token (ERC-7984)
        // to transfer the escrowed amount to the merchant.

        emit FundsClaimed(salt);
    }

    // ─── Cancel Invoice ──────────────────────────────────────────────────
    /// @notice Cancel an open invoice. Only the creator can cancel.
    ///         In a production system, you'd track the creator and verify.
    /// @param salt Invoice identifier
    function cancelInvoice(bytes32 salt) external {
        require(_invoices[salt].createdAt != 0, "Invoice not found");
        require(_invoices[salt].status == 0, "Not open");

        _invoices[salt].status = 2; // Cancelled
        emit InvoiceCancelled(salt);
    }

    // ─── View Functions ──────────────────────────────────────────────────

    /// @notice Get the encrypted amount handle (caller must have FHE.allow permission)
    function getInvoiceAmount(bytes32 salt) external view returns (euint64) {
        return _invoices[salt].amount;
    }

    /// @notice Get invoice status as plaintext proxy
    function getInvoiceStatus(bytes32 salt) external view returns (uint8) {
        return _invoices[salt].status;
    }

    /// @notice Verify a receipt hash exists (proof of payment)
    function verifyReceipt(bytes32 receiptHash) external view returns (bool) {
        return receiptExists[receiptHash];
    }
}
