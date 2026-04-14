// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title ConfidentialVoting
/// @notice Private voting where individual votes are encrypted but the
///         final tally can be publicly revealed. Demonstrates: encrypted
///         state, FHE.select (no if/else), FHE.asEuint64 for constants,
///         public decryption pattern, and access control.
contract ConfidentialVoting is ZamaEthereumConfig {
    address public admin;
    bool public votingOpen;
    bool public tallyRevealed;

    euint64 private _yesVotes;
    euint64 private _noVotes;
    uint64 public finalYesCount;
    uint64 public finalNoCount;

    mapping(address => bool) public hasVoted;

    event VoteCast(address indexed voter);
    event TallyRevealRequested();
    event TallyRevealed(uint64 yesVotes, uint64 noVotes);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    constructor() {
        admin = msg.sender;
        votingOpen = true;

        // Initialize encrypted counters to zero
        _yesVotes = FHE.asEuint64(0);
        _noVotes = FHE.asEuint64(0);
        FHE.allowThis(_yesVotes);
        FHE.allowThis(_noVotes);
    }

    /// @notice Cast a vote. The vote value is encrypted — nobody can see
    ///         how any individual voted.
    /// @param encryptedVote Encrypted value: any non-zero = yes, zero = no
    /// @param inputProof Proof of valid encryption
    function castVote(externalEuint64 encryptedVote, bytes calldata inputProof) external {
        require(votingOpen, "Voting closed");
        require(!hasVoted[msg.sender], "Already voted");
        hasVoted[msg.sender] = true;

        euint64 vote = FHE.fromExternal(encryptedVote, inputProof);

        // Determine if vote is "yes" (non-zero) or "no" (zero)
        // CANNOT use: if (vote > 0) — must use FHE.select
        ebool isYes = FHE.gt(vote, FHE.asEuint64(0));
        euint64 one = FHE.asEuint64(1);
        euint64 zero = FHE.asEuint64(0);

        // Add 1 to yes or no counter based on the encrypted vote
        euint64 yesIncrement = FHE.select(isYes, one, zero);
        euint64 noIncrement = FHE.select(isYes, zero, one);

        _yesVotes = FHE.add(_yesVotes, yesIncrement);
        _noVotes = FHE.add(_noVotes, noIncrement);

        // Allow contract to read its own state
        FHE.allowThis(_yesVotes);
        FHE.allowThis(_noVotes);

        emit VoteCast(msg.sender);
    }

    /// @notice Close voting and request public decryption of the tally.
    function closePollAndRequestTally() external onlyAdmin {
        require(votingOpen, "Already closed");
        votingOpen = false;

        // Mark tallies as publicly decryptable
        FHE.makePubliclyDecryptable(_yesVotes);
        FHE.makePubliclyDecryptable(_noVotes);

        emit TallyRevealRequested();
    }

    /// @notice Callback for the relayer to submit decrypted tally with proof.
    /// @param yesCount Decrypted yes vote count
    /// @param noCount Decrypted no vote count
    /// @param proof Cryptographic proof of correct decryption
    function revealTally(uint64 yesCount, uint64 noCount, bytes calldata proof) external {
        require(!votingOpen, "Voting still open");
        require(!tallyRevealed, "Already revealed");

        // Verify the decryption proof
        bytes32[] memory handles = new bytes32[](2);
        handles[0] = FHE.toBytes32(_yesVotes);
        handles[1] = FHE.toBytes32(_noVotes);
        FHE.checkSignatures(handles, abi.encode(yesCount, noCount), proof);

        finalYesCount = yesCount;
        finalNoCount = noCount;
        tallyRevealed = true;

        emit TallyRevealed(yesCount, noCount);
    }
}
