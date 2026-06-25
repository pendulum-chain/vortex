// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ITokenMessengerV2} from "./interfaces/ITokenMessengerV2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract PerUserCctpSettlement is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint32 public constant ETHEREUM_DESTINATION_DOMAIN = 0;
    bytes32 public constant DESTINATION_CALLER = bytes32(0);
    bytes32 public constant FORWARD_HOOK_DATA = 0x636374702d666f72776172640000000000000000000000000000000000000000;

    IERC20 public immutable usdc;
    ITokenMessengerV2 public immutable tokenMessenger;
    address public immutable ethereumMintRecipient;
    bytes32 public immutable mintRecipientBytes32;

    event UsdcSweptAndForwarded(
        address indexed caller,
        uint256 usdcAmount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bytes32 forwardHookData
    );

    constructor(address _usdc, address _tokenMessenger, address _ethereumMintRecipient) {
        require(_usdc != address(0), "Invalid USDC");
        require(_tokenMessenger != address(0), "Invalid messenger");
        require(_ethereumMintRecipient != address(0), "Invalid recipient");

        usdc = IERC20(_usdc);
        tokenMessenger = ITokenMessengerV2(_tokenMessenger);
        ethereumMintRecipient = _ethereumMintRecipient;
        mintRecipientBytes32 = _addressToBytes32(_ethereumMintRecipient);
    }

    function sweepUsdc(uint256 usdcAmount, uint256 maxFee, uint32 minFinalityThreshold) external nonReentrant {
        require(usdcAmount > 0, "Invalid amount");
        require(usdc.balanceOf(address(this)) >= usdcAmount, "Insufficient USDC balance");

        usdc.forceApprove(address(tokenMessenger), usdcAmount);

        tokenMessenger.depositForBurnWithHook(
            usdcAmount,
            ETHEREUM_DESTINATION_DOMAIN,
            mintRecipientBytes32,
            address(usdc),
            DESTINATION_CALLER,
            maxFee,
            minFinalityThreshold,
            abi.encodePacked(FORWARD_HOOK_DATA)
        );

        usdc.forceApprove(address(tokenMessenger), 0);

        emit UsdcSweptAndForwarded(
            msg.sender,
            usdcAmount,
            ETHEREUM_DESTINATION_DOMAIN,
            mintRecipientBytes32,
            DESTINATION_CALLER,
            maxFee,
            minFinalityThreshold,
            FORWARD_HOOK_DATA
        );
    }

    function _addressToBytes32(address value) private pure returns (bytes32) {
        return bytes32(uint256(uint160(value)));
    }
}
