import { randomBytes } from '../../../api/src/utils/index.js';
import { initTripVerifyService } from '../tripverify-service.js';

async function run() {
  try {
    const service = await initTripVerifyService();
    
    // =========================================================================
    // CASE 1: safetyConditionsMet = true
    // =========================================================================
    console.log('----------------------------------------------------');
    console.log('CASE 1: safetyConditionsMet = true (Should SUCCEED)');
    console.log('----------------------------------------------------');
    
    const tripId = randomBytes(32);
    const result1 = await service.verifyTrip(tripId, true);
    
    if (result1.success) {
      console.log(`✅ CASE 1 PASS: verifyTripCompliance SUCCEEDED! Tx Hash: ${result1.txHash}`);
    } else {
      console.error(`❌ CASE 1 FAIL: ${result1.error}`);
    }

    // =========================================================================
    // CASE 2: safetyConditionsMet = false
    // =========================================================================
    console.log('----------------------------------------------------');
    console.log('CASE 2: safetyConditionsMet = false (Should FAIL)');
    console.log('----------------------------------------------------');
    
    const tripId2 = randomBytes(32);
    const result2 = await service.verifyTrip(tripId2, false);
    
    if (!result2.success) {
      console.log(`✅ CASE 2 PASS: verifyTripCompliance REJECTED correctly with error: ${result2.error}`);
    } else {
      console.error('❌ CASE 2 FAIL: Transaction succeeded when it should have failed!');
    }

  } catch (e: any) {
    console.error(`Fatal error: ${e.message}`);
    console.debug(e.stack);
  } finally {
    process.exit(0);
  }
}

run();
