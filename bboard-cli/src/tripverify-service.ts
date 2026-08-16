import { createLogger } from './logger-utils.js';
import { StandaloneConfig } from './config.js';
import { MidnightWalletProvider } from './midnight-wallet-provider.js';
import { waitForUnshieldedFunds } from './wallet-utils.js';
import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { randomBytes } from '../../api/src/utils/index.js';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import path from 'path';

import * as TripVerify from '../../contract/src/managed/tripverify/contract/index.js';

export type TripVerifyPrivateState = {
  readonly secretKey: Uint8Array;
  readonly safetyConditionsMet: boolean;
};

const tripVerifyPrivateStateKey = 'tripverify-private-state';

const witnesses = {
  localSecretKey: ({ privateState }: any) => [privateState, privateState.secretKey],
  safetyConditionsMet: ({ privateState }: any) => [privateState, privateState.safetyConditionsMet],
};

export class TripVerifyService {
  constructor(
    private deployedContract: any,
    private providers: any,
    private logger: any
  ) {}

  async verifyTrip(tripIdBytes: Uint8Array, safetyConditionsMet: boolean): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // Check current state. If VERIFIED, we must reset first to allow a new verify call.
      const contractAddress = this.deployedContract.deployTxData.public.contractAddress;
      const st = await this.providers.publicDataProvider.queryContractState(contractAddress);
      if (st) {
        const ledgerState = TripVerify.ledger(st.data);
        if (ledgerState.state === TripVerify.State.VERIFIED) {
          this.logger.info('Contract is in VERIFIED state, resetting to PENDING first...');
          await this.deployedContract.callTx.resetTrip();
        }
      }

      // Update private state with the new boolean
      const privateState = await this.providers.privateStateProvider.get(tripVerifyPrivateStateKey);
      await this.providers.privateStateProvider.set(tripVerifyPrivateStateKey, {
        ...privateState,
        safetyConditionsMet,
      });

      this.logger.info(`Calling verifyTripCompliance...`);
      const tx = await this.deployedContract.callTx.verifyTripCompliance(tripIdBytes);
      return { success: true, txHash: tx.public.txHash };
    } catch (error: any) {
      this.logger.info(`verifyTripCompliance failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

let cachedServicePromise: Promise<TripVerifyService> | null = null;

export async function initTripVerifyService(): Promise<TripVerifyService> {
  if (cachedServicePromise) return cachedServicePromise;

  cachedServicePromise = (async () => {
    const config = new StandaloneConfig();
    const logger = await createLogger(config.logDir);
    const testEnv = config.getEnvironment(logger);
    
    // We expect the script to be run from the bboard-cli directory
    const assetsPath = path.resolve(process.cwd(), '../contract/src/managed/tripverify');

    const CompiledTripVerifyContract = CompiledContract.make<
      TripVerify.Contract<TripVerifyPrivateState>
    >("TripVerify", TripVerify.Contract<TripVerifyPrivateState> as any).pipe(
      CompiledContract.withWitnesses(witnesses as any),
      CompiledContract.withCompiledFileAssets(assetsPath)
    );

    const envConfiguration = await testEnv.start();
    logger.info(`Standalone Environment started`);

    const seed = process.env.WALLET_SEED || '0000000000000000000000000000000000000000000000000000000000000001';
    const walletProvider = await MidnightWalletProvider.build(logger, envConfiguration, seed);
    await walletProvider.start();

    await waitForUnshieldedFunds(logger, walletProvider.wallet, envConfiguration, unshieldedToken());
    logger.info(`Wallet funded.`);

    const zkConfigProvider = new NodeZkConfigProvider<'verifyTripCompliance' | 'resetTrip'>(assetsPath);

    const providers = {
      privateStateProvider: levelPrivateStateProvider<string, TripVerifyPrivateState>({
        privateStateStoreName: config.privateStateStoreName + '-tv',
        signingKeyStoreName: `${config.privateStateStoreName}-tv-signing-keys`,
        privateStoragePasswordProvider: () => 'Bboard-Test-2026!',
        accountId: seed,
      }),
      publicDataProvider: indexerPublicDataProvider(envConfiguration.indexer, envConfiguration.indexerWS),
      zkConfigProvider: zkConfigProvider,
      proofProvider: httpClientProofProvider(envConfiguration.proofServer, zkConfigProvider),
      walletProvider: walletProvider,
      midnightProvider: walletProvider,
    };

    logger.info('Deploying tripverify contract...');
    const deployedContract = await deployContract(providers as any, {
      compiledContract: CompiledTripVerifyContract as any,
      privateStateId: tripVerifyPrivateStateKey,
      initialPrivateState: { secretKey: randomBytes(32), safetyConditionsMet: true },
      args: [],
    });

    const contractAddress = deployedContract.deployTxData.public.contractAddress;
    logger.info(`Deployed tripverify at address: ${contractAddress}`);
    providers.privateStateProvider.setContractAddress(contractAddress);

    return new TripVerifyService(deployedContract, providers, logger);
  })();

  return cachedServicePromise;
}
