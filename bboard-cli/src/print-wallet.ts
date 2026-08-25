import pino from 'pino';
import { MidnightWalletProvider } from './midnight-wallet-provider.js';
import { getInitialUnshieldedState } from './wallet-utils.js';
import { UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';
import { getNetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

const logger = pino({ level: 'info' });

const envConfig = {
  walletNetworkId: 'preprod',
  networkId: 'preprod',
  indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
  indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  node: 'https://rpc.preprod.midnight.network',
  nodeWS: 'wss://rpc.preprod.midnight.network',
  faucet: 'https://midnight-tmnight-preprod.nethermind.dev/',
  proofServer: 'http://localhost:6300',
};

setNetworkId('preprod');

async function main() {
  const seed = process.env.WALLET_SEED || '16d62efdf587cbb94ce2525b4639b52cbf9a81211507b20e281c4e8162f081cd';
  const provider = await MidnightWalletProvider.build(logger, envConfig, seed);

  const initialState = await getInitialUnshieldedState(logger, provider.wallet.unshielded);
  const unshieldedAddress = UnshieldedAddress.codec.encode(getNetworkId(), initialState.address);

  console.log('\n\n--- PREPROD UNSHIELDED WALLET ADDRESS (FOR FAUCET) BELOW ---');
  console.log(unshieldedAddress.toString());
  console.log('-------------------------------------------------------------\n\n');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
