# HANDOFF: FleetShield

**Project Overview:** 
FleetShield is a privacy-preserving fleet compliance verification platform built on the Midnight blockchain. It was created for the Brainwave 2026 hackathon (Submission Deadline: Aug 17, 2026, 11:45 PM IST).

**Repo Location:** 
[https://github.com/divyanshkumar333/fleetshield-midnight](https://github.com/divyanshkumar333/fleetshield-midnight)

## What's Built and Working
*   **Zero-Knowledge Contract:** A `tripverify.compact` contract that verifies driver safety compliance using private witness data without exposing the underlying telemetry metrics to the ledger.
*   **Express API Backend:** Exposes `/verify-trip` and `/health` endpoints. It handles the local deployment of the ZK contract exactly once on server startup, manages ZK proof generation, and correctly transitions states (`resetTrip` -> `verifyTripCompliance`).
*   **React Dashboard:** A polished, enterprise-grade dark-mode UI featuring a live Fleet Map (`react-leaflet` with randomized driver movement and hover interactions) and a dynamic Midnight Privacy Verification panel.
*   **End-to-End Wiring:** The dashboard and API are successfully wired together. Local tests in the standalone Midnight environment confirm that valid claims generate ZK proofs and publish transaction hashes, while invalid claims are instantly rejected locally via the contract's `assert()` statements.

## Known Open Items
*   **On-Chain Deployment:** Deploying to public testnets is currently blocked. The PreProd environment is experiencing a known indexer synchronization deadlock (`sd#126`), and the Preview environment faucet is returning a `503 Service Unavailable` error. Local standalone docker execution works flawlessly as the fallback demo environment.
*   **Documentation:** README needs to be updated for final submission.
*   **Submission Materials:** Demo video recording has not yet started.

## Exact Local Run Instructions
To resume development or test the application, run the following sequence:

1.  **Start Docker:** Ensure Docker Desktop is open and the Docker Engine is running (required for the local Midnight proof server).
2.  **Start the Backend API:**
    ```bash
    cd bboard-cli
    npm run start-api
    ```
    *Wait 1-2 minutes for the local node to spin up and deploy the contract. You will see "Backend: ready" in the terminal when it listens on port 4000.*
3.  **Start the Frontend Dashboard:**
    ```bash
    cd dashboard
    npm run dev
    ```
    *The Vite server will start. Open `http://localhost:5173` in your browser.*

## Key File Locations
*   **Contract:** `contract/src/tripverify.compact`
*   **Service Layer (Contract bindings/logic):** `bboard-cli/src/tripverify-service.ts`
*   **API Server:** `bboard-cli/api-server/server.ts`
*   **Dashboard Source:** `dashboard/src/App.tsx` and `dashboard/src/index.css`
*   **Wallet / Config:** Test environment configurations and wallet configurations are localized in `bboard-cli/proof-server.yml` and related launcher scripts (`bboard-cli/src/launcher/`).
