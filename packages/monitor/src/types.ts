// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//

/**
 * PumpFun Telegram Bot — Types
 *
 * On-chain program IDs, instruction discriminators, event types, watch-list
 * entries, and monitor-state shapes for the DM bot + REST API + SSE service.
 *
 * The on-chain constants here mirror the canonical set used by @pumpkit/channel
 * (packages/channel/src/types.ts) — they describe the same pump.fun programs.
 */

// ============================================================================
// Program IDs
// ============================================================================

export const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMP_AMM_PROGRAM_ID = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
export const PUMP_FEE_PROGRAM_ID = 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ';
export const MONITORED_PROGRAM_IDS = [PUMP_PROGRAM_ID, PUMP_AMM_PROGRAM_ID, PUMP_FEE_PROGRAM_ID] as const;

export const PUMPFUN_FEE_ACCOUNT = 'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbCJ5GEFDM97zC';
export const PUMPFUN_MIGRATION_AUTHORITY = '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg';
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Decimals + display ticker for known quote mints.
export const QUOTE_MINT_INFO: Record<string, { ticker: string; decimals: number; isStable: boolean }> = {
    [WSOL_MINT]: { ticker: 'SOL', decimals: 9, isStable: false },
    [USDC_MINT]: { ticker: 'USDC', decimals: 6, isStable: true },
};

// ============================================================================
// Token Creation Discriminators
// ============================================================================

export const CREATE_V2_DISCRIMINATOR = 'd6904cec5f8b31b4';
export const CREATE_DISCRIMINATOR = '181ec828051c0777';

// ============================================================================
// Event Discriminators
// ============================================================================

export const COMPLETE_EVENT_DISCRIMINATOR = '5f72619cd42e9808';
export const COMPLETE_AMM_MIGRATION_DISCRIMINATOR = 'bde95db95c94ea94';
export const TRADE_EVENT_DISCRIMINATOR = 'bddb7fd34ee661ee';

export const DEFAULT_GRADUATION_SOL_THRESHOLD = 85;

// ============================================================================
// Claim Instructions
// ============================================================================

export type ClaimType =
    | 'collect_creator_fee'
    | 'claim_cashback'
    | 'collect_coin_creator_fee'
    | 'distribute_creator_fees'
    | 'transfer_creator_fees_to_pump'
    | 'claim_social_fee_pda';

export interface InstructionDef {
    discriminator: string;
    label: string;
    claimType: ClaimType;
    programId: string;
    isCreatorClaim: boolean;
}

export const CLAIM_INSTRUCTIONS: InstructionDef[] = [
    // V1 instructions (continue to work for SOL-paired coins after the 2026-05-21 V2 rollout)
    { claimType: 'collect_creator_fee', discriminator: '1416567bc61cdb84', isCreatorClaim: true, label: 'Collect Creator Fee (Pump)', programId: PUMP_PROGRAM_ID },
    { claimType: 'claim_cashback', discriminator: '253a237ebe35e4c5', isCreatorClaim: false, label: 'Claim Cashback (Pump)', programId: PUMP_PROGRAM_ID },
    { claimType: 'distribute_creator_fees', discriminator: 'a572670079cef751', isCreatorClaim: true, label: 'Distribute Creator Fees (Pump)', programId: PUMP_PROGRAM_ID },
    { claimType: 'collect_coin_creator_fee', discriminator: 'a039592ab58b2b42', isCreatorClaim: true, label: 'Collect Creator Fee (PumpSwap)', programId: PUMP_AMM_PROGRAM_ID },
    { claimType: 'claim_cashback', discriminator: '253a237ebe35e4c5', isCreatorClaim: false, label: 'Claim Cashback (PumpSwap)', programId: PUMP_AMM_PROGRAM_ID },
    { claimType: 'transfer_creator_fees_to_pump', discriminator: '8b348655e4e56cf1', isCreatorClaim: true, label: 'Transfer Creator Fees to Pump', programId: PUMP_AMM_PROGRAM_ID },
    { claimType: 'claim_social_fee_pda', discriminator: 'e115fb85a11ec7e2', isCreatorClaim: true, label: 'Claim Social Fee PDA (GitHub)', programId: PUMP_FEE_PROGRAM_ID },

    // V2 instructions (USDC + SOL paired coins, rolled out 2026-05-21).
    { claimType: 'collect_creator_fee', discriminator: 'cf118af204221338', isCreatorClaim: true, label: 'Collect Creator Fee V2 (Pump)', programId: PUMP_PROGRAM_ID },
    { claimType: 'distribute_creator_fees', discriminator: 'ffcb134ff444089f', isCreatorClaim: true, label: 'Distribute Creator Fees V2 (Pump)', programId: PUMP_PROGRAM_ID },
    { claimType: 'transfer_creator_fees_to_pump', discriminator: '01214eb921432c5c', isCreatorClaim: true, label: 'Transfer Creator Fees to Pump V2', programId: PUMP_AMM_PROGRAM_ID },
    { claimType: 'claim_social_fee_pda', discriminator: '114df0863abc3595', isCreatorClaim: true, label: 'Claim Social Fee PDA V2 (GitHub)', programId: PUMP_FEE_PROGRAM_ID },
    { claimType: 'distribute_creator_fees', discriminator: '6ffb31064e4e6a12', isCreatorClaim: true, label: 'Update Fee Shares V2 (Pump Fees)', programId: PUMP_FEE_PROGRAM_ID },
];

