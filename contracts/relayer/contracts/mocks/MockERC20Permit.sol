// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract MockERC20Permit is ERC20, ERC20Permit {
    uint256 public feeBps;

    constructor()
        ERC20("Mock Permit Token", "MPT")
        ERC20Permit("Mock Permit Token")
    {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFeeBps(uint256 newFeeBps) external {
        require(newFeeBps <= 10_000, "fee too large");
        feeBps = newFeeBps;
    }

    function _update(
        address from,
        address to,
        uint256 value
    ) internal override {
        if (
            feeBps > 0 &&
            from != address(0) &&
            to != address(0)
        ) {
            uint256 fee = (value * feeBps) / 10_000;
            super._update(from, address(0), fee);
            super._update(from, to, value - fee);
            return;
        }
        super._update(from, to, value);
    }
}
