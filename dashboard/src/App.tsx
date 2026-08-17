import { useState, useEffect, useRef } from 'react';
import OperationsMap from './OperationsMap';
import L from 'leaflet';

// Icons
import {
  Shield, Activity, HardDrive, Lock, Server, CheckCircle2,
  ChevronRight, ShieldCheck, ShieldAlert, Navigation, Search, Bell,
  Pause, Menu, X, Download,
  Copy, RotateCcw, Layers, Tv, AlertOctagon,
  LayoutDashboard, MapPin, Package, UserCheck, CreditCard, AlertTriangle,
  Truck, Clock
} from 'lucide-react';

// Deterministic Master Logistics Corridor Data
const MOCK_DRIVERS_DATA = [
  {
    id: 'MS-84921',
    name: 'Divyansh Kumar',
    score: 42,
    risk: 'HIGH',
    start: { lat: 28.6139, lng: 77.2090 }, // Delhi Hub
    destination: { lat: 19.0760, lng: 72.8777 }, // Mumbai Distribution Hub
    destinationName: 'Mumbai Distribution Hub',
    speed: 0.006,
    initialProgress: 0.68
  },
  {
    id: 'MS-84922',
    name: 'Vivek Jeet Patel',
    score: 88,
    risk: 'LOW',
    start: { lat: 26.9124, lng: 75.7873 }, // Jaipur Depot
    destination: { lat: 18.5204, lng: 73.8567 }, // Pune Logistics Center
    destinationName: 'Pune Logistics Center',
    speed: 0.005,
    initialProgress: 0.85
  },
  {
    id: 'MS-84923',
    name: 'Tejaswa Daboria',
    score: 65,
    risk: 'MEDIUM',
    start: { lat: 26.2183, lng: 78.1828 }, // Gwalior Facility
    destination: { lat: 23.0225, lng: 72.5714 }, // Ahmedabad Port
    destinationName: 'Ahmedabad Port',
    speed: 0.0055,
    initialProgress: 0.42
  },
  {
    id: 'MS-84924',
    name: "Daniel D'Souza",
    score: 92,
    risk: 'LOW',
    start: { lat: 22.7196, lng: 75.8577 }, // Indore Depot
    destination: { lat: 21.1702, lng: 72.8311 }, // Surat Depot
    destinationName: 'Surat Depot',
    speed: 0.005,
    initialProgress: 1.0
  }
];

export interface GeofenceZone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number;
  color: string;
}

export const GEOFENCES: GeofenceZone[] = [
  { id: 'gf-1', name: 'Mumbai Port Authority', lat: 19.0760, lng: 72.8777, radius: 10000, color: '#f59e0b' },
  { id: 'gf-2', name: 'Delhi Logistics Hub', lat: 28.6139, lng: 77.2090, radius: 15000, color: '#0ea5e9' },
  { id: 'gf-3', name: 'Pune Delivery Zone', lat: 18.5204, lng: 73.8567, radius: 8000, color: '#10b981' },
  { id: 'gf-4', name: 'Ahmedabad Port', lat: 23.0225, lng: 72.5714, radius: 12000, color: '#8b5cf6' },
  { id: 'gf-5', name: 'Surat Depot', lat: 21.1702, lng: 72.8311, radius: 6000, color: '#14b8a6' },
  { id: 'gf-6', name: 'Highway Rest Area 48', lat: 21.8, lng: 73.5, radius: 5000, color: '#3b82f6' }
];

const getHeading = (startLat: number, startLng: number, endLat: number, endLng: number) => {
  const dy = endLat - startLat;
  const dx = Math.cos(Math.PI / 180 * startLat) * (endLng - startLng);
  let angle = Math.atan2(dy, dx) * 180 / Math.PI;
  return 90 - angle;
};

interface RoutePoint {
  lat: number;
  lng: number;
}

export type DriverStatus = 'DRIVING' | 'RESTING' | 'REFUELING' | 'DELIVERING' | 'AT_SERVICE' | 'ARRIVED';
export type StopType = 'Rest' | 'Fuel' | 'Delivery' | 'Service' | 'Depot' | 'Destination';

export interface RouteStop {
  id: string;
  type: StopType;
  name: string;
  lat: number;
  lng: number;
  progressThreshold: number;
  durationMs: number;
  remainingMs: number;
  status: 'pending' | 'active' | 'completed';
}

export interface DriverSimulation {
  id: string;
  name: string;
  score: number;
  risk: string;
  start: RoutePoint;
  destination: RoutePoint;
  destinationName: string;
  progress: number;
  speed: number;
  currentLat: number;
  currentLng: number;
  heading: number;
  distance: number;
  routeCoords: [number, number][];
  osrmStatus: 'pending' | 'ok' | 'failed';
  driverStatus: DriverStatus;
  stops: RouteStop[];
  activeGeofenceId?: string | null;
  activeGeofenceName?: string | null;
  complianceState?: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'UNVERIFIED';
  verificationStatus?: 'idle' | 'generating' | 'verifying' | 'success' | 'error';
  txHash?: string | null;
  errorMsg?: string | null;
}

export interface GeoNotification {
  id: string;
  message: string;
  timestamp: number;
}

interface Shipment {
  id: string;
  origin: string;
  destination: string;
  vehicleId: string;
  driverId: string;
  driverName: string;
  status: 'SCHEDULED' | 'ASSIGNED' | 'IN_TRANSIT' | 'AT_STOP' | 'DELAYED' | 'DELIVERED' | 'EXCEPTION';
  priority: 'STANDARD' | 'EXPRESS' | 'CRITICAL';
  progress: number;
  eta: string;
  deliveryStop: string;
  complianceState: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'UNVERIFIED';
  payoutAmount: number;
  settlementStatus: 'NOT_ELIGIBLE' | 'READY_FOR_APPROVAL' | 'APPROVED';
  txHash?: string;
}

interface IncidentItem {
  id: string;
  vehicleId: string;
  driverName: string;
  shipmentId: string;
  type: 'COMPLIANCE_REJECTED' | 'VEHICLE_DELAYED' | 'DELIVERY_EXCEPTION' | 'BACKEND_OFFLINE';
  severity: 'Critical' | 'Warning' | 'Info';
  title: string;
  description: string;
  timestamp: Date;
  resolved: boolean;
}

type RoleMode = 'Fleet Manager' | 'Dispatcher' | 'Compliance Officer' | 'Finance';
type ViewMode = 'OVERVIEW' | 'OPERATIONS' | 'SHIPMENTS' | 'COMPLIANCE' | 'SETTLEMENTS' | 'DRIVERS' | 'PRIVACY_AUDIT' | 'INCIDENTS' | 'ACTIVITY';

const INITIAL_SHIPMENTS: Shipment[] = [
  {
    id: 'SH-84921',
    origin: 'Delhi Hub',
    destination: 'Mumbai Distribution Hub',
    vehicleId: 'MS-84921',
    driverId: 'MS-84921',
    driverName: 'Divyansh Kumar',
    status: 'IN_TRANSIT',
    priority: 'EXPRESS',
    progress: 0.68,
    eta: '11:45 AM',
    deliveryStop: 'Regional Hub',
    complianceState: 'PENDING',
    payoutAmount: 2450,
    settlementStatus: 'NOT_ELIGIBLE'
  },
  {
    id: 'SH-84922',
    origin: 'Jaipur Depot',
    destination: 'Pune Logistics Center',
    vehicleId: 'MS-84922',
    driverId: 'MS-84922',
    driverName: 'Vivek Jeet Patel',
    status: 'IN_TRANSIT',
    priority: 'CRITICAL',
    progress: 0.85,
    eta: '10:30 AM',
    deliveryStop: 'Pune Terminal',
    complianceState: 'VERIFIED',
    payoutAmount: 3800,
    settlementStatus: 'READY_FOR_APPROVAL',
    txHash: '5ac8fb98fec25d9174a7418d90e64293bc4b859759528a686139c9051020d425'
  },
  {
    id: 'SH-84923',
    origin: 'Gwalior Facility',
    destination: 'Ahmedabad Port',
    vehicleId: 'MS-84923',
    driverId: 'MS-84923',
    driverName: 'Tejaswa Daboria',
    status: 'AT_STOP',
    priority: 'STANDARD',
    progress: 0.42,
    eta: '02:15 PM',
    deliveryStop: 'Highway Rest Area',
    complianceState: 'PENDING',
    payoutAmount: 1950,
    settlementStatus: 'NOT_ELIGIBLE'
  },
  {
    id: 'SH-84924',
    origin: 'Indore Depot',
    destination: 'Surat Depot',
    vehicleId: 'MS-84924',
    driverId: 'MS-84924',
    driverName: "Daniel D'Souza",
    status: 'DELIVERED',
    priority: 'EXPRESS',
    progress: 1.0,
    eta: '09:15 AM',
    deliveryStop: 'Final Destination',
    complianceState: 'VERIFIED',
    payoutAmount: 4200,
    settlementStatus: 'APPROVED',
    txHash: 'e2d84b7de5b9f14e09a38e1e9c35424d97e10a98a61c12b7ab0f43a52b1c35b7'
  }
];

const INITIAL_INCIDENTS: IncidentItem[] = [
  {
    id: 'INC-901',
    vehicleId: 'MS-84921',
    driverName: 'Divyansh Kumar',
    shipmentId: 'SH-84921',
    type: 'COMPLIANCE_REJECTED',
    severity: 'Critical',
    title: 'Midnight ZK Compliance Assertion Failed',
    description: 'Contract safety conditions not met for high-speed segment.',
    timestamp: new Date(Date.now() - 15 * 60 * 1000),
    resolved: false
  },
  {
    id: 'INC-902',
    vehicleId: 'MS-84923',
    driverName: 'Tejaswa Daboria',
    shipmentId: 'SH-84923',
    type: 'VEHICLE_DELAYED',
    severity: 'Warning',
    title: 'Route Delay Detected (+24 mins)',
    description: 'Highway Rest Area stop exceeded planned duration window.',
    timestamp: new Date(Date.now() - 45 * 60 * 1000),
    resolved: false
  }
];

