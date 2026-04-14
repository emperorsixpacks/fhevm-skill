/**
 * Frontend: Encrypting inputs for FHEVM contracts
 *
 * This module shows how to encrypt values client-side before sending
 * them to a confidential smart contract. Works with any FHEVM contract
 * that accepts externalEuintXX + bytes proof parameters.
 *
 * Prerequisites:
 *   npm install @zama-fhe/relayer-sdk ethers
 *
 * NOTE: The old `fhevmjs` package is DEPRECATED. Use `@zama-fhe/relayer-sdk`.
 */

import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk";
import { BrowserProvider, Contract } from "ethers";

// ─── 1. Initialize the FHEVM instance (once per page load) ─────────

async function createFhevmInstance() {
  if (!window.ethereum) {
    throw new Error("No Ethereum provider found. Install MetaMask.");
  }

  const instance = await createInstance({
    ...SepoliaConfig,
    network: window.ethereum,
  });

  return instance;
}

// ─── 2. Encrypt a single value ─────────────────────────────────────

async function encryptAndDeposit(
  instance: Awaited<ReturnType<typeof createFhevmInstance>>,
  contract: Contract,
  contractAddress: string,
  amount: bigint,
) {
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const userAddress = await signer.getAddress();

  // Encrypt the amount (creates ciphertext + proof)
  const encrypted = await instance
    .createEncryptedInput(contractAddress, userAddress)
    .add64(amount) // Use add8/add16/add32/add64/add128 based on the contract's type
    .encrypt();

  // Send transaction with encrypted input + proof
  const tx = await contract.deposit(
    encrypted.handles[0], // externalEuint64
    encrypted.inputProof, // bytes proof
  );
  await tx.wait();

  console.log("Deposit successful!");
}

// ─── 3. Encrypt multiple values at once ────────────────────────────

async function encryptAndBid(
  instance: Awaited<ReturnType<typeof createFhevmInstance>>,
  contract: Contract,
  contractAddress: string,
  bidAmount: bigint,
  isPublicBid: boolean,
) {
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const userAddress = await signer.getAddress();

  // Multiple values in one encrypted input — shares a single proof
  const encrypted = await instance
    .createEncryptedInput(contractAddress, userAddress)
    .add64(bidAmount) // handles[0] → externalEuint64
    .addBool(isPublicBid) // handles[1] → externalEbool
    .encrypt();

  // Pass all handles + the single shared proof
  const tx = await contract.placeBid(
    encrypted.handles[0], // externalEuint64 bid
    encrypted.handles[1], // externalEbool isPublic
    encrypted.inputProof, // ONE proof for ALL inputs
  );
  await tx.wait();

  console.log("Bid placed!");
}

// ─── 4. Complete example: React-style usage ────────────────────────

async function main() {
  // Initialize once
  const fhevmInstance = await createFhevmInstance();

  // Get contract reference
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const contractAddress = "0x..."; // Your deployed contract address
  const contractABI = [
    /* ABI here */
  ];
  const contract = new Contract(contractAddress, contractABI, signer);

  // Encrypt and send
  await encryptAndDeposit(fhevmInstance, contract, contractAddress, 100n);
}

export { createFhevmInstance, encryptAndDeposit, encryptAndBid };
