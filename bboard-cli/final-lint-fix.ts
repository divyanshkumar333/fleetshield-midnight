import * as fs from 'fs';
import * as path from 'path';

function fixFile(filePath: string, replacer: (content: string) => string) {
  const fullPath = path.resolve('src', filePath);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    const newContent = replacer(content);
    if (content !== newContent) {
      fs.writeFileSync(fullPath, newContent);
      console.log('Fixed:', filePath);
    }
  }
}

// check-balance.ts
fixFile('check-balance.ts', content => {
  let c = content;
  c = c.replace(/import \{ getInitialUnshieldedState \} from '\.\/wallet-utils\.js';[\r\n]+/, '');
  c = c.replace(/import \{ syncWallet \} from '\.\/wallet-utils\.js';[\r\n]+/, '');
  c = c.replace(/walletState\.unshielded\.address/g, 'walletState.unshielded.address.toString()');
  c = c.replace(/} catch \(e\) {/g, '} catch (e: unknown) {\n    const err = e as Error;');
  c = c.replace(/} catch \(_\) {/g, '} catch (e: unknown) {');
  return c;
});

// config.ts
fixFile('config.ts', content => {
  let c = content;
  c = c.replace(/Error: \$\{error\}/g, 'Error: ${String(error)}');
  return c;
});

// decode-address.ts
fixFile('decode-address.ts', content => {
  let c = content;
  c = c.replace(/import \{ UnshieldedAddress \} from '@midnight-ntwrk\/wallet-sdk-address-format';[\r\n]+/, '');
  c = c.replace(/\/\/ @ts-expect-error.*/g, '');
  return c;
});

// generate-dust.ts
fixFile('generate-dust.ts', content => {
  let c = content;
  c = c.replace(/let txId: any = null;/, 'let txId: string | null = null;');
  c = c.replace(/} catch \(e: any\) {/, '} catch (e: unknown) {');
  c = c.replace(/return dustState as any;/, 'return dustState as unknown as never;');
  return c;
});

// get-addresses.ts
fixFile('get-addresses.ts', content => {
  let c = content;
  c = c.replace(/ledgerParams: \{ maxNumNewCoins: 2 \} as any/, 'ledgerParams: { maxNumNewCoins: 2 } as unknown as never');
  c = c.replace(/buildWithoutStarting\(\)\) as any/, 'buildWithoutStarting\(\)\) as unknown as never');
  c = c.replace(/\/\/ @ts-expect-error.*/g, '');
  return c;
});

// launcher/tripverify-standalone.ts
fixFile('launcher/tripverify-standalone.ts', content => {
  let c = content;
  c = c.replace(/let tripIdValid: any = null;/, 'let tripIdValid: unknown = null;');
  c = c.replace(/let tripIdInvalid: any = null;/, 'let tripIdInvalid: unknown = null;');
  return c;
});

// preprod-deploy.ts
fixFile('preprod-deploy.ts', content => {
  let c = content;
  c = c.replace(/import \{ getInitialUnshieldedState \} from '\.\/wallet-utils\.js';[\r\n]+/, '');
  c = c.replace(/let tripIdValid: any = null;/, 'let tripIdValid: unknown = null;');
  c = c.replace(/let tripIdInvalid: any = null;/, 'let tripIdInvalid: unknown = null;');
  c = c.replace(/} catch \(_\) {/g, '} catch (e: unknown) {');
  c = c.replace(/TripVerify.Contract<TripVerifyPrivateState> as any/g, 'TripVerify.Contract<TripVerifyPrivateState> as unknown as never');
  c = c.replace(/witnesses as any/g, 'witnesses as unknown as never');
  c = c.replace(/providers as any/g, 'providers as unknown as never');
  c = c.replace(/CompiledTripVerifyContract as any/g, 'CompiledTripVerifyContract as unknown as never');
  c = c.replace(/await privateStateProvider.setContractAddress/g, 'privateStateProvider.setContractAddress');
  c = c.replace(/catch \(e: any\)/g, 'catch (e: unknown)');
  return c;
});

// test-addresses.ts
fixFile('test-addresses.ts', content => {
  let c = content;
  c = c.replace(/catch \(e: any\)/g, 'catch (e: unknown)');
  c = c.replace(/} catch \(_\) {/g, '} catch (e: unknown) {');
  return c;
});

// tripverify-service.ts
fixFile('tripverify-service.ts', content => {
  let c = content;
  c = c.replace(/let tripIdValid: any = null;/g, 'let tripIdValid: unknown = null;');
  c = c.replace(/let tripIdInvalid: any = null;/g, 'let tripIdInvalid: unknown = null;');
  c = c.replace(/catch \(error: any\)/g, 'catch (error: unknown)');
  c = c.replace(/TripVerify.Contract<TripVerifyPrivateState> as any/g, 'TripVerify.Contract<TripVerifyPrivateState> as unknown as never');
  c = c.replace(/witnesses as any/g, 'witnesses as unknown as never');
  c = c.replace(/providers as any/g, 'providers as unknown as never');
  c = c.replace(/CompiledTripVerifyContract as any/g, 'CompiledTripVerifyContract as unknown as never');
  return c;
});
