import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("ConfidentialCounter", function () {
  let contract: any;
  let contractAddress: string;
  let deployer: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;

  beforeEach(async function () {
    [deployer, alice, bob] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("ConfidentialCounter");
    contract = await factory.deploy();
    await contract.waitForDeployment();
    contractAddress = await contract.getAddress();
  });

  describe("Initial state", function () {
    it("should have zero count after deployment", async function () {
      // Uninitialized euint32 returns null handle (bytes32(0))
      expect(await contract.getCount()).to.equal(ethers.ZeroHash);
    });
  });

  describe("Increment", function () {
    it("should increment by encrypted amount", async function () {
      // Encrypt the value 5
      const encrypted = await fhevm
        .createEncryptedInput(contractAddress, alice.address)
        .add32(5)
        .encrypt();

      // Send the increment transaction
      const tx = await contract
        .connect(alice)
        .increment(encrypted.handles[0], encrypted.inputProof);
      await tx.wait();

      // Decrypt and verify the result
      const handle = await contract.getCount();
      const clearCount = await fhevm.userDecryptEuint(
        FhevmType.euint32,
        handle,
        contractAddress,
        alice,
      );
      expect(clearCount).to.equal(5n);
    });

    it("should accumulate multiple increments", async function () {
      // First increment: 10
      let enc = await fhevm
        .createEncryptedInput(contractAddress, alice.address)
        .add32(10)
        .encrypt();
      await (
        await contract
          .connect(alice)
          .increment(enc.handles[0], enc.inputProof)
      ).wait();

      // Second increment: 20
      enc = await fhevm
        .createEncryptedInput(contractAddress, alice.address)
        .add32(20)
        .encrypt();
      await (
        await contract
          .connect(alice)
          .increment(enc.handles[0], enc.inputProof)
      ).wait();

      // Should be 30
      const handle = await contract.getCount();
      const clearCount = await fhevm.userDecryptEuint(
        FhevmType.euint32,
        handle,
        contractAddress,
        alice,
      );
      expect(clearCount).to.equal(30n);
    });
  });

  describe("Decrement", function () {
    it("should decrement from a non-zero count", async function () {
      // Increment by 100 first
      let enc = await fhevm
        .createEncryptedInput(contractAddress, alice.address)
        .add32(100)
        .encrypt();
      await (
        await contract
          .connect(alice)
          .increment(enc.handles[0], enc.inputProof)
      ).wait();

      // Decrement by 30
      enc = await fhevm
        .createEncryptedInput(contractAddress, alice.address)
        .add32(30)
        .encrypt();
      await (
        await contract
          .connect(alice)
          .decrement(enc.handles[0], enc.inputProof)
      ).wait();

      // Should be 70
      const handle = await contract.getCount();
      const clearCount = await fhevm.userDecryptEuint(
        FhevmType.euint32,
        handle,
        contractAddress,
        alice,
      );
      expect(clearCount).to.equal(70n);
    });
  });

  describe("Reset", function () {
    it("should reset count to zero", async function () {
      // Increment first
      const enc = await fhevm
        .createEncryptedInput(contractAddress, alice.address)
        .add32(42)
        .encrypt();
      await (
        await contract
          .connect(alice)
          .increment(enc.handles[0], enc.inputProof)
      ).wait();

      // Reset
      await (await contract.connect(alice).reset()).wait();

      // Should be 0
      const handle = await contract.getCount();
      const clearCount = await fhevm.userDecryptEuint(
        FhevmType.euint32,
        handle,
        contractAddress,
        alice,
      );
      expect(clearCount).to.equal(0n);
    });
  });

  describe("Access control", function () {
    it("should allow the incrementer to decrypt", async function () {
      const enc = await fhevm
        .createEncryptedInput(contractAddress, alice.address)
        .add32(7)
        .encrypt();
      await (
        await contract
          .connect(alice)
          .increment(enc.handles[0], enc.inputProof)
      ).wait();

      // Alice (who incremented) can decrypt
      const handle = await contract.getCount();
      const clearCount = await fhevm.userDecryptEuint(
        FhevmType.euint32,
        handle,
        contractAddress,
        alice,
      );
      expect(clearCount).to.equal(7n);
    });
  });
});
