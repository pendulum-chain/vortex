// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

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
 *
 * Security mitigations applied (see SECURITY_AUDIT.md):
 *   C-1:  ReentrancyGuard on execute()
 *   C-2:  ECDSA.recover() replaces raw ecrecover
 *   H-1:  Exact-amount approval + revoke after forward call
 *   H-2:  Signed destination validated against destinationContract
 *   M-1:  receive() + withdrawETH() for native ETH recovery
 *   M-2:  permit() wrapped in try-catch for front-run resilience
 *   L-1:  Redundant executedCalls mapping removed
 *   L-2:  Event added to withdrawToken / withdrawETH
 *   I-1:  Ownable used for access control
 *   I-2:  Redundant return value removed from execute()
 *   I-3:  OpenZeppelin EIP712 helper used for domain separator
 */
contract TokenRelayer is Ownable, ReentrancyGuard, EIP712 {
    // [I-3] Using OZ EIP712 for domain separator management
    bytes32 private constant _TYPE_HASH_PAYLOAD = keccak256(
        "Payload(address destination,bytes data,uint256 nonce,uint256 deadline)"
    );

    address public immutable destinationContract;

    mapping(address => mapping(uint256 => bool)) public usedPayloadNonces;
    // [L-1] Removed redundant executedCalls mapping — usedPayloadNonces is sufficient

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

    // [L-2] Events for withdrawal operations
    event TokenWithdrawn(address indexed token, uint256 amount, address indexed to);
    event ETHWithdrawn(uint256 amount, address indexed to);

    // [I-1] Ownable constructor sets deployer as owner; [I-3] EIP712 constructor
    constructor(address _destinationContract)
        Ownable(msg.sender)
        EIP712("TokenRelayer", "1")
    {
        require(_destinationContract != address(0), "Invalid destination");
        destinationContract = _destinationContract;
    }

    // [M-1] Allow contract to receive ETH (e.g., refunds from destination)
    receive() external payable {}

    // [C-1] nonReentrant modifier prevents reentrancy via _forwardCall
    // [I-2] Removed redundant bool return — function reverts on failure
    function execute(ExecuteParams calldata params) external payable nonReentrant {
        address owner = params.owner;
        uint256 nonce = params.payloadNonce;

        // --- Checks ---
        require(!usedPayloadNonces[owner][nonce], "Nonce used");
        require(block.timestamp <= params.payloadDeadline, "Payload expired");

        // [H-2] Verify payload signature and validate signed destination
        bytes32 digest = _computeDigest(params.payloadData, nonce, params.payloadDeadline);
        // [C-2] Using ECDSA.recover() which enforces low-s and rejects address(0)
        require(ECDSA.recover(digest, params.payloadV, params.payloadR, params.payloadS) == owner, "Invalid sig");

        require(msg.value == params.payloadValue, "Incorrect ETH value provided");

        // --- Effects (before interactions per CEI pattern) ---
        // [C-1] State changes before any external calls
        usedPayloadNonces[owner][nonce] = true;

        // --- Interactions ---
        // [M-2] permit wrapped in try-catch for front-run resilience
        _executePermitAndTransfer(
            params.token,
            owner,
            params.value,
            params.deadline,
            params.permitV,
            params.permitR,
            params.permitS
        );

        // [H-1] Approve exact amount, forward call, then revoke
        IERC20(params.token).approve(destinationContract, params.value);

        bool callSuccess = _forwardCall(params.payloadData, msg.value);
        require(callSuccess, "Call failed");

        // [H-1] Revoke approval after the call to prevent residual allowance
        IERC20(params.token).approve(destinationContract, 0);

        emit RelayerExecuted(owner, params.token, params.value);
    }

    // [I-3] Using inherited _hashTypedDataV4 from OZ EIP712
    function _computeDigest(bytes memory data, uint256 nonce, uint256 deadline) private view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(abi.encode(
                _TYPE_HASH_PAYLOAD,
                destinationContract, // [H-2] destination is always destinationContract
                keccak256(data),
                nonce,
                deadline
            ))
        );
    }

    /**
     * @dev Execute permit approval and then transfer tokens from owner to self (relayer).
     * [M-2] Permit is wrapped in try-catch: if it was front-run, we check
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
    ) internal {
        // [M-2] Wrap permit in try-catch for front-run resilience
        try IERC20Permit(token).permit(owner, address(this), value, deadline, v, r, s) {
            // permit succeeded
        } catch {
            // permit was front-run, verify allowance is sufficient
            require(
                IERC20(token).allowance(owner, address(this)) >= value,
                "Permit failed and insufficient allowance"
            );
        }

        // Transfer tokens from owner to this contract
        require(IERC20(token).transferFrom(owner, address(this), value), "TransferFrom failed");
    }

    function _forwardCall(bytes memory data, uint256 value) internal returns (bool) {
        (bool success, ) = destinationContract.call{value: value}(data);
        return success;
    }

    /**
     * @notice Allows the owner to recover any ERC20 tokens held by this contract.
     * @param token  The ERC20 token contract address.
     * @param amount The amount of tokens to transfer to the owner.
     */
    // [I-1] Using Ownable's onlyOwner instead of manual deployer check
    // [L-2] Added TokenWithdrawn event
    function withdrawToken(address token, uint256 amount) external onlyOwner {
        require(IERC20(token).transfer(owner(), amount), "Transfer failed");
        emit TokenWithdrawn(token, amount, owner());
    }

    /**
     * @notice Allows the owner to recover any native ETH held by this contract.
     * @param amount The amount of ETH to transfer to the owner.
     */
    // [M-1] ETH recovery function
    function withdrawETH(uint256 amount) external onlyOwner {
        (bool success, ) = owner().call{value: amount}("");
        require(success, "ETH transfer failed");
        emit ETHWithdrawn(amount, owner());
    }

    // [L-1] Using usedPayloadNonces instead of redundant executedCalls
    function isExecutionCompleted(address signer, uint256 nonce) external view returns (bool) {
        return usedPayloadNonces[signer][nonce];
    }
}
