import pino from 'pino';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { MidnightWalletProvider } from './midnight-wallet-provider.js';
import { getInitialUnshieldedState } from './wallet-utils.js';
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
  const logger = pino({ level: 'silent' });
  const seed = process.env.WALLET_SEED;
  if (!seed) throw new Error('WALLET_SEED required');
  let provider: MidnightWalletProvider | null = null;
  try {
    provider = await MidnightWalletProvider.build(logger, PREPROD_ENV, seed);
    await provider.start();
    const state = await getInitialUnshieldedState(logger, provider.wallet.unshielded);
    const balance = state.balances[unshieldedToken().raw] ?? 0n;
    if (balance > 0n) {
      console.log(`FUNDED:${balance.toString()}`);
    } else {
      console.log(`ZERO:0`);
    }
  } finally {
    try { await provider?.stop(); } catch (_) {}
  }
}

main().catch(e => {
  console.log(`ERROR:${e.message}`);
  process.exit(1);
});
