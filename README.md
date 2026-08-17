# FleetShield

Privacy-preserving fleet compliance verification powered by Midnight zero-knowledge technology.

## Problem

Fleet operators need to verify driver safety and compliance while avoiding unnecessary exposure of sensitive telemetry data to third parties, insurance providers, or public ledgers.

## Solution

FleetShield uses a Midnight Compact ZK contract to verify a compliance claim while keeping the underlying witness/telemetry data entirely private. Telemetry data stays local, and only a zero-knowledge proof proving compliance is submitted to the Midnight ledger.

## Architecture

```text
React Dashboard
       ↓
Express API
       ↓
Trip Verification Service
       ↓
Midnight Local Network
       ↓
Compact ZK Contract
       ↓
Proof + Ledger Transaction
```

## Main Features

* Live fleet map
* Driver safety scores
* Risk classification
* Driver selection
* Privacy-preserving compliance verification
* Midnight ZK proof generation
* Valid compliance verification
* Invalid compliance rejection
* Transaction hash display
* Backend health monitoring
* Animated verification flow

## API Endpoints

**GET `/health`**
Checks the health of the Express backend.

**POST `/verify-trip`**
Runs the Midnight ZK verification for a given trip.

Request Format:
```json
{
  "tripId": "MS-84921",
  "safetyConditionsMet": true
}
```

- **Valid Behavior:** When `safetyConditionsMet` is `true`, the local ZK circuit evaluates successfully, submitting the proof to the network. Returns `{ "success": true, "txHash": "..." }`.
- **Invalid Behavior:** When `safetyConditionsMet` is `false`, the local ZK circuit immediately fails its compliance assertion (`failed assert: Safety conditions not met`). The transaction is never broadcast to the network. Returns `{ "success": false, "error": "..." }`.

## Local Setup

### Prerequisites
* Node.js
* npm
* Docker Desktop & Docker Engine (Required to run the standalone Midnight proof server and node environment)

### Backend

1. Start Docker Desktop and wait for the Docker Engine to initialize.
2. In a new terminal, run:

```bash
cd bboard-cli
npm run start-api
```
3. Wait 1-2 minutes for the environment to download, start, fund the test wallet, and deploy the `tripverify` contract. The backend is ready when you see: `Ready to verify trips.`

### Frontend

In a separate terminal, run:

```bash
cd dashboard
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Demo Instructions

### Valid Case
1. Select a compliant driver (e.g., **Vivek Jeet Patel** or **Daniel D'Souza**), or click the **Compliant** scenario chip in the header.
2. In the Vehicle Intelligence panel, click **Run ZK Verification**.
3. Observe the sequence:
   * 1. Private Telemetry (DONE)
   * 2. ZK Proof Generation (DONE)
   * 3. Midnight On-Chain (DONE)
   * 4. Compliance Result (DONE)
   * On-chain transaction hash is confirmed and cryptographic ZK receipt is generated.

### Invalid Case
1. Select a high-risk driver (e.g., **Divyansh Kumar**), or click the **Rejected ZK** scenario chip in the header.
2. Click **Run ZK Verification**.
3. Observe the sequence:
   * 1. Private Telemetry (DONE)
   * 2. ZK Proof Generation (DONE)
   * 3. Midnight On-Chain (DONE)
   * 4. Compliance Result (FAIL)
   * The UI displays the Midnight contract assertion failure: `failed assert: Safety conditions not met`, and flags the compliance incident.

## Deployment Status

Due to a known Midnight Preview/PreProd indexer synchronization issue (tracked as sd#126) and intermittent Preview faucet downtime encountered during our build window, we were unable to complete wallet funding on the public testnet in time for submission. All core functionality — Compact contract compilation, ZK proof generation, on-chain-style transaction submission, and both valid/invalid compliance verification paths — is fully implemented and tested against Midnight's local standalone environment, which uses the identical contract, compiler (compactc 0.31.1), and proof server used on Preview/PreProd. We are prepared to redeploy to Preview/PreProd the moment network infrastructure stabilizes.
