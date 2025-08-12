// scripts/deploy.js - Simple working deployment script

async function main() {
    console.log("🛍️ Starting Shopping Rewards DApp Deployment...");
    
    // Get signers
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    
    if (!deployer) {
        throw new Error("No deployer account found");
    }
    
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH");

    // Step 1: Deploy SHOP Token
    console.log("\n📄 Step 1: Deploying SHOP Token...");
    const SHOPToken = await ethers.getContractFactory("SHOPToken");
    const shopToken = await SHOPToken.deploy();
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

    // Step 5: Deploy Stablecoin Swap (using deployer as mock USDC)
    console.log("\n💱 Step 5: Deploying Stablecoin Swap...");
    const StablecoinSwap = await ethers.getContractFactory("StablecoinSwap");
    const stablecoinSwap = await StablecoinSwap.deploy(shopToken.address, deployer.address);
    await stablecoinSwap.deployed();
    console.log("✅ Stablecoin Swap deployed to:", stablecoinSwap.address);

    // Step 6: Setup permissions
    console.log("\n⚙️ Step 6: Setting up permissions...");
    await shopToken.authorizeMinter(shopStaking.address, "SHOP Staking Contract");
    console.log("✅ Added staking contract as minter");
    
    await shopToken.authorizeMinter(purchaseValidator.address, "Purchase Validator");
    console.log("✅ Added purchase validator as minter");

    // Step 7: Register sample merchant
    console.log("\n🏪 Step 7: Registering sample merchant...");
    await merchantRegistry.registerMerchant(
        deployer.address, 
        "Tesco Ireland",
        "grocery",
        200 // 2% reward rate
    );
    console.log("✅ Registered Tesco Ireland (2% rewards)");

    // Step 8: Authorize merchant for minting
    await shopToken.authorizeMinter(deployer.address, "Tesco Ireland");
    console.log("✅ Authorized Tesco for minting rewards");

    // Step 9: Display deployment summary
    console.log("\n🎉 Deployment Complete!");
    console.log("==========================================");
    console.log("📄 SHOP Token:", shopToken.address);
    console.log("🏪 Merchant Registry:", merchantRegistry.address);
    console.log("✅ Purchase Validator:", purchaseValidator.address);
    console.log("🔒 SHOP Staking:", shopStaking.address);
    console.log("💱 Stablecoin Swap:", stablecoinSwap.address);
    console.log("==========================================");

    // Step 10: Quick verification
    console.log("\n🔍 Verifying deployment...");
    const totalSupply = await shopToken.totalSupply();
    const merchantCount = await merchantRegistry.getMerchantCount();
    
    console.log("SHOP Total Supply:", ethers.utils.formatEther(totalSupply), "SHOP");
    console.log("Registered Merchants:", merchantCount.toString());

    // Step 11: Demo transaction
    console.log("\n🧪 Demo transaction...");
    try {
        const purchaseAmount = ethers.utils.parseEther("5000"); // €50 purchase
        await purchaseValidator.processPurchase(
            deployer.address, // Customer
            purchaseAmount,
            "DEMO_TX_001"
        );
        
        const customerBalance = await shopToken.balanceOf(deployer.address);
        console.log("✅ Demo purchase successful!");
        console.log("   Customer earned:", ethers.utils.formatEther(customerBalance.sub(totalSupply)), "SHOP tokens");
        
    } catch (error) {
        console.log("⚠️ Demo transaction skipped:", error.message);
    }

    console.log("\n🎯 Assignment Ready!");
    console.log("✅ All contracts deployed successfully");
    console.log("✅ Permissions configured");  
    console.log("✅ Sample merchant registered");
    console.log("\nYour Shopping Rewards DApp is ready! 🚀");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });