// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./XTokens.sol";

contract ReceiveCrossChainXToken {

    address constant public axlUSDCAddress = 0xCa01a1D0993565291051daFF390892518ACfAD3A;
    IERC20 constant axlUSDC = IERC20(axlUSDCAddress);
    Xtokens constant xt = Xtokens(0x0000000000000000000000000000000000000804);

    event ReceiveBalance(uint256 balance);
    event MultiassetCall(Xtokens.Multilocation asset, uint256 amount, Xtokens.Multilocation destination, uint64 weight);

    struct XCMData {
        bytes payload;
        uint256 amount;
    }

    mapping(bytes32 => XCMData) public xcmDataMapping;

    function initXCM(
        bytes32 id, 
        bytes calldata payload,
        uint256 amount
    ) public {
        require(amount > 0, "Amount cannot be zero");
        require(xcmDataMapping[id].amount == 0, "ID already used");
        
        xcmDataMapping[id] = XCMData({
            payload: payload,
            amount: amount
        });

        transferApprovedTokensToSelf(amount);
    }

    function executeXCM(
        bytes32 id 
    ) public {
        XCMData memory xcmData = xcmDataMapping[id];
        require(xcmData.amount > 0, "XCM data not found for this ID");

        (
            Xtokens.Multilocation memory asset, 
            Xtokens.Multilocation memory destination,
            uint64 weight
        ) = abi.decode(xcmData.payload, (Xtokens.Multilocation, Xtokens.Multilocation, uint64));

        emit ReceiveBalance(axlUSDC.balanceOf(address(this)));

        xt.transfer(axlUSDCAddress, xcmData.amount, destination, weight);

        emit MultiassetCall(asset, xcmData.amount, destination, weight);

        delete xcmDataMapping[id];
    }

    function transferApprovedTokensToSelf(uint256 amount) internal {
        IERC20 token = IERC20(axlUSDCAddress);
        bool success = token.transferFrom(0xEa749Fd6bA492dbc14c24FE8A3d08769229b896c, address(this), amount);
        require(success, "Transfer failed");
    }
}