const computePolylineLength = (coords: [number, number][]) => {
  let len = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    len += L.latLng(coords[i][0], coords[i][1]).distanceTo(L.latLng(coords[i + 1][0], coords[i + 1][1]));
  }
  return len;
};

const interpolateRoute = (coords: [number, number][], progress: number): { lat: number, lng: number, heading: number } => {
  if (!coords || coords.length === 0) return { lat: 0, lng: 0, heading: 0 };
  if (coords.length === 1) return { lat: coords[0][0], lng: coords[0][1], heading: 0 };
  if (progress <= 0) return { lat: coords[0][0], lng: coords[0][1], heading: getHeading(coords[0][0], coords[0][1], coords[1][0], coords[1][1]) };
  if (progress >= 1) {
    const last = coords.length - 1;
    return { lat: coords[last][0], lng: coords[last][1], heading: getHeading(coords[last - 1][0], coords[last - 1][1], coords[last][0], coords[last][1]) };
  }

  const totalLength = computePolylineLength(coords);
  if (totalLength === 0) return { lat: coords[0][0], lng: coords[0][1], heading: 0 };

  const targetDist = totalLength * progress;

  let currentDist = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = L.latLng(coords[i][0], coords[i][1]);
    const p2 = L.latLng(coords[i + 1][0], coords[i + 1][1]);
    const segDist = p1.distanceTo(p2);

    if (currentDist + segDist >= targetDist) {
      if (segDist === 0) return { lat: p1.lat, lng: p1.lng, heading: 0 };
      const segmentProgress = (targetDist - currentDist) / segDist;
      const lat = p1.lat + (p2.lat - p1.lat) * segmentProgress;
      const lng = p1.lng + (p2.lng - p1.lng) * segmentProgress;
      const heading = getHeading(p1.lat, p1.lng, p2.lat, p2.lng);
      return { lat, lng, heading };
    }
    currentDist += segDist;
  }

  const last = coords.length - 1;
  return { lat: coords[last][0], lng: coords[last][1], heading: getHeading(coords[last - 1][0], coords[last - 1][1], coords[last][0], coords[last][1]) };
};

const generateStops = (coords: [number, number][], distanceKm: number, driverId: string): RouteStop[] => {
  const stops: RouteStop[] = [];
  const minToMs = 60 * 1000;
  const numId = parseInt(driverId.split('-')[1] || "0");
  const last = coords[coords.length - 1];
  const first = coords[0];

  stops.push({
    id: `stop-${driverId}-depot`, type: 'Depot', name: 'Origin Depot',
    lat: first[0], lng: first[1], progressThreshold: 0.0, durationMs: 0, remainingMs: 0, status: 'completed'
  });

  if (distanceKm > 100) {
    if (numId % 2 === 0) {
      stops.push({
        id: `stop-${driverId}-fuel`, type: 'Fuel', name: 'NH-48 Fuel & Service',
        lat: 0, lng: 0, progressThreshold: 0.3, durationMs: 25 * minToMs, remainingMs: 25 * minToMs, status: 'pending'
      });
      stops.push({
        id: `stop-${driverId}-rest`, type: 'Rest', name: 'Highway Rest Stop',
        lat: 0, lng: 0, progressThreshold: 0.6, durationMs: 480 * minToMs, remainingMs: 480 * minToMs, status: 'pending'
      });
    } else {
      stops.push({
        id: `stop-${driverId}-rest`, type: 'Rest', name: 'Logistics Corridor Plaza',
        lat: 0, lng: 0, progressThreshold: 0.4, durationMs: 480 * minToMs, remainingMs: 480 * minToMs, status: 'pending'
      });
      stops.push({
        id: `stop-${driverId}-fuel`, type: 'Fuel', name: 'NH Expressway Fuel',
        lat: 0, lng: 0, progressThreshold: 0.7, durationMs: 20 * minToMs, remainingMs: 20 * minToMs, status: 'pending'
      });
    }
    stops.push({
      id: `stop-${driverId}-del`, type: 'Delivery', name: 'Regional Freight Hub',
      lat: 0, lng: 0, progressThreshold: 0.85, durationMs: 60 * minToMs, remainingMs: 60 * minToMs, status: 'pending'
    });
  } else {
    stops.push({
      id: `stop-${driverId}-fuel`, type: 'Fuel', name: 'Local Freight Stop',
      lat: 0, lng: 0, progressThreshold: 0.5, durationMs: 15 * minToMs, remainingMs: 15 * minToMs, status: 'pending'
    });
  }

  stops.push({
    id: `stop-${driverId}-dest`, type: 'Destination', name: 'Final Destination',
    lat: last[0], lng: last[1], progressThreshold: 1.0, durationMs: 0, remainingMs: 0, status: 'pending'
  });

  return stops.map(stop => {
    if (stop.progressThreshold >= 1.0) return stop;
    if (stop.progressThreshold <= 0.0) return stop;
    const { lat, lng } = interpolateRoute(coords, stop.progressThreshold);
    return { ...stop, lat, lng };
  });
};

const initializeSimulation = (): DriverSimulation[] => {
  return MOCK_DRIVERS_DATA.map((data) => {
    const heading = getHeading(data.start.lat, data.start.lng, data.destination.lat, data.destination.lng);
    const distance = Math.round(L.latLng(data.start.lat, data.start.lng).distanceTo(L.latLng(data.destination.lat, data.destination.lng)) / 1000);
    const fallbackCoords: [number, number][] = [[data.start.lat, data.start.lng], [data.destination.lat, data.destination.lng]];
    const { lat, lng } = interpolateRoute(fallbackCoords, data.initialProgress);

    const matchingShipment = INITIAL_SHIPMENTS.find(s => s.vehicleId === data.id);
    const cState = matchingShipment ? matchingShipment.complianceState : 'PENDING';
    const vStatus = cState === 'VERIFIED' ? 'success' : cState === 'REJECTED' ? 'error' : 'idle';
    const tHash = matchingShipment?.txHash || null;

    return {
      id: data.id,
      name: data.name,
      score: data.score,
      risk: data.risk,
      start: data.start,
      destination: data.destination,
      destinationName: data.destinationName,
      progress: data.initialProgress,
      speed: data.speed,
      currentLat: lat,
      currentLng: lng,
      heading,
      distance,
      routeCoords: fallbackCoords,
      osrmStatus: 'pending',
      driverStatus: 'DRIVING',
      stops: [],
      complianceState: cState,
      verificationStatus: vStatus,
      txHash: tHash,
      errorMsg: null
    };
  });
};

// (Legacy map helper components removed in favor of OperationsMap)

type ZkState = 'idle' | 'generating' | 'verifying' | 'success' | 'error';

type ActivityItem = {
  id: string;
  type: 'initiated' | 'generating' | 'verifying' | 'verified' | 'rejected' | 'completed' | 'system';
  title: string;
  driverName: string;
  tripId: string;
  description: string;
  timestamp: Date;
  txHash?: string;
};

interface ComplianceReceipt {
  verificationId: string;
  tripId: string;
  driverName: string;
  vehicleId: string;
  timestamp: string;
  status: 'VERIFIED' | 'REJECTED';
  txHash: string;
  policyName: string;
}

// Subcomponents
const PrivacyBoundaryDiagram = () => (
  <div className="privacy-boundary-container">
    <div className="boundary-zones-wrapper">
      <div className="boundary-zone zone-private">
        <div className="zone-header">
          <Lock size={14} />
          <span>PRIVATE ZONE (LOCAL NODE)</span>
        </div>
        <div className="zone-node-list">
          <div className="zone-node">
            <span>GPS Coordinate Telemetry</span>
            <span className="kbd">PRIVATE WITNESS</span>
          </div>
          <div className="zone-node">
            <span>Continuous Speed & HOS Clock</span>
            <span className="kbd">LOCAL ONLY</span>
          </div>
          <div className="zone-node">
            <span>Local Witness Generator</span>
            <span className="kbd">UNEXPOSED</span>
          </div>
        </div>
      </div>

      <div className="boundary-divider">
        <ChevronRight size={18} />
        <span className="boundary-divider-badge">ZK PROOF BARRIER</span>
        <ChevronRight size={18} />
      </div>

      <div className="boundary-zone zone-public">
        <div className="zone-header">
          <Server size={14} />
          <span>PUBLIC LEDGER (MIDNIGHT)</span>
        </div>
        <div className="zone-node-list">
          <div className="zone-node">
            <span>Midnight Compact Contract</span>
            <span className="badge badge-ok">EVALUATING</span>
          </div>
          <div className="zone-node">
            <span>On-Chain Assertion Result</span>
            <span className="badge badge-ok">VERIFIED</span>
          </div>
          <div className="zone-node">
            <span>Immutable Tx Reference</span>
            <span className="kbd">ON-CHAIN</span>
          </div>
        </div>
      </div>
    </div>

    <div className="privacy-banner-statement">
      <strong>🔒 Privacy Statement:</strong> Private telemetry values are not included in the verification result or transaction. Midnight evaluates the zero-knowledge assertion on-chain without revealing raw GPS coordinates or driver logs.
    </div>
  </div>
);

const ScalabilityArchitectureDiagram = () => (
  <div className="detail-section">
    <div className="detail-section-title">
      <Layers size={14} />
      ENTERPRISE ARCHITECTURE SCALABILITY (1 → 10,000+ VEHICLES)
    </div>
    <div className="scalability-flow">
      <div className="scale-node">
        <div className="scale-node-title">Fleet Operations</div>
        <div className="scale-node-sub">1 to 10,000+ Rigs</div>
      </div>
      <ChevronRight size={16} color="var(--text-tertiary)" />
      <div className="scale-node">
        <div className="scale-node-title">Verification API</div>
        <div className="scale-node-sub">Stateless Gateway</div>
      </div>
      <ChevronRight size={16} color="var(--text-tertiary)" />
      <div className="scale-node">
        <div className="scale-node-title">Midnight ZK Service</div>
        <div className="scale-node-sub">Zero-Knowledge Prover</div>
      </div>
      <ChevronRight size={16} color="var(--text-tertiary)" />
      <div className="scale-node">
        <div className="scale-node-title">Privacy-Preserving Verification</div>
        <div className="scale-node-sub">Verifiable Ledger Result</div>
      </div>
    </div>
  </div>
);

