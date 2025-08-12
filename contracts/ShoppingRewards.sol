// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title SHOP Token - Unified Shopping Rewards Token
 * @dev Main rewards token that replaces traditional loyalty points across merchants
 */
contract SHOPToken is ERC20, Ownable, Pausable {
    // No max supply - inflationary model based on merchant activity
    uint256 public constant INITIAL_SUPPLY = 10_000_000 * 10**18; // 10M tokens
    
    // Token value: 1 SHOP = €0.01 (100 SHOP = €1)
    uint256 public constant TOKEN_VALUE_CENTS = 1; // 1 cent per token
    
    mapping(address => bool) public authorizedMinters;
    mapping(address => uint256) public merchantTokensIssued;
    
    // Rate limiting
    mapping(address => uint256) public lastMintTime;
    uint256 public constant MINT_COOLDOWN = 1 hours;
    uint256 public constant MAX_MINT_PER_TX = 10000 * 10**18; // 10k tokens max per tx
    
    event MinterAuthorized(address indexed minter, string merchantName);
    event MinterRemoved(address indexed minter);
    event RewardsIssued(address indexed merchant, address indexed customer, uint256 amount, uint256 purchaseValue);
    
    constructor() ERC20("Unified Shopping Rewards", "SHOP") {
        _mint(msg.sender, INITIAL_SUPPLY);
    }
    
    /**
     * @dev Authorize a merchant contract to mint rewards
     */
    function authorizeMinter(address _minter, string memory _merchantName) external onlyOwner {
        require(_minter != address(0), "Invalid minter address");
        require(bytes(_merchantName).length > 0, "Invalid merchant name");
        authorizedMinters[_minter] = true;
        emit MinterAuthorized(_minter, _merchantName);
    }
    
    /**
     * @dev Remove authorization from a merchant
     */
    function removeMinter(address _minter) external onlyOwner {
        authorizedMinters[_minter] = false;
        emit MinterRemoved(_minter);
    }
    
    /**
     * @dev Mint rewards for customer purchases (only authorized merchants)
     */
    function mintRewards(address customer, uint256 amount, uint256 purchaseValue) external {
        require(authorizedMinters[msg.sender], "Not authorized merchant");
        require(customer != address(0), "Invalid customer address");
        require(amount > 0, "Amount must be positive");
        require(amount <= MAX_MINT_PER_TX, "Exceeds max mint per transaction");
        require(purchaseValue > 0, "Invalid purchase value");
        
        // Rate limiting
        require(
            block.timestamp >= lastMintTime[msg.sender] + MINT_COOLDOWN,
            "Mint cooldown not met"
        );
        
        lastMintTime[msg.sender] = block.timestamp;
        merchantTokensIssued[msg.sender] += amount;
        
        _mint(customer, amount);
        emit RewardsIssued(msg.sender, customer, amount, purchaseValue);
    }
    
    /**
     * @dev Pause token operations (emergency)
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause token operations
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Override _beforeTokenTransfer to include pause functionality (OpenZeppelin v4.x)
     */
    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }
    
    /**
     * @dev Get merchant statistics
     */
    function getMerchantStats(address merchant) external view returns (uint256 tokensIssued, bool isAuthorized) {
        return (merchantTokensIssued[merchant], authorizedMinters[merchant]);
    }
}

/**
 * @title Merchant Registry
 * @dev Manages merchant onboarding and verification
 */
