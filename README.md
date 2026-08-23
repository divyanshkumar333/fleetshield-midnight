# FleetShield

Privacy-first fleet compliance and logistics operations powered by Midnight zero-knowledge technology.

## What FleetShield does

Fleet operators and logistics companies often need to prove to third parties—such as insurers, regulators, or enterprise clients—that a delivery trip adhered to safety and compliance standards. However, sharing raw telemetry logs (like real-time GPS coordinates, continuous vehicle speeds, and driver behavior) creates serious privacy concerns and commercial data leaks.

FleetShield addresses this by letting an operator verify a trip compliance claim using Midnight's zero-knowledge infrastructure without exposing the underlying private telemetry values. Instead of sharing sensitive location and speed records, FleetShield generates a ZK proof to verify compliance on-chain.

> **Note on Demo Data:** The surrounding fleet telemetry, vehicle movement, route calculations, driver roster, shipments, and financial settlement workflows are currently simulated in the frontend to demonstrate an end-to-end operational dashboard.

## Main features

- **Live Fleet Operations Map:** Real-time tracking interface powered by Leaflet and OpenStreetMap.
- **Real-Road OSRM Routing:** Actual road geometry routes calculated via Open Source Routing Machine (OSRM).
- **Truck Movement Simulation:** Dynamic vehicle movement along realistic Indian highways (e.g., Delhi to Mumbai, Jaipur to Pune).
- **Route Stops & Driver States:** Active monitoring of rest stops, vehicle speeds, and risk ratings.
- **Shipment Management:** Full freight order tracking with priority levels, ETAs, and ZK compliance status.
- **Driver & Fleet Roster:** Driver safety scores, vehicle rig assignments, and operational risk metrics.
- **Midnight ZK Verification:** On-demand zero-knowledge proof generation proving trip compliance.
- **Privacy Audit View:** Interactive visual representation of private vs. public data boundaries.
- **Compliance Receipts:** Downloadable JSON ZK verification receipts with cryptographic proofs and replay verification.
- **Incident Response & Investigation:** Contract traceback viewer to inspect failed ZK assertions.
- **Automated Settlement Workflow:** Payout releases unlocked only upon verified ZK proofs.
- **Accident & Insurance Simulation:** Visual accident alert triggers and verifiable ZK insurance claim filing.
- **Demo / Presentation Mode:** One-click scenario presets (Compliant, Rejected ZK, Speeding, High Risk, Accident) for quick evaluation.
- **Responsive Enterprise Dashboard:** Modern dark-mode interface optimized across desktop and mobile screens.

## How Midnight is used

FleetShield connects a web frontend to a local Express backend that interacts with a Midnight Compact smart contract:

```text
Frontend (React Dashboard)
       ↓
Express API Server (/verify-trip)
       ↓
Midnight Service Wrapper
       ↓
Compact Contract (tripverify.compact)
       ↓
ZK Proof Generation & Ledger Execution
       ↓
Verification Result & On-Chain Transaction Hash
```

- **Contract Location:** `contract/src/tripverify.compact`
- **Primary Circuit:** `verifyTripCompliance`

The Compact contract evaluates the compliance condition passed to it. If the safety conditions are satisfied, the contract executes cleanly, generating a ZK proof and submitting a valid transaction to the Midnight network. If the safety conditions are not met, the contract triggers an explicit assertion failure (`failed assert: Safety conditions not met`), preventing the invalid claim from being verified on-chain.

## What is real vs simulated

To evaluate FleetShield fairly during testing, here is a transparent breakdown of what runs on real code versus what is simulated for demonstration purposes:

### Real
- **Midnight Compact Contract:** Written in `.compact` and compiled for the Midnight runtime.
- **ZK Proof & Verification Flow:** Full local execution of the Midnight proof server and node.
- **API Endpoints:** Live Express server handling `/health` and `/verify-trip`.
- **Valid Verification Execution:** Produces a real ZK proof and on-chain transaction hash from the local Midnight standalone node.
- **Invalid Verification Handling:** Triggers a real contract assertion failure directly from the Compact circuit when compliance conditions fail.

### Simulated
- Vehicle GPS positions and real-time movement updates.
- Fleet rosters, driver safety scores, and shipment ETAs.
- Financial settlement payout amounts and carrier approvals.
- Visual accident triggers and insurance claim filing UI.
- Company analytics, KPIs, and operational activity feeds.

## PreProd Deployment Status

- **Midnight PreProd Integration:** Wallet connectivity, contract compilation, and the ZK verification flow are fully implemented and verified against Midnight PreProd.
- **Faucet Funding Request:** Funding was requested and confirmed via the official PreProd faucet (Transaction ID: `00b6c061798f4bb07803e909a17b274e32169b5981c3e15130c6e3b31fede58094`).
- **Indexer Synchronization:** Tokens did not appear in wallet state after 30+ minutes of polling, consistent with the known PreProd indexer synchronization issue (`sd#126`).
- **Local Standalone Demonstration:** The identical contract and ZK verification logic (valid + invalid paths) is fully functional and demonstrated against the local Midnight standalone node.
- **Automated Deployment:** Contract deployment will complete automatically via `preprod-deploy.ts` once indexer sync is confirmed working.

## Running locally

### Prerequisites
- **Node.js:** v18 or newer
- **npm:** v9 or newer
- **Docker Desktop:** Required to run the standalone Midnight proof server and local node container.

### 1. Start the Backend API & Midnight Environment

Ensure Docker Desktop is open and running, then execute:

```bash
cd bboard-cli
npm run start-api
```

*Note: On initial startup, the backend automatically initializes the Docker standalone Midnight network, funds the test wallet, compiles the Compact contract, and deploys `tripverify.compact`. Wait until you see `Ready to verify trips.` in the terminal.*

### 2. Start the Frontend Dashboard

In a separate terminal window:

```bash
cd dashboard
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Quick Demo Guide for Judges

1. **Test a Compliant Verification (Success Path):**
   - In the top header bar, click the **Compliant** demo scenario chip (or select driver **Vivek Jeet Patel**).
   - Click **Run ZK Verification** in the vehicle panel or **Verify ZK** in the Operations map drawer.
   - Watch the ZK proof pipeline execute. A valid transaction hash will be generated, and a ZK compliance receipt will be logged.

2. **Test a Non-Compliant Verification (Failure Path):**
   - Click the **Rejected ZK** scenario chip (or select high-risk driver **Divyansh Kumar**).
   - Click **Run ZK Verification**.
   - The Compact contract assertion will fail (`failed assert: Safety conditions not met`), triggering an incident alert in the dashboard without posting an invalid proof to the chain.

3. **Inspect Privacy Boundaries:**
   - Navigate to the **Privacy Audit** tab in the sidebar to inspect the data boundary between private telemetry and public ZK receipts.
