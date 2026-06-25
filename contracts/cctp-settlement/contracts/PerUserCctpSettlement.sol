// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {ITokenMessengerV2} from "./interfaces/ITokenMessengerV2.sol";

contract PerUserCctpSettlement is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint32 public constant ETHEREUM_DESTINATION_DOMAIN = 0;

    IERC20 public immutable usdc;
    ITokenMessengerV2 public immutable tokenMessenger;
    address public immutable ethereumMintRecipient;
    bytes32 public immutable mintRecipientBytes32;
    bytes32 public immutable destinationCaller;

    event UsdcSweptAndBurned(
        address indexed caller,
        uint256 usdcAmount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold
    );

    constructor(address _usdc, address _tokenMessenger, address _ethereumMintRecipient, bytes32 _destinationCaller) {
        require(_usdc != address(0), "Invalid USDC");
        require(_tokenMessenger != address(0), "Invalid messenger");
        require(_ethereumMintRecipient != address(0), "Invalid recipient");

        usdc = IERC20(_usdc);
        tokenMessenger = ITokenMessengerV2(_tokenMessenger);
        ethereumMintRecipient = _ethereumMintRecipient;
        mintRecipientBytes32 = _addressToBytes32(_ethereumMintRecipient);
        destinationCaller = _destinationCaller;
    }

    function sweepUsdc(uint256 maxFee, uint32 minFinalityThreshold) external nonReentrant {
        uint256 usdcAmount = usdc.balanceOf(address(this));
        require(usdcAmount > 0, "No USDC balance");

        usdc.forceApprove(address(tokenMessenger), usdcAmount);

        tokenMessenger.depositForBurn(
            usdcAmount,
            ETHEREUM_DESTINATION_DOMAIN,
            mintRecipientBytes32,
            address(usdc),
            destinationCaller,
            maxFee,
            minFinalityThreshold
        );

        usdc.forceApprove(address(tokenMessenger), 0);

        emit UsdcSweptAndBurned(
            msg.sender,
            usdcAmount,
            ETHEREUM_DESTINATION_DOMAIN,
            mintRecipientBytes32,
            destinationCaller,
            maxFee,
            minFinalityThreshold
        );
    }

    function _addressToBytes32(address value) private pure returns (bytes32) {
        return bytes32(uint256(uint160(value)));
    }
}
