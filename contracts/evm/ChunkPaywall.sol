// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ChunkPaywall — Sepolia multi-asset pay-per-chunk receiver (demo)
/// @notice Accepts allowlisted ERC-20s (USDC, EURC, cirBTC) and emits ChunkPaid for EffectStream.
/// @dev Not audited. Testnet only. Never deploy to Ethereum mainnet for this hackathon demo.
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract ChunkPaywall {
    address public immutable MERCHANT;
    mapping(address => bool) public allowedToken;

    event ChunkPaid(
        bytes32 indexed chunkHash,
        address indexed payer,
        address indexed token,
        uint256 amount,
        uint256 timestamp
    );
    event TokenAllowlisted(address indexed token, bool allowed);

    error ZeroAddress();
    error ZeroAmount();
    error TokenNotAllowed();
    error TransferFailed();

    constructor(address merchant_, address[] memory tokens_) {
        if (merchant_ == address(0)) revert ZeroAddress();
        MERCHANT = merchant_;
        for (uint256 i = 0; i < tokens_.length; i++) {
            address t = tokens_[i];
            if (t == address(0)) revert ZeroAddress();
            allowedToken[t] = true;
            emit TokenAllowlisted(t, true);
        }
    }

    /// @notice Pay `amount` of `token` (atomic units) for `chunkHash`.
    function pay(address token, bytes32 chunkHash, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (!allowedToken[token]) revert TokenNotAllowed();
        bool ok = IERC20(token).transferFrom(msg.sender, MERCHANT, amount);
        if (!ok) revert TransferFailed();
        emit ChunkPaid(chunkHash, msg.sender, token, amount, block.timestamp);
    }

    function merchant() external view returns (address) {
        return MERCHANT;
    }
}
