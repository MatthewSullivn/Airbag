// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Minimal interfaces for what the guard calls. Morpho Blue is the lending contract under Circle's Borrow Kit;
/// the savings vault is Circle's Earn Kit vault (Morpho Vault V2, ERC-4626 style).
struct MarketParams {
    address loanToken;
    address collateralToken;
    address oracle;
    address irm;
    uint256 lltv;
}

interface IMorpho {
    function idToMarketParams(bytes32 id)
        external view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv);
    function position(bytes32 id, address user)
        external view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral);
    function market(bytes32 id)
        external view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee);
    function repay(MarketParams calldata marketParams, uint256 assets, uint256 shares, address onBehalf, bytes calldata data)
        external returns (uint256 assetsRepaid, uint256 sharesRepaid);
    function borrow(MarketParams calldata marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver)
        external returns (uint256 assetsBorrowed, uint256 sharesBorrowed);
}

interface IOracle {
    function price() external view returns (uint256);
}

interface IVault {
    function asset() external view returns (address);
    function withdraw(uint256 assets, address receiver, address onBehalf) external returns (uint256 shares);
    function deposit(uint256 assets, address onBehalf) external returns (uint256 shares);
}

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @title AirbagGuard
/// @notice Lets the Airbag bot protect ONE owner's loan without being able to take anything.
/// The bot can only:
///   - save():     move the owner's savings (vault) into the owner's own loan (Morpho repay on the owner's behalf)
///   - giveBack(): borrow from the owner's own loan back into the owner's own savings, never below a health floor
/// Money never goes to the bot, to this contract (except for the length of one call), or to anyone else.
/// Both moves are capped per day on-chain. The owner can pause, swap the bot, change the caps, or simply
/// revoke the vault allowance / Morpho authorization to cut the guard off completely.
contract AirbagGuard {
    uint256 private constant WAD = 1e18;
    uint256 private constant ORACLE_SCALE = 1e36;
    uint256 private constant DAY = 1 days;

    address public immutable owner;
    IMorpho public immutable morpho;
    IVault public immutable vault;
    bytes32 public immutable marketId;
    IERC20 public immutable usdc;

    address public bot;
    bool public paused;
    /// Max USDC (6 decimals) the bot may move per rolling day, both directions added together.
    uint256 public dailyCap;
    /// giveBack() must leave the loan at least this healthy, on the lending market's own oracle price (WAD, 1.15e18 = 1.15).
    uint256 public minHealthAfterGiveBack;

    uint256 public windowStart;
    uint256 public movedInWindow;

    event Saved(uint256 assets, uint256 healthAfter);
    event GivenBack(uint256 assets, uint256 healthAfter);
    event BotChanged(address bot);
    event Paused(bool paused);
    event LimitsChanged(uint256 dailyCap, uint256 minHealthAfterGiveBack);

    error NotOwner();
    error NotBot();
    error IsPaused();
    error ZeroAmount();
    error OverDailyCap(uint256 wouldMove, uint256 cap);
    error HealthTooLow(uint256 healthAfter, uint256 floor);
    error WrongMarket();
    error BadFloor();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyBot() {
        if (msg.sender != bot) revert NotBot();
        if (paused) revert IsPaused();
        _;
    }

    constructor(
        address owner_,
        address bot_,
        IMorpho morpho_,
        IVault vault_,
        bytes32 marketId_,
        uint256 dailyCap_,
        uint256 minHealthAfterGiveBack_
    ) {
        (address loanToken,,,, uint256 lltv) = morpho_.idToMarketParams(marketId_);
        if (loanToken == address(0) || lltv == 0) revert WrongMarket();
        if (vault_.asset() != loanToken) revert WrongMarket();
        if (minHealthAfterGiveBack_ < WAD) revert BadFloor();
        owner = owner_;
        bot = bot_;
        morpho = morpho_;
        vault = vault_;
        marketId = marketId_;
        usdc = IERC20(loanToken);
        dailyCap = dailyCap_;
        minHealthAfterGiveBack = minHealthAfterGiveBack_;
        // Approve once: Morpho pulls USDC for repay, the vault pulls USDC for deposit.
        IERC20(loanToken).approve(address(morpho_), type(uint256).max);
        IERC20(loanToken).approve(address(vault_), type(uint256).max);
        emit BotChanged(bot_);
        emit LimitsChanged(dailyCap_, minHealthAfterGiveBack_);
    }

    // ------------------------------------------------------------------ bot actions

    /// Move `assets` USDC from the owner's savings into the owner's loan.
    /// Needs: the owner approved this contract to spend their vault shares.
    function save(uint256 assets) external onlyBot returns (uint256 healthAfter) {
        if (assets == 0) revert ZeroAmount();
        _spend(assets);
        vault.withdraw(assets, address(this), owner);                // owner's shares -> USDC here, for this call only
        morpho.repay(_params(), assets, 0, owner, "");                // repays the OWNER's debt; reverts if more than owed
        healthAfter = health();
        emit Saved(assets, healthAfter);
    }

    /// Borrow `assets` USDC from the owner's loan and deposit it into the owner's savings.
    /// Needs: the owner called morpho.setAuthorization(this, true). Refuses to leave the loan under the floor.
    function giveBack(uint256 assets) external onlyBot returns (uint256 healthAfter) {
        if (assets == 0) revert ZeroAmount();
        _spend(assets);
        morpho.borrow(_params(), assets, 0, owner, address(this));    // the OWNER's loan, USDC to here for this call only
        healthAfter = health();
        if (healthAfter < minHealthAfterGiveBack) revert HealthTooLow(healthAfter, minHealthAfterGiveBack);
        vault.deposit(assets, owner);                                  // shares go to the OWNER
        emit GivenBack(assets, healthAfter);
    }

    // ------------------------------------------------------------------ owner controls

    function setBot(address bot_) external onlyOwner {
        bot = bot_;
        emit BotChanged(bot_);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit Paused(paused_);
    }

    function setLimits(uint256 dailyCap_, uint256 minHealthAfterGiveBack_) external onlyOwner {
        if (minHealthAfterGiveBack_ < WAD) revert BadFloor();
        dailyCap = dailyCap_;
        minHealthAfterGiveBack = minHealthAfterGiveBack_;
        emit LimitsChanged(dailyCap_, minHealthAfterGiveBack_);
    }

    /// The guard never keeps funds, but if anyone sends tokens here by mistake, only the owner can take them out.
    function sweep(IERC20 token) external onlyOwner {
        token.transfer(owner, token.balanceOf(address(this)));
    }

    // ------------------------------------------------------------------ views

    /// The owner's loan health on the lending market's own oracle price (WAD). type(uint256).max with no debt.
    function health() public view returns (uint256) {
        (,, address oracle,, uint256 lltv) = morpho.idToMarketParams(marketId);
        (, uint128 borrowShares, uint128 collateral) = morpho.position(marketId, owner);
        if (borrowShares == 0) return type(uint256).max;
        (,, uint128 totalBorrowAssets, uint128 totalBorrowShares,,) = morpho.market(marketId);
        // Debt rounded up, like Morpho does for borrowers (with its virtual shares: +1 asset, +1e6 shares).
        uint256 debt = _mulDivUp(borrowShares, uint256(totalBorrowAssets) + 1, uint256(totalBorrowShares) + 1e6);
        uint256 maxBorrow = (uint256(collateral) * IOracle(oracle).price() / ORACLE_SCALE) * lltv / WAD;
        return maxBorrow * WAD / debt;
    }

    /// How much more the bot may move today.
    function capLeft() external view returns (uint256) {
        uint256 moved = block.timestamp >= windowStart + DAY ? 0 : movedInWindow;
        return moved >= dailyCap ? 0 : dailyCap - moved;
    }

    // ------------------------------------------------------------------ internals

    function _spend(uint256 assets) private {
        if (block.timestamp >= windowStart + DAY) {
            windowStart = block.timestamp;
            movedInWindow = 0;
        }
        uint256 next = movedInWindow + assets;
        if (next > dailyCap) revert OverDailyCap(next, dailyCap);
        movedInWindow = next;
    }

    function _params() private view returns (MarketParams memory p) {
        (p.loanToken, p.collateralToken, p.oracle, p.irm, p.lltv) = morpho.idToMarketParams(marketId);
    }

    function _mulDivUp(uint256 x, uint256 y, uint256 d) private pure returns (uint256) {
        return (x * y + (d - 1)) / d;
    }
}
