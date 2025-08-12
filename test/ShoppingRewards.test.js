// test/ShoppingRewards.test.js - FIXED All Issues

const { expect } = require("chai");
const { ethers } = require("hardhat");

// Helper function to compare BigNumbers
const expectBigNumberEqual = (actual, expected) => {
    expect(actual.toString()).to.equal(expected.toString());
};

describe("Shopping Rewards System", function () {
    let shopToken, merchantRegistry, purchaseValidator, shopStaking, stablecoinSwap;
    let owner, customer, merchant, mockUSDC;

    beforeEach(async function () {
        [owner, customer, merchant, mockUSDC] = await ethers.getSigners();

        // Deploy SHOP Token
        const SHOPToken = await ethers.getContractFactory("SHOPToken");
        shopToken = await SHOPToken.deploy();
        await shopToken.deployed();
        
        // Deploy Merchant Registry
        const MerchantRegistry = await ethers.getContractFactory("MerchantRegistry");
        merchantRegistry = await MerchantRegistry.deploy(shopToken.address);
        await merchantRegistry.deployed();
        
        // Deploy Purchase Validator
        const PurchaseValidator = await ethers.getContractFactory("PurchaseValidator");
        purchaseValidator = await PurchaseValidator.deploy(shopToken.address, merchantRegistry.address);
        await purchaseValidator.deployed();
        
        // Deploy Staking
        const SHOPStaking = await ethers.getContractFactory("SHOPStaking");
        shopStaking = await SHOPStaking.deploy(shopToken.address);
        await shopStaking.deployed();
        
        // Deploy Stablecoin Swap (using mockUSDC address)
        const StablecoinSwap = await ethers.getContractFactory("StablecoinSwap");
        stablecoinSwap = await StablecoinSwap.deploy(shopToken.address, mockUSDC.address);
        await stablecoinSwap.deployed();

        // Setup permissions (FIXED: manually authorize minters)
        await shopToken.authorizeMinter(purchaseValidator.address, "Purchase Validator");
        await shopToken.authorizeMinter(shopStaking.address, "SHOP Staking");
    });

    describe("SHOP Token Basic Tests", function () {
        it("Should have correct initial supply", async function () {
            const totalSupply = await shopToken.totalSupply();
            expectBigNumberEqual(totalSupply, ethers.utils.parseEther("10000000"));
        });

        it("Should have correct name and symbol", async function () {
            expect(await shopToken.name()).to.equal("Unified Shopping Rewards");
            expect(await shopToken.symbol()).to.equal("SHOP");
        });

        it("Should mint initial supply to owner", async function () {
            const ownerBalance = await shopToken.balanceOf(owner.address);
            expectBigNumberEqual(ownerBalance, ethers.utils.parseEther("10000000"));
        });

        it("Should authorize minters correctly", async function () {
            const stats = await shopToken.getMerchantStats(purchaseValidator.address);
            expect(stats.isAuthorized).to.be.true;
        });
    });

    describe("Merchant Registration", function () {
        it("Should register a merchant successfully", async function () {
            await merchantRegistry.registerMerchant(
                merchant.address,
                "Test Store",
                "grocery",
                200 // 2% rewards
            );

            const merchantInfo = await merchantRegistry.getMerchantInfo(merchant.address);
            expect(merchantInfo.name).to.equal("Test Store");
            expect(merchantInfo.category).to.equal("grocery");
            expect(merchantInfo.rewardRate.toNumber()).to.equal(200);
            expect(merchantInfo.isActive).to.be.true;
        });

        it("Should track merchant count", async function () {
            await merchantRegistry.registerMerchant(merchant.address, "Test Store", "grocery", 200);
            expect((await merchantRegistry.getMerchantCount()).toNumber()).to.equal(1);
        });

        it("Should not allow duplicate merchant registration", async function () {
            await merchantRegistry.registerMerchant(merchant.address, "Test Store", "grocery", 200);
            
            // Use try/catch instead of expect().to.be.revertedWith() for now
            let errorThrown = false;
            try {
                await merchantRegistry.registerMerchant(merchant.address, "Another Store", "electronics", 300);
            } catch (error) {
                expect(error.message).to.include("Merchant already registered");
                errorThrown = true;
            }
            expect(errorThrown).to.be.true;
        });
    });

    describe("Purchase Rewards System", function () {
        beforeEach(async function () {
            // Register merchant
            await merchantRegistry.registerMerchant(merchant.address, "Tesco", "grocery", 200);
            // FIXED: Manually authorize merchant for minting
            await shopToken.authorizeMinter(merchant.address, "Tesco");
        });

        it("Should process purchase and mint rewards", async function () {
            const purchaseAmount = ethers.utils.parseEther("5000"); // €50 purchase
            const expectedRewards = purchaseAmount.mul(200).div(10000); // 2% rewards = 100 SHOP
            
            await purchaseValidator.connect(merchant).processPurchase(
                customer.address,
                purchaseAmount,
                "TX123"
            );

            const customerBalance = await shopToken.balanceOf(customer.address);
            expectBigNumberEqual(customerBalance, expectedRewards);
            
            console.log("✅ Customer earned", ethers.utils.formatEther(customerBalance), "SHOP tokens");
        });

        it("Should prevent duplicate transaction processing", async function () {
            const purchaseAmount = ethers.utils.parseEther("1000");
            
            await purchaseValidator.connect(merchant).processPurchase(
                customer.address,
                purchaseAmount,
                "TX123"
            );

            // Use try/catch for error handling
            let errorThrown = false;
            try {
                await purchaseValidator.connect(merchant).processPurchase(
                    customer.address,
                    purchaseAmount,
                    "TX123"
                );
            } catch (error) {
                expect(error.message).to.include("Transaction already processed");
                errorThrown = true;
            }
            expect(errorThrown).to.be.true;
        });

        it("Should track customer statistics correctly", async function () {
            const purchaseAmount = ethers.utils.parseEther("10000"); // €100 purchase
            
            await purchaseValidator.connect(merchant).processPurchase(
                customer.address,
                purchaseAmount,
                "TX456"
            );

            const stats = await purchaseValidator.getCustomerStats(customer.address);
            expectBigNumberEqual(stats.totalSpent, purchaseAmount);
            expectBigNumberEqual(stats.totalRewards, purchaseAmount.mul(200).div(10000));
            expectBigNumberEqual(stats.shopBalance, purchaseAmount.mul(200).div(10000));
        });

        it("Should enforce purchase limits", async function () {
            // Test minimum limit
            let errorThrown = false;
            try {
                await purchaseValidator.connect(merchant).processPurchase(
                    customer.address,
                    ethers.utils.parseEther("50"), // €0.50 - below €1 minimum
                    "TX_LOW"
                );
            } catch (error) {
                expect(error.message).to.include("Purchase amount too low");
                errorThrown = true;
            }
            expect(errorThrown).to.be.true;

            // Test maximum limit
            errorThrown = false;
            try {
                await purchaseValidator.connect(merchant).processPurchase(
                    customer.address,
                    ethers.utils.parseEther("150000"), // €1500 - above €1000 maximum
                    "TX_HIGH"
                );
            } catch (error) {
                expect(error.message).to.include("Purchase amount too high");
                errorThrown = true;
            }
            expect(errorThrown).to.be.true;
        });
    });

    describe("Staking System", function () {
        beforeEach(async function () {
            // Give customer some SHOP tokens
            await shopToken.transfer(customer.address, ethers.utils.parseEther("25000"));
        });

        it("Should stake tokens and assign correct tier 1", async function () {
            const stakeAmount = ethers.utils.parseEther("1000"); // €10 - Tier 1
            
            await shopToken.connect(customer).approve(shopStaking.address, stakeAmount);
            await shopStaking.connect(customer).stake(stakeAmount);

            const stakeInfo = await shopStaking.getUserStakeInfo(customer.address);
            expectBigNumberEqual(stakeInfo.stakedAmount, stakeAmount);
            expect(stakeInfo.stakingTier.toNumber()).to.equal(1);
            expect(stakeInfo.multiplier.toNumber()).to.equal(110); // 1.1x multiplier
        });

        it("Should assign correct tier 2 for larger stakes", async function () {
            const stakeAmount = ethers.utils.parseEther("5000"); // €50 - Tier 2
            
            await shopToken.connect(customer).approve(shopStaking.address, stakeAmount);
            await shopStaking.connect(customer).stake(stakeAmount);

            const stakeInfo = await shopStaking.getUserStakeInfo(customer.address);
            expect(stakeInfo.stakingTier.toNumber()).to.equal(2);
            expect(stakeInfo.multiplier.toNumber()).to.equal(150); // 1.5x multiplier
        });

        it("Should assign correct tier 3 for largest stakes", async function () {
            const stakeAmount = ethers.utils.parseEther("20000"); // €200 - Tier 3
            
            await shopToken.connect(customer).approve(shopStaking.address, stakeAmount);
            await shopStaking.connect(customer).stake(stakeAmount);

            const stakeInfo = await shopStaking.getUserStakeInfo(customer.address);
            expect(stakeInfo.stakingTier.toNumber()).to.equal(3);
            expect(stakeInfo.multiplier.toNumber()).to.equal(200); // 2.0x multiplier
        });

        it("Should enforce minimum stake amount", async function () {
            const lowStakeAmount = ethers.utils.parseEther("500"); // €5 - below minimum
            
            await shopToken.connect(customer).approve(shopStaking.address, lowStakeAmount);
            
            let errorThrown = false;
            try {
                await shopStaking.connect(customer).stake(lowStakeAmount);
            } catch (error) {
                expect(error.message).to.include("Below minimum stake amount");
                errorThrown = true;
            }
            expect(errorThrown).to.be.true;
        });

        it("Should enforce lock periods", async function () {
            const stakeAmount = ethers.utils.parseEther("1000");
            
            await shopToken.connect(customer).approve(shopStaking.address, stakeAmount);
            await shopStaking.connect(customer).stake(stakeAmount);

            // Try to unstake immediately (should fail)
            let errorThrown = false;
            try {
                await shopStaking.connect(customer).unstake(stakeAmount);
            } catch (error) {
                expect(error.message).to.include("Lock period not met");
                errorThrown = true;
            }
            expect(errorThrown).to.be.true;
        });

        it("Should apply multipliers correctly", async function () {
            // Stake for 1.5x multiplier (Tier 2)
            const stakeAmount = ethers.utils.parseEther("5000");
            await shopToken.connect(customer).approve(shopStaking.address, stakeAmount);
            await shopStaking.connect(customer).stake(stakeAmount);

            // Test multiplier application
            const baseRewards = ethers.utils.parseEther("100");
            const multipliedRewards = await shopStaking.applyMultiplier(customer.address, baseRewards);
            
            // Expected: 100 + (100 * 50/100) = 150 SHOP
            const expectedRewards = baseRewards.add(baseRewards.mul(50).div(100));
            expectBigNumberEqual(multipliedRewards, expectedRewards);
        });
    });

    describe("Complete Integration Test", function () {
        it("Should demonstrate full shopping rewards workflow", async function () {
            console.log("🧪 Testing complete customer journey...");
            
            // 1. Register merchant
            await merchantRegistry.registerMerchant(merchant.address, "Tesco Ireland", "grocery", 200);
            await shopToken.authorizeMinter(merchant.address, "Tesco Ireland"); // FIXED: Manual authorization
            console.log("✅ Tesco registered with 2% rewards");
            
            // 2. Customer makes initial purchase
            const purchaseAmount = ethers.utils.parseEther("10000"); // €100 purchase
            await purchaseValidator.connect(merchant).processPurchase(
                customer.address,
                purchaseAmount,
                "TX001"
            );
            
            const initialRewards = await shopToken.balanceOf(customer.address);
            console.log("✅ Customer earned", ethers.utils.formatEther(initialRewards), "SHOP from purchase");
            
            // 3. Customer stakes some tokens for multiplier
            await shopToken.transfer(customer.address, ethers.utils.parseEther("4800")); // Give more tokens
            const stakeAmount = ethers.utils.parseEther("5000"); // €50 stake for Tier 2
            
            await shopToken.connect(customer).approve(shopStaking.address, stakeAmount);
            await shopStaking.connect(customer).stake(stakeAmount);
            
            const stakeInfo = await shopStaking.getUserStakeInfo(customer.address);
            console.log("✅ Customer staked", ethers.utils.formatEther(stakeInfo.stakedAmount), "SHOP");
            console.log("✅ Earned", stakeInfo.multiplier.toString() + "%", "shopping multiplier");
            
            // 4. Test multiplier on future rewards
            const baseRewards = ethers.utils.parseEther("100");
            const multipliedRewards = await shopStaking.applyMultiplier(customer.address, baseRewards);
            const bonus = multipliedRewards.sub(baseRewards);
            
            console.log("✅ Base rewards:", ethers.utils.formatEther(baseRewards), "SHOP");
            console.log("✅ Multiplied rewards:", ethers.utils.formatEther(multipliedRewards), "SHOP");
            console.log("✅ Bonus from staking:", ethers.utils.formatEther(bonus), "SHOP");
            
            // 5. Verify everything worked
            expect(stakeInfo.stakingTier.toNumber()).to.equal(2);
            expect(stakeInfo.multiplier.toNumber()).to.equal(150);
            expect(multipliedRewards.gt(baseRewards)).to.be.true;
            
            console.log("\n🎉 Complete shopping rewards workflow successful!");
            console.log("   - Merchant registration ✓");
            console.log("   - Purchase processing ✓");
            console.log("   - Reward distribution ✓");
            console.log("   - Token staking ✓");
            console.log("   - Multiplier application ✓");
        });
    });

    describe("Security and Access Control", function () {
        it("Should only allow owner to register merchants", async function () {
            let errorThrown = false;
            try {
                await merchantRegistry.connect(customer).registerMerchant(
                    customer.address,
                    "Unauthorized Store", 
                    "grocery",
                    200
                );
            } catch (error) {
                expect(error.message).to.include("Ownable: caller is not the owner");
                errorThrown = true;
            }
            expect(errorThrown).to.be.true;
        });

        it("Should only allow registered merchants to process purchases", async function () {
            let errorThrown = false;
            try {
                await purchaseValidator.connect(customer).processPurchase(
                    customer.address,
                    ethers.utils.parseEther("1000"),
                    "TX999"
                );
            } catch (error) {
                expect(error.message).to.include("Merchant not registered");
                errorThrown = true;
            }
            expect(errorThrown).to.be.true;
        });

        it("Should only allow authorized minters to mint tokens", async function () {
            let errorThrown = false;
            try {
                await shopToken.connect(customer).mintRewards(
                    customer.address,
                    ethers.utils.parseEther("1000"),
                    ethers.utils.parseEther("10000")
                );
            } catch (error) {
                expect(error.message).to.include("Not authorized merchant");
                errorThrown = true;
            }
            expect(errorThrown).to.be.true;
        });

        it("Should allow owner to pause token operations", async function () {
            // Pause the token
            await shopToken.pause();
            
            // Try to transfer (should fail)
            let errorThrown = false;
            try {
                await shopToken.transfer(customer.address, ethers.utils.parseEther("100"));
            } catch (error) {
                expect(error.message).to.include("Pausable: paused");
                errorThrown = true;
            }
            expect(errorThrown).to.be.true;
            
            // Unpause
            await shopToken.unpause();
            
            // Should work after unpause (no error expected)
            await shopToken.transfer(customer.address, ethers.utils.parseEther("100"));
            const balance = await shopToken.balanceOf(customer.address);
            expectBigNumberEqual(balance, ethers.utils.parseEther("100"));
        });
    });
});