export const CLAIM_EVENT_DISCRIMINATORS: Record<string, { label: string; isCreatorClaim: boolean }> = {
    '7a027f010ebf0caf': { isCreatorClaim: true, label: 'CollectCreatorFeeEvent' },
    'a537817004b3ca28': { isCreatorClaim: true, label: 'DistributeCreatorFeesEvent' },
    'e2d6f62107f293e5': { isCreatorClaim: false, label: 'ClaimCashbackEvent' },
    'e8f5c2eeeada3a59': { isCreatorClaim: true, label: 'CollectCoinCreatorFeeEvent' },
    '3212c141edd2eaec': { isCreatorClaim: true, label: 'SocialFeePdaClaimed' },
};

// ============================================================================
// CTO (Community Take-Over) / creator-change instructions
// ============================================================================

export type CreatorChangeType =
    | 'set_creator'
    | 'admin_set_creator'
    | 'set_coin_creator'
    | 'admin_set_coin_creator';

export interface CreatorChangeInstructionDef {
    discriminator: string;
    label: string;
    programId: string;
    changeType: CreatorChangeType;
    /**
     * True when the new creator pubkey is passed as an instruction arg
     * (8-byte discriminator + 32-byte pubkey), so it can be read directly.
     * False when the creator is derived from on-chain metadata instead.
     */
    hasCreatorArg: boolean;
}

// Anchor discriminators = sha256("global:<ix_name>")[0..8].
export const CTO_INSTRUCTIONS: CreatorChangeInstructionDef[] = [
    { changeType: 'set_creator', discriminator: 'fe94ff70cf8eaaa5', hasCreatorArg: false, label: 'Set Creator (Pump)', programId: PUMP_PROGRAM_ID },
    { changeType: 'admin_set_creator', discriminator: '4519ab8e39ef0d04', hasCreatorArg: true, label: 'Admin Set Creator (Pump)', programId: PUMP_PROGRAM_ID },
    { changeType: 'set_coin_creator', discriminator: 'd295802dbc3a4eaf', hasCreatorArg: false, label: 'Set Coin Creator (PumpSwap)', programId: PUMP_AMM_PROGRAM_ID },
    { changeType: 'admin_set_coin_creator', discriminator: 'f228759149606968', hasCreatorArg: true, label: 'Admin Set Coin Creator (PumpSwap)', programId: PUMP_AMM_PROGRAM_ID },
];

// ============================================================================
// Events
// ============================================================================

export interface FeeClaimEvent {
    txSignature: string;
    slot: number;
    timestamp: number;
    claimerWallet: string;
    tokenMint: string;
    tokenName?: string;
    tokenSymbol?: string;
    amountSol: number;
    amountLamports: number;
    claimType: ClaimType;
    isCashback: boolean;
    programId: string;
    claimLabel: string;
    /** GitHub numeric user ID (only for claim_social_fee_pda events) */
    githubUserId?: string;
    /** Platform enum (2 = GitHub) — only for claim_social_fee_pda events */
    socialPlatform?: number;
    /** Recipient wallet for social fee claims (may differ from signer) */
    recipientWallet?: string;
    /** Social fee PDA account for social claims */
    socialFeePda?: string;
    /** True when instruction was called but no SocialFeePdaClaimed event was emitted */
    isFake?: boolean;
    /** Lifetime total claimed in lamports (cumulative across all claims) */
    lifetimeClaimedLamports?: number;
    /** When multiple tokens share the same social fee PDA, all candidate mints */
    allCandidateMints?: string[];
    /** Quote mint for the claim (V2 events only — wrapped SOL or USDC). Base58. */
    quoteMint?: string;
    /** Display ticker for the quote currency, e.g. "SOL" or "USDC". */
    quoteTicker?: string;
    /** True when the quote currency is a USD-stable asset (USDC, etc.). */
    isStableQuote?: boolean;
    /** Claim amount expressed in whole units of the quote currency. */
    amountQuote?: number;
    /** Lifetime total claimed in whole units of the quote currency, when known. */
    lifetimeClaimedQuote?: number;
}

