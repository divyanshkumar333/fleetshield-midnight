import express from 'express';
import cors from 'cors';
import { initTripVerifyService } from '../src/tripverify-service.js';

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
const allowedOrigin = process.env.ALLOWED_ORIGIN;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!allowedOrigin) {
        // In local dev, allow localhost, 127.0.0.1, or non-browser requests
        if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
          return callback(null, true);
        }
      } else if (origin === allowedOrigin || !origin) {
        return callback(null, true);
      }
      callback(new Error(`Not allowed by CORS: ${origin}`));
    },
  }),
);
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// A simple string-to-bytes utility for the demo if needed, 
// but tripId can just be padded to 32 bytes
function to32Bytes(str: string): Uint8Array {
  const bytes = new TextEncoder().encode(str);
  const padded = new Uint8Array(32);
  padded.set(bytes.subarray(0, 32));
  return padded;
}

app.post('/verify-trip', async (req, res) => {
  try {
    const { tripId, safetyConditionsMet } = req.body;
    
    if (typeof tripId !== 'string' || typeof safetyConditionsMet !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Invalid request body' });
    }

    const service = await initTripVerifyService();
    const tripIdBytes = to32Bytes(tripId);
    
    const result = await service.verifyTrip(tripIdBytes, safetyConditionsMet);
    
    res.json(result);
  } catch (error: any) {
    console.error('Error verifying trip:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Initialize the Midnight environment right at startup
console.log('Starting Midnight test environment (this may take 1-2 minutes)...');
initTripVerifyService().then(() => {
  app.listen(port, () => {
    console.log(`API Server listening at http://localhost:${port}`);
    console.log(`Ready to verify trips.`);
  });
}).catch(err => {
  console.error('Failed to initialize trip verify service:', err);
  process.exit(1);
});
