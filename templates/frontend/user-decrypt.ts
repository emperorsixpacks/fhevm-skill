/**
 * Frontend: Decrypting user-specific data from FHEVM contracts
 *
 * This module shows how to decrypt encrypted values that the user has
 * permission to read (i.e., the contract called FHE.allow(handle, user)).
 *
 * Flow: get handle from contract → EIP-712 signature → relayer decrypts → cleartext
 *
 * Prerequisites:
 *   npm install @zama-fhe/relayer-sdk ethers
 */

import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk";
import { BrowserProvider } from "ethers";

// ─── 1. Decrypt a single value ─────────────────────────────────────

async function decryptBalance(
  instance: Awaited<ReturnType<typeof createInstance>>,
  contractAddress: string,
  ciphertextHandle: string, // bytes32 handle from contract.getBalance()
) {
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const userAddress = await signer.getAddress();

  // Step 1: Generate ephemeral keypair for this decrypt session
  const keypair = instance.generateKeypair();

  // Step 2: Create EIP-712 typed data for the user to sign
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const validity = "10"; // seconds

  const eip712 = instance.createEIP712(
    keypair.publicKey,
    [contractAddress],
    timestamp,
    validity,
  );

  // Step 3: User signs (triggers MetaMask popup)
  const signature = await signer.signTypedData(
    eip712.domain,
    {
      UserDecryptRequestVerification:
        eip712.types.UserDecryptRequestVerification,
    },
    eip712.message,
  );

  // Step 4: Request decryption from the relayer
  const result = await instance.userDecrypt(
    [{ handle: ciphertextHandle, contractAddress }],
    keypair.privateKey,
    keypair.publicKey,
    signature.replace("0x", ""), // Strip 0x prefix — required!
    [contractAddress],
    userAddress,
    timestamp,
    validity,
  );

  // Step 5: Read cleartext value
  const clearBalance = result[ciphertextHandle];
  return clearBalance;
}

// ─── 2. Decrypt multiple values at once ────────────────────────────

async function decryptMultiple(
  instance: Awaited<ReturnType<typeof createInstance>>,
  contractAddress: string,
  handles: string[], // Array of bytes32 handles
) {
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const userAddress = await signer.getAddress();

  const keypair = instance.generateKeypair();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const validity = "10";

  const eip712 = instance.createEIP712(
    keypair.publicKey,
    [contractAddress],
    timestamp,
    validity,
  );

  const signature = await signer.signTypedData(
    eip712.domain,
    {
      UserDecryptRequestVerification:
        eip712.types.UserDecryptRequestVerification,
    },
    eip712.message,
  );

  // Request decryption for all handles at once
  const result = await instance.userDecrypt(
    handles.map((handle) => ({ handle, contractAddress })),
    keypair.privateKey,
    keypair.publicKey,
    signature.replace("0x", ""),
    [contractAddress],
    userAddress,
    timestamp,
    validity,
  );

  // result is a map: { [handle]: cleartext value }
  return result;
}

// ─── 3. Complete usage example ─────────────────────────────────────

async function showMyBalance(contractAddress: string, contract: any) {
  // Initialize FHEVM instance
  const instance = await createInstance({
    ...SepoliaConfig,
    network: window.ethereum,
  });

  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const userAddress = await signer.getAddress();

  // Get encrypted handle from contract (this is a view call, no gas)
  const handle = await contract.confidentialBalanceOf(userAddress);

  if (handle === "0x" + "0".repeat(64)) {
    console.log("Balance: 0 (no encrypted value stored)");
    return 0n;
  }

  // Decrypt it
  const clearBalance = await decryptBalance(instance, contractAddress, handle);
  console.log("My balance:", clearBalance);
  return clearBalance;
}

export { decryptBalance, decryptMultiple, showMyBalance };
