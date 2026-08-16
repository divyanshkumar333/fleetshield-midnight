// Automates the initial steps of the bboard CLI to capture wallet creation output.
// Run: node automate-cli.mjs
import { spawn } from 'child_process';

let walletSelected = false;
let output = '';
const TIMEOUT_MS = 45_000;

const child = spawn('node', [
  '--experimental-specifier-resolution=node',
  '--loader', 'ts-node/esm',
  'src/launcher/preprod.ts'
], {
  cwd: import.meta.dirname ?? process.cwd(),
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env },
});

const timer = setTimeout(() => {
  console.log('\n[Automation] Timeout reached. Captured output so far:');
  console.log(output);
  child.kill('SIGINT');
}, TIMEOUT_MS);

child.stdout.on('data', (data) => {
  const chunk = data.toString();
  output += chunk;
  process.stdout.write(chunk);

  // Select "Build a fresh wallet" option
  if (!walletSelected && (chunk.includes('Build a fresh wallet') || chunk.includes('fresh wallet') || chunk.includes('option 1') || chunk.includes('[1]') || chunk.includes('(1)'))) {
    walletSelected = true;
    console.log('\n[Automation] Detected wallet menu — selecting option 1...');
    child.stdin.write('1\n');
  }

  // After wallet address appears, wait a bit then exit
  if (chunk.includes('mn_addr_preprod1') || chunk.includes('waiting for funds')) {
    const addressMatch = output.match(/mn_addr_preprod1[a-z0-9]+/);
    const seedMatch = output.match(/wallet seed is: ([a-f0-9]{64})/i);
    console.log('\n[Automation] ===== WALLET CREATED =====');
    if (seedMatch) console.log('[Automation] Seed:', seedMatch[1]);
    if (addressMatch) console.log('[Automation] Address:', addressMatch[0]);
    console.log('[Automation] Fund this address at: https://midnight-tmnight-preprod.nethermind.dev/');
    console.log('[Automation] Killing process (you can now run npm run preprod-remote manually)');
    clearTimeout(timer);
    setTimeout(() => child.kill('SIGINT'), 3000);
  }
});

child.stderr.on('data', (data) => {
  process.stderr.write(data);
});

child.on('close', (code) => {
  clearTimeout(timer);
  console.log(`\n[Automation] CLI process exited with code ${code}`);
});
