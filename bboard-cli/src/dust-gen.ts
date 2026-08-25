import pino from 'pino';
import { MidnightWalletProvider } from './midnight-wallet-provider.js';
import { generateDust } from './generate-dust.js';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

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
  const logger = pino({ level: 'info' });
  const seed = process.env.WALLET_SEED;
  if (!seed) throw new Error('WALLET_SEED required');

  const provider = await MidnightWalletProvider.build(logger, PREPROD_ENV, seed);
  await provider.start();
  logger.info('Wallet provider started. Grabbing latest state after 5s...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const walletState = await import('rxjs').then(Rx => Rx.firstValueFrom(provider.wallet.unshielded.state));
  
  logger.info('Generating DUST...');
  await generateDust(logger, seed, walletState, provider.wallet);
  logger.info('DUST generation complete.');
  
  await provider.stop();
  process.exit(0);
}

main().catch(console.error);
