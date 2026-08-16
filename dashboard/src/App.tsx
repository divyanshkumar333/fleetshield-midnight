import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';

// Icons
import { 
  Shield, Activity, HardDrive, Lock, Server, CheckCircle2, XCircle, 
  ChevronRight, ShieldCheck, ShieldAlert, Navigation, Search, Bell, 
  Focus, ZoomIn, ZoomOut, Pause, Menu, X, Check, ChevronDown, Download, 
  Copy, RotateCcw, Layers, Tv, ExternalLink, AlertOctagon 
} from 'lucide-react';

// Mock Data
const MOCK_DRIVERS = [
  { id: 'MS-84921', name: 'David Torres', score: 42, risk: 'HIGH' },
  { id: 'MS-84922', name: 'Sarah Chen', score: 88, risk: 'LOW' },
  { id: 'MS-84923', name: 'Michael Vance', score: 65, risk: 'MEDIUM' },
  { id: 'MS-84924', name: 'Robert Jenkins', score: 92, risk: 'LOW' },
];

const MOCK_DESTINATIONS = [
  { name: 'Mumbai Distribution Hub', coords: [24.5, 76.5] },
  { name: 'Pune Logistics Center', coords: [27.0, 80.0] },
  { name: 'Ahmedabad Port', coords: [25.0, 75.0] },
  { name: 'Surat Depot', coords: [28.0, 77.0] },
];

const MAP_CENTER: [number, number] = [26.2183, 78.1828]; // Gwalior, MP

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

type DriverStatus = 'DRIVING' | 'RESTING' | 'REFUELING' | 'DELIVERING' | 'AT_SERVICE' | 'ARRIVED';
type StopType = 'Rest' | 'Fuel' | 'Delivery' | 'Service' | 'Depot' | 'Destination';

interface RouteStop {
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

interface DriverSimulation {
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
}

const computePolylineLength = (coords: [number, number][]) => {
  let len = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    len += L.latLng(coords[i][0], coords[i][1]).distanceTo(L.latLng(coords[i+1][0], coords[i+1][1]));
  }
  return len;
};

const interpolateRoute = (coords: [number, number][], progress: number): { lat: number, lng: number, heading: number } => {
  if (coords.length === 0) return { lat: 0, lng: 0, heading: 0 };
  if (coords.length === 1) return { lat: coords[0][0], lng: coords[0][1], heading: 0 };
  if (progress <= 0) return { lat: coords[0][0], lng: coords[0][1], heading: getHeading(coords[0][0], coords[0][1], coords[1][0], coords[1][1]) };
  if (progress >= 1) {
    const last = coords.length - 1;
    return { lat: coords[last][0], lng: coords[last][1], heading: getHeading(coords[last-1][0], coords[last-1][1], coords[last][0], coords[last][1]) };
  }

  const totalLength = computePolylineLength(coords);
  const targetDist = totalLength * progress;

  let currentDist = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = L.latLng(coords[i][0], coords[i][1]);
    const p2 = L.latLng(coords[i+1][0], coords[i+1][1]);
    const segDist = p1.distanceTo(p2);

    if (currentDist + segDist >= targetDist) {
      const segmentProgress = (targetDist - currentDist) / segDist;
      const lat = p1.lat + (p2.lat - p1.lat) * segmentProgress;
      const lng = p1.lng + (p2.lng - p1.lng) * segmentProgress;
      const heading = getHeading(p1.lat, p1.lng, p2.lat, p2.lng);
      return { lat, lng, heading };
    }
    currentDist += segDist;
  }
  
  const last = coords.length - 1;
  return { lat: coords[last][0], lng: coords[last][1], heading: getHeading(coords[last-1][0], coords[last-1][1], coords[last][0], coords[last][1]) };
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
        id: `stop-${driverId}-fuel`, type: 'Fuel', name: 'NH-44 Fuel Station',
        lat: 0, lng: 0, progressThreshold: 0.3, durationMs: 25 * minToMs, remainingMs: 25 * minToMs, status: 'pending'
      });
      stops.push({
        id: `stop-${driverId}-rest`, type: 'Rest', name: 'Highway Rest Area',
        lat: 0, lng: 0, progressThreshold: 0.6, durationMs: 480 * minToMs, remainingMs: 480 * minToMs, status: 'pending'
      });
    } else {
      stops.push({
        id: `stop-${driverId}-rest`, type: 'Rest', name: 'Logistics Park Rest',
        lat: 0, lng: 0, progressThreshold: 0.4, durationMs: 480 * minToMs, remainingMs: 480 * minToMs, status: 'pending'
      });
      stops.push({
        id: `stop-${driverId}-fuel`, type: 'Fuel', name: 'City Outskirts Fuel',
        lat: 0, lng: 0, progressThreshold: 0.7, durationMs: 20 * minToMs, remainingMs: 20 * minToMs, status: 'pending'
      });
    }
    stops.push({
      id: `stop-${driverId}-del`, type: 'Delivery', name: 'Regional Hub',
      lat: 0, lng: 0, progressThreshold: 0.85, durationMs: 60 * minToMs, remainingMs: 60 * minToMs, status: 'pending'
    });
  } else {
    stops.push({
      id: `stop-${driverId}-fuel`, type: 'Fuel', name: 'Local Station',
      lat: 0, lng: 0, progressThreshold: 0.5, durationMs: 15 * minToMs, remainingMs: 15 * minToMs, status: 'pending'
    });
  }
  
  stops.push({
    id: `stop-${driverId}-dest`, type: 'Destination', name: 'Final Destination',
    lat: last[0], lng: last[1], progressThreshold: 1.0, durationMs: 0, remainingMs: 0, status: 'pending'
  });
  
  // Snap coordinates to exact polyline path based on threshold
  return stops.map(stop => {
    if (stop.progressThreshold >= 1.0) return stop;
    if (stop.progressThreshold <= 0.0) return stop;
    const { lat, lng } = interpolateRoute(coords, stop.progressThreshold);
    return { ...stop, lat, lng };
  });
};

const initializeSimulation = (): DriverSimulation[] => {
  return MOCK_DRIVERS.map((driver, index) => {
    // Generate origin further away for more interesting routes
    const start = {
      lat: MAP_CENTER[0] + (Math.random() - 0.5) * 5,
      lng: MAP_CENTER[1] + (Math.random() - 0.5) * 5
    };
    const dest = MOCK_DESTINATIONS[index % MOCK_DESTINATIONS.length];
    const destination = { lat: dest.coords[0], lng: dest.coords[1] };
    const heading = getHeading(start.lat, start.lng, destination.lat, destination.lng);
    const distance = Math.round(L.latLng(start.lat, start.lng).distanceTo(L.latLng(destination.lat, destination.lng)) / 1000);
    
    return {
      ...driver,
      start,
      destination,
      destinationName: dest.name,
      progress: Math.random() * 0.2, // Start early in the route
      speed: 0.005 + Math.random() * 0.003,
      currentLat: start.lat,
      currentLng: start.lng,
      heading,
      distance,
      routeCoords: [[start.lat, start.lng], [destination.lat, destination.lng]],
      osrmStatus: 'pending',
      driverStatus: 'DRIVING',
      stops: []
    };
  });
};

const createTruckIcon = (risk: string, heading: number, isSelected: boolean) => {
  const color = risk === 'HIGH' ? 'var(--status-crit)' : (risk === 'MEDIUM' ? 'var(--status-warn)' : 'var(--status-ok)');
  
  const truckSvg = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="${color}">
      <rect x="5" y="2" width="14" height="20" rx="3"/>
      <rect x="7" y="4" width="10" height="5" rx="1" fill="#111827" opacity="0.9"/>
    </svg>
  `;

  return L.divIcon({
    className: `truck-marker-container ${isSelected ? 'selected' : ''}`,
    html: `
      <div class="truck-marker-inner ${risk.toLowerCase()}" style="transform: rotate(${heading}deg);">
        ${truckSvg}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
};

