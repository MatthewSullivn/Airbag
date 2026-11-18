// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MarketParams} from "../src/AirbagGuard.sol";

/// Test doubles that behave like the parts of USDC, Morpho Blue and the Earn Kit vault the guard uses.

contract MockERC20 {
    string public name;
    uint8 public immutable decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory n, uint8 d) {
        name = n;
        decimals = d;
    }

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    function transferFrom(address from, address to, uint256 a) external returns (bool) {
        if (allowance[from][msg.sender] != type(uint256).max) allowance[from][msg.sender] -= a;
        balanceOf[from] -= a;
        balanceOf[to] += a;
        return true;
    }
}

contract MockOracle {
    uint256 public price;

    constructor(uint256 p) {
        price = p;
    }

    function set(uint256 p) external {
        price = p;
    }
}

/// ERC-4626 style vault, 1 share = 1 asset. Withdrawing for someone else needs a share allowance.
contract MockVault {
    MockERC20 public immutable token;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(MockERC20 t) {
        token = t;
    }

    function asset() external view returns (address) {
        return address(token);
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function deposit(uint256 assets, address onBehalf) external returns (uint256) {
        token.transferFrom(msg.sender, address(this), assets);
        balanceOf[onBehalf] += assets;
        return assets;
    }

    function withdraw(uint256 assets, address receiver, address onBehalf) external returns (uint256) {
        if (msg.sender != onBehalf) {
            uint256 al = allowance[onBehalf][msg.sender];
            require(al >= assets, "vault: allowance");
            if (al != type(uint256).max) allowance[onBehalf][msg.sender] = al - assets;
        }
        balanceOf[onBehalf] -= assets;
        token.transfer(receiver, assets);
        return assets;
    }
}

/// Just enough Morpho Blue: one market, debt in assets with shares = assets * 1e6 (Morpho's virtual-share scale).
contract MockMorpho {
    bytes32 public immutable id;
    MarketParams internal mp;
    MockERC20 public immutable loan;
    mapping(address => uint128) public borrowShares;
    mapping(address => uint128) public collateralOf;
    mapping(address => mapping(address => bool)) public isAuthorized;
    uint128 public totalBorrowAssets;
    uint128 public totalBorrowShares;

    constructor(bytes32 id_, MarketParams memory p) {
        id = id_;
        mp = p;
        loan = MockERC20(p.loanToken);
        loan.mint(address(this), 1e15); // liquidity to lend
    }

    function idToMarketParams(bytes32 i) external view returns (address, address, address, address, uint256) {
        if (i != id) return (address(0), address(0), address(0), address(0), 0);
        return (mp.loanToken, mp.collateralToken, mp.oracle, mp.irm, mp.lltv);
    }

    function setAuthorization(address who, bool ok) external {
        isAuthorized[msg.sender][who] = ok;
    }

    function setPosition(address user, uint128 collateral, uint128 debtAssets) external {
        collateralOf[user] = collateral;
        totalBorrowAssets = totalBorrowAssets - (borrowShares[user] / 1e6) + debtAssets;
        totalBorrowShares = totalBorrowShares - borrowShares[user] + debtAssets * 1e6;
        borrowShares[user] = debtAssets * 1e6;
    }

    function debtOf(address user) external view returns (uint256) {
        return borrowShares[user] / 1e6;
    }

    function position(bytes32, address user) external view returns (uint256, uint128, uint128) {
        return (0, borrowShares[user], collateralOf[user]);
    }

    function market(bytes32) external view returns (uint128, uint128, uint128, uint128, uint128, uint128) {
        return (0, 0, totalBorrowAssets, totalBorrowShares, 0, 0);
    }

    function repay(MarketParams calldata, uint256 assets, uint256, address onBehalf, bytes calldata)
        external returns (uint256, uint256)
    {
        uint128 s = uint128(assets * 1e6);
        require(borrowShares[onBehalf] >= s, "morpho: repay more than owed");
        loan.transferFrom(msg.sender, address(this), assets);
        borrowShares[onBehalf] -= s;
        totalBorrowShares -= s;
        totalBorrowAssets -= uint128(assets);
        return (assets, s);
    }

    function borrow(MarketParams calldata, uint256 assets, uint256, address onBehalf, address receiver)
        external returns (uint256, uint256)
    {
        require(msg.sender == onBehalf || isAuthorized[onBehalf][msg.sender], "morpho: unauthorized");
        uint128 s = uint128(assets * 1e6);
        borrowShares[onBehalf] += s;
        totalBorrowShares += s;
        totalBorrowAssets += uint128(assets);
        loan.transfer(receiver, assets);
        return (assets, s);
    }
}
