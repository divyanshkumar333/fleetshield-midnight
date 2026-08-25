import { FluentWalletBuilder } from '@midnight-ntwrk/testkit-js';
import { ZswapSecretKeys } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';
import { getNetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import fs from 'fs';
import path from 'path';

setNetworkId('preprod');

async function main() {
  const envFile = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
  let seed = '';
  for (const line of envFile.split('\n')) {
    if (line.startsWith('WALLET_SEED=')) {
      seed = line.split('=')[1].trim();
    }
  }

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

  const builder = FluentWalletBuilder.forEnvironment(PREPROD_ENV).withDustOptions({
    ledgerParams: { maxNumNewCoins: 2 } as any, // dummy since we don't start
    additionalFeeOverhead: 1_000n,
    feeBlocksMargin: 5,
  });

  const buildResult = (await builder.withSeed(seed).buildWithoutStarting()) as any;

  const shieldedKeys = ZswapSecretKeys.fromSeed(buildResult.seeds.shielded);
  const shieldedAddress = shieldedKeys.coinPublicKey;

  const unshieldedKeystore = buildResult.keystore;
  const pubKeyHex = await unshieldedKeystore.getPublicKey();
  const pubKeyBytes = new Uint8Array(Buffer.from(pubKeyHex, 'hex'));
  // @ts-expect-error - Needs untyped fallback
  const unshieldedAddressStr = UnshieldedAddress.codec.encode(getNetworkId(), pubKeyBytes).toString();
  console.log('Unshielded Address (Bech32):', unshieldedAddressStr);
  console.log('Shielded Address (Hex): ', shieldedAddress);
}

main().catch(console.error);
