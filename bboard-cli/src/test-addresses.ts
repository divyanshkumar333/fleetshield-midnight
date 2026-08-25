/* eslint-disable @typescript-eslint/no-explicit-any */
import pino from 'pino';
import { MidnightWalletProvider } from './midnight-wallet-provider.js';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { getInitialUnshieldedState, getInitialShieldedState, syncWallet } from './wallet-utils.js';
import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';
import fs from 'fs';
import path from 'path';

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
  const envFile = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
  let seed = '';
  for (const line of envFile.split('\n')) {
    if (line.startsWith('WALLET_SEED=')) {
      seed = line.split('=')[1].trim();
    }
  }

  if (!seed) throw new Error('WALLET_SEED not found');
  let provider: MidnightWalletProvider | null = null;

  try {
    console.log('--- 2. NETWORK ENDPOINTS ---');
    console.log(JSON.stringify(PREPROD_ENV, null, 2));

    provider = await MidnightWalletProvider.build(logger, PREPROD_ENV, seed);
    await provider.start();

    const unshieldedState = await getInitialUnshieldedState(logger, provider.wallet.unshielded);
    const unshieldedAddrStr = UnshieldedAddress.codec.encode(getNetworkId(), unshieldedState.address).toString();

    const shieldedState = await getInitialShieldedState(logger, provider.wallet.shielded);
    const shieldedAddrStr = shieldedState.address.coinPublicKeyString();

    console.log('\n--- 1. ADDRESS MATCH ---');
    console.log('Unshielded Address: ', unshieldedAddrStr);
    console.log('Shielded Address:   ', shieldedAddrStr);

    console.log('\n--- 3. BALANCES (Including DUST) ---');
    await syncWallet(logger, provider.wallet, 2000);

    const unshieldedBalance = unshieldedState.balances[unshieldedToken().raw] ?? 0n;
    console.log('Unshielded tNight:  ', unshieldedBalance.toString());

    const state = await provider.wallet.state().toPromise();
    if (state) {
      console.log('Dust Balance:       ', state.dust.balance(new Date(Date.now()))?.toString() ?? '0');
    }
  } catch (err: any) {
    console.error('--- CAUGHT ERROR ---');
    console.error(err);
  } finally {
    try {
      await provider?.stop();
    } catch (e: any) {
      e;
    }
  }
}

main().catch((e) => console.error('OUTER ERROR:', e));