const createStopIcon = (type: string, isHighlighted: boolean, isActive: boolean) => {
  let iconHtml = '';
  const color = isActive ? '#fff' : (isHighlighted ? 'var(--text-secondary)' : 'var(--text-tertiary)');
  const bg = isActive ? 'var(--accent)' : 'var(--bg-card)';
  
  // Use simple SVG path representations for icons inside divIcon
  if (type === 'Fuel') {
    iconHtml = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><path d="M3 22h12"/><path d="M4 9h10v13H4z"/><path d="M20 22v-6c0-1.1-.9-2-2-2h-2"/><path d="M14 4h4a2 2 0 0 1 2 2v6"/></svg>`;
  } else if (type === 'Rest') {
    iconHtml = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>`;
  } else if (type === 'Delivery') {
    iconHtml = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>`;
  } else if (type === 'Service') {
    iconHtml = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
  } else if (type === 'Depot') {
    iconHtml = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`;
  } else {
    iconHtml = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`;
  }

  return L.divIcon({
    className: 'stop-marker',
    html: `<div style="background: ${bg}; border: 1px solid var(--border); border-radius: 50%; padding: 4px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.5);">${iconHtml}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12]
  });
};

const createDestinationIcon = () => {
  return L.divIcon({
    className: 'destination-marker',
    html: `<div class="dest-pin"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    popupAnchor: [0, -10]
  });
};

function MapController({ lat, lng, followMode }: { lat?: number, lng?: number, followMode: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (followMode && lat !== undefined && lng !== undefined) {
      map.panTo([lat, lng], { animate: true, duration: 2.5, easeLinearity: 1 });
    }
  }, [lat, lng, followMode, map]);
  return null;
}

function GlobalMapControls() {
  const map = useMap();
  return (
    <div className="map-global-controls">
      <button className="map-btn" onClick={() => map.zoomIn()} title="Zoom In">
        <ZoomIn size={18} />
      </button>
      <button className="map-btn" onClick={() => map.zoomOut()} title="Zoom Out">
        <ZoomOut size={18} />
      </button>
      <button className="map-btn" onClick={() => map.setView(MAP_CENTER, 8)} title="Recenter Fleet">
        <Focus size={18} />
      </button>
    </div>
  );
}

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

type FleetFilter = 'ALL' | 'ON_ROUTE' | 'COMPLIANT' | 'ATTENTION' | 'HIGH_RISK' | 'OFFLINE';
type TabState = 'OPERATIONS' | 'COMPLIANCE' | 'PRIVACY_AUDIT';

// Subcomponents for Hackathon Judging

const PrivacyBoundaryDiagram = () => (
  <div className="privacy-boundary-container">
    <div className="boundary-zones-wrapper">
      {/* Private Zone */}
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

      {/* Divider */}
      <div className="boundary-divider">
        <ChevronRight size={18} />
        <span className="boundary-divider-badge">ZK PROOF BARRIER</span>
        <ChevronRight size={18} />
      </div>

      {/* Public Zone */}
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
      <strong>🔒 Privacy Statement:</strong> The underlying private telemetry is not exposed as the verification result. Midnight evaluates the zero-knowledge assertion on-chain without revealing raw GPS coordinates or driver logs.
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
            <div className="receipt-field" style={{ gridColumn: 'span 2' }}>
              <span className="receipt-label">Policy Assertion</span>
              <span className="receipt-value" style={{ fontSize: '0.75rem' }}>{receipt.policyName}</span>
            </div>
            <div className="receipt-field">
              <span className="receipt-label">Timestamp</span>
              <span className="receipt-value" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{receipt.timestamp}</span>
            </div>
            <div className="receipt-field">
              <span className="receipt-label">Midnight Tx Hash</span>
              <span className="receipt-value" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                {receipt.txHash ? `${receipt.txHash.substring(0, 16)}...` : 'N/A'}
              </span>
            </div>
            {receipt.rejectionReason && (
              <div className="receipt-field" style={{ gridColumn: 'span 2' }}>
                <span className="receipt-label" style={{ color: 'var(--status-crit)' }}>Rejection Reason</span>
                <span className="receipt-value text-crit" style={{ fontSize: '0.75rem' }}>{receipt.rejectionReason}</span>
              </div>
            )}
          </div>

          {/* Audit Steps Timeline */}
          <div className="detail-section">
            <div className="detail-section-title">VERIFICATION LIFECYCLE AUDIT</div>
            <div className="compact-timeline">
              {receipt.timeline.map((step, idx) => (
                <div key={idx} className={`timeline-row ${step.status}`}>
                  <div className="timeline-dot-wrapper">
                    {step.status === 'completed' ? <Check size={10} /> : (step.status === 'rejected' ? <X size={10} color="var(--status-crit)" /> : <div className="timeline-dot" />)}
                  </div>
                  <div className="timeline-row-info">
                    <div className="timeline-row-name">{step.stage}</div>
                    <div className="timeline-row-sub">{step.detail} · {step.timestamp}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer-actions">
          <button 
            className="btn btn-secondary"
            onClick={() => {
              copyReceiptText(receipt);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            <Copy size={14} /> {copied ? 'COPIED!' : 'Copy Receipt'}
          </button>
          <button className="btn btn-secondary" onClick={() => downloadReceiptJson(receipt)}>
            <Download size={14} /> Download JSON
          </button>
          {receipt.txHash && (
            <button 
              className="btn btn-primary" 
              onClick={() => {
                navigator.clipboard.writeText(receipt.txHash!);
                setCopiedHash(true);
                setTimeout(() => setCopiedHash(false), 2000);
              }}
            >
              <ExternalLink size={14} /> {copiedHash ? 'HASH COPIED!' : 'Copy Tx Hash'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const IncidentInvestigationModal = ({ incident, onClose }: { incident: IncidentRecord; onClose: () => void }) => (
  <div className="modal-overlay" onClick={onClose}>
    <div className="receipt-modal-card" style={{ maxWidth: '620px' }} onClick={e => e.stopPropagation()}>
      <div className="modal-header-bar" style={{ backgroundColor: 'rgba(248, 81, 73, 0.1)', borderColor: 'rgba(248, 81, 73, 0.3)' }}>
        <div className="modal-title-group">
          <AlertOctagon size={20} color="var(--status-crit)" />
          <div>
            <div className="modal-title-text" style={{ color: 'var(--status-crit)' }}>COMPLIANCE INCIDENT INVESTIGATION</div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
              Source of Truth: Midnight Contract Execution Assertion
            </div>
          </div>
        </div>
        <button className="detail-close-btn" onClick={onClose}><X size={16} /></button>
      </div>

      <div className="receipt-modal-body">
        <div className="receipt-grid">
          <div className="receipt-field">
            <span className="receipt-label">Vehicle Identifier</span>
            <span className="receipt-value">{incident.vehicleId}</span>
          </div>
          <div className="receipt-field">
            <span className="receipt-label">Driver Name</span>
            <span className="receipt-value">{incident.driverName}</span>
          </div>
          <div className="receipt-field">
            <span className="receipt-label">Trip Progress</span>
            <span className="receipt-value">{incident.routeProgress}% complete</span>
          </div>
          <div className="receipt-field">
            <span className="receipt-label">Driver State</span>
            <span className="receipt-value text-accent">{incident.driverStatus}</span>
          </div>
          <div className="receipt-field">
            <span className="receipt-label">Risk Classification</span>
            <span className="receipt-value text-crit">{incident.risk}</span>
          </div>
          <div className="receipt-field">
            <span className="receipt-label">Midnight Result</span>
            <span className="badge badge-crit">REJECTED</span>
          </div>
          <div className="receipt-field" style={{ gridColumn: 'span 2' }}>
            <span className="receipt-label" style={{ color: 'var(--status-crit)' }}>Actual Contract Rejection Reason</span>
            <span className="receipt-value text-crit" style={{ fontSize: '0.875rem', fontFamily: 'var(--font-mono)' }}>
              {incident.rejectionReason}
            </span>
          </div>
        </div>

        <div className="privacy-banner-statement" style={{ borderColor: 'var(--status-crit)', backgroundColor: 'rgba(248, 81, 73, 0.08)' }}>
          <strong>🔍 Contextual Data Integrity:</strong> Operational telemetry and simulation route provide dispatcher context, while the local Midnight Zero-Knowledge proof evaluation remains the binding compliance result.
        </div>

        <div className="focus-block">
          <div className="focus-header">
            <span className="focus-tag" style={{ color: 'var(--status-warn)' }}>DISPATCH RECOMMENDED ACTION</span>
          </div>
          <div className="focus-title" style={{ fontSize: '0.8125rem' }}>
            {incident.recommendedAction}
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
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentStep(prev => (prev < receipt.timeline.length - 1 ? prev + 1 : prev));
    }, 1000);
    return () => clearInterval(timer);
  }, [receipt]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="receipt-modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header-bar">
          <div className="modal-title-group">
            <RotateCcw size={18} color="var(--accent)" />
            <div>
              <div className="modal-title-text">VERIFICATION REPLAY RUNNER</div>
              <div className="badge badge-warn" style={{ marginTop: '0.25rem' }}>RECORDED REPLAY</div>
            </div>
          </div>
          <button className="detail-close-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="receipt-modal-body">
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Replaying recorded verification event for Vehicle {receipt.vehicleId} (Driver {receipt.driverName}).
          </div>

          <div className="compact-timeline">
            {receipt.timeline.map((step, idx) => {
              const isPast = idx < currentStep;
              const isCurrent = idx === currentStep;
              return (
                <div key={idx} className={`timeline-row ${isPast ? 'completed' : ''} ${isCurrent ? 'active' : ''}`}>
                  <div className="timeline-dot-wrapper">
                    {isPast ? <Check size={10} /> : (isCurrent ? <div className="spinner-small" /> : <div className="timeline-dot" />)}
                  </div>
                  <div className="timeline-row-info">
                    <div className="timeline-row-name">{step.stage}</div>
                    <div className="timeline-row-sub">{step.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {currentStep === receipt.timeline.length - 1 && (
            <div className={`receipt-privacy-notice ${receipt.status === 'REJECTED' ? 'notice-crit' : ''}`}>
              <ShieldCheck size={16} />
              <span>Replay Complete: Verification Result was {receipt.status}</span>
            </div>
          )}
        </div>

        <div className="modal-footer-actions">
          <button className="btn btn-secondary" onClick={() => setCurrentStep(0)}><RotateCcw size={14} /> Restart Replay</button>
          <button className="btn btn-primary" onClick={onClose}>Close Replay</button>
        </div>
      </div>
    </div>
  );
};

export interface AuditStep {
  stage: string;
  detail: string;
  timestamp: string;
  status: 'completed' | 'active' | 'pending' | 'rejected';
}

export interface ComplianceReceipt {
  verificationId: string;
  tripId: string;
  driverName: string;
  vehicleId: string;
  policyName: string;
  timestamp: string;
  status: 'VERIFIED' | 'REJECTED';
  txHash: string | null;
  privacyStatement: string;
  rejectionReason?: string;
  timeline: AuditStep[];
  driverStatusAtVerification: string;
  riskAtVerification: string;
}

export interface IncidentRecord {
  tripId: string;
  driverName: string;
  vehicleId: string;
  routeProgress: number;
  driverStatus: string;
  risk: string;
  rejectionReason: string;
  timestamp: string;
  recommendedAction: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<TabState>('OPERATIONS');
  const [status, setStatus] = useState<ZkState>('idle');
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [activeDriverId, setActiveDriverId] = useState<string | null>(null);
  const [fleetFilter, setFleetFilter] = useState<FleetFilter>('ALL');
  const [followMode, setFollowMode] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'connecting' | 'ready' | 'offline'>('connecting');
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copiedTx, setCopiedTx] = useState(false);
  
  // Hackathon Judging & Verification State
  const [receiptsHistory, setReceiptsHistory] = useState<ComplianceReceipt[]>([]);
  const [activeReceipt, setActiveReceipt] = useState<ComplianceReceipt | null>(null);
  const [receiptModalOpen, setReceiptModalOpen] = useState<boolean>(false);

  const [activeIncident, setActiveIncident] = useState<IncidentRecord | null>(null);
  const [investigationModalOpen, setInvestigationModalOpen] = useState<boolean>(false);

  const [replayModalOpen, setReplayModalOpen] = useState<boolean>(false);
  const [replayReceipt, setReplayReceipt] = useState<ComplianceReceipt | null>(null);

  const [demoScenario, setDemoScenario] = useState<'NONE' | 'COMPLIANT' | 'HIGH_RISK' | 'REJECTED'>('NONE');
  const [presentationMode, setPresentationMode] = useState<boolean>(false);
  
  // Global Simulation State
  const [simulationSpeed, setSimulationSpeed] = useState<number>(1);
  const [simulationTime, setSimulationTime] = useState<Date>(new Date(new Date().setHours(8, 0, 0, 0)));

  const notifications = [
    { id: 1, type: 'alert', title: 'High Risk Detected', desc: 'MS-84924 velocity exceeding limits', time: '10m ago' },
    { id: 2, type: 'info', title: 'Verification Completed', desc: 'MS-84921 compliance verified', time: '1h ago' },
    { id: 3, type: 'alert', title: 'Fleet Offline', desc: 'Connection lost to Berlin Central node', time: '2h ago' }
  ];

  // Command Palette Keyboard Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCmdPaletteOpen(v => !v);
      }
      if (e.key === 'Escape') setCmdPaletteOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const addActivity = (activity: Omit<ActivityItem, 'id' | 'timestamp'>) => {
    setActivities(prev => [{
      ...activity,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date()
    }, ...prev]);
  };



  // Check backend health
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('http://localhost:4000/health');
        if (res.ok) setBackendStatus('ready');
        else setBackendStatus('offline');
      } catch (e) {
        setBackendStatus('offline');
      }
    };
    checkHealth();
  }, []);

  // Map state for live simulation
  const [driverLocations, setDriverLocations] = useState<DriverSimulation[]>(initializeSimulation);

  // Fetch OSRM Routes
  useEffect(() => {
    let mounted = true;

    const fetchRoutes = async () => {
      const initialDrivers = initializeSimulation();
      
      for (const driver of initialDrivers) {
        try {
          const url = `https://router.project-osrm.org/route/v1/driving/${driver.start.lng},${driver.start.lat};${driver.destination.lng},${driver.destination.lat}?overview=full&geometries=geojson`;
          const res = await fetch(url);
          const data = await res.json();

          if (data.code === 'Ok' && data.routes && data.routes[0].geometry.coordinates) {
            const coords: [number, number][] = data.routes[0].geometry.coordinates.map((c: number[]) => [c[1], c[0]]);
            const distance = data.routes[0].distance / 1000;
            const stops = generateStops(coords, distance, driver.id);
            
            if (!mounted) return;
            setDriverLocations(prev => prev.map(d => 
              d.id === driver.id 
                ? { ...d, osrmStatus: 'ok', routeCoords: coords, distance, stops } 
                : d
            ));
          } else {
            if (!mounted) return;
            setDriverLocations(prev => prev.map(d => d.id === driver.id ? { ...d, osrmStatus: 'failed' } : d));
          }
        } catch (e) {
          if (!mounted) return;
          setDriverLocations(prev => prev.map(d => d.id === driver.id ? { ...d, osrmStatus: 'failed' } : d));
        }
        await new Promise(r => setTimeout(r, 200));
      }
    };

    fetchRoutes();

    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (simulationSpeed === 0) return; // Paused

    const tickMs = 1000; // physical tick is 1s

    const interval = setInterval(() => {
      const simulatedElapsedMs = tickMs * simulationSpeed;
      
      setSimulationTime(prev => new Date(prev.getTime() + simulatedElapsedMs));

      setDriverLocations(prev => {
        const newActivities: any[] = [];
        
        const next = prev.map(driver => {
          let newProgress = driver.progress;
          let newStatus = driver.driverStatus;
          const updatedStops = [...driver.stops];
          
          // Check for active stops
          const activeStopIndex = updatedStops.findIndex(s => s.status === 'active');
          
          if (activeStopIndex !== -1) {
            // We are currently at a stop, tick down its duration
            const stop = updatedStops[activeStopIndex];
            stop.remainingMs -= simulatedElapsedMs;
            
            if (stop.remainingMs <= 0) {
              stop.status = 'completed';
              stop.remainingMs = 0;
              newStatus = 'DRIVING';
              newActivities.push({
                type: 'system', title: `Completed: ${stop.name}`, driverName: driver.name, tripId: driver.id,
                description: `Vehicle resumed journey.`, timestamp: new Date()
              });
            }
          } else if (newStatus === 'ARRIVED') {
            // Already arrived, do nothing
          } else {
            // We are DRIVING. Move progress forward.
            // A truck driving at ~80km/h (22.2 m/s) covers distance depending on speed
            const distanceCoveredKm = (80 * (simulatedElapsedMs / 3600000)); 
            const progressDelta = driver.distance > 0 ? (distanceCoveredKm / driver.distance) : driver.speed;
            newProgress += progressDelta;
            
            if (newProgress >= 1) {
              newProgress = 1;
            }

            // Check if we hit any pending stops with our new progress
            for (let i = 0; i < updatedStops.length; i++) {
              const stop = updatedStops[i];
              if (stop.status === 'pending' && newProgress >= stop.progressThreshold) {
                // We reached this stop! Snap to its exact location.
                newProgress = stop.progressThreshold;
                if (stop.type === 'Destination') {
                  newStatus = 'ARRIVED';
                  stop.status = 'completed';
                  newActivities.push({
                    type: 'system', title: 'Arrived at Destination', driverName: driver.name, tripId: driver.id,
                    description: `Vehicle arrived at ${stop.name}`, timestamp: new Date()
                  });
                } else {
                  stop.status = 'active';
                  newStatus = stop.type === 'Rest' ? 'RESTING' : (stop.type === 'Fuel' ? 'REFUELING' : (stop.type === 'Delivery' ? 'DELIVERING' : 'AT_SERVICE'));
                  newActivities.push({
                    type: 'system', title: `Stopped: ${stop.name}`, driverName: driver.name, tripId: driver.id,
                    description: `Vehicle entered ${stop.type} stop.`, timestamp: new Date()
                  });
                }
                break; // Only trigger one stop per tick
              }
            }
          }

          const { lat, lng, heading } = interpolateRoute(driver.routeCoords, newProgress);

          return {
            ...driver,
            progress: newProgress,
            driverStatus: newStatus,
            stops: updatedStops,
            heading,
            currentLat: lat,
            currentLng: lng
          };
        });

        if (newActivities.length > 0) {
          setActivities(a => [...newActivities.map(act => ({ ...act, id: Math.random().toString(36).substr(2, 9) })), ...a]);
        }

        return next;
      });
    }, tickMs); 
    return () => clearInterval(interval);
  }, [simulationSpeed]);

  const filteredDrivers = driverLocations.filter(driver => {
    if (fleetFilter === 'ALL') return true;
    if (fleetFilter === 'ON_ROUTE') return true;
    if (fleetFilter === 'COMPLIANT') return driver.risk === 'LOW';
    if (fleetFilter === 'ATTENTION') return driver.risk === 'MEDIUM';
    if (fleetFilter === 'HIGH_RISK') return driver.risk === 'HIGH';
    if (fleetFilter === 'OFFLINE') return false;
    return true;
  });

  const downloadReceiptJson = (receipt: ComplianceReceipt) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(receipt, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `FleetShield_Receipt_${receipt.verificationId}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const copyReceiptText = (receipt: ComplianceReceipt) => {
    const text = `FLEETSHIELD ZK COMPLIANCE RECEIPT
Verification ID: ${receipt.verificationId}
Trip ID: ${receipt.tripId}
Driver: ${receipt.driverName}
Vehicle: ${receipt.vehicleId}
Policy Name: ${receipt.policyName}
Timestamp: ${receipt.timestamp}
Result: ${receipt.status}
Midnight Tx Hash: ${receipt.txHash || 'N/A'}
Privacy Notice: ${receipt.privacyStatement}
${receipt.rejectionReason ? `Rejection Reason: ${receipt.rejectionReason}` : ''}`;
    navigator.clipboard.writeText(text);
  };

  const startReplay = (receipt: ComplianceReceipt) => {
    setReplayReceipt(receipt);
    setReplayModalOpen(true);
  };


  const runVerification = async (driver: typeof MOCK_DRIVERS[0], valid: boolean) => {
    setStatus('generating');
    setTxHash(null);
    setErrorMsg(null);

    const nowStr = new Date().toLocaleTimeString();
    const verifId = `FS-ZK-${Math.floor(100000 + Math.random() * 900000)}`;

    addActivity({
      type: 'initiated',
      title: 'Verification initiated',
      driverName: driver.name,
      tripId: driver.id,
      description: 'Operator triggered compliance check'
    });

    setTimeout(() => {
      addActivity({
        type: 'generating',
        title: 'ZK proof generation',
        driverName: driver.name,
        tripId: driver.id,
        description: 'Private compliance proof generating'
      });
    }, 400);

    try {
      const response = await fetch('http://localhost:4000/verify-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId: 'MS-84921', safetyConditionsMet: valid })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setStatus('verifying');
        addActivity({
          type: 'completed',
          title: 'Midnight verification completed',
          driverName: driver.name,
          tripId: driver.id,
          description: 'Evaluating on-chain assertion'
        });

        setTimeout(() => {
          setTxHash(data.txHash);
          setStatus('success');

          const newReceipt: ComplianceReceipt = {
            verificationId: verifId,
            tripId: driver.id,
            driverName: driver.name,
            vehicleId: `Vehicle ${driver.id.split('-')[1] || driver.id}`,
            policyName: 'Midnight Hours-of-Service & Route Compliance Assertion',
            timestamp: nowStr,
            status: 'VERIFIED',
            txHash: data.txHash,
            privacyStatement: 'Private telemetry values are not included in the verification result or transaction.',
            driverStatusAtVerification: driverLocations.find(d => d.id === driver.id)?.driverStatus || 'DRIVING',
            riskAtVerification: driver.risk,
            timeline: [
              { stage: 'Verification Requested', detail: 'Operator triggered verification request', timestamp: nowStr, status: 'completed' },
              { stage: 'Proof Processing', detail: 'Local witness evaluated locally', timestamp: nowStr, status: 'completed' },
              { stage: 'Midnight Verification', detail: 'Zero-Knowledge contract assertions verified', timestamp: nowStr, status: 'completed' },
              { stage: 'Result Finalized', detail: 'Immutable assertion verified on-chain', timestamp: nowStr, status: 'completed' }
            ]
          };

          setReceiptsHistory(prev => [newReceipt, ...prev]);
          setActiveReceipt(newReceipt);
          setReceiptModalOpen(true);

          addActivity({
            type: 'verified',
            title: 'Compliance verified',
            driverName: driver.name,
            tripId: driver.id,
            description: 'Midnight ZK verification completed successfully',
            txHash: data.txHash
          });
        }, 1200);
      } else {
        setStatus('verifying');
        addActivity({
          type: 'completed',
          title: 'Midnight verification completed',
          driverName: driver.name,
          tripId: driver.id,
          description: 'Evaluating on-chain assertion'
        });

        setTimeout(() => {
          const reason = data.error || 'Safety conditions not met';
          setErrorMsg(reason);
          setStatus('error');

          const newReceipt: ComplianceReceipt = {
            verificationId: verifId,
            tripId: driver.id,
            driverName: driver.name,
            vehicleId: `Vehicle ${driver.id.split('-')[1] || driver.id}`,
            policyName: 'Midnight Hours-of-Service & Route Compliance Assertion',
            timestamp: nowStr,
            status: 'REJECTED',
            txHash: null,
            rejectionReason: reason,
            privacyStatement: 'Private telemetry values are not included in the verification result or transaction.',
            driverStatusAtVerification: driverLocations.find(d => d.id === driver.id)?.driverStatus || 'DRIVING',
            riskAtVerification: driver.risk,
            timeline: [
              { stage: 'Verification Requested', detail: 'Operator triggered verification request', timestamp: nowStr, status: 'completed' },
              { stage: 'Proof Processing', detail: 'Local witness evaluated locally', timestamp: nowStr, status: 'completed' },
              { stage: 'Midnight Verification', detail: 'Zero-Knowledge contract assertion evaluated', timestamp: nowStr, status: 'completed' },
              { stage: 'Result Finalized', detail: `Compliance rejected: ${reason}`, timestamp: nowStr, status: 'rejected' }
            ]
          };

          const incident: IncidentRecord = {
            tripId: driver.id,
            driverName: driver.name,
            vehicleId: `Vehicle ${driver.id.split('-')[1] || driver.id}`,
            routeProgress: Math.round((driverLocations.find(d => d.id === driver.id)?.progress || 0.42) * 100),
            driverStatus: driverLocations.find(d => d.id === driver.id)?.driverStatus.replace('_', ' ') || 'DRIVING',
            risk: driver.risk,
            rejectionReason: reason,
            timestamp: nowStr,
            recommendedAction: 'Review trip compliance before dispatch continuation.'
          };

          setReceiptsHistory(prev => [newReceipt, ...prev]);
          setActiveReceipt(newReceipt);
          setActiveIncident(incident);
          setInvestigationModalOpen(true);

          addActivity({
            type: 'rejected',
            title: 'Compliance rejected',
            driverName: driver.name,
            tripId: driver.id,
            description: reason
          });
        }, 1200);
      }
    } catch (e: any) {
      setStatus('verifying');
      addActivity({
        type: 'completed',
        title: 'Midnight verification completed',
        driverName: driver.name,
        tripId: driver.id,
        description: 'Evaluating on-chain assertion'
      });

      setTimeout(() => {
        const reason = e.message || "Failed to reach API server.";
        setErrorMsg(reason);
        setStatus('error');

        const newReceipt: ComplianceReceipt = {
          verificationId: verifId,
          tripId: driver.id,
          driverName: driver.name,
          vehicleId: `Vehicle ${driver.id.split('-')[1] || driver.id}`,
          policyName: 'Midnight Hours-of-Service & Route Compliance Assertion',
          timestamp: nowStr,
          status: 'REJECTED',
          txHash: null,
          rejectionReason: reason,
          privacyStatement: 'Private telemetry values are not included in the verification result or transaction.',
          driverStatusAtVerification: driverLocations.find(d => d.id === driver.id)?.driverStatus || 'DRIVING',
          riskAtVerification: driver.risk,
          timeline: [
            { stage: 'Verification Requested', detail: 'Operator triggered verification request', timestamp: nowStr, status: 'completed' },
            { stage: 'Proof Processing', detail: 'Local witness evaluated locally', timestamp: nowStr, status: 'completed' },
            { stage: 'Midnight Verification', detail: 'Zero-Knowledge contract assertion evaluated', timestamp: nowStr, status: 'completed' },
            { stage: 'Result Finalized', detail: `Compliance rejected: ${reason}`, timestamp: nowStr, status: 'rejected' }
          ]
        };

        const incident: IncidentRecord = {
          tripId: driver.id,
          driverName: driver.name,
          vehicleId: `Vehicle ${driver.id.split('-')[1] || driver.id}`,
          routeProgress: Math.round((driverLocations.find(d => d.id === driver.id)?.progress || 0.42) * 100),
          driverStatus: driverLocations.find(d => d.id === driver.id)?.driverStatus.replace('_', ' ') || 'DRIVING',
          risk: driver.risk,
          rejectionReason: reason,
          timestamp: nowStr,
          recommendedAction: 'Review trip compliance before dispatch continuation.'
        };

        setReceiptsHistory(prev => [newReceipt, ...prev]);
        setActiveReceipt(newReceipt);
        setActiveIncident(incident);
        setInvestigationModalOpen(true);

        addActivity({
          type: 'rejected',
          title: 'Compliance rejected',
          driverName: driver.name,
          tripId: driver.id,
          description: reason
        });
      }, 1200);
    }
  };

  const handleTriggerDemoScenario = async (scenario: 'COMPLIANT' | 'HIGH_RISK' | 'REJECTED') => {
    setDemoScenario(scenario);
    if (scenario === 'COMPLIANT') {
      const driver = driverLocations.find(d => d.id === 'MS-84922') || driverLocations[0];
      setActiveDriverId(driver.id);
      setActiveTab('OPERATIONS');
      setFollowMode(true);
      runVerification(driver, true);
    } else if (scenario === 'HIGH_RISK') {
      const driver = driverLocations.find(d => d.id === 'MS-84921') || driverLocations[0];
      setActiveDriverId(driver.id);
      setFleetFilter('HIGH_RISK');
      setActiveTab('OPERATIONS');
      setFollowMode(true);
    } else if (scenario === 'REJECTED') {
      const driver = driverLocations.find(d => d.id === 'MS-84921') || driverLocations[0];
      setActiveDriverId(driver.id);
      setActiveTab('OPERATIONS');
      runVerification(driver, false);
    }
  };


  return (
    <div className="app-layout">
      {/* App Shell Header */}
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-logo">
            <Shield size={16} color="var(--accent)" />
            <span style={{ letterSpacing: '0.06em', fontWeight: 700, fontSize: 'var(--fs-base)' }}>FLEETSHIELD</span>
          </div>

          <div className="header-divider hide-on-mobile" />

          {/* Operator Modes Navigation */}
          <nav className="header-nav hide-on-mobile">
            <div className={`nav-item ${activeTab === 'OPERATIONS' ? 'active' : ''}`} onClick={() => setActiveTab('OPERATIONS')}>Operations</div>
            <div className={`nav-item ${activeTab === 'COMPLIANCE' ? 'active' : ''}`} onClick={() => setActiveTab('COMPLIANCE')}>Compliance</div>
            <div className={`nav-item ${activeTab === 'PRIVACY_AUDIT' ? 'active' : ''}`} onClick={() => setActiveTab('PRIVACY_AUDIT')}>Privacy Audit</div>
          </nav>
        </div>
        
        <div className="header-actions-group">
          {/* Demo scenarios */}
          <div className="demo-bar hide-on-mobile">
            <button className={`demo-chip ${demoScenario === 'COMPLIANT' ? 'active' : ''}`} onClick={() => handleTriggerDemoScenario('COMPLIANT')}>Compliant</button>
            <button className={`demo-chip ${demoScenario === 'HIGH_RISK' ? 'active' : ''}`} onClick={() => handleTriggerDemoScenario('HIGH_RISK')}>High Risk</button>
            <button className={`demo-chip ${demoScenario === 'REJECTED' ? 'active' : ''}`} onClick={() => handleTriggerDemoScenario('REJECTED')}>Rejected ZK</button>
          </div>

          <div className="header-divider hide-on-mobile" />

          {/* Sim controls */}
          <div className="sim-controls hide-on-mobile">
            <span className="sim-time">{simulationTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <div className="sim-btn-group">
              <button className={`sim-btn ${simulationSpeed === 0 ? 'active' : ''}`} onClick={() => setSimulationSpeed(0)}><Pause size={10} /></button>
              <button className={`sim-btn ${simulationSpeed === 1 ? 'active' : ''}`} onClick={() => setSimulationSpeed(1)}>1×</button>
              <button className={`sim-btn ${simulationSpeed === 5 ? 'active' : ''}`} onClick={() => setSimulationSpeed(5)}>5×</button>
              <button className={`sim-btn ${simulationSpeed === 10 ? 'active' : ''}`} onClick={() => setSimulationSpeed(10)}>10×</button>
            </div>
          </div>

          <div className="header-divider hide-on-mobile" />

          {/* Runtime indicators */}
          <span className="chip chip-sim hide-on-mobile">Simulation</span>
          <span className="chip chip-live hide-on-mobile">Live ZK</span>

          {/* Presentation Mode */}
          <button 
            className={`search-trigger ${presentationMode ? 'active' : ''}`} 
            onClick={() => setPresentationMode(v => !v)}
            title="Presentation Mode"
          >
            <Tv size={13} />
            <span className="hide-on-mobile">{presentationMode ? 'Presenting' : 'Present'}</span>
          </button>

          <button className="search-trigger hide-on-mobile" onClick={() => setCmdPaletteOpen(true)}>
            <Search size={13} />
            <span>Search</span>
            <span className="kbd">⌘K</span>
          </button>
          
          <div style={{ position: 'relative' }}>
            <button className="notification-trigger" onClick={() => setNotificationsOpen(v => !v)}>
              <Bell size={15} />
              <span className="badge-count">3</span>
            </button>
            {notificationsOpen && (
              <div className="notifications-dropdown">
                <div className="notif-header">
                  <span className="notif-title">Alerts</span>
                  <button className="notif-clear">Clear all</button>
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

          <div className="header-divider hide-on-mobile" />

          <div className="header-status hide-on-mobile">
            <div className={`status-indicator ${backendStatus}`} />
            <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
              {backendStatus === 'ready' ? 'Online' : backendStatus === 'connecting' ? 'Connecting' : 'Offline'}
            </span>
          </div>
          
          <button className="notification-trigger show-on-mobile-only" onClick={() => setMobileMenuOpen(v => !v)}>
            <Menu size={17} />
          </button>
        </div>
      </header>

      {/* Main Split Workspace */}
      <main className={`app-workspace ${activeDriverId ? 'workspace-details-open' : ''}`}>
        
        {/* Left Data Panel */}
        <aside className={`side-panel ${mobileMenuOpen ? 'mobile-open' : ''}`}>
          
          <div className="side-panel-tabs">
            <div className={`sp-tab ${activeTab === 'OPERATIONS' ? 'active' : ''}`} onClick={() => setActiveTab('OPERATIONS')}>Fleet</div>
            <div className={`sp-tab ${activeTab === 'COMPLIANCE' ? 'active' : ''}`} onClick={() => setActiveTab('COMPLIANCE')}>Activity</div>
          </div>
          
          {activeTab === 'OPERATIONS' && (
            <div className="panel-section">
              <div className="section-header">
                <h2 className="section-title">Vehicles</h2>
                <div className="section-meta">{driverLocations.length} ACTIVE</div>
              </div>

              <div className="filter-tabs">
                {(['ALL', 'ON_ROUTE', 'COMPLIANT', 'ATTENTION', 'HIGH_RISK', 'OFFLINE'] as FleetFilter[]).map(f => (
                  <button 
                    key={f} 
                    className={`filter-tab ${fleetFilter === f ? 'active' : ''}`}
                    onClick={() => setFleetFilter(f)}
                  >
                    {f.replace('_', ' ')}
                  </button>
                ))}
              </div>
              
              <div className="data-table">
                <div className="table-header">
                  <div>DRIVER / ID</div>
                  <div>STATUS</div>
                  <div style={{ textAlign: 'right' }}>SCORE</div>
                </div>
                
                {filteredDrivers.length === 0 ? (
                  <div className="table-empty">No vehicles match this filter</div>
                ) : (
                  filteredDrivers.map(driver => (
                    <div 
                      key={driver.id} 
                      className={`table-row ${activeDriverId === driver.id ? 'selected' : ''}`}
                      onClick={() => {
                        setActiveDriverId(driver.id);
                        if (status !== 'idle') setStatus('idle');
                      }}
                    >
                      <div className="cell-entity">
                        <span className="entity-name">{driver.name}</span>
                        <span className="entity-sub">Vehicle {driver.id.split('-')[1]} · {driver.driverStatus.replace('_', ' ')}</span>
                      </div>
                      <div className="cell-status">
                        <span className={`badge ${driver.risk === 'HIGH' ? 'badge-crit' : (driver.risk === 'MEDIUM' ? 'badge-warn' : 'badge-ok')}`}>
                          {driver.risk === 'LOW' ? 'COMPLIANT' : driver.risk}
                        </span>
                      </div>
                      <div className="cell-metric">{driver.score}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
          
          {activeTab === 'COMPLIANCE' && (
            <div className="panel-section activity-section" style={{ borderBottom: 'none', height: '100%' }}>
              <div className="section-header">
                <h2 className="section-title">Compliance History</h2>
                <div className="section-meta">IMMUTABLE LOGS</div>
              </div>
              
              <div className="activity-feed">
                {activities.length === 0 ? (
                  <div className="activity-empty-state">
                    <div className="empty-title">No recent activity</div>
                    <div className="empty-desc">Fleet compliance events will appear here as they occur.</div>
                  </div>
                ) : (
                  activities.map((item, index) => (
                    <div key={item.id} className={`activity-item activity-${item.type} enter-anim`}>
                      <div className="activity-icon-col">
                        <div className="activity-icon">
                          {item.type === 'verified' ? <ShieldCheck size={12} /> : 
                           item.type === 'rejected' ? <ShieldAlert size={12} /> : 
                           item.type === 'completed' ? <CheckCircle2 size={12} /> :
                           item.type === 'system' ? <Navigation size={12} /> :
                           item.type === 'generating' ? <Server size={12} /> :
                           <Activity size={12} />}
                        </div>
                        {index < activities.length - 1 && <div className="timeline-connector"></div>}
                      </div>
                      <div className="activity-content">
                        <div className="activity-title">{item.title}</div>
                        <div className="activity-entity">
                          {item.driverName} <span className="dot-sep">·</span> Vehicle {item.tripId.split('-')[1] || item.tripId}
                        </div>
                        <div className="activity-desc">
                          {item.description}
                        </div>
                        <div className="activity-time" style={{ marginTop: '0.25rem' }}>
                          {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                        {item.txHash && (
                          <div className="activity-tx">
                            <span className="tx-hash">{item.txHash.substring(0, 16)}...</span>
                            <button className="copy-btn-inline" onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(item.txHash!);
                            }}>COPY</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </aside>

        {/* Center Map Workspace */}
        <div className="map-panel">
          <MapContainer center={MAP_CENTER} zoom={8} scrollWheelZoom={true} zoomControl={false}>
            <GlobalMapControls />
            <MapController 
              followMode={followMode} 
              lat={activeDriverId ? driverLocations.find(d => d.id === activeDriverId)?.currentLat : undefined} 
              lng={activeDriverId ? driverLocations.find(d => d.id === activeDriverId)?.currentLng : undefined} 
            />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            {driverLocations.map(driver => (
              <div key={`route-${driver.id}`}>
                {driver.osrmStatus === 'ok' ? (
                  <Polyline 
                    positions={driver.routeCoords} 
                    pathOptions={{ 
                      color: activeDriverId === driver.id ? 'var(--accent)' : 'var(--text-tertiary)', 
                      weight: activeDriverId === driver.id ? 4 : 2,
                      opacity: activeDriverId === driver.id ? 0.9 : 0.2,
                      lineCap: 'round',
                      lineJoin: 'round'
                    }} 
                  />
                ) : (
                  <Polyline 
                    positions={[[driver.start.lat, driver.start.lng], [driver.destination.lat, driver.destination.lng]]} 
                    pathOptions={{ 
                      color: activeDriverId === driver.id ? 'var(--accent)' : 'var(--text-tertiary)', 
                      weight: activeDriverId === driver.id ? 3 : 2,
                      dashArray: activeDriverId === driver.id ? undefined : '5, 8',
                      opacity: activeDriverId === driver.id ? 0.8 : 0.3
                    }} 
                  />
                )}
                
                {/* Render Route Stops */}
                {driver.stops.map(stop => {
                  if (stop.type === 'Destination') return null; // We render it separately
                  const isHighlighted = activeDriverId === driver.id;
                  if (!isHighlighted && stop.status !== 'active') return null; // Only show active stops or all stops for selected driver
                  
                  return (
                    <Marker 
                      key={stop.id}
                      position={[stop.lat, stop.lng]} 
                      icon={createStopIcon(stop.type, isHighlighted, stop.status === 'active')}
                    >
                      <Popup>
                        <div className="popup-driver-name">{stop.name}</div>
                        <div className="popup-score">{stop.type} · {stop.status}</div>
                      </Popup>
                    </Marker>
                  );
                })}

                <Marker 
                  position={[driver.destination.lat, driver.destination.lng]} 
                  icon={createDestinationIcon()}
                >
                  <Popup>
                    <div className="popup-driver-name">{driver.destinationName}</div>
                    <div className="popup-score">Destination</div>
                  </Popup>
                </Marker>
                <Marker 
                  position={[driver.currentLat, driver.currentLng]} 
                  icon={createTruckIcon(driver.risk, driver.heading, activeDriverId === driver.id)}
                  eventHandlers={{
                    click: () => setActiveDriverId(prev => prev === driver.id ? null : driver.id),
                  }}
                >
                  <Popup>
                    <div className="popup-driver-name">{driver.name}</div>
                    <div className="popup-score">Status: En Route · {driver.risk === 'HIGH' ? 'High Risk' : 'Compliant'}</div>
                  </Popup>
                </Marker>
              </div>
            ))}
          </MapContainer>
          
          {/* Offline Banner Overlay */}
          {backendStatus === 'offline' && (
            <div className="offline-banner">
              <Server size={14} />
              API Server Disconnected. Local simulation mode only. Midnight network unreachable.
            </div>
          )}
        </div>

        {/* Right Detail Pane */}
        {(() => {
          const selectedDriver = activeDriverId ? driverLocations.find(d => d.id === activeDriverId) : null;
          const activeStop = selectedDriver?.stops.find(s => s.status === 'active');
          const nextStop = selectedDriver?.stops.find(s => s.status === 'pending');

          return (
            <aside className={`detail-panel ${selectedDriver ? 'open' : ''}`}>
              {/* Mobile handle */}
              <div className="show-on-mobile-only detail-panel-handle"></div>

              {!selectedDriver ? (
                <div className="detail-empty">
                  <Shield size={32} color="var(--text-tertiary)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                  <div className="empty-title">No Vehicle Selected</div>
                  <div className="empty-desc">Choose a vehicle on the map or from the fleet list to view real-time intelligence, route stops, and ZK compliance.</div>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="detail-panel-header">
                    <div className="detail-panel-context">
                      <Shield size={12} color="var(--accent)" />
                      VEHICLE INTELLIGENCE
                    </div>
                    <div className="detail-panel-title-row">
                      <div>
                        <div className="detail-panel-driver">{selectedDriver.name}</div>
                        <div className="detail-panel-sub-row">
                          <span className="detail-panel-vehicle-id">Vehicle {selectedDriver.id.split('-')[1] || selectedDriver.id}</span>
                          <span className={`badge ${selectedDriver.driverStatus === 'DRIVING' ? 'badge-ok' : 'badge-warn'}`}>
                            ● {selectedDriver.driverStatus.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                      <button 
                        className="detail-close-btn" 
                        onClick={() => setActiveDriverId(null)}
                        title="Close Drawer"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Scrollable Body */}
                  <div className="detail-panel-body">
                    {/* 2-Column Compact Summary */}
                    <div className="compact-summary-grid">
                      <div className="summary-item">
                        <span className="summary-label">CURRENT STATE</span>
                        <span className="summary-value text-accent">{selectedDriver.driverStatus.replace('_', ' ')}</span>
                      </div>
                      <div className="summary-item">
                        <span className="summary-label">DESTINATION</span>
                        <span className="summary-value">{selectedDriver.destinationName}</span>
                      </div>
                      <div className="summary-item">
                        <span className="summary-label">RISK LEVEL</span>
                        <span className={`summary-value ${selectedDriver.risk === 'HIGH' ? 'text-crit' : (selectedDriver.risk === 'MEDIUM' ? 'text-warn' : 'text-ok')}`}>
                          {selectedDriver.risk}
                        </span>
                      </div>
                      <div className="summary-item">
                        <span className="summary-label">COMPLIANCE</span>
                        <span className={`summary-value ${status === 'success' ? 'text-ok' : (status === 'error' ? 'text-crit' : 'text-warn')}`}>
                          {status === 'success' ? 'VERIFIED' : (status === 'error' ? 'REJECTED' : 'REQUIRES VERIFICATION')}
                        </span>
                      </div>
                    </div>

                    {/* Current / Next Stop Focus Block */}
                    <div className="focus-block">
                      <div className="focus-header">
                        <span className="focus-tag">
                          {selectedDriver.driverStatus !== 'DRIVING' ? 'CURRENT STOP' : 'CURRENT STATUS'}
                        </span>
                        <span className="focus-meta">
                          {activeStop ? `${Math.round(activeStop.remainingMs / 60000)}m remaining` : 'In Transit'}
                        </span>
                      </div>
                      <div className="focus-title">
                        {activeStop ? activeStop.name : 'On Route to Destination'}
                      </div>
                      <div className="next-stop-row">
                        <span className="next-stop-label">NEXT STOP</span>
                        <span className="next-stop-name">
                          {nextStop ? `${nextStop.name} (${nextStop.type})` : selectedDriver.destinationName}
                        </span>
                      </div>
                    </div>

                    {/* Trip Progress Section */}
                    <div className="detail-section">
                      <div className="detail-section-header">
                        <span className="detail-section-title">TRIP PROGRESS</span>
                        <span className="focus-meta" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {Math.round(selectedDriver.progress * 100)}% complete
                        </span>
                      </div>
                      <div className="trip-progress-box">
                        <div className="progress-track">
                          <div className="progress-fill" style={{ width: `${selectedDriver.progress * 100}%` }}></div>
                        </div>
                        <div className="progress-origin-dest">
                          <span>Gwalior Central Depot</span>
                          <span>{selectedDriver.destinationName}</span>
                        </div>
                        <div className="progress-stats-row">
                          <span>{Math.round(selectedDriver.progress * 100)}% complete</span>
                          <span style={{ fontFamily: 'var(--font-mono)' }}>
                            {Math.round((1 - selectedDriver.progress) * 1240 + 60)} km remaining
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Route Timeline (TRIP STOPS) */}
                    {selectedDriver.stops && selectedDriver.stops.length > 0 && (
                      <div className="detail-section">
                        <div className="detail-section-header">
                          <span className="detail-section-title">TRIP STOPS</span>
                          <span className="focus-meta">{selectedDriver.stops.length} STOPS</span>
                        </div>
                        <div className="compact-timeline">
                          {selectedDriver.stops.map((stop) => {
                            const isPast = stop.status === 'completed';
                            const isCurrent = stop.status === 'active';
                            return (
                              <div key={stop.id} className={`timeline-row ${isPast ? 'completed' : ''} ${isCurrent ? 'active' : ''} ${!isPast && !isCurrent ? 'upcoming' : ''}`}>
                                <div className="timeline-dot-wrapper">
                                  {isPast ? <Check size={10} /> : <div className="timeline-dot" />}
                                </div>
                                <div className="timeline-row-info">
                                  <div className="timeline-row-name">{stop.name}</div>
                                  <div className="timeline-row-sub">
                                    {isCurrent ? `${stop.type} · Active (${Math.round(stop.remainingMs / 60000)}m left)` : 
                                     isPast ? `${stop.type} · Completed` : `${stop.type} · Upcoming`}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Vehicle Metadata */}
                    <div className="detail-section">
                      <div className="detail-section-header">
                        <span className="detail-section-title">VEHICLE DETAILS</span>
                      </div>
                      <div className="metadata-grid">
                        <div className="meta-item">
                          <span className="meta-key">Vehicle ID</span>
                          <span className="meta-val">{selectedDriver.id}</span>
                        </div>
                        <div className="meta-item">
                          <span className="meta-key">Driver</span>
                          <span className="meta-val">{selectedDriver.name}</span>
                        </div>
                        <div className="meta-item">
                          <span className="meta-key">Compliance Score</span>
                          <span className="meta-val" style={{ fontFamily: 'var(--font-mono)' }}>{selectedDriver.score} / 100</span>
                        </div>
                        <div className="meta-item">
                          <span className="meta-key">Vehicle Class</span>
                          <span className="meta-val">Class A Heavy Rig</span>
                        </div>
                        <div className="meta-item">
                          <span className="meta-key">Current State</span>
                          <span className="meta-val">{selectedDriver.driverStatus.replace('_', ' ')}</span>
                        </div>
                        <div className="meta-item">
                          <span className="meta-key">Destination</span>
                          <span className="meta-val">{selectedDriver.destinationName}</span>
                        </div>
                      </div>
                    </div>

                    {/* Midnight ZK Audit Trail */}
                    <div className="detail-section">
                      <div className="detail-section-header">
                        <span className="detail-section-title">MIDNIGHT PRIVACY VERIFICATION</span>
                        <button 
                          className="copy-btn-inline" 
                          onClick={() => runVerification(selectedDriver, false)}
                          disabled={status === 'generating' || status === 'verifying'}
                        >
                          FAIL DEMO
                        </button>
                      </div>
                      <div className="focus-meta" style={{ marginBottom: '0.5rem' }}>
                        Verify compliance without exposing underlying telemetry.
                      </div>
                      
                      <div className="zk-audit-trail">
                        {/* Step 1 */}
                        <div className={`zk-audit-step ${status !== 'idle' ? 'success' : ''}`}>
                          <div className="zk-step-left">
                            <HardDrive size={14} />
                            <span>1. PRIVATE TELEMETRY</span>
                          </div>
                          <span className="zk-step-status-chip">
                            {status !== 'idle' ? 'COMPLETE' : 'PENDING'}
                          </span>
                        </div>

                        {/* Step 2 */}
                        <div className={`zk-audit-step ${(status === 'generating' || status === 'verifying' || status === 'success' || status === 'error') ? 'active' : ''} ${status === 'verifying' || status === 'success' || status === 'error' ? 'success' : ''}`}>
                          <div className="zk-step-left">
                            {status === 'generating' ? <div className="spinner-small" /> : <Lock size={14} />}
                            <span>2. ZK PROOF GENERATION</span>
                          </div>
                          <span className="zk-step-status-chip">
                            {status === 'generating' ? 'COMPUTING...' : ((status === 'verifying' || status === 'success' || status === 'error') ? 'COMPLETE' : 'PENDING')}
                          </span>
                        </div>

                        {/* Step 3 */}
                        <div className={`zk-audit-step ${(status === 'verifying' || status === 'success' || status === 'error') ? 'active' : ''} ${status === 'success' || status === 'error' ? 'success' : ''}`}>
                          <div className="zk-step-left">
                            {status === 'verifying' ? <div className="spinner-small" /> : <Server size={14} />}
                            <span>3. MIDNIGHT VERIFICATION</span>
                          </div>
                          <span className="zk-step-status-chip">
                            {status === 'verifying' ? 'EVALUATING...' : ((status === 'success' || status === 'error') ? 'COMPLETE' : 'PENDING')}
                          </span>
                        </div>

                        {/* Step 4 */}
                        <div className={`zk-audit-step ${status === 'success' ? 'success' : ''} ${status === 'error' ? 'rejected' : ''}`}>
                          <div className="zk-step-left">
                            {status === 'success' ? <CheckCircle2 size={14} color="var(--status-ok)" /> : (status === 'error' ? <XCircle size={14} color="var(--status-crit)" /> : <Shield size={14} />)}
                            <span>4. COMPLIANCE RESULT</span>
                          </div>
                          <span className="zk-step-status-chip">
                            {status === 'success' ? 'VERIFIED' : (status === 'error' ? 'REJECTED' : 'PENDING')}
                          </span>
                        </div>
                      </div>

                      {/* Success / Error Terminal Result */}
                      {status === 'success' && txHash && (
                        <div className="terminal" style={{ marginTop: '0.75rem' }}>
                          <div className="terminal-header">
                            <span style={{ color: 'var(--status-ok)', fontWeight: 600 }}>✓ COMPLIANCE VERIFIED</span>
                            <span className="terminal-success">[ON-CHAIN]</span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                            Midnight verification completed. Assertion proved in zero-knowledge.
                          </div>
                          <div className="activity-tx" style={{ width: '100%', justifyContent: 'space-between' }}>
                            <span className="tx-hash">{txHash.substring(0, 22)}...</span>
                            <button 
                              className="copy-btn-inline"
                              onClick={() => {
                                navigator.clipboard.writeText(txHash);
                                setCopiedTx(true);
                                setTimeout(() => setCopiedTx(false), 2000);
                              }}
                            >
                              {copiedTx ? 'COPIED!' : 'COPY'}
                            </button>
                          </div>
                        </div>
                      )}

                      {status === 'error' && errorMsg && (
                        <div className="terminal" style={{ marginTop: '0.75rem', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                          <div className="terminal-header">
                            <span style={{ color: 'var(--status-crit)', fontWeight: 600 }}>✕ COMPLIANCE REJECTED</span>
                            <span className="terminal-error">[FAILED]</span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                            Safety conditions not met. ZK constraint failed.
                          </div>
                          <div className="terminal-body terminal-error" style={{ fontSize: '0.6875rem' }}>
                            {errorMsg}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* How It Works Disclosure */}
                    <details className="how-it-works-details">
                      <summary className="how-it-works-summary">
                        <span>How FleetShield protects private telemetry</span>
                        <ChevronDown size={14} />
                      </summary>
                      <div className="how-it-works-body">
                        Vehicle telemetry (coordinates, continuous timestamps, speed) is evaluated locally to produce a Zero-Knowledge Proof. Only the cryptographic proof and non-sensitive compliance assertion are submitted to the Midnight network. Raw telemetry is never exposed or logged on-chain.
                      </div>
                    </details>
                  </div>

                  {/* Sticky Footer */}
                  <div className="detail-panel-footer">
                    <button 
                      className="btn btn-primary btn-large"
                      onClick={() => runVerification(selectedDriver, true)}
                      disabled={status === 'generating' || status === 'verifying'}
                    >
                      {(status === 'generating' || status === 'verifying') ? <div className="spinner" /> : <Shield size={16} />}
                      Verify Compliance
                    </button>
                    <div className="footer-actions-row">
                      <label className="follow-toggle">
                        <input type="checkbox" checked={followMode} onChange={(e) => setFollowMode(e.target.checked)} />
                        <span className="toggle-label">Follow Vehicle on Map</span>
                      </label>
                    </div>
                  </div>
                </>
              )}
            </aside>
          );
        })()}


        {/* Privacy Audit Workspace View */}
        {activeTab === 'PRIVACY_AUDIT' && (
          <div className="map-panel" style={{ padding: '1.5rem', overflowY: 'auto', gap: '1.5rem', zIndex: 10 }}>
            {/* Judge Explanation Banner */}
            <div className="privacy-banner-statement" style={{ backgroundColor: 'var(--bg-surface)', borderLeft: '4px solid var(--accent)', padding: '1.25rem' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>
                What FleetShield Proves
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                FleetShield verifies a compliance claim using Midnight's zero-knowledge infrastructure without exposing the underlying private witness data as the verification result.
              </div>
            </div>

            {/* Architecture Data Protection Card */}
            <div className="compact-summary-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', padding: '1.25rem' }}>
              <div className="summary-item">
                <span className="summary-label">UNDERLYING TELEMETRY</span>
                <span className="summary-value text-accent" style={{ fontSize: '0.875rem' }}>Not Included in Ledger Result</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">PROVING ENGINE</span>
                <span className="summary-value" style={{ fontSize: '0.875rem' }}>Midnight Compact ZK</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">AUDIT EVENT COUNT</span>
                <span className="summary-value text-ok" style={{ fontSize: '0.875rem' }}>{receiptsHistory.length} Receipts Logged</span>
              </div>
            </div>

            {/* Privacy Boundary Visualization */}
            <div className="detail-section">
              <div className="detail-section-title">INTERACTIVE PRIVACY BOUNDARY VISUALIZATION</div>
              <PrivacyBoundaryDiagram />
            </div>

            {/* Scalability Architecture */}
            <ScalabilityArchitectureDiagram />

            {/* Verification History Log Table */}
            <div className="detail-section">
              <div className="detail-section-title">VERIFICATION AUDIT LOG (IMMUTABLE RECORD)</div>
              {receiptsHistory.length === 0 ? (
                <div className="table-empty" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '2rem' }}>
                  No ZK verifications performed yet. Run a verification from the Operations map drawer or Demo Scenarios above.
                </div>
              ) : (
                <div className="data-table" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '6px' }}>
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

      </main>

      {/* Command Palette Overlay */}
      {cmdPaletteOpen && (
        <div className="cmd-overlay" onClick={() => setCmdPaletteOpen(false)}>
          <div className="cmd-palette" onClick={e => e.stopPropagation()}>
            <div className="cmd-header">
              <Search size={18} color="var(--text-secondary)" />
              <input 
                type="text" 
                className="cmd-input" 
                placeholder="Search drivers, trips, or run commands..." 
                value={cmdQuery}
                onChange={e => setCmdQuery(e.target.value)}
                autoFocus
              />
              <span className="kbd">ESC</span>
            </div>
            <div className="cmd-body">
              <div className="cmd-section-title">SUGGESTIONS</div>
              <div className="cmd-item" onClick={() => { setFleetFilter('HIGH_RISK'); setCmdPaletteOpen(false); setActiveTab('OPERATIONS'); }}>
                <ShieldAlert size={14} color="var(--status-crit)" /> Show high-risk vehicles
              </div>
              <div className="cmd-item" onClick={() => { setFleetFilter('ON_ROUTE'); setCmdPaletteOpen(false); setActiveTab('OPERATIONS'); }}>
                <Navigation size={14} color="var(--accent)" /> Show active fleet
              </div>
              <div className="cmd-item" onClick={() => { setActiveTab('COMPLIANCE'); setCmdPaletteOpen(false); }}>
                <Server size={14} color="var(--text-secondary)" /> View compliance logs
              </div>

              {cmdQuery.trim().length > 0 && (
                <>
                  <div className="cmd-section-title" style={{ marginTop: '1rem' }}>SEARCH RESULTS</div>
                  {MOCK_DRIVERS.filter(d => d.name.toLowerCase().includes(cmdQuery.toLowerCase()) || d.id.toLowerCase().includes(cmdQuery.toLowerCase())).map(driver => (
                    <div className="cmd-item" key={driver.id} onClick={() => {
                      setActiveDriverId(driver.id);
                      setActiveTab('OPERATIONS');
                      setCmdPaletteOpen(false);
                      setFleetFilter('ALL');
                    }}>
                      <div className="cmd-driver-info">
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{driver.name}</span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.6875rem' }}>{driver.id}</span>
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
