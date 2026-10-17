// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ZendoCoin} from "./ZendoCoin.sol";

/// @title Zendo bridge vault on Polygon
/// @notice Lock-and-release. This contract never mints.
/// @dev release() pays ERC-20 ZCOIN already held here after an operator signature.
///      lock() pulls ERC-20 ZCOIN into this contract and emits the znd1 hash.
///      ZendoCoin has no transfer callback, and this contract talks only to that token.
contract ZendoBridge {
    uint256 private constant HALF_N = uint256(0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0);

    ZendoCoin public immutable token;
    address public immutable signer;
    uint256 public immutable chainId;
    uint256 public lockNonce;

    mapping(uint256 => bool) public usedRelease;

    event Released(address indexed to, uint256 amount, uint256 nonce);
    event Locked(address indexed from, bytes32 indexed zendoHash, uint256 amount, uint256 nonce);

    error ZeroAddress();
    error ZeroAmount();
    error BadAccount();
    error BadSignature();
    error Replay();

    constructor(address token_, address signer_, uint256 chainId_) {
        if (token_ == address(0) || signer_ == address(0)) revert ZeroAddress();
        if (chainId_ == 0) revert ZeroAmount();
        token = ZendoCoin(token_);
        signer = signer_;
        chainId = chainId_;
    }

    /// @notice Sends vault ZCOIN to `to` once for this nonce. The signature covers chain, vault, recipient, amount, and nonce.
    function release(address to, uint256 amount, uint256 nonce, bytes calldata signature) external {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (usedRelease[nonce]) revert Replay();
        bytes32 inner = keccak256(abi.encodePacked("ZENDO_RELEASE_V1", chainId, address(this), to, amount, nonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", inner));
        if (_recover(digest, signature) != signer) revert BadSignature();
        usedRelease[nonce] = true;
        token.transfer(to, amount);
        emit Released(to, amount, nonce);
    }

    /// @notice Pulls `amount` of ZCOIN from the caller. `zendoAccount` is the 42-character znd1 address that may be credited on zendo-1.
    function lock(string calldata zendoAccount, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        bytes memory raw = bytes(zendoAccount);
        if (raw.length != 42 || raw[0] != "z" || raw[1] != "n" || raw[2] != "d" || raw[3] != "1") revert BadAccount();
        bytes32 zendoHash = keccak256(raw);
        uint256 nonce = ++lockNonce;
        token.transferFrom(msg.sender, address(this), amount);
        emit Locked(msg.sender, zendoHash, amount, nonce);
    }

    function _recover(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        if (signature.length != 65) revert BadSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (uint256(s) == 0 || uint256(s) > HALF_N) revert BadSignature();
        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert BadSignature();
        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0)) revert BadSignature();
        return recovered;
    }
}
