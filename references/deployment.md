# Deployment Reference

> Load when deploying contracts to Sepolia testnet or mainnet.

---

## Network configuration

### Ethereum mainnet (live since late 2025)
| Parameter                       | Value                                        |
|---------------------------------|----------------------------------------------|
| Chain ID                        | `1`                                          |
| Gateway Chain ID                | `261131`                                     |
| ZAMA Token                      | `0xA12CC123ba206d4031D1c7f6223D1C2Ec249f4f3` |
| Wrappers Registry               | `0xeb5015fF021DB115aCe010f23F55C2591059bBA0` |
| **Requires API key**            | Yes — apply at https://forms.gle/jq84zEek1oiv3kBz9 |

```typescript
// Mainnet SDK initialization
import { createInstance, MainnetConfig } from '@zama-fhe/relayer-sdk';
const instance = await createInstance({
    ...MainnetConfig,
    network: 'https://ethereum-rpc.publicnode.com',
    auth: { __type: 'ApiKeyHeader', value: process.env.ZAMA_FHEVM_API_KEY },
});
```

Live wrapped tokens: cUSDC, cUSDT, cWETH, cBRON, cZAMA, ctGBP, cXAUt.
Fees paid in $ZAMA token, priced in USD. Volume discounts up to 99%.

### Sepolia testnet
| Parameter                       | Value                                        |
|---------------------------------|----------------------------------------------|
| Chain ID                        | `11155111`                                   |
| RPC URL                         | `https://sepolia.infura.io/v3/{INFURA_KEY}`  |
| Gateway Chain ID                | `10901`                                      |
| Relayer URL                     | `https://relayer.testnet.zama.org`           |
| ACL contract                    | `0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D` |
| KMS contract                    | `0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A` |
| InputVerifier                   | `0xBBC1fFCdc7C316aAAd72E807D9b0272BE8F84DA0` |
| VerifyingContractDecryption     | `0x5D8BD78e2ea6bbE41f26dFe9fdaEAa349e077478` |
| VerifyingContractInputVerification | `0x483b9dE06E4E4C7D35CCf5837A1668487406D955` |

### Getting testnet ETH
- Sepolia faucet: https://sepoliafaucet.com
- Alchemy faucet: https://www.alchemy.com/faucets/ethereum-sepolia
- Infura faucet: https://www.infura.io/faucet/sepolia

---

## Environment setup

### .env file
```bash
MNEMONIC="your twelve word mnemonic phrase here for deployment"
INFURA_API_KEY="your_infura_project_id"
ETHERSCAN_API_KEY="your_etherscan_api_key"
```

### Hardhat variables (alternative to .env)
```bash
npx hardhat vars set MNEMONIC "your twelve word mnemonic phrase here"
npx hardhat vars set INFURA_API_KEY "your_infura_project_id"
npx hardhat vars set ETHERSCAN_API_KEY "your_etherscan_api_key"
```

---

## Deploy script

### Using hardhat-deploy
```typescript
// deploy/01_deploy_counter.ts
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployer } = await hre.getNamedAccounts();
    const { deploy } = hre.deployments;

    const deployed = await deploy("ConfidentialCounter", {
        from: deployer,
        log: true,
    });

    console.log(`ConfidentialCounter deployed at: ${deployed.address}`);
};

export default func;
func.id = "deploy_confidential_counter";
func.tags = ["ConfidentialCounter"];
```

### Deploy with constructor args
```typescript
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployer } = await hre.getNamedAccounts();
    const { deploy } = hre.deployments;

    await deploy("ConfidentialERC20", {
        from: deployer,
        args: [
            deployer,                   // owner
            1000000n,                   // initial supply (plaintext, encrypted on-chain)
            "Confidential Token",       // name
            "CTKN",                     // symbol
            "https://example.com/meta", // contractURI
        ],
        log: true,
    });
};
```

---

## Deploy commands

```bash
# Deploy to local Hardhat network (mock mode)
npx hardhat deploy

# Deploy to Sepolia
npx hardhat deploy --network sepolia

# Deploy specific contract
npx hardhat deploy --network sepolia --tags ConfidentialCounter

# Verify on Etherscan
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

---

## Post-deployment checklist

1. **Save the contract address** — you'll need it for frontend and tests
2. **Verify on Etherscan** — `npx hardhat verify --network sepolia ADDRESS`
3. **Test a basic operation** — send a transaction to confirm FHE works
4. **Check gas costs** — FHE operations are expensive, ensure you have enough ETH
5. **Configure frontend** — update contract address in your dApp config

---

## Solidity compiler settings (required)

```typescript
// In hardhat.config.ts
solidity: {
    version: "0.8.27",
    settings: {
        metadata: { bytecodeHash: "none" },
        optimizer: { enabled: true, runs: 800 },
        evmVersion: "cancun",             // REQUIRED for FHEVM
    },
},
```

**`evmVersion: "cancun"` is mandatory.** Without it, compilation may succeed
but the contract will fail at runtime.

---

## Common deployment issues

### MetaMask nonce desync (local development)
When restarting a local Hardhat node, MetaMask caches old nonces.
Fix: MetaMask → Settings → Advanced → Clear activity tab data.

### Node.js version
Must use even-numbered versions (v20, v22). Odd versions (v21, v23)
cause build failures with native modules.

### Insufficient gas
FHE operations cost 100-1000x more than normal operations.
Ensure your deployer account has plenty of testnet ETH.
A single FHE transaction can cost 1-5M gas.
