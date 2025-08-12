// scripts/deploy.js - GitHub Actions + Sepolia deployment

async function main() {
    console.log("🛍️ Starting Shopping Rewards DApp Deployment...");
    
    // Debug environment variables (without exposing sensitive data)
    console.log("🔍 Environment check:");
    console.log("- INFURA_API_KEY exists:", !!process.env.INFURA_API_KEY);
    console.log("- SEPOLIA_INFURA_API_KEY exists:", !!process.env.SEPOLIA_INFURA_API_KEY);
    console.log("- PRIVATE_KEY exists:", !!process.env.PRIVATE_KEY);
    console.log("- SEPOLIA_PRIVATE_KEY exists:", !!process.env.SEPOLIA_PRIVATE_KEY);
    
    // Get network info
    const network = await ethers.provider.getNetwork();
    console.log("📡 Network:", network.name, "Chain ID:", network.chainId);
    
    // Get signers with better error handling
    let signers;
    try {
        signers = await ethers.getSigners();
        console.log("👤 Available signers:", signers.length);
    } catch (error) {
        console.error("❌ Failed to get signers:", error.message);
        throw new Error("Cannot get signers. Check your private key configuration.");
    }
    
    if (!signers || signers.length === 0) {
        console.error("❌ No signers available!");
        console.log("💡 Make sure your environment variables are set:");
        console.log("   - INFURA_API_KEY or SEPOLIA_INFURA_API_KEY");
        console.log("   - PRIVATE_KEY or SEPOLIA_PRIVATE_KEY");
        throw new Error("No deployer account found");
    }
    
    const deployer = signers[0];
    console.log("🚀 Deploying with account:", deployer.address);
    
    // Check balance
    const balance = await deployer.getBalance();
    console.log("💰 Account balance:", ethers.utils.formatEther(balance), "ETH");
    
    if (balance.eq(0)) {
        console.error("❌ Deployer account has 0 ETH!");
        console.log("💡 Get Sepolia ETH from: https://sepoliafaucet.com/");
        throw new Error("Insufficient balance for deployment");
    }

    // Step 1: Deploy SHOP Token
    console.log("\n📄 Step 1: Deploying SHOP Token...");
    const SHOPToken = await ethers.getContractFactory("SHOPToken");
    console.log("   Deploying contract...");
    const shopToken = await SHOPToken.deploy();
    console.log("   Waiting for deployment...");
    await shopToken.deployed();
    console.log("✅ SHOP Token deployed to:", shopToken.address);

    // Step 2: Deploy Merchant Registry
    console.log("\n🏪 Step 2: Deploying Merchant Registry...");
    const MerchantRegistry = await ethers.getContractFactory("MerchantRegistry");
    const merchantRegistry = await MerchantRegistry.deploy(shopToken.address);
    await merchantRegistry.deployed();
    console.log("✅ Merchant Registry deployed to:", merchantRegistry.address);

    // Step 3: Deploy Purchase Validator
    console.log("\n✅ Step 3: Deploying Purchase Validator...");
    const PurchaseValidator = await ethers.getContractFactory("PurchaseValidator");
    const purchaseValidator = await PurchaseValidator.deploy(shopToken.address, merchantRegistry.address);
    await purchaseValidator.deployed();
    console.log("✅ Purchase Validator deployed to:", purchaseValidator.address);

    // Step 4: Deploy Staking Contract
    console.log("\n🔒 Step 4: Deploying SHOP Staking...");
    const SHOPStaking = await ethers.getContractFactory("SHOPStaking");
    const shopStaking = await SHOPStaking.deploy(shopToken.address);
    await shopStaking.deployed();
    console.log("✅ SHOP Staking deployed to:", shopStaking.address);

    // Step 5: Deploy Stablecoin Swap
    console.log("\n💱 Step 5: Deploying Stablecoin Swap...");
    // Use a known Sepolia USDC address or deployer as mock
    const mockUSDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; // Sepolia USDC
    const StablecoinSwap = await ethers.getContractFactory("StablecoinSwap");
    const stablecoinSwap = await StablecoinSwap.deploy(shopToken.address, mockUSDC);
    await stablecoinSwap.deployed();
    console.log("✅ Stablecoin Swap deployed to:", stablecoinSwap.address);

    // Step 6: Setup permissions
    console.log("\n⚙️ Step 6: Setting up permissions...");
    
    console.log("   Authorizing staking contract...");
    await shopToken.authorizeMinter(shopStaking.address, "SHOP Staking Contract");
    console.log("✅ Added staking contract as minter");
    
    console.log("   Authorizing purchase validator...");
    await shopToken.authorizeMinter(purchaseValidator.address, "Purchase Validator");
    console.log("✅ Added purchase validator as minter");

    // Step 7: Register sample merchants
    console.log("\n🏪 Step 7: Registering sample merchants...");
    
    console.log("   Registering Tesco Ireland...");
    await merchantRegistry.registerMerchant(
        deployer.address, 
        "Tesco Ireland",
        "grocery",
        200 // 2% reward rate
    );
    console.log("✅ Registered Tesco Ireland (2% rewards)");

    console.log("   Authorizing Tesco for minting...");
    await shopToken.authorizeMinter(deployer.address, "Tesco Ireland");
    console.log("✅ Authorized Tesco for minting rewards");

    // Step 8: Deployment Summary
    console.log("\n🎉 Deployment Complete!");
    console.log("==========================================");
    console.log("📄 SHOP Token:", shopToken.address);
    console.log("🏪 Merchant Registry:", merchantRegistry.address);
    console.log("✅ Purchase Validator:", purchaseValidator.address);
    console.log("🔒 SHOP Staking:", shopStaking.address);
    console.log("💱 Stablecoin Swap:", stablecoinSwap.address);
    console.log("==========================================");

    // Step 9: Save deployment info
    const deploymentInfo = {
        network: network.name,
        chainId: network.chainId,
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        contracts: {
            shopToken: shopToken.address,
            merchantRegistry: merchantRegistry.address,
            purchaseValidator: purchaseValidator.address,
            shopStaking: shopStaking.address,
            stablecoinSwap: stablecoinSwap.address
        },
        verificationCommands: {
            shopToken: `npx hardhat verify --network sepolia ${shopToken.address}`,
            merchantRegistry: `npx hardhat verify --network sepolia ${merchantRegistry.address} ${shopToken.address}`,
            purchaseValidator: `npx hardhat verify --network sepolia ${purchaseValidator.address} ${shopToken.address} ${merchantRegistry.address}`,
            shopStaking: `npx hardhat verify --network sepolia ${shopStaking.address} ${shopToken.address}`,
            stablecoinSwap: `npx hardhat verify --network sepolia ${stablecoinSwap.address} ${shopToken.address} ${mockUSDC}`
        }
    };

    console.log("\n📋 Deployment Information:");
    console.log(JSON.stringify(deploymentInfo, null, 2));

    // Step 10: Quick verification
    console.log("\n🔍 Verifying deployment...");
    const totalSupply = await shopToken.totalSupply();
    const merchantCount = await merchantRegistry.getMerchantCount();
    const stakingTokenAddress = await shopStaking.shopToken();
    
    console.log("✅ SHOP Total Supply:", ethers.utils.formatEther(totalSupply), "SHOP");
    console.log("✅ Registered Merchants:", merchantCount.toString());
    console.log("✅ Staking Contract Connected:", stakingTokenAddress === shopToken.address);

    console.log("\n🎯 Assignment Ready!");
    console.log("✅ All contracts deployed to Sepolia testnet");
    console.log("✅ Permissions configured correctly");  
    console.log("✅ Sample merchant registered and authorized");
    console.log("✅ System ready for testing and submission");
    console.log("\n🌐 View on Sepolia Etherscan:");
    console.log(`   SHOP Token: https://sepolia.etherscan.io/address/${shopToken.address}`);
    console.log(`   Merchant Registry: https://sepolia.etherscan.io/address/${merchantRegistry.address}`);
    console.log("\n🚀 Your Shopping Rewards DApp is live on Sepolia!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        console.error("Stack trace:", error.stack);
        process.exit(1);
    });