export interface CreatorChangeEvent {
    txSignature: string;
    slot: number;
    timestamp: number;
    tokenMint: string;
    /** Signer / authority that initiated the change (first account key) */
    signerWallet: string;
    /** New creator wallet, when readable from instruction args (else empty) */
    newCreatorWallet: string;
    programId: string;
    changeType: CreatorChangeType;
    changeLabel: string;
    /** Optional token metadata, when resolved for display */
    tokenName?: string;
    tokenSymbol?: string;
}

export interface TokenLaunchEvent {
    txSignature: string;
    slot: number;
    timestamp: number;
    mintAddress: string;
    creatorWallet: string;
    name: string;
    symbol: string;
    description: string;
    metadataUri: string;
    hasGithub: boolean;
    githubUrls: string[];
    mayhemMode: boolean;
    cashbackEnabled: boolean;
    metadata?: Record<string, unknown>;
}

export interface GraduationEvent {
    txSignature: string;
    slot: number;
    timestamp: number;
    mintAddress: string;
    user: string;
    bondingCurve: string;
    isMigration: boolean;
    solAmount?: number;
    mintAmount?: number;
    poolMigrationFee?: number;
    poolAddress?: string;
}

export interface TradeAlertEvent {
    txSignature: string;
    slot: number;
    timestamp: number;
    mintAddress: string;
    user: string;
    creator: string;
    isBuy: boolean;
    solAmount: number;
    tokenAmount: number;
    fee: number;
    creatorFee: number;
    virtualSolReserves: number;
    virtualTokenReserves: number;
    realSolReserves: number;
    realTokenReserves: number;
    mayhemMode: boolean;
    marketCapSol: number;
    bondingCurveProgress: number;
}

export interface FeeDistributionEvent {
    txSignature: string;
    slot: number;
    timestamp: number;
    mintAddress: string;
    bondingCurve: string;
    admin: string;
    distributedSol: number;
    shareholders: Array<{ address: string; shareBps: number }>;
}

// ============================================================================
// Bot config
// ============================================================================

export interface BotConfig {
    allowedUserIds: number[];
    enableFeeDistributionAlerts: boolean;
    enableGraduationAlerts: boolean;
    enableLaunchMonitor: boolean;
    enableTradeAlerts: boolean;
    githubOnlyFilter: boolean;
    ipfsGateway: string;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    pollIntervalSeconds: number;
    solanaRpcUrl: string;
    solanaRpcUrls: string[];
    solanaWsUrl: string | undefined;
    telegramToken: string;
    whaleThresholdSol: number;
}

// ============================================================================
// Watch list
// ============================================================================

export interface WatchEntry {
    /** Stable unique id (e.g. "w_<n>") */
    id: string;
    /** Telegram chat the watch belongs to (0 for API-created watches) */
    chatId: number;
    /** Telegram user id who added it (0 for API-created watches) */
    addedBy: number;
    /** Wallet whose claims trigger a notification */
    recipientWallet: string;
    /** Optional human label */
    label?: string;
    /** Whether the watch is active */
    active: boolean;
    /** Unix ms when created */
    createdAt: number;
    /** Optional: only notify for these token mints */
    tokenFilter?: string[];
}

// ============================================================================
// Monitor state
// ============================================================================

export interface MonitorState {
    isRunning: boolean;
    mode: 'polling' | 'websocket';
    startedAt: number;
    lastSlot: number;
    claimsDetected: number;
    creatorFeeClaims: number;
    cashbackClaims: number;
    creatorChanges: number;
    monitoredPrograms: string[];
}

export interface PumpEventMonitorState {
    isRunning: boolean;
    mode: 'polling' | 'websocket';
    startedAt: number;
    lastSlot: number;
    tradesDetected: number;
    whaleTradesDetected: number;
    graduationsDetected: number;
    feeDistributionsDetected: number;
    errorsEncountered: number;
}

export interface TokenLaunchMonitorState {
    isRunning: boolean;
    mode: 'polling' | 'websocket';
    startedAt: number;
    lastSlot: number;
    tokensDetected: number;
    tokensWithGithub: number;
    githubOnly: boolean;
    errorsEncountered: number;
}
