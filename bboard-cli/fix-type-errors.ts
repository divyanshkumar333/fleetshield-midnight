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

// decode-address.ts
fixFile('decode-address.ts', content => {
  let c = content;
  // Restore @ts-expect-error for fromString
  c = c.replace(/const bech = MidnightBech32m\.fromString/, '// @ts-expect-error - Needs untyped fallback\n  const bech = MidnightBech32m.fromString');
  return c;
});

// get-addresses.ts
fixFile('get-addresses.ts', content => {
  let c = content;
  // Since eslint is disabled for any, we can use any instead of never
  c = c.replace(/as unknown as never/g, 'as any');
  c = c.replace(/UnshieldedAddress\.codec\.encode\(getNetworkId\(\), pubKeyBytes\)/g, '// @ts-expect-error - Expected\n  UnshieldedAddress.codec.encode(getNetworkId(), pubKeyBytes)');
  return c;
});

// preprod-deploy.ts
fixFile('preprod-deploy.ts', content => {
  let c = content;
  // Change e: unknown to e: any
  c = c.replace(/catch \(e: unknown\)/g, 'catch (e: any)');
  c = c.replace(/as unknown as never/g, 'as any');
  return c;
});

// test-addresses.ts
fixFile('test-addresses.ts', content => {
  let c = content;
  c = c.replace(/catch \(e: unknown\)/g, 'catch (e: any)');
  return c;
});

// tripverify-service.ts
fixFile('tripverify-service.ts', content => {
  let c = content;
  c = c.replace(/catch \(error: unknown\)/g, 'catch (error: any)');
  c = c.replace(/as unknown as never/g, 'as any');
  return c;
});
