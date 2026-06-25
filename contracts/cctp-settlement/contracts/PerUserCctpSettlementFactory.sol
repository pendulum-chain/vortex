// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PerUserCctpSettlement} from "./PerUserCctpSettlement.sol";

contract PerUserCctpSettlementFactory {
    address public immutable usdc;
    address public immutable tokenMessenger;

    event SettlementDeployed(
        address indexed settlement,
        address indexed ethereumMintRecipient
    );

    constructor(address _usdc, address _tokenMessenger) {
        require(_usdc != address(0), "Invalid USDC");
        require(_tokenMessenger != address(0), "Invalid messenger");

        usdc = _usdc;
        tokenMessenger = _tokenMessenger;
    }

    function deploySettlement(address ethereumMintRecipient) external returns (address settlement) {
        settlement = address(new PerUserCctpSettlement(usdc, tokenMessenger, ethereumMintRecipient));

        emit SettlementDeployed(settlement, ethereumMintRecipient);
    }
}
