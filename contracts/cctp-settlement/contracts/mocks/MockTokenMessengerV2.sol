// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockTokenMessengerV2 {
    using SafeERC20 for IERC20;

    struct BurnCall {
        uint256 amount;
        uint32 destinationDomain;
        bytes32 mintRecipient;
        address burnToken;
        bytes32 destinationCaller;
        uint256 maxFee;
        uint32 minFinalityThreshold;
        bytes hookData;
        address depositor;
    }

    BurnCall public lastBurnCall;
    bool public reenter;
    address public reenterTarget;
    bytes public reenterData;

    event DepositForBurn(
        address indexed burnToken,
        uint256 amount,
        address indexed depositor,
        bytes32 mintRecipient,
        uint32 destinationDomain,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 indexed minFinalityThreshold,
        bytes hookData
    );

    function depositForBurnWithHook(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bytes calldata hookData
    ) external {
        if (reenter) {
            (bool success, bytes memory returndata) = reenterTarget.call(reenterData);
            if (!success) {
                assembly {
                    revert(add(returndata, 32), mload(returndata))
                }
            }
        }

        IERC20(burnToken).safeTransferFrom(msg.sender, address(this), amount);

        lastBurnCall = BurnCall({
            amount: amount,
            destinationDomain: destinationDomain,
            mintRecipient: mintRecipient,
            burnToken: burnToken,
            destinationCaller: destinationCaller,
            maxFee: maxFee,
            minFinalityThreshold: minFinalityThreshold,
            hookData: hookData,
            depositor: msg.sender
        });

        emit DepositForBurn(
            burnToken,
            amount,
            msg.sender,
            mintRecipient,
            destinationDomain,
            destinationCaller,
            maxFee,
            minFinalityThreshold,
            hookData
        );
    }

    function setReenter(address target, bytes calldata data) external {
        reenter = true;
        reenterTarget = target;
        reenterData = data;
    }
}