contract MerchantRegistry is Ownable {
    struct Merchant {
        string name;
        string category; // "grocery", "electronics", "fashion", etc.
        address merchantAddress;
        uint256 rewardRate; // Basis points (e.g., 200 = 2%)
        bool isActive;
        uint256 registeredAt;
        uint256 totalSales;
        uint256 totalRewardsIssued;
    }
    
    mapping(address => Merchant) public merchants;
    mapping(address => bool) public isMerchant;
    address[] public merchantList;
    
    SHOPToken public shopToken;
    
    event MerchantRegistered(address indexed merchant, string name, string category, uint256 rewardRate);
    event MerchantStatusUpdated(address indexed merchant, bool isActive);
    event RewardRateUpdated(address indexed merchant, uint256 newRate);
    
    constructor(address _shopToken) {
        require(_shopToken != address(0), "Invalid SHOP token address");
        shopToken = SHOPToken(_shopToken);
    }
    
    /**
     * @dev Register a new merchant (FIXED: removed automatic authorization)
     */
    function registerMerchant(
        address _merchantAddress,
        string memory _name,
        string memory _category,
        uint256 _rewardRate
    ) external onlyOwner {
        require(_merchantAddress != address(0), "Invalid merchant address");
        require(bytes(_name).length > 0, "Invalid merchant name");
        require(bytes(_category).length > 0, "Invalid category");
        require(_rewardRate > 0 && _rewardRate <= 1000, "Invalid reward rate"); // Max 10%
        require(!isMerchant[_merchantAddress], "Merchant already registered");
        
        merchants[_merchantAddress] = Merchant({
            name: _name,
            category: _category,
            merchantAddress: _merchantAddress,
            rewardRate: _rewardRate,
            isActive: true,
            registeredAt: block.timestamp,
            totalSales: 0,
            totalRewardsIssued: 0
        });
        
        isMerchant[_merchantAddress] = true;
        merchantList.push(_merchantAddress);
        
        // FIXED: Don't automatically authorize - let owner do it manually
        // This prevents ownership issues
        
        emit MerchantRegistered(_merchantAddress, _name, _category, _rewardRate);
    }
    
    /**
     * @dev Get merchant information
     */
    function getMerchantInfo(address _merchant) external view returns (
        string memory name,
        string memory category,
        uint256 rewardRate,
        bool isActive,
        uint256 totalSales,
        uint256 totalRewardsIssued
    ) {
        require(isMerchant[_merchant], "Merchant not registered");
        Merchant memory merchant = merchants[_merchant];
        return (
            merchant.name,
            merchant.category,
            merchant.rewardRate,
            merchant.isActive,
            merchant.totalSales,
            merchant.totalRewardsIssued
        );
    }
    
    /**
     * @dev Get total number of registered merchants
     */
    function getMerchantCount() external view returns (uint256) {
        return merchantList.length;
    }
}

/**
 * @title Purchase Validator
 * @dev Validates purchases and distributes rewards to customers
 */
contract PurchaseValidator is ReentrancyGuard, Ownable {
    SHOPToken public shopToken;
    MerchantRegistry public merchantRegistry;
    
    mapping(address => uint256) public customerTotalSpent;
    mapping(address => uint256) public customerTotalRewards;
    mapping(string => bool) public processedTransactions;
    
    // Purchase limits for security
    uint256 public constant MAX_PURCHASE_AMOUNT = 100000 * 10**18; // €1000 max
    uint256 public constant MIN_PURCHASE_AMOUNT = 100 * 10**18; // €1 min
    
    event PurchaseProcessed(
        address indexed customer,
        address indexed merchant,
        uint256 amount,
        uint256 rewards,
        string transactionId
    );
    
    constructor(address _shopToken, address _merchantRegistry) {
        require(_shopToken != address(0), "Invalid SHOP token address");
        require(_merchantRegistry != address(0), "Invalid merchant registry address");
        shopToken = SHOPToken(_shopToken);
        merchantRegistry = MerchantRegistry(_merchantRegistry);
    }
    
    /**
     * @dev Process a purchase and distribute rewards
     */
    function processPurchase(
        address _customer,
        uint256 _amount,
        string memory _transactionId
    ) external nonReentrant {
        require(_customer != address(0), "Invalid customer address");
        require(_amount >= MIN_PURCHASE_AMOUNT, "Purchase amount too low");
        require(_amount <= MAX_PURCHASE_AMOUNT, "Purchase amount too high");
        require(bytes(_transactionId).length > 0, "Invalid transaction ID");
        require(!processedTransactions[_transactionId], "Transaction already processed");
        
        // Verify caller is registered merchant
        (, , uint256 rewardRate, bool isActive, ,) = 
            merchantRegistry.getMerchantInfo(msg.sender);
        require(isActive, "Merchant not active");
        
        // Calculate rewards: amount * rewardRate / 10000
        uint256 rewardsToEarn = (_amount * rewardRate) / 10000;
        require(rewardsToEarn > 0, "No rewards to earn");
        
        // Update tracking
        customerTotalSpent[_customer] += _amount;
        customerTotalRewards[_customer] += rewardsToEarn;
        processedTransactions[_transactionId] = true;
        
        // Mint rewards to customer
        shopToken.mintRewards(_customer, rewardsToEarn, _amount);
        
        emit PurchaseProcessed(_customer, msg.sender, _amount, rewardsToEarn, _transactionId);
    }
    
    /**
     * @dev Get customer statistics
     */
    function getCustomerStats(address _customer) external view returns (
        uint256 totalSpent,
        uint256 totalRewards,
        uint256 shopBalance
    ) {
        return (
            customerTotalSpent[_customer],
            customerTotalRewards[_customer],
            shopToken.balanceOf(_customer)
        );
    }
}

/**
 * @title SHOP Staking Pool
 * @dev Allows users to stake SHOP tokens for earning multipliers and bonuses
 */
