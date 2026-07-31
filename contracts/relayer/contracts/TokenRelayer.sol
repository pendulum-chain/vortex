// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title TokenRelayer
 * @notice A relayer contract that accepts ERC20 permit signatures and executes
 * arbitrary calls to a destination contract, both authorized via signature.
 * 
 * Flow:
 * 1. User signs a permit allowing the relayer to spend their tokens
 * 2. User signs a payload (e.g., transfer from relayer to another user)
 * 3. Relayer:
 *    a. Executes permit to approve the tokens
 *    b. Transfers tokens from user to relayer (via transferFrom)
 *    c. Forwards the payload call (transfer from relayer to another user)
 */
contract TokenRelayer is Ownable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    // Using OZ EIP712 for domain separator management
    bytes32 private constant _TYPE_HASH_PAYLOAD = keccak256(
        "Payload(address destination,address owner,address token,uint256 value,bytes data,uint256 ethValue,uint256 nonce,uint256 deadline)"
    );

    error InvalidDestination(address destination);
    error NativeRefundFailed(address recipient, uint256 amount);
    error TokenBalanceNotRestored(
        address token,
        uint256 balanceBefore,
        uint256 balanceAfter
    );
    error TokenReceiptMismatch(
        address token,
        uint256 requested,
        uint256 received
    );

    address public immutable destinationContract;

    mapping(address => mapping(uint256 => bool)) public usedPayloadNonces;
    // Removed redundant executedCalls mapping — usedPayloadNonces is sufficient

    struct ExecuteParams {
        address token;
        address owner;
        uint256 value;
        uint256 deadline;
        uint8 permitV;
        bytes32 permitR;
        bytes32 permitS;
        bytes payloadData;
        uint256 payloadValue;
        uint256 payloadNonce;
        uint256 payloadDeadline;
        uint8 payloadV;
        bytes32 payloadR;
        bytes32 payloadS;
    }

    event RelayerExecuted(
        address indexed signer,
        address indexed token,
        uint256 amount
    );
    event RelayerTransferObserved(
        address indexed signer,
        address indexed token,
        uint256 requested,
        uint256 received,
        uint256 consumed
    );
    event NativeRefunded(address indexed executor, uint256 amount);

    // Events for withdrawal operations
    event TokenWithdrawn(address indexed token, uint256 amount, address indexed to);
    event ETHWithdrawn(uint256 amount, address indexed to);

    // Ownable constructor sets deployer as owner; EIP712 constructor
    constructor(address _destinationContract)
        Ownable(msg.sender)
        EIP712("TokenRelayer", "1")
    {
        if (
            _destinationContract == address(0) ||
            _destinationContract.code.length == 0
        ) {
            revert InvalidDestination(_destinationContract);
        }
        destinationContract = _destinationContract;
    }

    // Allow contract to receive ETH (e.g., refunds from destination)
    receive() external payable {}

    // nonReentrant modifier prevents reentrancy via _forwardCall
    // Removed redundant bool return — function reverts on failure
    function execute(ExecuteParams calldata params) external payable nonReentrant {
        address owner = params.owner;
        uint256 nonce = params.payloadNonce;
        IERC20 token = IERC20(params.token);

        // --- Checks ---
        require(owner != address(0), "Invalid owner");
        require(params.token != address(0), "Invalid token");
        require(!usedPayloadNonces[owner][nonce], "Nonce used");
        require(block.timestamp <= params.payloadDeadline, "Payload expired");

        // Verify payload signature and validate signed destination
        bytes32 digest = _computeDigest(
            owner,
            params.token,
            params.value,
            params.payloadData,
            params.payloadValue,
            nonce,
            params.payloadDeadline
        );
        // Using ECDSA.recover() which enforces low-s and rejects address(0)
        require(ECDSA.recover(digest, params.payloadV, params.payloadR, params.payloadS) == owner, "Invalid sig");

        require(msg.value == params.payloadValue, "Incorrect ETH value provided");
        uint256 tokenBalanceBefore = token.balanceOf(address(this));
        uint256 ethBalanceBefore = address(this).balance - msg.value;

        // --- Effects (before interactions per CEI pattern) ---
        // State changes before any external calls
        usedPayloadNonces[owner][nonce] = true;

        // --- Interactions ---
        // permit wrapped in try-catch for front-run resilience
        uint256 received = _executePermitAndTransfer(
            params.token,
            owner,
            params.value,
            params.deadline,
            params.permitV,
            params.permitR,
            params.permitS
        );
        if (received != params.value) {
            revert TokenReceiptMismatch(params.token, params.value, received);
        }

        // Approve no more than this execution actually contributed, forward the signed
        // call, then revoke. The post-call balance check prevents both cross-execution
        // subsidy and successful partial consumption from contaminating the shared balance.
        token.forceApprove(destinationContract, received);

        bool callSuccess = _forwardCall(params.payloadData, msg.value);
        require(callSuccess, "Call failed");

        // Revoke approval after the call to prevent residual allowance
        token.forceApprove(destinationContract, 0);

        uint256 tokenBalanceAfter = token.balanceOf(address(this));
        if (tokenBalanceAfter != tokenBalanceBefore) {
            revert TokenBalanceNotRestored(
                params.token,
                tokenBalanceBefore,
                tokenBalanceAfter
            );
        }

        uint256 nativeRefund = address(this).balance - ethBalanceBefore;
        if (nativeRefund > 0) {
            (bool refundSuccess, ) = msg.sender.call{value: nativeRefund}("");
            if (!refundSuccess) {
                revert NativeRefundFailed(msg.sender, nativeRefund);
            }
            emit NativeRefunded(msg.sender, nativeRefund);
        }

        emit RelayerTransferObserved(
            owner,
            params.token,
            params.value,
            received,
            received
        );
        emit RelayerExecuted(owner, params.token, params.value);
    }

    //  Using inherited _hashTypedDataV4 from OZ EIP712
    function _computeDigest(
        address owner,
        address token,
        uint256 value,
        bytes memory data,
        uint256 ethValue,
        uint256 nonce,
        uint256 deadline
    ) private view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(abi.encode(
                _TYPE_HASH_PAYLOAD,
                destinationContract, // [H-2] destination is always destinationContract
                owner,
                token,
                value,
                keccak256(data),
                ethValue,
                nonce,
                deadline
            ))
        );
    }

    /**
     * @dev Execute permit approval and then transfer tokens from owner to self (relayer).
     * Permit is wrapped in try-catch: if it was front-run, we check
     *        that the allowance is already sufficient before proceeding.
     */
    function _executePermitAndTransfer(
        address token,
        address owner,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal returns (uint256 received) {
        // Wrap permit in try-catch for front-run resilience
        try IERC20Permit(token).permit(owner, address(this), value, deadline, v, r, s) {
            // permit succeeded
        } catch {
            // permit was front-run, verify allowance is sufficient
            require(
                IERC20(token).allowance(owner, address(this)) >= value,
                "Permit failed and insufficient allowance"
            );
        }

        // Attribute only the balance increase from this execution. A nominal ERC-20
        // transfer amount is not proof of receipt for fee-on-transfer or rebasing tokens.
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(owner, address(this), value);
        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        if (balanceAfter < balanceBefore) {
            revert TokenReceiptMismatch(token, value, 0);
        }
        return balanceAfter - balanceBefore;
    }

    function _forwardCall(bytes memory data, uint256 value) internal returns (bool) {
        if (destinationContract.code.length == 0) {
            return false;
        }
        (bool success, ) = destinationContract.call{value: value}(data);
        return success;
    }

    /**
     * @notice Allows the owner to recover any ERC20 tokens held by this contract.
     * @param token  The ERC20 token contract address.
     * @param amount The amount of tokens to transfer to the owner.
     */
    // Using Ownable's onlyOwner instead of manual deployer check
    // Added TokenWithdrawn event
    function withdrawToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
        emit TokenWithdrawn(token, amount, owner());
    }

    /**
     * @notice Allows the owner to recover any native ETH held by this contract.
     * @param amount The amount of ETH to transfer to the owner.
     */
    // ETH recovery function
    function withdrawETH(uint256 amount) external onlyOwner {
        (bool success, ) = owner().call{value: amount}("");
        require(success, "ETH transfer failed");
        emit ETHWithdrawn(amount, owner());
    }

    // Using usedPayloadNonces instead of redundant executedCalls
    function isExecutionCompleted(address signer, uint256 nonce) external view returns (bool) {
        return usedPayloadNonces[signer][nonce];
    }
}
