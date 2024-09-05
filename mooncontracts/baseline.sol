// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./XTokens.sol";

contract ReceiveCrossChainXToken {

    address constant public axlUSDCAddress = 0xCa01a1D0993565291051daFF390892518ACfAD3A;
    IERC20 constant axlUSDC = IERC20(axlUSDCAddress);
    Xtokens constant xt = Xtokens(0x0000000000000000000000000000000000000804);
    
    event ReceiveBalance(uint256 balance);
    event MultiassetCall(Xtokens.Multilocation, uint256, Xtokens.Multilocation, uint64);

    function executeXCM(
        bytes calldata payload,
        uint256 amount
    ) public {
        // Doesn't reject other currencies, but it will throw an exception if you attempt them
        (
            Xtokens.Multilocation memory asset, 
            Xtokens.Multilocation memory destination,
            uint64 weight
        ) = abi.decode(payload, (Xtokens.Multilocation, Xtokens.Multilocation, uint64));

        // We will be using "amount" instead, since that's what we're actually working with
        emit ReceiveBalance(axlUSDC.balanceOf(address(this)));

        // Transfer to self from the multicall contract
        transferApprovedTokensToSelf(amount);
        
        xt.transfer(axlUSDCAddress, amount, destination, weight);
        
        emit MultiassetCall(asset, amount, destination, weight);
    }


    function transferApprovedTokensToSelf(uint256 amount) internal {
        IERC20 token = IERC20(axlUSDCAddress);
        bool success = token.transferFrom(0xEa749Fd6bA492dbc14c24FE8A3d08769229b896c, address(this), amount);
        require(success, "Transfer failed");
    }
}