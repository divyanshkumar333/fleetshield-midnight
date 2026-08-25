import pino from 'pino';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { MidnightWalletProvider } from './midnight-wallet-provider.js';
import { getInitialUnshieldedState, syncWallet } from './wallet-utils.js';
import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';

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

async function main() {
  const logger = pino({ level: 'debug' });
  const seed = process.env.WALLET_SEED;
  if (!seed) throw new Error('WALLET_SEED required');
  let provider: MidnightWalletProvider | null = null;
  console.log('\n--- Checking Balance ---');
  try {
    provider = await MidnightWalletProvider.build(logger, PREPROD_ENV, seed);
    await provider.start();

    logger.info('Wallet provider started. Grabbing latest state after 5s...');
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const walletState = await import('rxjs').then((Rx) => Rx.firstValueFrom(provider!.wallet.state()));

    const unshieldedBalance = walletState.unshielded.balances[unshieldedToken().raw] ?? 0n;

    console.log(`\nAddress: ${walletState.unshielded.address}`);
    console.log(`Unshielded Balance: ${unshieldedBalance.toString()} tNIGHT (raw)`);
    console.log(
      `Shielded Balance:   ${(walletState.shielded.balances[unshieldedToken().raw] ?? 0n).toString()} tNIGHT (raw)`,
    );
  } catch (error) {
    logger.error(`Error during balance check: ${error}`);
  } finally {
    try {
      await provider?.stop();
    } catch (_) {}
  }
}

main().catch((e) => {
  console.log(`ERROR:${e.message}`);
  process.exit(1);
});