contract SHOPStaking is ReentrancyGuard, Ownable, Pausable {
    SHOPToken public shopToken;
    
    struct StakeInfo {
        uint256 amount;
        uint256 stakingTime;
        uint256 lastRewardClaim;
        uint256 stakingTier; // 1, 2, or 3
        uint256 multiplier; // 110, 150, 200 (representing 1.1x, 1.5x, 2.0x)
    }
    
    mapping(address => StakeInfo) public stakes;
    mapping(address => bool) public isStaker;
    
    uint256 public totalStaked;
    
    // Staking tiers and multipliers
    uint256 public constant TIER_1_MIN = 1000 * 10**18; // 1k SHOP (€10)
    uint256 public constant TIER_2_MIN = 5000 * 10**18; // 5k SHOP (€50)
    uint256 public constant TIER_3_MIN = 20000 * 10**18; // 20k SHOP (€200)
    
    uint256 public constant TIER_1_MULTIPLIER = 110; // 1.1x rewards
    uint256 public constant TIER_2_MULTIPLIER = 150; // 1.5x rewards
    uint256 public constant TIER_3_MULTIPLIER = 200; // 2.0x rewards
    
    uint256 public constant TIER_1_LOCK = 7 days;
    uint256 public constant TIER_2_LOCK = 30 days;
    uint256 public constant TIER_3_LOCK = 90 days;
    
    // Bonus rewards for staking (5% APY in SHOP tokens)
    uint256 public stakingRewardRate = 500; // 5% APY
    uint256 public constant SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
    
    address[] public stakers;
    
    event Staked(address indexed user, uint256 amount, uint256 tier, uint256 multiplier);
    event Unstaked(address indexed user, uint256 amount);
    event StakingRewardsClaimed(address indexed user, uint256 rewards);
    
    constructor(address _shopToken) {
        require(_shopToken != address(0), "Invalid SHOP token address");
        shopToken = SHOPToken(_shopToken);
    }
    
    /**
     * @dev Stake SHOP tokens for earning multipliers
     */
    function stake(uint256 _amount) external nonReentrant whenNotPaused {
        require(_amount > 0, "Amount must be positive");
        require(_amount >= TIER_1_MIN, "Below minimum stake amount");
        require(shopToken.balanceOf(msg.sender) >= _amount, "Insufficient balance");
        
        // Transfer tokens to contract
        require(shopToken.transferFrom(msg.sender, address(this), _amount), "Transfer failed");
        
        // Determine staking tier and multiplier
        (uint256 tier, uint256 multiplier,) = _getStakingTier(_amount);
        
        // If user already has stake, claim rewards first
        if (stakes[msg.sender].amount > 0) {
            _claimStakingRewards(msg.sender);
        } else {
            stakers.push(msg.sender);
            isStaker[msg.sender] = true;
        }
        
        // Update stake info
        stakes[msg.sender] = StakeInfo({
            amount: stakes[msg.sender].amount + _amount,
            stakingTime: block.timestamp,
            lastRewardClaim: block.timestamp,
            stakingTier: tier,
            multiplier: multiplier
        });
        
        totalStaked += _amount;
        
        emit Staked(msg.sender, _amount, tier, multiplier);
    }
    
    /**
     * @dev Unstake SHOP tokens
     */
    function unstake(uint256 _amount) external nonReentrant {
        require(_amount > 0, "Amount must be positive");
        
        StakeInfo storage userStake = stakes[msg.sender];
        require(userStake.amount >= _amount, "Insufficient staked amount");
        
        // Check lock period based on tier
        uint256 lockPeriod = _getLockPeriod(userStake.stakingTier);
        require(
            block.timestamp >= userStake.stakingTime + lockPeriod,
            "Lock period not met"
        );
        
        // Claim staking rewards first
        _claimStakingRewards(msg.sender);
        
        // Update stake
        userStake.amount -= _amount;
        totalStaked -= _amount;
        
        // Transfer tokens back
        require(shopToken.transfer(msg.sender, _amount), "Transfer failed");
        
        emit Unstaked(msg.sender, _amount);
    }
    
    /**
     * @dev Apply staking multiplier to shopping rewards
     */
    function applyMultiplier(address _customer, uint256 _baseRewards) external view returns (uint256) {
        if (!isStaker[_customer]) {
            return _baseRewards;
        }
        
        StakeInfo memory userStake = stakes[_customer];
        if (userStake.amount == 0) {
            return _baseRewards;
        }
        
        uint256 bonusRewards = (_baseRewards * (userStake.multiplier - 100)) / 100;
        return _baseRewards + bonusRewards;
    }
    
    /**
     * @dev Claim staking rewards (5% APY)
     */
    function claimStakingRewards() external nonReentrant {
        _claimStakingRewards(msg.sender);
    }
    
    /**
     * @dev Internal function to claim staking rewards
     */
    function _claimStakingRewards(address _user) internal {
        StakeInfo storage userStake = stakes[_user];
        require(userStake.amount > 0, "No active stake");
        
        uint256 stakingDuration = block.timestamp - userStake.lastRewardClaim;
        uint256 rewards = (userStake.amount * stakingRewardRate * stakingDuration) / 
                         (10000 * SECONDS_PER_YEAR);
        
        if (rewards > 0) {
            userStake.lastRewardClaim = block.timestamp;
            shopToken.mintRewards(_user, rewards, userStake.amount);
            emit StakingRewardsClaimed(_user, rewards);
        }
    }
    
    /**
     * @dev Get staking tier based on amount
     */
    function _getStakingTier(uint256 _amount) internal pure returns (uint256 tier, uint256 multiplier, uint256 lockPeriod) {
        if (_amount >= TIER_3_MIN) {
            return (3, TIER_3_MULTIPLIER, TIER_3_LOCK);
        } else if (_amount >= TIER_2_MIN) {
            return (2, TIER_2_MULTIPLIER, TIER_2_LOCK);
        } else {
            return (1, TIER_1_MULTIPLIER, TIER_1_LOCK);
        }
    }
    
    /**
     * @dev Get lock period for tier
     */
    function _getLockPeriod(uint256 _tier) internal pure returns (uint256) {
        if (_tier == 3) return TIER_3_LOCK;
        if (_tier == 2) return TIER_2_LOCK;
        return TIER_1_LOCK;
    }
    
    /**
     * @dev Get user staking information
     */
    function getUserStakeInfo(address _user) external view returns (
        uint256 stakedAmount,
        uint256 stakingTier,
        uint256 multiplier,
        uint256 pendingRewards,
        bool canUnstake
    ) {
        StakeInfo memory userStake = stakes[_user];
        uint256 lockPeriod = _getLockPeriod(userStake.stakingTier);
        
        uint256 pendingStakingRewards = 0;
        if (userStake.amount > 0) {
            uint256 stakingDuration = block.timestamp - userStake.lastRewardClaim;
            pendingStakingRewards = (userStake.amount * stakingRewardRate * stakingDuration) / 
                                   (10000 * SECONDS_PER_YEAR);
        }
        
        return (
            userStake.amount,
            userStake.stakingTier,
            userStake.multiplier,
            pendingStakingRewards,
            block.timestamp >= userStake.stakingTime + lockPeriod
        );
    }
}

