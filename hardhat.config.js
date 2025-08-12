require("@nomiclabs/hardhat-ethers");
require("dotenv").config();

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // Local development
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337
    },
    
    // Sepolia Testnet
    sepolia: {
      url: process.env.INFURA_API_KEY 
        ? `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`
        : `https://sepolia.infura.io/v3/${process.env.SEPOLIA_INFURA_API_KEY}`, // Alternative env var name
      accounts: process.env.PRIVATE_KEY 
        ? [`0x${process.env.PRIVATE_KEY.replace('0x', '')}`] // Remove 0x if present
        : process.env.SEPOLIA_PRIVATE_KEY 
        ? [`0x${process.env.SEPOLIA_PRIVATE_KEY.replace('0x', '')}`] // Alternative env var name
        : [],
      chainId: 11155111,
      gasPrice: 20000000000, // 20 gwei
      gas: 6000000,
      timeout: 60000 // 60 seconds timeout
    },
    
    // Hardhat network (for testing)
    hardhat: {
      chainId: 31337,
      accounts: {
        count: 10,
        accountsBalance: "10000000000000000000000" // 10000 ETH
      }
    }
  },
  
  // Etherscan verification
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || process.env.SEPOLIA_ETHERSCAN_API_KEY || ""
    }
  },
  
  mocha: {
    timeout: 60000
  }
};