const ComplianceReceiptModal = ({ receipt, onClose, downloadReceiptJson, copyReceiptText }: {
  receipt: ComplianceReceipt;
  onClose: () => void;
  downloadReceiptJson: (r: ComplianceReceipt) => void;
  copyReceiptText: (r: ComplianceReceipt) => void;
}) => {
  const [copied, setCopied] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="receipt-modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header-bar">
          <div className="modal-title-group">
            <ShieldCheck size={20} color={receipt.status === 'VERIFIED' ? 'var(--status-ok)' : 'var(--status-crit)'} />
            <div>
              <div className="modal-title-text">ZK COMPLIANCE RECEIPT</div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                ID: {receipt.verificationId}
              </div>
            </div>
          </div>
          <button className="detail-close-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="receipt-modal-body">
          <div className={`receipt-privacy-notice ${receipt.status === 'REJECTED' ? 'notice-crit' : ''}`}>
            <Lock size={14} />
            <span>Private telemetry values are not included in the verification result or transaction.</span>
          </div>

          <div className="receipt-grid">
            <div className="receipt-field">
              <span className="receipt-label">Verification ID</span>
              <span className="receipt-value" style={{ fontFamily: 'var(--font-mono)' }}>{receipt.verificationId}</span>
            </div>
            <div className="receipt-field">
              <span className="receipt-label">Trip / Vehicle ID</span>
              <span className="receipt-value">{receipt.tripId} ({receipt.vehicleId})</span>
            </div>
            <div className="receipt-field">
              <span className="receipt-label">Driver Name</span>
              <span className="receipt-value">{receipt.driverName}</span>
            </div>
            <div className="receipt-field">
              <span className="receipt-label">Verification Result</span>
              <span className={`badge ${receipt.status === 'VERIFIED' ? 'badge-ok' : 'badge-crit'}`}>
                {receipt.status}
              </span>
            </div>
            <div className="receipt-field">
              <span className="receipt-label">Policy Verified</span>
              <span className="receipt-value">{receipt.policyName}</span>
            </div>
            <div className="receipt-field">
              <span className="receipt-label">Timestamp</span>
              <span className="receipt-value" style={{ fontFamily: 'var(--font-mono)' }}>{receipt.timestamp}</span>
            </div>
          </div>

          <div className="receipt-field" style={{ background: 'var(--ink-1)', padding: '0.875rem', borderRadius: '6px' }}>
            <span className="receipt-label">Midnight Transaction Hash</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.25rem' }}>
              <span className="tx-hash" style={{ fontSize: '0.75rem' }}>{receipt.txHash}</span>
              {receipt.txHash !== 'N/A' && (
                <button
                  className="copy-btn-inline"
                  onClick={() => {
                    navigator.clipboard.writeText(receipt.txHash);
                    setCopiedHash(true);
                    setTimeout(() => setCopiedHash(false), 2000);
                  }}
                >
                  {copiedHash ? 'COPIED!' : 'COPY HASH'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer-actions">
          <button className="btn btn-secondary" onClick={() => { copyReceiptText(receipt); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
            <Copy size={14} />
            {copied ? 'Copied!' : 'Copy Summary'}
          </button>
          <button className="btn btn-primary" onClick={() => downloadReceiptJson(receipt)}>
            <Download size={14} />
            Download JSON
          </button>
        </div>
      </div>
    </div>
  );
};

const IncidentInvestigationModal = ({ incident, onClose }: { incident: { id: string; driverName: string; tripId: string; description: string; timestamp: Date; errorTrace?: string }; onClose: () => void }) => (
  <div className="modal-overlay" onClick={onClose}>
    <div className="receipt-modal-card" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
      <div className="modal-header-bar" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
        <div className="modal-title-group">
          <AlertOctagon size={20} color="var(--status-crit)" />
          <div>
            <div className="modal-title-text" style={{ color: 'var(--status-crit)' }}>INCIDENT INVESTIGATION</div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              INCIDENT ID: {incident.id}
            </div>
          </div>
        </div>
        <button className="detail-close-btn" onClick={onClose}><X size={16} /></button>
      </div>

      <div className="receipt-modal-body">
        <div className="receipt-grid">
          <div className="receipt-field">
            <span className="receipt-label">Driver / Vehicle</span>
            <span className="receipt-value">{incident.driverName} ({incident.tripId})</span>
          </div>
          <div className="receipt-field">
            <span className="receipt-label">Timestamp</span>
            <span className="receipt-value">{incident.timestamp.toLocaleString()}</span>
          </div>
        </div>

        <div className="detail-section">
          <div className="detail-section-title">INCIDENT SUMMARY</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', lineHeight: 1.5, backgroundColor: 'var(--ink-1)', padding: '0.875rem', borderRadius: '6px' }}>
            {incident.description}
          </div>
        </div>

        <div className="detail-section">
          <div className="detail-section-title">MIDNIGHT CONTRACT ERROR TRACEBACK</div>
          <div className="terminal" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
            <div className="terminal-header">
              <span className="terminal-error">ASSERTION_FAILURE</span>
              <span>tripverify.compact:38</span>
            </div>
            <div className="terminal-body terminal-error">
              {incident.errorTrace || "Error: failed assert: Safety conditions not met, cannot verify trip"}
            </div>
          </div>
        </div>
      </div>

      <div className="modal-footer-actions">
        <button className="btn btn-secondary" onClick={onClose}>Close Investigation</button>
      </div>
    </div>
  </div>
);

const ReplayVerificationModal = ({ receipt, onClose }: { receipt: ComplianceReceipt; onClose: () => void }) => {
  const [replayStep, setReplayStep] = useState(0);

  useEffect(() => {
    const timer1 = setTimeout(() => setReplayStep(1), 1000);
    const timer2 = setTimeout(() => setReplayStep(2), 2200);
    const timer3 = setTimeout(() => setReplayStep(3), 3400);
    return () => { clearTimeout(timer1); clearTimeout(timer2); clearTimeout(timer3); };
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="receipt-modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header-bar">
          <div className="modal-title-group">
            <RotateCcw size={18} color="var(--accent)" />
            <div>
              <div className="modal-title-text">DETERMINISTIC ZK REPLAY</div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                REPLAYING RECORD {receipt.verificationId}
              </div>
            </div>
          </div>
          <button className="detail-close-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="receipt-modal-body">
          <div className="zk-audit-trail">
            <div className={`zk-audit-step ${replayStep >= 0 ? 'success' : ''}`}>
              <div className="zk-step-left">
                <HardDrive size={14} />
                <span>1. FETCH WITNESS SNAPSHOT</span>
              </div>
              <span className="zk-step-status-chip">REPLAYED</span>
            </div>
            <div className={`zk-audit-step ${replayStep >= 1 ? 'success' : 'active'}`}>
              <div className="zk-step-left">
                {replayStep < 1 ? <div className="spinner-small" /> : <Lock size={14} />}
                <span>2. RE-EXECUTE PROVER ENGINE</span>
              </div>
              <span className="zk-step-status-chip">{replayStep >= 1 ? 'MATCHED' : 'RUNNING...'}</span>
            </div>
            <div className={`zk-audit-step ${replayStep >= 2 ? 'success' : ''}`}>
              <div className="zk-step-left">
                {replayStep === 1 ? <div className="spinner-small" /> : <Server size={14} />}
                <span>3. EVALUATE COMPACT CONTRACT</span>
              </div>
              <span className="zk-step-status-chip">{replayStep >= 2 ? 'MATCHED' : 'PENDING'}</span>
            </div>
            <div className={`zk-audit-step ${replayStep >= 3 ? (receipt.status === 'VERIFIED' ? 'success' : 'rejected') : ''}`}>
              <div className="zk-step-left">
                <ShieldCheck size={14} />
                <span>4. VERIFY ON-CHAIN RESULT</span>
              </div>
              <span className="zk-step-status-chip">{replayStep >= 3 ? receipt.status : 'PENDING'}</span>
            </div>
          </div>

          {replayStep >= 3 && (
            <div className="terminal" style={{ marginTop: '0.75rem' }}>
              <div className="terminal-header">
                <span className="terminal-success">✓ REPLAY VERIFICATION IDENTICAL</span>
                <span className="terminal-success">DETERMINISTIC</span>
              </div>
              <div className="terminal-body" style={{ fontSize: '0.6875rem' }}>
                Replay hash matched: {receipt.txHash.substring(0, 24)}...
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer-actions">
          <button className="btn btn-secondary" onClick={onClose}>Close Replay</button>
        </div>
      </div>
    </div>
  );
};

// Main App Component
function App() {
  const [activeView, setActiveView] = useState<ViewMode>('OPERATIONS');
  const [activeRole, setActiveRole] = useState<RoleMode>('Fleet Manager');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [wsPopoverOpen, setWsPopoverOpen] = useState(false);
  const [simPopoverOpen, setSimPopoverOpen] = useState(false);

  const [driverLocations, setDriverLocations] = useState<DriverSimulation[]>(initializeSimulation);
  const [activeDriverId, setActiveDriverId] = useState<string | null>(null);
  const [status, setStatus] = useState<ZkState>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [shipments, setShipments] = useState<Shipment[]>(INITIAL_SHIPMENTS);
  const [incidents, setIncidents] = useState<IncidentItem[]>(INITIAL_INCIDENTS);

  const [activities, setActivities] = useState<ActivityItem[]>([
    {
      id: 'act-init-1',
      type: 'system',
      title: 'Enterprise Dispatch Initialized',
      driverName: 'Fleet Command',
      tripId: 'MS-84921',
      description: '4 active rigs assigned to primary freight corridors.',
      timestamp: new Date()
    }
  ]);

  const [receiptsHistory, setReceiptsHistory] = useState<ComplianceReceipt[]>([
    {
      verificationId: 'ZK-REC-9821',
      tripId: 'MS-84922',
      driverName: 'Vivek Jeet Patel',
      vehicleId: 'MS-84922',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'VERIFIED',
      txHash: '5ac8fb98fec25d9174a7418d90e64293bc4b859759528a686139c9051020d425',
      policyName: 'Midnight HOS & Speed Policy v1'
    }
  ]);

  const [cmdPaletteOpen, setCmdPaletteOpen] = useState<boolean>(false);
  const [cmdQuery, setCmdQuery] = useState<string>('');
  const [notificationsOpen, setNotificationsOpen] = useState<boolean>(false);
  const [notifications] = useState<{ id: string; title: string; desc: string; time: string; type: 'alert' | 'info' }[]>([
    { id: '1', title: 'Midnight Proof Generated', desc: 'Vivek Jeet Patel verified on Midnight ledger.', time: '2m ago', type: 'info' },
    { id: '2', title: 'Settlement Ready', desc: 'Shipment SH-84922 is eligible for ₹3,800 payout.', time: '5m ago', type: 'info' },
    { id: '3', title: 'Compliance Assertion Failed', desc: 'Divyansh Kumar trip rejected on contract safety check.', time: '12m ago', type: 'alert' }
  ]);

  const [geoNotifications, setGeoNotifications] = useState<GeoNotification[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [backendStatus, setBackendStatus] = useState<'ready' | 'connecting' | 'offline'>('connecting');

  const [demoScenario, setDemoScenario] = useState<'IDLE' | 'COMPLIANT' | 'HIGH_RISK' | 'REJECTED'>('IDLE');
  const [presentationMode, setPresentationMode] = useState<boolean>(false);

  const [receiptModalOpen, setReceiptModalOpen] = useState<boolean>(false);
  const [activeReceipt, setActiveReceipt] = useState<ComplianceReceipt | null>(null);

  const [investigationModalOpen, setInvestigationModalOpen] = useState<boolean>(false);
  const [activeIncident, setActiveIncident] = useState<{ id: string; driverName: string; tripId: string; description: string; timestamp: Date; errorTrace?: string } | null>(null);

  const [replayModalOpen, setReplayModalOpen] = useState<boolean>(false);
  const [replayReceipt, setReplayReceipt] = useState<ComplianceReceipt | null>(null);

  const [simulationSpeed, setSimulationSpeed] = useState<number>(1);
  const [simulationTime, setSimulationTime] = useState<Date>(new Date());

  // Simulation Clock
  useEffect(() => {
    if (simulationSpeed === 0) return;
    const interval = setInterval(() => {
      setSimulationTime(prev => new Date(prev.getTime() + 1000 * simulationSpeed));
    }, 1000);
    return () => clearInterval(interval);
  }, [simulationSpeed]);

  // Check Backend Status
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch('http://127.0.0.1:4000/health');
        if (res.ok) setBackendStatus('ready');
        else setBackendStatus('offline');
      } catch (err) {
        setBackendStatus('offline');
      }
    };
    checkBackend();
    const interval = setInterval(checkBackend, 10000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcut Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdPaletteOpen(v => !v);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch OSRM Road Routes ONCE per driver
  const fetchedRoutesRef = useRef<{ [id: string]: boolean }>({});

  useEffect(() => {
    driverLocations.forEach((driver) => {
      if (fetchedRoutesRef.current[driver.id]) return;
      fetchedRoutesRef.current[driver.id] = true;

      const fetchRoute = async () => {
        try {
          const url = `https://router.project-osrm.org/route/v1/driving/${driver.start.lng},${driver.start.lat};${driver.destination.lng},${driver.destination.lat}?overview=full&geometries=geojson`;
          const res = await fetch(url);
          const data = await res.json();

          if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            const geom = data.routes[0].geometry.coordinates;
            const routeCoords: [number, number][] = geom.map((c: [number, number]) => [c[1], c[0]]);
            const distanceKm = Math.round(data.routes[0].distance / 1000);
            const generatedStops = generateStops(routeCoords, distanceKm, driver.id);

            setDriverLocations(prev => prev.map(d => {
              if (d.id !== driver.id) return d;
              const { lat, lng, heading } = interpolateRoute(routeCoords, d.progress);
              return {
                ...d,
                routeCoords,
                distance: distanceKm,
                osrmStatus: 'ok',
                stops: generatedStops,
                currentLat: lat,
                currentLng: lng,
                heading
              };
            }));
          }
        } catch (err) {
          setDriverLocations(prev => prev.map(d => d.id === driver.id ? { ...d, osrmStatus: 'failed' } : d));
        }
      };
      fetchRoute();
    });
  }, []);

  // Truck Movement Simulation (Deterministic State Progression)
  useEffect(() => {
    if (simulationSpeed === 0) return;
    const interval = setInterval(() => {
      setDriverLocations(prev => prev.map(driver => {
        if (!driver.routeCoords || driver.routeCoords.length === 0) return driver;

        let newProgress = driver.progress + (driver.speed * 0.05 * simulationSpeed);
        if (newProgress >= 1.0) newProgress = 0.0; // Loop trip smoothly

        const { lat, lng, heading } = interpolateRoute(driver.routeCoords, newProgress);

        let driverStatus: DriverStatus = 'DRIVING';
        const updatedStops = driver.stops.map(stop => {
          if (Math.abs(newProgress - stop.progressThreshold) < 0.03) {
            if (stop.type === 'Rest') driverStatus = 'RESTING';
            else if (stop.type === 'Fuel') driverStatus = 'REFUELING';
            else if (stop.type === 'Delivery') driverStatus = 'DELIVERING';
            return { ...stop, status: 'active' as const };
          } else if (newProgress > stop.progressThreshold) {
            return { ...stop, status: 'completed' as const };
          }
          return stop;
        });

        // Ensure current position contains valid numbers
        const validLat = Number.isFinite(lat) && lat !== 0 ? lat : driver.start.lat;
        const validLng = Number.isFinite(lng) && lng !== 0 ? lng : driver.start.lng;

        // Geofence Check
        let currentGeofence: GeofenceZone | null = null;
        for (const gf of GEOFENCES) {
          const dist = L.latLng(validLat, validLng).distanceTo(L.latLng(gf.lat, gf.lng));
          if (dist <= gf.radius) {
            currentGeofence = gf;
            break;
          }
        }

        if (currentGeofence && driver.activeGeofenceId !== currentGeofence.id) {
          setTimeout(() => {
            setGeoNotifications(n => [{
              id: `geo-${Date.now()}-${driver.id}`,
              message: `Vehicle ${driver.id} entered ${currentGeofence!.name}`,
              timestamp: Date.now()
            }, ...n].slice(0, 5)); // Keep last 5 notifications
          }, 0);
        }

        return {
          ...driver,
          progress: newProgress,
          currentLat: validLat,
          currentLng: validLng,
          heading: Number.isFinite(heading) ? heading : driver.heading,
          driverStatus,
          stops: updatedStops,
          activeGeofenceId: currentGeofence ? currentGeofence.id : null,
          activeGeofenceName: currentGeofence ? currentGeofence.name : null
        };
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, [simulationSpeed]);

  // Run Real Midnight ZK Verification
  const runVerification = async (driver: DriverSimulation, forceFailure = false, overrideSafetyConditionsMet?: boolean) => {
    setStatus('generating');
    setTxHash(null);
    setErrorMsg(null);

    setDriverLocations(prev => prev.map(d => d.id === driver.id ? {
      ...d,
      verificationStatus: 'generating',
      errorMsg: null
    } : d));

    const logActivity = (type: ActivityItem['type'], title: string, desc: string, hash?: string) => {
      setActivities(prev => [
        {
          id: `act-${Date.now()}-${Math.random()}`,
          type,
          title,
          driverName: driver.name,
          tripId: driver.id,
          description: desc,
          timestamp: new Date(),
          txHash: hash
        },
        ...prev
      ]);
    };

    logActivity('generating', 'Generating ZK Witness Proof', `Computing continuous HOS and speed proof for ${driver.name} (${driver.id})...`);

    setTimeout(async () => {
      setStatus('verifying');
      setDriverLocations(prev => prev.map(d => d.id === driver.id ? {
        ...d,
        verificationStatus: 'verifying'
      } : d));

      logActivity('verifying', 'Submitting Proof to Midnight', 'Evaluating contract safety conditions on-chain...');

      try {
        const safetyConditionsMet = overrideSafetyConditionsMet !== undefined
          ? overrideSafetyConditionsMet
          : (forceFailure ? false : (driver.score > 50));

        const payload = {
          tripId: driver.id,
          driverName: driver.name,
          safetyConditionsMet,
          averageSpeedKmH: safetyConditionsMet ? 68 : 115,
          restStopsCompleted: safetyConditionsMet ? 2 : 0
        };

        const res = await fetch('http://127.0.0.1:4000/verify-trip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.success) {
          setStatus('success');
          setTxHash(data.txHash);
          setDriverLocations(prev => prev.map(d => d.id === driver.id ? {
            ...d,
            complianceState: 'VERIFIED',
            verificationStatus: 'success',
            txHash: data.txHash,
            errorMsg: null
          } : d));

          logActivity('verified', 'Compliance Verified on Midnight', `On-chain proof confirmed. Tx Hash: ${data.txHash.substring(0, 16)}...`, data.txHash);

          const newReceipt: ComplianceReceipt = {
            verificationId: `ZK-REC-${Math.floor(1000 + Math.random() * 9000)}`,
            tripId: driver.id,
            driverName: driver.name,
            vehicleId: driver.id,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            status: 'VERIFIED',
            txHash: data.txHash,
            policyName: 'Midnight HOS & Speed Policy v1'
          };

          setReceiptsHistory(prev => [newReceipt, ...prev]);
          setActiveReceipt(newReceipt);
          setReceiptModalOpen(true);

          // Update Shipment State & Settlement Eligibility
          setShipments(prev => prev.map(s => s.vehicleId === driver.id ? {
            ...s,
            complianceState: 'VERIFIED',
            settlementStatus: 'READY_FOR_APPROVAL',
            txHash: data.txHash
          } : s));

        } else {
          setStatus('error');
          const errText = data.error || 'Contract assertion failed: Safety conditions not met';
          setErrorMsg(errText);

          setDriverLocations(prev => prev.map(d => d.id === driver.id ? {
            ...d,
            complianceState: 'REJECTED',
            verificationStatus: 'error',
            txHash: null,
            errorMsg: errText
          } : d));

          logActivity('rejected', 'Compliance Assertion Rejected', `Verification failed: ${errText}`);

          const newReceipt: ComplianceReceipt = {
            verificationId: `ZK-REC-${Math.floor(1000 + Math.random() * 9000)}`,
            tripId: driver.id,
            driverName: driver.name,
            vehicleId: driver.id,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            status: 'REJECTED',
            txHash: 'N/A',
            policyName: 'Midnight HOS & Speed Policy v1'
          };

          setReceiptsHistory(prev => [newReceipt, ...prev]);
          setShipments(prev => prev.map(s => s.vehicleId === driver.id ? { ...s, complianceState: 'REJECTED' } : s));

          // Log Incident
          const newIncident: IncidentItem = {
            id: `INC-${Math.floor(100 + Math.random() * 900)}`,
            vehicleId: driver.id,
            driverName: driver.name,
            shipmentId: `SH-${driver.id.split('-')[1] || '84921'}`,
            type: 'COMPLIANCE_REJECTED',
            severity: 'Critical',
            title: 'Midnight ZK Compliance Rejected',
            description: errText,
            timestamp: new Date(),
            resolved: false
          };
          setIncidents(prev => [newIncident, ...prev]);
        }
      } catch (err) {
        setStatus('error');
        const errText = 'Failed to connect to local Midnight ZK verification backend API (localhost:4000)';
        setErrorMsg(errText);

        setDriverLocations(prev => prev.map(d => d.id === driver.id ? {
          ...d,
          complianceState: 'REJECTED',
          verificationStatus: 'error',
          txHash: null,
          errorMsg: errText
        } : d));

        logActivity('rejected', 'Verification API Offline', errText);
      }
    }, 1800);
  };

  const handleTriggerDemoScenario = (scenario: 'COMPLIANT' | 'HIGH_RISK' | 'REJECTED') => {
    setDemoScenario(scenario);
    if (scenario === 'COMPLIANT') {
      const driver = driverLocations.find(d => d.risk === 'LOW') || driverLocations[1];
      setActiveDriverId(driver.id);
      setActiveView('OPERATIONS');
      runVerification(driver, false, true);
    } else if (scenario === 'HIGH_RISK') {
      const driver = driverLocations.find(d => d.risk === 'HIGH') || driverLocations[0];
      setActiveDriverId(driver.id);
      setActiveView('OPERATIONS');
      runVerification(driver, true, false);
    } else if (scenario === 'REJECTED') {
      const driver = driverLocations[0];
      setActiveDriverId(driver.id);
      setActiveView('OPERATIONS');
      runVerification(driver, true, false);
    }
  };

  const approveSettlement = (shipmentId: string) => {
    setShipments(prev => prev.map(s => s.id === shipmentId ? { ...s, settlementStatus: 'APPROVED' } : s));
    const sh = shipments.find(s => s.id === shipmentId);
    if (sh) {
      setActivities(prev => [
        {
          id: `act-set-${Date.now()}`,
          type: 'verified',
          title: 'Settlement Payout Approved',
          driverName: sh.driverName,
          tripId: sh.id,
          description: `Financial payout of ₹${sh.payoutAmount.toLocaleString()} approved for delivered shipment ${sh.id}.`,
          timestamp: new Date(),
          txHash: sh.txHash
        },
        ...prev
      ]);
    }
  };

  const downloadReceiptJson = (receipt: ComplianceReceipt) => {
    const jsonStr = JSON.stringify(receipt, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fleetshield-receipt-${receipt.verificationId}.json`;
    a.click();
  };

  const copyReceiptText = (receipt: ComplianceReceipt) => {
    const text = `FLEETSHIELD ZK COMPLIANCE RECEIPT\nVerification ID: ${receipt.verificationId}\nTrip ID: ${receipt.tripId}\nDriver: ${receipt.driverName}\nResult: ${receipt.status}\nMidnight Tx: ${receipt.txHash}\nPrivacy: Private telemetry values are not included in the verification result.`;
    navigator.clipboard.writeText(text);
  };

  const startReplay = (receipt: ComplianceReceipt) => {
    setReplayReceipt(receipt);
    setReplayModalOpen(true);
  };

  const pendingVerificationsCount = shipments.filter(s => s.complianceState === 'PENDING').length;
  const pendingSettlementsCount = shipments.filter(s => s.settlementStatus === 'READY_FOR_APPROVAL').length;
  const pendingSettlementTotal = shipments
    .filter(s => s.settlementStatus === 'READY_FOR_APPROVAL')
    .reduce((sum, s) => sum + s.payoutAmount, 0);

  return (
    <div className="app-layout">
      {geoNotifications.length > 0 && (
        <div className="geo-notifications-overlay">
          {geoNotifications.map(notif => (
            <div key={notif.id} className="geo-toast">
              <MapPin size={14} color="var(--status-warn)" />
              <span>{notif.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Premium Enterprise Header ── */}
      <header className="app-header">
        {/* Brand */}
        <div className="header-brand">
          <div className="brand-logo" onClick={() => setActiveView('OVERVIEW')} title="Overview">
            <img src="/fleetshield-logo.png" alt="FleetShield" className="brand-logo-img"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
          <div className="brand-wordmark" onClick={() => setActiveView('OVERVIEW')} style={{ cursor: 'pointer' }}>
            <span className="brand-wordmark-name">FleetShield</span>
            <span className="brand-wordmark-sub">Fleet Operations</span>
          </div>
        </div>

        {/* Right actions */}
        <div className="header-actions-group">
          {/* Demo scenario chips */}
          <div className="demo-bar hide-on-mobile">
            <button className={`demo-chip ${demoScenario === 'COMPLIANT' ? 'active' : ''}`} onClick={() => handleTriggerDemoScenario('COMPLIANT')}>Compliant</button>
            <button className={`demo-chip ${demoScenario === 'HIGH_RISK' ? 'active' : ''}`} onClick={() => handleTriggerDemoScenario('HIGH_RISK')}>High Risk</button>
            <button className={`demo-chip ${demoScenario === 'REJECTED' ? 'active' : ''}`} onClick={() => handleTriggerDemoScenario('REJECTED')}>Rejected ZK</button>
          </div>

          <div className="header-divider hide-on-mobile" />

          {/* Polished Simulation pill */}
          <div className="sim-pill-wrap hide-on-mobile">
            <button
              className={`sim-pill ${simulationSpeed === 0 ? 'paused' : ''}`}
              onClick={() => setSimPopoverOpen(v => !v)}
            >
              <span className="sim-pill-dot" />
              <span>{simulationSpeed === 0 ? 'Paused' : 'Simulation'}</span>
              <span className="sim-pill-speed">{simulationSpeed === 0 ? '' : `${simulationSpeed}×`}</span>
            </button>
            {simPopoverOpen && (
              <div className="sim-speed-popover" onClick={() => setSimPopoverOpen(false)}>
                <div className={`sim-speed-opt pause-opt ${simulationSpeed === 0 ? 'active' : ''}`} onClick={() => setSimulationSpeed(0)}>
                  <Pause size={12} /> Pause
                </div>
                <div className={`sim-speed-opt ${simulationSpeed === 1 ? 'active' : ''}`} onClick={() => setSimulationSpeed(1)}>
                  1× Normal
                </div>
                <div className={`sim-speed-opt ${simulationSpeed === 5 ? 'active' : ''}`} onClick={() => setSimulationSpeed(5)}>
                  5× Fast
                </div>
                <div className={`sim-speed-opt ${simulationSpeed === 10 ? 'active' : ''}`} onClick={() => setSimulationSpeed(10)}>
                  10× Rapid
                </div>
              </div>
            )}
          </div>

          {/* Midnight ZK live badge */}
          <div className="zk-live-badge hide-on-mobile">
            <span className="zk-live-dot" />
            Midnight ZK
          </div>

          <div className="header-divider hide-on-mobile" />

          {/* Search */}
          <button className="search-trigger hide-on-mobile" onClick={() => setCmdPaletteOpen(true)}>
            <Search size={13} />
            <span>Search</span>
            <span className="kbd">⌘K</span>
          </button>

          {/* Notifications */}
          <div style={{ position: 'relative' }}>
            <button className="notification-trigger" onClick={() => setNotificationsOpen(v => !v)}>
              <Bell size={15} />
              <span className="badge-count">3</span>
            </button>
            {notificationsOpen && (
              <div className="notifications-dropdown">
                <div className="notif-header">
                  <span className="notif-title">Alerts</span>
                  <button className="notif-clear" onClick={() => setNotificationsOpen(false)}>Close</button>
                </div>
                <div className="notif-list">
                  {notifications.map(n => (
                    <div key={n.id} className="notif-item">
                      <div className="notif-icon">
                        {n.type === 'alert' ? <ShieldAlert size={13} color="var(--crit)" /> : <Activity size={13} color="var(--accent)" />}
                      </div>
                      <div className="notif-content">
                        <div className="notif-item-title">{n.title}</div>
                        <div className="notif-item-desc">{n.desc}</div>
                        <div className="notif-item-time">{n.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Backend status */}
          <div className={`hdr-status-pill hide-on-mobile ${backendStatus}`}>
            <span className="hdr-status-dot" />
            {backendStatus === 'ready' ? 'Online' : backendStatus === 'connecting' ? 'Connecting' : 'Offline'}
          </div>

          {/* Presentation mode */}
          <button
            className={`search-trigger hide-on-mobile ${presentationMode ? 'active' : ''}`}
            onClick={() => setPresentationMode(v => !v)}
            title="Presentation Mode"
          >
            <Tv size={13} />
            <span>{presentationMode ? 'Presenting' : 'Present'}</span>
          </button>

          {/* Mobile menu */}
          <button className="notification-trigger show-on-mobile-only" onClick={() => setMobileMenuOpen(v => !v)}>
            <Menu size={17} />
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="app-workspace">

        {/* ── Premium Enterprise Sidebar ── */}
        <aside className={`enterprise-sidebar ${mobileMenuOpen ? 'mobile-open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}>

          {/* Sidebar collapse toggle */}
          <button
            className="sidebar-toggle hide-on-mobile"
            onClick={() => setSidebarCollapsed(v => !v)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronRight size={12} style={{ transform: sidebarCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 220ms ease' }} />
          </button>

          <button className="sidebar-close-mobile show-on-mobile-only" onClick={() => setMobileMenuOpen(false)}>
            <X size={16} />
          </button>

          {/* Workspace / Role Selector */}
          <div className="workspace-selector" style={{ position: 'relative' }}>
            <button className="workspace-selector-btn" onClick={() => setWsPopoverOpen(v => !v)}>
              <div className="ws-icon">
                <Shield size={15} />
              </div>
              {!sidebarCollapsed && (
                <>
                  <div className="ws-text">
                    <span className="ws-name">{activeRole}</span>
                    <span className="ws-meta">Operations workspace</span>
                  </div>
                  <ChevronRight size={13} className={`ws-chevron ${wsPopoverOpen ? 'open' : ''}`} />
                </>
              )}
            </button>

            {wsPopoverOpen && !sidebarCollapsed && (
              <div className="ws-popover">
                <div className="ws-demo-label">Demo Role</div>
                {(['Fleet Manager', 'Dispatcher', 'Compliance Officer', 'Finance'] as RoleMode[]).map(role => (
                  <button
                    key={role}
                    className={`ws-option ${activeRole === role ? 'active' : ''}`}
                    onClick={() => {
                      setActiveRole(role);
                      setWsPopoverOpen(false);
                      if (role === 'Fleet Manager') setActiveView('OVERVIEW');
                      else if (role === 'Dispatcher') setActiveView('SHIPMENTS');
                      else if (role === 'Compliance Officer') setActiveView('COMPLIANCE');
                      else if (role === 'Finance') setActiveView('SETTLEMENTS');
                    }}
                  >
                    <span className="ws-opt-icon">
                      {role === 'Fleet Manager' ? <Truck size={13} /> :
                        role === 'Dispatcher' ? <Navigation size={13} /> :
                          role === 'Compliance Officer' ? <ShieldCheck size={13} /> :
                            <CreditCard size={13} />}
                    </span>
                    <span>{role}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Navigation Groups */}
          <nav className="sidebar-nav-groups">
            <div className="sidebar-group">
              <div className="sidebar-group-title">Overview</div>
              <button className={`sidebar-item ${activeView === 'OVERVIEW' ? 'active' : ''}`} onClick={() => setActiveView('OVERVIEW')}>
                <LayoutDashboard size={14} />
                <span className="sidebar-item-label">Executive Overview</span>
              </button>
            </div>

            <div className="sidebar-group">
              <div className="sidebar-group-title">Operations</div>
              <button className={`sidebar-item ${activeView === 'OPERATIONS' ? 'active' : ''}`} onClick={() => setActiveView('OPERATIONS')}>
                <MapPin size={14} />
                <span className="sidebar-item-label">Fleet Command</span>
              </button>
            </div>

            <div className="sidebar-group">
              <div className="sidebar-group-title">Logistics</div>
              <button className={`sidebar-item ${activeView === 'SHIPMENTS' ? 'active' : ''}`} onClick={() => setActiveView('SHIPMENTS')}>
                <Package size={14} />
                <span className="sidebar-item-label">Shipments</span>
              </button>
              <button className={`sidebar-item ${activeView === 'DRIVERS' ? 'active' : ''}`} onClick={() => setActiveView('DRIVERS')}>
                <UserCheck size={14} />
                <span className="sidebar-item-label">Drivers</span>
              </button>
            </div>

            <div className="sidebar-group">
              <div className="sidebar-group-title">Compliance</div>
              <button className={`sidebar-item ${activeView === 'COMPLIANCE' ? 'active' : ''}`} onClick={() => setActiveView('COMPLIANCE')}>
                <ShieldCheck size={14} />
                <span className="sidebar-item-label">Verification</span>
                {pendingVerificationsCount > 0 && <span className="nav-badge">{pendingVerificationsCount}</span>}
              </button>
              <button className={`sidebar-item ${activeView === 'PRIVACY_AUDIT' ? 'active' : ''}`} onClick={() => setActiveView('PRIVACY_AUDIT')}>
                <Lock size={14} />
                <span className="sidebar-item-label">Privacy Audit</span>
              </button>
              <button className={`sidebar-item ${activeView === 'INCIDENTS' ? 'active' : ''}`} onClick={() => setActiveView('INCIDENTS')}>
                <AlertTriangle size={14} />
                <span className="sidebar-item-label">Incidents</span>
                {incidents.length > 0 && <span className="nav-badge">{incidents.length}</span>}
              </button>
            </div>

            <div className="sidebar-group">
              <div className="sidebar-group-title">Finance</div>
              <button className={`sidebar-item ${activeView === 'SETTLEMENTS' ? 'active' : ''}`} onClick={() => setActiveView('SETTLEMENTS')}>
                <CreditCard size={14} />
                <span className="sidebar-item-label">Settlements</span>
                {pendingSettlementsCount > 0 && <span className="nav-badge nav-badge-accent">{pendingSettlementsCount}</span>}
              </button>
            </div>

            <div className="sidebar-group">
              <div className="sidebar-group-title">System</div>
              <button className={`sidebar-item ${activeView === 'ACTIVITY' ? 'active' : ''}`} onClick={() => setActiveView('ACTIVITY')}>
                <Activity size={14} />
                <span className="sidebar-item-label">Activity</span>
              </button>
            </div>
          </nav>

          {/* System Status Footer */}
          <div className="sidebar-footer">
            <div className="sidebar-footer-title">System</div>
            <div className="sidebar-status-row">
              <span className={`ss-dot ${backendStatus === 'ready' ? 'ok' : backendStatus === 'connecting' ? 'warn' : 'offline'}`} />
              <span className="sidebar-status-label">
                {backendStatus === 'ready' ? 'Backend Online' : backendStatus === 'connecting' ? 'Connecting...' : 'Backend Offline'}
              </span>
            </div>
            <div className="sidebar-status-row">
              <span className="ss-dot ok" />
              <span className="sidebar-status-label">Midnight ZK Ready</span>
            </div>
            <div className="sidebar-status-row">
              <span className={`ss-dot ${simulationSpeed === 0 ? 'warn' : 'active'}`} />
              <span className="sidebar-status-label">
                {simulationSpeed === 0 ? 'Simulation Paused' : `Simulation ${simulationSpeed}×`}
              </span>
            </div>
          </div>
        </aside>

        {/* Dynamic Workspace View Router */}
        {activeView === 'OVERVIEW' && (
          <div className="overview-workspace enter-fade-up">
            <div className="overview-header">
              <div>
                <h1 className="overview-title">Enterprise Logistics Command Center</h1>
                <div className="overview-subtitle">FleetShield Privacy-First Operations · {activeRole} View</div>
              </div>
              <span className="chip chip-sim">SIMULATION DATA</span>
            </div>

            {/* KPI Cards Grid */}
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-header">
                  <span>ACTIVE RIGS</span>
                  <Truck size={15} />
                </div>
                <div className="kpi-value">12</div>
                <div className="kpi-subtext">4 Rigs Simulating Real Roads</div>
              </div>

              <div className="kpi-card">
                <div className="kpi-header">
                  <span>ACTIVE SHIPMENTS</span>
                  <Package size={15} />
                </div>
                <div className="kpi-value">{shipments.length}</div>
                <div className="kpi-subtext">Delhi · Jaipur · Gwalior · Indore</div>
              </div>

              <div className="kpi-card">
                <div className="kpi-header">
                  <span>ON-TIME RATE</span>
                  <Clock size={15} />
                </div>
                <div className="kpi-value" style={{ color: 'var(--ok)' }}>94.2%</div>
                <div className="kpi-subtext">+1.8% vs last week</div>
              </div>

              <div className="kpi-card">
                <div className="kpi-header">
                  <span>COMPLIANCE RATE</span>
                  <ShieldCheck size={15} />
                </div>
                <div className="kpi-value" style={{ color: 'var(--accent)' }}>96.0%</div>
                <div className="kpi-subtext">Midnight ZK Contract Verified</div>
              </div>

              <div className="kpi-card">
                <div className="kpi-header">
                  <span>PENDING VERIFICATION</span>
                  <AlertTriangle size={15} />
                </div>
                <div className="kpi-value" style={{ color: 'var(--warn)' }}>{pendingVerificationsCount}</div>
                <div className="kpi-subtext">Awaiting ZK proof submission</div>
              </div>

              <div className="kpi-card">
                <div className="kpi-header">
                  <span>PENDING SETTLEMENT</span>
                  <CreditCard size={15} />
                </div>
                <div className="kpi-value" style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                  ₹{pendingSettlementTotal.toLocaleString()}
                </div>
                <div className="kpi-subtext">{pendingSettlementsCount} Verified Payouts Ready</div>
              </div>
            </div>

            {/* Overview Content Grid */}
            <div className="overview-content-grid">
              <div className="overview-panel">
                <div className="overview-panel-title">
                  <span>Active Shipments Queue</span>
                  <button className="copy-btn-inline" onClick={() => setActiveView('SHIPMENTS')}>View All Shipments →</button>
                </div>
                <div className="data-table">
                  <div className="table-header" style={{ gridTemplateColumns: '1.2fr 1fr 1fr 1fr' }}>
                    <div>SHIPMENT / ROUTE</div>
                    <div>ASSIGNED RIG</div>
                    <div>STATUS</div>
                    <div>COMPLIANCE</div>
                  </div>
                  {shipments.map(s => (
                    <div key={s.id} className="table-row" style={{ gridTemplateColumns: '1.2fr 1fr 1fr 1fr' }}>
                      <div className="cell-entity">
                        <span className="entity-name" style={{ fontFamily: 'var(--font-mono)' }}>{s.id}</span>
                        <span className="entity-sub">{s.origin} → {s.destination}</span>
                      </div>
                      <div className="cell-entity">
                        <span className="entity-name">{s.driverName}</span>
                        <span className="entity-sub">{s.vehicleId}</span>
                      </div>
                      <div className="cell-status">
                        <span className="badge badge-ok">{s.status}</span>
                      </div>
                      <div className="cell-status">
                        <span className={`badge ${s.complianceState === 'VERIFIED' ? 'badge-ok' : (s.complianceState === 'REJECTED' ? 'badge-crit' : 'badge-warn')}`}>
                          {s.complianceState}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="overview-panel">
                <div className="overview-panel-title">
                  <span>Settlement Approval Queue</span>
                  <button className="copy-btn-inline" onClick={() => setActiveView('SETTLEMENTS')}>Settlements →</button>
                </div>
                {shipments.filter(s => s.settlementStatus === 'READY_FOR_APPROVAL').length === 0 ? (
                  <div className="table-empty">No settlements pending approval. Verify trip compliance to make payouts eligible.</div>
                ) : (
                  shipments.filter(s => s.settlementStatus === 'READY_FOR_APPROVAL').map(s => (
                    <div key={s.id} className="settlement-card" style={{ padding: '0.875rem' }}>
                      <div className="shipment-card-header">
                        <span className="shipment-id">{s.id}</span>
                        <span className="settlement-amount">₹{s.payoutAmount.toLocaleString()}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {s.driverName} · {s.origin} → {s.destination}
                      </div>
                      <button className="btn btn-primary" style={{ marginTop: '0.25rem' }} onClick={() => approveSettlement(s.id)}>
                        Approve Settlement
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}


        {/* Persistent Map Operations View — Full-Viewport Immersive */}
        <div style={{ display: activeView === 'OPERATIONS' ? 'flex' : 'none', flex: '1 1 0%', position: 'relative', minWidth: 0, minHeight: 0 }}>
          <OperationsMap
            driverLocations={driverLocations}
            activeDriverId={activeDriverId}
            status={status}
            txHash={txHash}
            errorMsg={errorMsg}
            simulationTime={simulationTime}
            simulationSpeed={simulationSpeed}
            onSelectDriver={setActiveDriverId}
            onVerify={(driver) => runVerification(driver, false)}
            isVisible={activeView === 'OPERATIONS'}
          />
        </div>

        {activeView === 'SHIPMENTS' && (
          <div className="workspace-container enter-fade-up">
            <div className="workspace-header-bar">
              <div className="workspace-title-group">
                <h1 className="workspace-title">Shipment Operations Workspace</h1>
                <div className="workspace-desc">Active freight orders, route progress, and ZK compliance status</div>
              </div>
              <span className="chip chip-sim">SIMULATION WORKFLOW</span>
            </div>

            <div className="enterprise-card-grid">
              {shipments.map(s => (
                <div key={s.id} className="shipment-card">
                  <div className="shipment-card-header">
                    <span className="shipment-id">{s.id}</span>
                    <span className={`badge ${s.priority === 'CRITICAL' ? 'badge-crit' : (s.priority === 'EXPRESS' ? 'badge-warn' : 'badge-ok')}`}>
                      {s.priority}
                    </span>
                  </div>

                  <div className="shipment-route">
                    <span>{s.origin}</span>
                    <ChevronRight size={16} color="var(--text-tertiary)" />
                    <span>{s.destination}</span>
                  </div>

                  <div className="shipment-meta-row">
                    <span>Rig {s.vehicleId} · {s.driverName}</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>ETA {s.eta}</span>
                  </div>

                  <div className="trip-progress-box">
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${Math.round(s.progress * 100)}%` }} />
                    </div>
                    <div className="progress-stats-row">
                      <span>Progress: {Math.round(s.progress * 100)}%</span>
                      <span className="text-accent">{s.status}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--stroke-dim)', paddingTop: '0.75rem' }}>
                    <span className={`badge ${s.complianceState === 'VERIFIED' ? 'badge-ok' : (s.complianceState === 'REJECTED' ? 'badge-crit' : 'badge-warn')}`}>
                      ZK: {s.complianceState}
                    </span>
                    <button className="btn btn-secondary" onClick={() => {
                      const drv = driverLocations.find(d => d.id === s.vehicleId);
                      if (drv) {
                        setActiveDriverId(drv.id);
                        setActiveView('OPERATIONS');
                        runVerification(drv, false);
                      }
                    }}>
                      Verify ZK
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeView === 'COMPLIANCE' && (
          <div className="workspace-container enter-fade-up">
            <div className="workspace-header-bar">
              <div className="workspace-title-group">
                <h1 className="workspace-title">Compliance & ZK Verification Center</h1>
                <div className="workspace-desc">Zero-knowledge proof evaluator powered by Midnight smart contracts</div>
              </div>
              <span className="chip chip-live">LIVE MIDNIGHT ZK</span>
            </div>

            <div className="detail-section" style={{ background: 'var(--ink-2)', padding: '1.25rem', borderRadius: '8px' }}>
              <div className="detail-section-title">VERIFICATION AUDIT QUEUE</div>
              <div className="data-table">
                <div className="table-header" style={{ gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1.2fr' }}>
                  <div>SHIPMENT / DRIVER</div>
                  <div>VEHICLE RIG</div>
                  <div>RESULT</div>
                  <div>TX HASH</div>
                  <div style={{ textAlign: 'right' }}>ACTION</div>
                </div>

                {shipments.map(s => (
                  <div key={s.id} className="table-row" style={{ gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1.2fr' }}>
                    <div className="cell-entity">
                      <span className="entity-name">{s.driverName}</span>
                      <span className="entity-sub">{s.id} · {s.origin} → {s.destination}</span>
                    </div>
                    <div className="cell-entity">
                      <span className="entity-name">{s.vehicleId}</span>
                    </div>
                    <div className="cell-status">
                      <span className={`badge ${s.complianceState === 'VERIFIED' ? 'badge-ok' : (s.complianceState === 'REJECTED' ? 'badge-crit' : 'badge-warn')}`}>
                        {s.complianceState}
                      </span>
                    </div>
                    <div className="cell-metric" style={{ textAlign: 'left' }}>
                      {s.txHash ? `${s.txHash.substring(0, 14)}...` : 'Pending Proof'}
                    </div>
                    <div className="cell-metric" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button className="btn btn-secondary" onClick={() => {
                        const drv = driverLocations.find(d => d.id === s.vehicleId);
                        if (drv) {
                          setActiveDriverId(drv.id);
                          setActiveView('OPERATIONS');
                          runVerification(drv, false);
                        }
                      }}>
                        Verify Compliance
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeView === 'SETTLEMENTS' && (
          <div className="workspace-container enter-fade-up">
            <div className="workspace-header-bar">
              <div className="workspace-title-group">
                <h1 className="workspace-title">Financial Settlement & Payouts</h1>
                <div className="workspace-desc">Automated carrier settlement released upon Midnight zero-knowledge verification</div>
              </div>
              <span className="chip chip-sim">SIMULATED SETTLEMENT</span>
            </div>

            <div className="privacy-banner-statement" style={{ backgroundColor: 'var(--ink-2)', borderLeft: '4px solid var(--accent)' }}>
              <strong>💡 Settlement Rule:</strong> Delivered Shipment + Verified Midnight Compliance ZK Proof → Settlement Eligible → Company Approval.
            </div>

            <div className="enterprise-card-grid">
              {shipments.map(s => (
                <div key={s.id} className="settlement-card">
                  <div className="shipment-card-header">
                    <span className="shipment-id">{s.id}</span>
                    <span className="settlement-amount">₹{s.payoutAmount.toLocaleString()}</span>
                  </div>

                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {s.driverName} ({s.vehicleId})
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Route: {s.origin} → {s.destination}
                  </div>

                  <div className="shipment-meta-row" style={{ borderTop: '1px solid var(--stroke-dim)', paddingTop: '0.625rem' }}>
                    <span>Midnight ZK:</span>
                    <span className={`badge ${s.complianceState === 'VERIFIED' ? 'badge-ok' : 'badge-warn'}`}>{s.complianceState}</span>
                  </div>

                  <div className="shipment-meta-row">
                    <span>Settlement Status:</span>
                    <span className={`settlement-status-badge ${s.settlementStatus === 'APPROVED' ? 'settlement-approved' : (s.settlementStatus === 'READY_FOR_APPROVAL' ? 'settlement-eligible' : 'settlement-pending')}`}>
                      {s.settlementStatus.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {s.settlementStatus === 'READY_FOR_APPROVAL' && (
                    <button className="btn btn-primary" style={{ marginTop: '0.375rem' }} onClick={() => approveSettlement(s.id)}>
                      Approve Settlement
                    </button>
                  )}

                  {s.settlementStatus === 'APPROVED' && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--ok)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <CheckCircle2 size={14} /> Settlement Approved & Paid
                    </div>
                  )}

                  {s.settlementStatus === 'NOT_ELIGIBLE' && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      Run ZK verification to unlock settlement eligibility.
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeView === 'DRIVERS' && (
          <div className="workspace-container enter-fade-up">
            <div className="workspace-header-bar">
              <div className="workspace-title-group">
                <h1 className="workspace-title">Drivers & Personnel Roster</h1>
                <div className="workspace-desc">Driver safety scores, assigned rigs, and active trip status</div>
              </div>
              <span className="chip chip-sim">FLEET ROSTER</span>
            </div>

            <div className="enterprise-card-grid">
              {driverLocations.map(d => (
                <div key={d.id} className="shipment-card">
                  <div className="shipment-card-header">
                    <span className="shipment-id">{d.name}</span>
                    <span className={`badge ${d.risk === 'HIGH' ? 'badge-crit' : (d.risk === 'MEDIUM' ? 'badge-warn' : 'badge-ok')}`}>
                      {d.risk} RISK
                    </span>
                  </div>

                  <div className="shipment-meta-row">
                    <span>Rig Identifier:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-1)' }}>{d.id}</span>
                  </div>

                  <div className="shipment-meta-row">
                    <span>Driver Safety Score:</span>
                    <span style={{ fontWeight: 700, color: d.score < 50 ? 'var(--crit)' : 'var(--ok)' }}>{d.score} / 100</span>
                  </div>

                  <div className="shipment-meta-row">
                    <span>Active Status:</span>
                    <span className="text-accent" style={{ fontWeight: 600 }}>{d.driverStatus}</span>
                  </div>

                  <button className="btn btn-secondary" style={{ marginTop: '0.5rem' }} onClick={() => {
                    setActiveDriverId(d.id);
                    setActiveView('OPERATIONS');
                  }}>
                    Focus Rig on Map
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeView === 'PRIVACY_AUDIT' && (
          <div className="workspace-container enter-fade-up">
            <div className="privacy-banner-statement" style={{ backgroundColor: 'var(--ink-2)', borderLeft: '4px solid var(--accent)', padding: '1.25rem' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: '0.375rem' }}>
                What FleetShield Proves
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-2)', lineHeight: 1.5 }}>
                FleetShield verifies a compliance claim using Midnight's zero-knowledge infrastructure without exposing the underlying private witness data as the verification result.
              </div>
            </div>

            <PrivacyBoundaryDiagram />
            <ScalabilityArchitectureDiagram />

            <div className="detail-section">
              <div className="detail-section-title">VERIFICATION AUDIT LOG (IMMUTABLE RECORD)</div>
              {receiptsHistory.length === 0 ? (
                <div className="table-empty" style={{ backgroundColor: 'var(--ink-2)', border: '1px solid var(--stroke-dim)', borderRadius: '6px', padding: '2rem' }}>
                  No ZK verifications performed yet. Run a verification from the Operations map drawer or Demo Scenarios above.
                </div>
              ) : (
                <div className="data-table" style={{ backgroundColor: 'var(--ink-2)', border: '1px solid var(--stroke-dim)', borderRadius: '6px' }}>
                  <div className="table-header" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1.5fr' }}>
                    <div>VERIFICATION ID / TRIP</div>
                    <div>DRIVER</div>
                    <div>RESULT</div>
                    <div>TIMESTAMP</div>
                    <div style={{ textAlign: 'right' }}>ACTIONS</div>
                  </div>
                  {receiptsHistory.map(rec => (
                    <div key={rec.verificationId} className="table-row" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1.5fr' }}>
                      <div className="cell-entity">
                        <span className="entity-name" style={{ fontFamily: 'var(--font-mono)' }}>{rec.verificationId}</span>
                        <span className="entity-sub">{rec.tripId} ({rec.vehicleId})</span>
                      </div>
                      <div className="cell-entity">
                        <span className="entity-name">{rec.driverName}</span>
                      </div>
                      <div className="cell-status">
                        <span className={`badge ${rec.status === 'VERIFIED' ? 'badge-ok' : 'badge-crit'}`}>
                          {rec.status}
                        </span>
                      </div>
                      <div className="cell-metric" style={{ textAlign: 'left' }}>{rec.timestamp}</div>
                      <div className="cell-metric" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button className="copy-btn-inline" onClick={() => { setActiveReceipt(rec); setReceiptModalOpen(true); }}>
                          Receipt
                        </button>
                        <button className="copy-btn-inline" onClick={() => startReplay(rec)}>
                          Replay
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeView === 'INCIDENTS' && (
          <div className="workspace-container enter-fade-up">
            <div className="workspace-header-bar">
              <div className="workspace-title-group">
                <h1 className="workspace-title">Incident Response Center</h1>
                <div className="workspace-desc">Compliance rejections, contract assertion tracebacks, and operational alerts</div>
              </div>
              <span className="chip chip-sim">INCIDENT QUEUE</span>
            </div>

            <div className="enterprise-card-grid">
              {incidents.map(inc => (
                <div key={inc.id} className="shipment-card" style={{ borderColor: inc.severity === 'Critical' ? 'var(--crit-line)' : 'var(--warn-line)' }}>
                  <div className="shipment-card-header">
                    <span className="shipment-id" style={{ color: inc.severity === 'Critical' ? 'var(--crit)' : 'var(--warn)' }}>{inc.id}</span>
                    <span className={`badge ${inc.severity === 'Critical' ? 'badge-crit' : 'badge-warn'}`}>
                      {inc.severity}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-1)' }}>
                    {inc.title}
                  </div>

                  <div style={{ fontSize: '0.75rem', color: 'var(--text-2)' }}>
                    {inc.driverName} ({inc.vehicleId}) · Shipment {inc.shipmentId}
                  </div>

                  <div className="terminal" style={{ fontSize: '0.6875rem', marginTop: '0.25rem' }}>
                    {inc.description}
                  </div>

                  <button className="btn btn-secondary" style={{ marginTop: '0.375rem' }} onClick={() => {
                    setActiveIncident({
                      id: inc.id,
                      driverName: inc.driverName,
                      tripId: inc.vehicleId,
                      description: inc.description,
                      timestamp: inc.timestamp,
                      errorTrace: 'Error: failed assert: Safety conditions not met, cannot verify trip'
                    });
                    setInvestigationModalOpen(true);
                  }}>
                    Investigate Traceback
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activity Log */}
        {activeView === 'ACTIVITY' && (
          <div className="overview-workspace enter-fade-up">
            <div className="overview-header">
              <div>
                <h1 className="overview-title">System Activity</h1>
                <div className="overview-subtitle">Live ZK verification events and fleet operations log</div>
              </div>
              <span className="chip chip-sim">LIVE FEED</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '720px' }}>
              {activities.length === 0 && (
                <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-3)', fontSize: '13px' }}>
                  No activity yet. Trigger a ZK verification to see events here.
                </div>
              )}
              {activities.map(act => {
                const iconColor = act.type === 'verified' ? 'var(--ok)'
                  : act.type === 'rejected' ? 'var(--crit)'
                    : act.type === 'generating' || act.type === 'verifying' ? 'var(--warn)'
                      : 'var(--text-3)';
                return (
                  <div key={act.id} style={{
                    display: 'flex', gap: '14px', alignItems: 'flex-start',
                    padding: '14px 16px', background: 'var(--surface-card)',
                    border: '1px solid var(--stroke-base)', borderRadius: '6px',
                  }}>
                    <div style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: iconColor, flexShrink: 0, marginTop: '5px',
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-1)', marginBottom: '2px' }}>{act.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>{act.description}</div>
                      <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-3)' }}>
                        <span>{act.driverName}</span>
                        <span>{act.tripId}</span>
                        {act.txHash && <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{act.txHash.slice(0, 20)}…</span>}
                        <span style={{ marginLeft: 'auto' }}>{act.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </main>

      {/* Command Palette */}
      {cmdPaletteOpen && (
        <div className="cmd-overlay" onClick={() => setCmdPaletteOpen(false)}>
          <div className="cmd-palette" onClick={e => e.stopPropagation()}>
            <div className="cmd-header">
              <Search size={18} color="var(--text-secondary)" />
              <input
                type="text"
                className="cmd-input"
                placeholder="Search drivers, shipments, verifications, or incidents..."
                value={cmdQuery}
                onChange={e => setCmdQuery(e.target.value)}
                autoFocus
              />
              <span className="kbd">ESC</span>
            </div>
            <div className="cmd-body">
              <div className="cmd-section-title">SUGGESTIONS</div>
              <div className="cmd-item" onClick={() => { setActiveView('OPERATIONS'); setCmdPaletteOpen(false); }}>
                <MapPin size={14} color="var(--accent)" /> Fleet Command Map
              </div>
              <div className="cmd-item" onClick={() => { setActiveView('SHIPMENTS'); setCmdPaletteOpen(false); }}>
                <Package size={14} color="var(--accent)" /> View All Shipments
              </div>
              <div className="cmd-item" onClick={() => { setActiveView('SETTLEMENTS'); setCmdPaletteOpen(false); }}>
                <CreditCard size={14} color="var(--accent)" /> Financial Settlements
              </div>

              {cmdQuery.trim().length > 0 && (
                <>
                  <div className="cmd-section-title" style={{ marginTop: '1rem' }}>SEARCH RESULTS</div>
                  {MOCK_DRIVERS_DATA.filter(d => d.name.toLowerCase().includes(cmdQuery.toLowerCase()) || d.id.toLowerCase().includes(cmdQuery.toLowerCase())).map(driver => (
                    <div className="cmd-item" key={driver.id} onClick={() => {
                      setActiveDriverId(driver.id);
                      setActiveView('OPERATIONS');
                      setCmdPaletteOpen(false);
                    }}>
                      <div className="cmd-driver-info">
                        <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>{driver.name}</span>
                        <span style={{ color: 'var(--text-2)', fontSize: '0.6875rem' }}>Vehicle Rig {driver.id}</span>
                      </div>
                      <ChevronRight size={14} color="var(--text-tertiary)" />
                    </div>
                  ))}
                  {shipments.filter(s => s.id.toLowerCase().includes(cmdQuery.toLowerCase()) || s.origin.toLowerCase().includes(cmdQuery.toLowerCase()) || s.destination.toLowerCase().includes(cmdQuery.toLowerCase())).map(s => (
                    <div className="cmd-item" key={s.id} onClick={() => {
                      setActiveView('SHIPMENTS');
                      setCmdPaletteOpen(false);
                    }}>
                      <div className="cmd-driver-info">
                        <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>Shipment {s.id}</span>
                        <span style={{ color: 'var(--text-2)', fontSize: '0.6875rem' }}>{s.origin} → {s.destination}</span>
                      </div>
                      <ChevronRight size={14} color="var(--text-tertiary)" />
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modals System */}
      {receiptModalOpen && activeReceipt && (
        <ComplianceReceiptModal
          receipt={activeReceipt}
          onClose={() => setReceiptModalOpen(false)}
          downloadReceiptJson={downloadReceiptJson}
          copyReceiptText={copyReceiptText}
        />
      )}

      {investigationModalOpen && activeIncident && (
        <IncidentInvestigationModal
          incident={activeIncident}
          onClose={() => setInvestigationModalOpen(false)}
        />
      )}

      {replayModalOpen && replayReceipt && (
        <ReplayVerificationModal
          receipt={replayReceipt}
          onClose={() => setReplayModalOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
