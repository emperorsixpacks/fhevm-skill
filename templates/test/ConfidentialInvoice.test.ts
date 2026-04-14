import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("ConfidentialInvoice", function () {
  let contract: any;
  let contractAddress: string;
  let creator: HardhatEthersSigner;
  let merchant: HardhatEthersSigner;
  let payer: HardhatEthersSigner;

  const INVOICE_AMOUNT = 1000n;

  beforeEach(async function () {
    [creator, merchant, payer] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("ConfidentialInvoice");
    contract = await factory.deploy();
    await contract.waitForDeployment();
    contractAddress = await contract.getAddress();
  });

  function generateSalt(): string {
    return ethers.hexlify(ethers.randomBytes(32));
  }

  function generateClaimHash(
    merchantAddress: string,
    salt: string,
    claimSecret: string,
  ): string {
    return ethers.solidityPackedKeccak256(
      ["address", "bytes32", "bytes32"],
      [merchantAddress, salt, claimSecret],
    );
  }

  describe("Invoice creation", function () {
    it("should create an invoice with encrypted amount and merchant", async function () {
      const salt = generateSalt();
      const claimSecret = ethers.hexlify(ethers.randomBytes(32));
      const claimHash = generateClaimHash(merchant.address, salt, claimSecret);

      // Encrypt both amount and merchant address in a single input (one proof)
      const enc = await fhevm
        .createEncryptedInput(contractAddress, creator.address)
        .add64(INVOICE_AMOUNT)
        .addAddress(merchant.address)
        .encrypt();

      await expect(
        contract
          .connect(creator)
          .createInvoice(
            salt,
            enc.handles[0],
            enc.handles[1],
            enc.inputProof,
            claimHash,
          ),
      ).to.emit(contract, "InvoiceCreated").withArgs(salt);

      expect(await contract.getInvoiceStatus(salt)).to.equal(0); // Open
      expect(await contract.invoiceCount()).to.equal(1);
    });

    it("should reject duplicate salt", async function () {
      const salt = generateSalt();
      const claimSecret = ethers.hexlify(ethers.randomBytes(32));
      const claimHash = generateClaimHash(merchant.address, salt, claimSecret);

      const enc = await fhevm
        .createEncryptedInput(contractAddress, creator.address)
        .add64(INVOICE_AMOUNT)
        .addAddress(merchant.address)
        .encrypt();

      await (
        await contract
          .connect(creator)
          .createInvoice(
            salt,
            enc.handles[0],
            enc.handles[1],
            enc.inputProof,
            claimHash,
          )
      ).wait();

      // Second creation with same salt should fail
      const enc2 = await fhevm
        .createEncryptedInput(contractAddress, creator.address)
        .add64(500n)
        .addAddress(merchant.address)
        .encrypt();

      await expect(
        contract
          .connect(creator)
          .createInvoice(
            salt,
            enc2.handles[0],
            enc2.handles[1],
            enc2.inputProof,
            claimHash,
          ),
      ).to.be.revertedWith("Salt already used");
    });

    it("should allow creator to decrypt invoice amount", async function () {
      const salt = generateSalt();
      const claimSecret = ethers.hexlify(ethers.randomBytes(32));
      const claimHash = generateClaimHash(merchant.address, salt, claimSecret);

      const enc = await fhevm
        .createEncryptedInput(contractAddress, creator.address)
        .add64(INVOICE_AMOUNT)
        .addAddress(merchant.address)
        .encrypt();

      await (
        await contract
          .connect(creator)
          .createInvoice(
            salt,
            enc.handles[0],
            enc.handles[1],
            enc.inputProof,
            claimHash,
          )
      ).wait();

      // Creator should be able to decrypt the amount
      const handle = await contract.getInvoiceAmount(salt);
      const amount = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        handle,
        contractAddress,
        creator,
      );
      expect(amount).to.equal(INVOICE_AMOUNT);
    });
  });

  describe("Payment", function () {
    let salt: string;
    let claimSecret: string;

    beforeEach(async function () {
      salt = generateSalt();
      claimSecret = ethers.hexlify(ethers.randomBytes(32));
      const claimHash = generateClaimHash(merchant.address, salt, claimSecret);

      const enc = await fhevm
        .createEncryptedInput(contractAddress, creator.address)
        .add64(INVOICE_AMOUNT)
        .addAddress(merchant.address)
        .encrypt();

      await (
        await contract
          .connect(creator)
          .createInvoice(
            salt,
            enc.handles[0],
            enc.handles[1],
            enc.inputProof,
            claimHash,
          )
      ).wait();
    });

    it("should accept payment with matching amount", async function () {
      const enc = await fhevm
        .createEncryptedInput(contractAddress, payer.address)
        .add64(INVOICE_AMOUNT)
        .encrypt();

      const tx = await contract
        .connect(payer)
        .payInvoice(salt, enc.handles[0], enc.inputProof);
      const receipt = await tx.wait();

      expect(await contract.getInvoiceStatus(salt)).to.equal(1); // Paid

      // Verify a receipt was emitted
      const event = receipt.logs.find(
        (log: any) => log.fragment?.name === "PaymentMade",
      );
      expect(event).to.not.be.undefined;
    });

    it("should emit verifiable receipt hash", async function () {
      const enc = await fhevm
        .createEncryptedInput(contractAddress, payer.address)
        .add64(INVOICE_AMOUNT)
        .encrypt();

      const tx = await contract
        .connect(payer)
        .payInvoice(salt, enc.handles[0], enc.inputProof);
      const receipt = await tx.wait();

      // Extract receipt hash from event
      const event = receipt.logs.find(
        (log: any) => log.fragment?.name === "PaymentMade",
      );
      if (event && event.args) {
        const receiptHash = event.args[1]; // second arg is receiptHash
        expect(await contract.verifyReceipt(receiptHash)).to.be.true;
      }
    });

    it("should reject payment for non-existent invoice", async function () {
      const fakeSalt = generateSalt();
      const enc = await fhevm
        .createEncryptedInput(contractAddress, payer.address)
        .add64(INVOICE_AMOUNT)
        .encrypt();

      await expect(
        contract
          .connect(payer)
          .payInvoice(fakeSalt, enc.handles[0], enc.inputProof),
      ).to.be.revertedWith("Invoice not found");
    });
  });

  describe("Claiming funds", function () {
    let salt: string;
    let claimSecret: string;

    beforeEach(async function () {
      salt = generateSalt();
      claimSecret = ethers.hexlify(ethers.randomBytes(32));
      const claimHash = generateClaimHash(merchant.address, salt, claimSecret);

      // Create invoice
      const enc1 = await fhevm
        .createEncryptedInput(contractAddress, creator.address)
        .add64(INVOICE_AMOUNT)
        .addAddress(merchant.address)
        .encrypt();

      await (
        await contract
          .connect(creator)
          .createInvoice(
            salt,
            enc1.handles[0],
            enc1.handles[1],
            enc1.inputProof,
            claimHash,
          )
      ).wait();

      // Pay invoice
      const enc2 = await fhevm
        .createEncryptedInput(contractAddress, payer.address)
        .add64(INVOICE_AMOUNT)
        .encrypt();

      await (
        await contract
          .connect(payer)
          .payInvoice(salt, enc2.handles[0], enc2.inputProof)
      ).wait();
    });

    it("should allow merchant to claim with valid commitment", async function () {
      await expect(
        contract.connect(merchant).claimFunds(salt, claimSecret),
      ).to.emit(contract, "FundsClaimed").withArgs(salt);
    });

    it("should reject claim with wrong secret", async function () {
      const wrongSecret = ethers.hexlify(ethers.randomBytes(32));
      await expect(
        contract.connect(merchant).claimFunds(salt, wrongSecret),
      ).to.be.revertedWith("Invalid claim");
    });

    it("should reject claim from wrong address", async function () {
      // payer tries to claim with the correct secret but wrong address
      await expect(
        contract.connect(payer).claimFunds(salt, claimSecret),
      ).to.be.revertedWith("Invalid claim");
    });
  });

  describe("Cancellation", function () {
    it("should cancel an open invoice", async function () {
      const salt = generateSalt();
      const claimSecret = ethers.hexlify(ethers.randomBytes(32));
      const claimHash = generateClaimHash(merchant.address, salt, claimSecret);

      const enc = await fhevm
        .createEncryptedInput(contractAddress, creator.address)
        .add64(INVOICE_AMOUNT)
        .addAddress(merchant.address)
        .encrypt();

      await (
        await contract
          .connect(creator)
          .createInvoice(
            salt,
            enc.handles[0],
            enc.handles[1],
            enc.inputProof,
            claimHash,
          )
      ).wait();

      await expect(
        contract.connect(creator).cancelInvoice(salt),
      ).to.emit(contract, "InvoiceCancelled").withArgs(salt);

      expect(await contract.getInvoiceStatus(salt)).to.equal(2); // Cancelled
    });
  });

  describe("Privacy guarantees", function () {
    it("should not leak addresses in events", async function () {
      const salt = generateSalt();
      const claimSecret = ethers.hexlify(ethers.randomBytes(32));
      const claimHash = generateClaimHash(merchant.address, salt, claimSecret);

      const enc = await fhevm
        .createEncryptedInput(contractAddress, creator.address)
        .add64(INVOICE_AMOUNT)
        .addAddress(merchant.address)
        .encrypt();

      const tx = await contract
        .connect(creator)
        .createInvoice(
          salt,
          enc.handles[0],
          enc.handles[1],
          enc.inputProof,
          claimHash,
        );
      const receipt = await tx.wait();

      // Verify InvoiceCreated event only has salt, no addresses or amounts
      const event = receipt.logs.find(
        (log: any) => log.fragment?.name === "InvoiceCreated",
      );
      expect(event).to.not.be.undefined;
      // Event should only have 1 indexed topic (salt) + event signature
      // No address or amount topics
      expect(event.args.length).to.equal(1);
    });
  });
});
