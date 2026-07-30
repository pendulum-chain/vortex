// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockRelayerDestination {
    using SafeERC20 for IERC20;

    function pull(
        address token,
        address recipient,
        uint256 amount
    ) external {
        _pull(token, recipient, amount);
    }

    function pullAndRefund(
        address token,
        address recipient,
        uint256 amount,
        uint256 refund
    ) external payable {
        _pull(token, recipient, amount);
        (bool success, ) = msg.sender.call{value: refund}("");
        require(success, "refund failed");
    }

    function _pull(
        address token,
        address recipient,
        uint256 amount
    ) private {
        IERC20(token).safeTransferFrom(msg.sender, recipient, amount);
    }
}
