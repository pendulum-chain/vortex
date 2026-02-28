// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

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
contract TokenRelayer {
    bytes32 private constant _TYPE_HASH_PAYLOAD = keccak256(
        "Payload(address destination,bytes data,uint256 nonce,uint256 deadline)"
    );

    address public immutable destinationContract;
    address public immutable deployer;

    mapping(address => mapping(uint256 => bool)) public usedPayloadNonces;
    mapping(bytes32 => bool) public executedCalls;
    mapping(address => bool) public tokenApproved;

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

    constructor(address _destinationContract) {
        require(_destinationContract != address(0), "Invalid destination");
        destinationContract = _destinationContract;
        deployer = msg.sender;
    }

    function execute(ExecuteParams calldata params) external payable returns (bool) {
        address owner = params.owner;
        uint256 nonce = params.payloadNonce;

        // Nonce check
        require(!usedPayloadNonces[owner][nonce], "Nonce used");
        require(block.timestamp <= params.payloadDeadline, "Payload expired");
        usedPayloadNonces[owner][nonce] = true;

        // Verify payload signature
        bytes32 digest = _computeDigest(params.payloadData, nonce, params.payloadDeadline);
        require(_recoverSigner(digest, params.payloadV, params.payloadR, params.payloadS) == owner, "Invalid sig");

        // Execute permit and self-transfer
        _executePermitAndSelfTransfer(
            params.token,
            owner,
            params.value,
            params.deadline,
            params.permitV,
            params.permitR,
            params.permitS
        );

        require(msg.value == params.payloadValue, "Incorrect ETH value provided");

        // Execute payload call
        bool callSuccess = _forwardCall(params.payloadData, msg.value);
        require(callSuccess, "Call failed");

        // Mark executed
        executedCalls[keccak256(abi.encodePacked(owner, nonce))] = true;

        emit RelayerExecuted(owner, params.token, params.value);
        return  callSuccess;
    }

    function _computeDigest(bytes memory data, uint256 nonce, uint256 deadline) private view returns (bytes32) {
        return keccak256(abi.encodePacked(
            "\x19\x01",
            _domainSeparator(),
            keccak256(abi.encode(
                _TYPE_HASH_PAYLOAD,
                destinationContract,
                keccak256(data),
                nonce,
                deadline
            ))
        ));
    }

    function _domainSeparator() private view returns (bytes32) {
        return keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("TokenRelayer")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
    }

    function _recoverSigner(bytes32 digest, uint8 v, bytes32 r, bytes32 s) private pure returns (address) {
        address recovered = ecrecover(digest, v, r, s);
        require(recovered != address(0), "Invalid signature");
        return recovered;
    }

    /**
     * @dev Execute permit approval and then transfer tokens from owner to self (relayer)
     * This allows the payload call to then transfer from relayer to another user
     */
    function _executePermitAndSelfTransfer(
        address token,
        address owner,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal  {
        // Execute the permit to approve the tokens
        IERC20Permit(token).permit(owner, address(this), value, deadline, v, r, s);

        // Transfer tokens from owner to this contract
        IERC20(token).transferFrom(owner, address(this), value);

        // Approve destinationContract for max value if not already approved
        if (!tokenApproved[token]) {
            IERC20(token).approve(destinationContract, type(uint256).max);
            tokenApproved[token] = true;
        }
    }


    function _forwardCall(bytes memory data, uint256 value) internal returns (bool) {
        (bool success, ) = destinationContract.call{value: value}(data);
        return success;
    }

    /**
     * @notice Allows the deployer to recover any ERC20 tokens held by this contract.
     * @param token  The ERC20 token contract address.
     * @param amount The amount of tokens to transfer to the deployer.
     */
    function withdrawToken(address token, uint256 amount) external {
        require(msg.sender == deployer, "Only deployer");
        require(IERC20(token).transfer(deployer, amount), "Transfer failed");
    }

    function isExecutionCompleted(address signer, uint256 nonce) external view returns (bool) {
        return executedCalls[keccak256(abi.encodePacked(signer, nonce))];
    }
}
