/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, no-empty */
/**
 * preprod-deploy.ts
 * Deploy tripverify.compact to PreProd, run one valid + one invalid verification.
 * Polls for balance using fresh wallet connections to avoid WS stall.
 * Does NOT print the wallet seed. Does NOT request faucet funds.
 */
import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { MidnightWalletProvider } from './midnight-wallet-provider.js';
import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { randomBytes } from '../../api/src/utils/index.js';
import * as TripVerify from '../../contract/src/managed/tripverify/contract/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

setNetworkId('preprod');

const PREPROD_ENV = {
  walletNetworkId: 'preprod',
  networkId: 'preprod',
  indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
  indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  node: 'https://rpc.preprod.midnight.network',
  nodeWS: 'wss://rpc.preprod.midnight.network',
  faucet: 'https://midnight-tmnight-preprod.nethermind.dev/',
  proofServer: 'http://localhost:6300',
};

type TripVerifyPrivateState = {
  readonly secretKey: Uint8Array;
  readonly safetyConditionsMet: boolean;
};

const PRIVATE_STATE_KEY = 'tv-preprod-state';

const witnesses = {
  localSecretKey: ({ privateState }: any) => [privateState, privateState.secretKey],
  safetyConditionsMet: ({ privateState }: any) => [privateState, privateState.safetyConditionsMet],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll for balance using a fresh short-lived wallet each attempt.
 * Avoids the WS-drops-and-stream-stalls problem.
 */
async function pollBalance(seed: string, logger: any, maxAttempts = 120, intervalMs = 15_000): Promise<bigint> {
  const startTime = Date.now();
  for (let i = 1; i <= maxAttempts; i++) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const ts = new Date().toISOString();
    let walletInit = false;
    let balance = 0n;
    let connectionStatus = 'unknown';
    let provider: MidnightWalletProvider | null = null;
    try {
      provider = await MidnightWalletProvider.build(logger, PREPROD_ENV, seed);
      walletInit = true;
      await provider.start();
      connectionStatus = 'connected';
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const state = await import('rxjs').then((Rx) => Rx.firstValueFrom(provider!.wallet.unshielded.state));
      balance = state.balances[unshieldedToken().raw] ?? 0n;
      connectionStatus = 'ok';
    } catch (e: any) {
      connectionStatus = `error: ${e.message}`;
    } finally {
      try {
        await provider?.stop();
      } catch (e: any) {}
    }

    // Structured per-attempt record
    console.log(
      JSON.stringify({
        attempt: `${i}/${maxAttempts}`,
        timestamp: ts,
        elapsed_s: elapsed,
        wallet_initialized: walletInit,
        balance_tNight: balance.toString(),
        connection_status: connectionStatus,
      }),
    );

    if (balance > 0n) return balance;

    if (i < maxAttempts) {
      await sleep(intervalMs);
    }
  }
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  throw new Error(`PREPROD FUNDING: BLOCKED — elapsed ${elapsed}s, balance still 0 after ${maxAttempts} attempts.`);
}

async function main() {
  const logger = pino({ level: 'info' });
  const seed = process.env.WALLET_SEED;
  if (!seed) throw new Error('WALLET_SEED env var is required');

  const assetsPath = path.resolve(__dirname, '..', '..', 'contract', 'src', 'managed', 'tripverify');

  // ---- 1. WAIT FOR FUNDS ----
  logger.info('Polling for PreProd wallet balance (faucet confirmation may take a few minutes)...');
  const balance = await pollBalance(seed, logger);
  logger.info(`Wallet funded: ${balance} tNight — proceeding to deploy.`);

  // ---- 2. BUILD LIVE PROVIDER FOR DEPLOY ----
  logger.info('Building wallet provider for deployment...');
  const walletProvider = await MidnightWalletProvider.build(logger, PREPROD_ENV, seed);
  await walletProvider.start();

  const zkConfigProvider = new NodeZkConfigProvider<'verifyTripCompliance' | 'resetTrip'>(assetsPath);

  const privateStateProvider = levelPrivateStateProvider<string, TripVerifyPrivateState>({
    privateStateStoreName: 'tv-preprod-private-state',
    signingKeyStoreName: 'tv-preprod-signing-keys',
    privateStoragePasswordProvider: () => 'Bboard-Test-2026!',
    accountId: seed,
  });

  const providers = {
    privateStateProvider,
    publicDataProvider: indexerPublicDataProvider(PREPROD_ENV.indexer, PREPROD_ENV.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(PREPROD_ENV.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };

  const CompiledTripVerifyContract = CompiledContract.make<TripVerify.Contract<TripVerifyPrivateState>>(
    'TripVerify',
    TripVerify.Contract<TripVerifyPrivateState> as any,
  ).pipe(CompiledContract.withWitnesses(witnesses as any), CompiledContract.withCompiledFileAssets(assetsPath));

  // ---- 3. DEPLOY ----
  logger.info('Deploying tripverify contract to PreProd...');
  const deployedContract = await deployContract(providers as any, {
    compiledContract: CompiledTripVerifyContract as any,
    privateStateId: PRIVATE_STATE_KEY,
    initialPrivateState: { secretKey: randomBytes(32), safetyConditionsMet: true },
    args: [],
  });

  const contractAddress = deployedContract.deployTxData.public.contractAddress;
  console.log(`\nCONTRACT ADDRESS: ${contractAddress}\n`);
  privateStateProvider.setContractAddress(contractAddress);

  // ---- 4. VALID VERIFICATION ----
  logger.info('Running VALID verification (safetyConditionsMet=true)...');
  const tripIdValid = new Uint8Array(32);
  new TextEncoder().encode('trip-valid-001').forEach((b, i) => {
    tripIdValid[i] = b;
  });

  const curState = (await privateStateProvider.get(PRIVATE_STATE_KEY)) as TripVerifyPrivateState;
  await privateStateProvider.set(PRIVATE_STATE_KEY, { ...curState, safetyConditionsMet: true });

  const validTx = await deployedContract.callTx.verifyTripCompliance(tripIdValid);
  const validTxHash = validTx.public.txHash;
  console.log(`VALID TX HASH: ${validTxHash}`);

  // ---- 5. RESET ----
  logger.info('Resetting contract state (VERIFIED -> PENDING)...');
  await deployedContract.callTx.resetTrip();

  // ---- 6. INVALID VERIFICATION ----
  logger.info('Running INVALID verification (safetyConditionsMet=false)...');
  const tripIdInvalid = new Uint8Array(32);
  new TextEncoder().encode('trip-invalid-001').forEach((b, i) => {
    tripIdInvalid[i] = b;
  });

  const curState2 = (await privateStateProvider.get(PRIVATE_STATE_KEY)) as TripVerifyPrivateState;
  await privateStateProvider.set(PRIVATE_STATE_KEY, { ...curState2, safetyConditionsMet: false });

  let invalidResult: string;
  let invalidError = '';
  try {
    await deployedContract.callTx.verifyTripCompliance(tripIdInvalid);
    invalidResult = 'UNEXPECTED_SUCCESS — contract did NOT reject this call';
  } catch (e: any) {
    invalidError = e.message ?? String(e);
    if (invalidError.includes('Safety conditions not met')) {
      invalidResult = 'PASS';
    } else {
      invalidResult = `FAIL — unexpected error: ${invalidError}`;
    }
  }

  console.log(`INVALID VERIFICATION: ${invalidResult}`);
  if (invalidError) console.log(`Rejection message: ${invalidError}`);

  await walletProvider.stop();
  process.exit(0);
}

main().catch((e) => {
  console.error('Fatal error:', e.message ?? e);
  process.exit(1);
});
