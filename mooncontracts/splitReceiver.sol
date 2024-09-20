// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.15;

import "./IERC20.sol";
import "./XTokens.sol";

contract ReceiveCrossChainXToken {

    address constant public axlUSDCAddress = 0xCa01a1D0993565291051daFF390892518ACfAD3A;
    IERC20 constant axlUSDC = IERC20(axlUSDCAddress);
    Xtokens constant xt = Xtokens(0x0000000000000000000000000000000000000804);

    event ReceiveBalance(uint256 balance);
    event MultiassetCall(address asset, uint256 amount, Xtokens.Multilocation destination, uint64 weight);

    mapping(bytes32 => uint256) public xcmDataMapping;


    function initXCM(
        bytes32 hash,
        uint256 amount
    ) public {
        require(amount > 0, "Amount cannot be zero");
        require(xcmDataMapping[hash] == 0, "Hash already used");
        
        xcmDataMapping[hash] = amount;

        transferApprovedTokensToSelf(amount);
        emit ReceiveBalance(amount);
    }

    function executeXCM(
        bytes32 id,
        bytes calldata payload
    ) public {
        bytes32 hash = sha256(abi.encodePacked(id, payload));
        require(xcmDataMapping[hash] > 0, "Hash invalid");

        (
            Xtokens.Multilocation memory destination,
            uint64 weight
        ) = abi.decode(payload, (Xtokens.Multilocation, uint64));

        uint256 amount = xcmDataMapping[hash];

        xt.transfer(axlUSDCAddress, amount, destination, weight);

        emit MultiassetCall(axlUSDCAddress, amount, destination, weight);

        delete xcmDataMapping[hash];
    }

    function transferApprovedTokensToSelf(uint256 amount) internal {
        IERC20 token = IERC20(axlUSDCAddress);
        bool success = token.transferFrom(0xEa749Fd6bA492dbc14c24FE8A3d08769229b896c, address(this), amount);
        require(success, "Transfer failed");
    }
}
