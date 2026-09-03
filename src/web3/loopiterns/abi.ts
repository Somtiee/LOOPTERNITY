/**
 * Minimal LOOPITERNS ABI for P2M mint.
 * Survival time is not on this ABI — the contract never checks it.
 */
export const loopiternsAbi = [
  {
    type: "function",
    name: "mintPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "remaining",
    stateMutability: "view",
    inputs: [{ name: "rarity", type: "uint8" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "remainingAll",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "out", type: "uint256[5]" }],
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "tokensOfOwner",
    stateMutability: "view",
    inputs: [{ name: "owner_", type: "address" }],
    outputs: [{ name: "ids", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "tokenRarity",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "mintWithVoucher",
    stateMutability: "payable",
    inputs: [
      { name: "rarity", type: "uint8" },
      { name: "deadline", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "Minted",
    inputs: [
      { name: "to", type: "address", indexed: true },
      { name: "id", type: "uint256", indexed: true },
      { name: "rarity", type: "uint8", indexed: false },
      { name: "requested", type: "uint8", indexed: false },
    ],
  },
] as const;
