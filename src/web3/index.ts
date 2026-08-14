export {
  APP_NAME,
  BASE_CHAIN,
  CHAIN_LABEL,
  CHAIN_MODE,
  CHAIN_REQUIRED_LABEL,
  CHAIN_SWITCH_LABEL,
  WRONG_NETWORK_HINT,
  EXPLORER_ORIGIN,
  LOOPTERNITY_CONTRACT_ADDRESS,
  vaultIsDeployed,
  VAULT_DEPLOY_BLOCK,
  baseRpcUrl,
  wagmiConfig,
  walletConnectProjectId,
} from "./config";
export type { LoopternityChainMode } from "./config";
export {
  encryptBool,
  encryptRunScore,
  encryptThemeIndex,
  encryptUint256,
  getIncoLightning,
  handleTypes,
  incoScoreSubmitValue,
  readIncoInputFeeWei,
} from "./inco";
export type {
  EncryptedRunScore,
  EncryptUint256Params,
  IncoLightningClient,
} from "./inco";
export { loopternityVaultAbi } from "./abi/loopternityVault";
export { Web3Providers } from "./Web3Providers";
export { useIncoEncrypt } from "./hooks/useIncoEncrypt";
export { useSubmitConfidentialScore } from "./hooks/useSubmitConfidentialScore";
export type { SubmitPhase } from "./hooks/useSubmitConfidentialScore";
export { usePlayerRegistry } from "./hooks/usePlayerRegistry";
export { useOnchainWeekTheme } from "./hooks/useOnchainWeekTheme";
export type { OnchainWeekTheme, OnchainWeekThemeStatus } from "./hooks/useOnchainWeekTheme";
export { useVerifiedP2EBoard } from "./hooks/useVerifiedP2EBoard";
export type { VerifiedBoardSource } from "./hooks/useVerifiedP2EBoard";
export { useP2EEntryFee } from "./hooks/useP2EEntryFee";
export { useClaimPayout } from "./hooks/useClaimPayout";
export type { ClaimWeekRow, ClaimWeekStatus } from "./hooks/useClaimPayout";
