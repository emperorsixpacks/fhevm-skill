// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64, ebool, eaddress} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title SealedBidAuction
/// @notice Sealed-bid auction where bids are encrypted. Nobody (not even the
///         auctioneer) can see bid amounts until the auction ends. The highest
///         bid wins. Demonstrates: encrypted comparisons with FHE.select,
///         eaddress for private winner tracking, public decryption for reveal,
///         and the complete auction lifecycle.
contract SealedBidAuction is ZamaEthereumConfig {
    address public auctioneer;
    bool public biddingOpen;
    bool public winnerRevealed;

    euint64 private _highestBid;
    eaddress private _highestBidder;
    uint256 public bidCount;

    // Public results (populated after reveal)
    uint64 public winningBid;
    address public winner;

    mapping(address => bool) public hasBid;

    event BidPlaced(address indexed bidder);
    event AuctionEnded();
    event WinnerRevealed(address winner, uint64 amount);

    modifier onlyAuctioneer() {
        require(msg.sender == auctioneer, "Not auctioneer");
        _;
    }

    constructor() {
        auctioneer = msg.sender;
        biddingOpen = true;

        // Initialize with zero bid and zero address
        _highestBid = FHE.asEuint64(0);
        _highestBidder = FHE.asEaddress(address(0));
        FHE.allowThis(_highestBid);
        FHE.allowThis(_highestBidder);
    }

    /// @notice Place a sealed bid. The bid amount is encrypted — nobody can
    ///         see it until the auction is revealed.
    /// @param encryptedBid The encrypted bid amount
    /// @param inputProof Proof of valid encryption
    function placeBid(externalEuint64 encryptedBid, bytes calldata inputProof) external {
        require(biddingOpen, "Bidding closed");
        require(!hasBid[msg.sender], "Already bid");
        hasBid[msg.sender] = true;

        euint64 bid = FHE.fromExternal(encryptedBid, inputProof);

        // Compare new bid against current highest — CANNOT use if/else
        ebool isHigher = FHE.gt(bid, _highestBid);

        // Update highest bid using FHE.select (encrypted conditional)
        _highestBid = FHE.select(isHigher, bid, _highestBid);
        _highestBidder = FHE.select(
            isHigher,
            FHE.asEaddress(msg.sender),
            _highestBidder
        );

        // CRITICAL: Allow contract to read these next transaction
        FHE.allowThis(_highestBid);
        FHE.allowThis(_highestBidder);

        bidCount++;
        emit BidPlaced(msg.sender);
    }

    /// @notice End bidding and request public decryption of the winner.
    function endAuction() external onlyAuctioneer {
        require(biddingOpen, "Already ended");
        biddingOpen = false;

        // Mark for public decryption
        FHE.makePubliclyDecryptable(_highestBid);
        FHE.makePubliclyDecryptable(_highestBidder);

        emit AuctionEnded();
    }

    /// @notice Callback to reveal winner after decryption by the relayer.
    /// @param winningAmount The decrypted winning bid amount
    /// @param winnerAddress The decrypted winner address
    /// @param proof Cryptographic proof of correct decryption
    function revealWinner(
        uint64 winningAmount,
        address winnerAddress,
        bytes calldata proof
    ) external {
        require(!biddingOpen, "Bidding still open");
        require(!winnerRevealed, "Already revealed");

        // Verify decryption proof
        bytes32[] memory handles = new bytes32[](2);
        handles[0] = FHE.toBytes32(_highestBid);
        handles[1] = FHE.toBytes32(_highestBidder);
        FHE.checkSignatures(
            handles,
            abi.encode(winningAmount, winnerAddress),
            proof
        );

        winningBid = winningAmount;
        winner = winnerAddress;
        winnerRevealed = true;

        emit WinnerRevealed(winnerAddress, winningAmount);
    }
}
