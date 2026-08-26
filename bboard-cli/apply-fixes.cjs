const fs = require('fs');

// 1. decode-address.ts
let decode = fs.readFileSync('src/decode-address.ts', 'utf8');
decode = decode.replace("import { UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';\n", "");
decode = decode.replace("import { getNetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';", "import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';");
decode = decode.replace("// @ts-ignore", "// @ts-expect-error - Needs untyped fallback");
fs.writeFileSync('src/decode-address.ts', decode);

// 2. preprod-deploy.ts
let preprod = fs.readFileSync('src/preprod-deploy.ts', 'utf8');
preprod = preprod.replace("import { getInitialUnshieldedState } from './wallet-utils.js';\n", "");
fs.writeFileSync('src/preprod-deploy.ts', preprod);

// 3. tripverify-service.ts
let tv = fs.readFileSync('src/tripverify-service.ts', 'utf8');
tv = tv.replace("import { createLogger } from './logger-utils.js';", "import { createLogger } from './logger-utils.js';\nimport { Logger } from 'pino';");
tv = tv.replace("import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';", "import { deployContract, DeployedContract, ContractProviders } from '@midnight-ntwrk/midnight-js-contracts';");

const anyWitness = `const witnesses = {
  localSecretKey: ({ privateState }: any) => [privateState, privateState.secretKey],
  safetyConditionsMet: ({ privateState }: any) => [privateState, privateState.safetyConditionsMet],
};`;
const specificWitness = `interface PrivateStateContext {
  privateState: TripVerifyPrivateState;
}

const witnesses = {
  localSecretKey: ({ privateState }: PrivateStateContext) => [privateState, privateState.secretKey],
  safetyConditionsMet: ({ privateState }: PrivateStateContext) => [privateState, privateState.safetyConditionsMet],
};`;
tv = tv.replace(anyWitness, specificWitness);

const anyConstructor = `  constructor(
    private deployedContract: any,
    private providers: any,
    private logger: any
  ) { }`;
const specificConstructor = `  constructor(
    private deployedContract: DeployedContract<TripVerify.Contract<TripVerifyPrivateState>, TripVerifyPrivateState>,
    private providers: ContractProviders<TripVerify.Contract<TripVerifyPrivateState>, TripVerifyPrivateState, string>,
    private logger: Logger
  ) { }`;
tv = tv.replace(anyConstructor, specificConstructor);

const anyFallbackConstructor = `  constructor(private logger: any) { }`;
const specificFallbackConstructor = `  constructor(private logger: Logger) { }`;
tv = tv.replace(anyFallbackConstructor, specificFallbackConstructor);

const asyncFallback = `  async verifyTrip(_tripIdBytes: Uint8Array, safetyConditionsMet: boolean): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (safetyConditionsMet) {
      const bytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
      const randomHex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      return {
        success: true,
        txHash: randomHex
      };
    } else {
      return {
        success: false,
        error: "Unexpected error executing scoped transaction '<unnamed>': Error: failed assert: Safety conditions not met, cannot verify trip"
      };
    }
  }`;
const syncFallback = `  verifyTrip(_tripIdBytes: Uint8Array, safetyConditionsMet: boolean): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (safetyConditionsMet) {
      const bytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
      const randomHex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
      return Promise.resolve({
        success: true,
        txHash: randomHex
      });
    } else {
      return Promise.resolve({
        success: false,
        error: "Unexpected error executing scoped transaction '<unnamed>': Error: failed assert: Safety conditions not met, cannot verify trip"
      });
    }
  }`;
tv = tv.replace(asyncFallback, syncFallback);

tv = tv.replace("let cachedServicePromise: Promise<any> | null = null;", "let cachedServicePromise: Promise<TripVerifyService | FallbackTripVerifyService> | null = null;");
tv = tv.replace("export async function initTripVerifyService(): Promise<any> {", "export async function initTripVerifyService(): Promise<TripVerifyService | FallbackTripVerifyService> {");
fs.writeFileSync('src/tripverify-service.ts', tv);

// 4. get-addresses.ts
let getAddrs = fs.readFileSync('src/get-addresses.ts', 'utf8');
getAddrs = getAddrs.replace("// @ts-ignore", "// @ts-expect-error - Needs untyped fallback");
fs.writeFileSync('src/get-addresses.ts', getAddrs);

// 5. generate-dust.ts
let genDust = fs.readFileSync('src/generate-dust.ts', 'utf8');
genDust = genDust.replace("let txId: any = null;", "let txId: string | null = null;");
genDust = genDust.replace("} catch (e: any) {", "} catch (error: unknown) {\n    const e = error as Error;");
fs.writeFileSync('src/generate-dust.ts', genDust);
