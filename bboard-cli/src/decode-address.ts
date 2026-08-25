import { UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { MidnightBech32m } from '@midnight-ntwrk/wallet-sdk-address-format';

setNetworkId('preprod');

const addrStr = 'mn_addr_preprod1fqc6vppkdjj48rzemdp6nflpnmjug35k3st3lz6g57xpfgdt6raqsduw52';

try {
  // @ts-expect-error - Needs untyped fallback
  const bech = MidnightBech32m.fromString(addrStr);
  console.log('Decoded Unshielded Hex:', Buffer.from(bech.data).toString('hex'));
} catch (e) {
  console.error('Failed to decode', e);
}
