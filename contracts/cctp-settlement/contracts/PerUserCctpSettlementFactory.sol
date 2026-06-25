// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PerUserCctpSettlement} from "./PerUserCctpSettlement.sol";

contract PerUserCctpSettlementFactory {
    address public immutable usdc;
    address public immutable tokenMessenger;

    event SettlementDeployed(
        address indexed settlement,
        address indexed ethereumMintRecipient,
        bytes32 destinationCaller
    );

    constructor(address _usdc, address _tokenMessenger) {
        require(_usdc != address(0), "Invalid USDC");
        require(_tokenMessenger != address(0), "Invalid messenger");

        usdc = _usdc;
        tokenMessenger = _tokenMessenger;
    }

    function deploySettlement(address ethereumMintRecipient, bytes32 destinationCaller) external returns (address settlement) {
        settlement = address(new PerUserCctpSettlement(usdc, tokenMessenger, ethereumMintRecipient, destinationCaller));

        emit SettlementDeployed(settlement, ethereumMintRecipient, destinationCaller);
    }
}
