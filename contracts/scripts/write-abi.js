const fs = require("fs");
const p = "d:/LOOPTERNITY/contracts/abi.json";
let s = fs.readFileSync(p, "utf8");
if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
const abi = JSON.parse(s);
const body = JSON.stringify(abi, null, 2);
const ts = `/**
 * LoopternityVault ABI — generated from contracts/src/LoopternityVault.sol
 * Target: Base. Do not set NEXT_PUBLIC_LOOPTERNITY_CONTRACT_ADDRESS until deploy (Prompt E).
 *
 * enterRun(weekId) payable — min entryFeeWei, credits weekly pool.
 * submitConfidentialScore(bytes,bytes) payable — Inco euint256 ciphertexts + Lightning input fee.
 * sealWeeklyTheme(weekId,bytes) payable — owner/keeper, once per week.
 * attestTop10 + settleWeek — keeper Hybrid A path (encrypted scores cannot be ranked in-EVM).
 */
export const loopternityVaultAbi = ${body} as const;
`;
fs.writeFileSync("d:/LOOPTERNITY/src/web3/abi/loopternityVault.ts", ts);
console.log("abi items", abi.length);