/**
 * @title Stablecoin Swap
 * @dev Allows users to swap SHOP tokens for stablecoins (USDC)
 */
contract StablecoinSwap is ReentrancyGuard, Ownable, Pausable {
    SHOPToken public shopToken;
    IERC20 public stablecoin; // USDC or USDT
    
    uint256 public constant SHOP_TO_STABLECOIN_RATE = 100; // 100 SHOP = 1 USDC (€1)
    uint256 public swapFee = 50; // 0.5% fee in basis points
    uint256 public constant MAX_FEE = 500; // Max 5% fee
    
    uint256 public totalSwapped;
    mapping(address => uint256) public userSwappedAmount;
    
    event SwappedToStablecoin(address indexed user, uint256 shopAmount, uint256 stablecoinAmount, uint256 fee);
    
    constructor(address _shopToken, address _stablecoin) {
        require(_shopToken != address(0), "Invalid SHOP token address");
        require(_stablecoin != address(0), "Invalid stablecoin address");
        shopToken = SHOPToken(_shopToken);
        stablecoin = IERC20(_stablecoin);
    }
    
    /**
     * @dev Swap SHOP tokens for stablecoins
     */
    function swapToStablecoin(uint256 _shopAmount) external nonReentrant whenNotPaused {
        require(_shopAmount > 0, "Amount must be positive");
        require(_shopAmount >= SHOP_TO_STABLECOIN_RATE, "Minimum 100 SHOP for swap");
        require(shopToken.balanceOf(msg.sender) >= _shopAmount, "Insufficient SHOP balance");
        
        // Calculate stablecoin amount and fee
        uint256 stablecoinAmount = _shopAmount / SHOP_TO_STABLECOIN_RATE;
        uint256 fee = (stablecoinAmount * swapFee) / 10000;
        uint256 finalAmount = stablecoinAmount - fee;
        
        require(stablecoin.balanceOf(address(this)) >= finalAmount, "Insufficient stablecoin reserves");
        
        // Transfer SHOP tokens to contract (burns them from circulation)
        require(shopToken.transferFrom(msg.sender, address(this), _shopAmount), "SHOP transfer failed");
        
        // Transfer stablecoins to user
        require(stablecoin.transfer(msg.sender, finalAmount), "Stablecoin transfer failed");
        
        // Update tracking
        totalSwapped += _shopAmount;
        userSwappedAmount[msg.sender] += _shopAmount;
        
        emit SwappedToStablecoin(msg.sender, _shopAmount, finalAmount, fee);
    }
}