import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("ConfidentialERC20", function () {
  let contract: any;
  let contractAddress: string;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;

  const INITIAL_SUPPLY = 1_000_000n; // 1M tokens
  const TOKEN_NAME = "Confidential Token";
  const TOKEN_SYMBOL = "CTKN";
  const CONTRACT_URI = "https://example.com/metadata";

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("ConfidentialERC20");
    contract = await factory.deploy(
      owner.address,
      INITIAL_SUPPLY,
      TOKEN_NAME,
      TOKEN_SYMBOL,
      CONTRACT_URI,
    );
    await contract.waitForDeployment();
    contractAddress = await contract.getAddress();
  });

  describe("Deployment", function () {
    it("should set the correct owner", async function () {
      expect(await contract.owner()).to.equal(owner.address);
    });

    it("should set token name and symbol", async function () {
      expect(await contract.name()).to.equal(TOKEN_NAME);
      expect(await contract.symbol()).to.equal(TOKEN_SYMBOL);
    });
  });

  describe("Minting", function () {
    it("should allow owner to mint with plaintext amount", async function () {
      const mintAmount = 500n;
      await (await contract.connect(owner).mint(alice.address, mintAmount)).wait();

      // Alice should be able to decrypt her balance
      const handle = await contract.confidentialBalanceOf(alice.address);
      const balance = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        handle,
        contractAddress,
        alice,
      );
      expect(balance).to.equal(mintAmount);
    });

    it("should allow owner to mint with encrypted amount", async function () {
      const mintAmount = 1000n;
      const enc = await fhevm
        .createEncryptedInput(contractAddress, owner.address)
        .add64(mintAmount)
        .encrypt();

      await (
        await contract
          .connect(owner)
          .confidentialMint(alice.address, enc.handles[0], enc.inputProof)
      ).wait();

      const handle = await contract.confidentialBalanceOf(alice.address);
      const balance = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        handle,
        contractAddress,
        alice,
      );
      expect(balance).to.equal(mintAmount);
    });

    it("should reject non-owner mint", async function () {
      await expect(
        contract.connect(alice).mint(alice.address, 100n),
      ).to.be.reverted; // OwnableUnauthorizedAccount
    });
  });

  describe("Burning", function () {
    it("should allow owner to burn tokens", async function () {
      // Mint 1000 to alice
      await (await contract.connect(owner).mint(alice.address, 1000n)).wait();

      // Burn 300
      await (await contract.connect(owner).burn(alice.address, 300n)).wait();

      // Balance should be 700
      const handle = await contract.confidentialBalanceOf(alice.address);
      const balance = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        handle,
        contractAddress,
        alice,
      );
      expect(balance).to.equal(700n);
    });
  });

  describe("Owner initial balance", function () {
    it("should have initial supply minted to owner", async function () {
      const handle = await contract.confidentialBalanceOf(owner.address);
      const balance = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        handle,
        contractAddress,
        owner,
      );
      expect(balance).to.equal(INITIAL_SUPPLY);
    });
  });

  // Note: Transfer tests depend on the ERC-7984 base implementation.
  // The OZ ConfidentialERC20 base handles confidentialTransfer internally.
  // These tests verify the BlindPay-relevant mint/burn/balance patterns.
});
