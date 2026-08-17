import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';

// Icons
import { 
  Shield, Activity, HardDrive, Lock, Server, CheckCircle2, XCircle, 
  ChevronRight, ShieldCheck, ShieldAlert, Navigation, Search, Bell, 
  Focus, ZoomIn, ZoomOut, Pause, Menu, X, Download, 
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

const MAP_CENTER: [number, number] = [23.5, 76.0]; // Center over Western Freight Corridor

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
type ViewMode = 'OVERVIEW' | 'OPERATIONS' | 'SHIPMENTS' | 'COMPLIANCE' | 'SETTLEMENTS' | 'DRIVERS' | 'PRIVACY_AUDIT' | 'INCIDENTS';
type TabState = 'OPERATIONS' | 'COMPLIANCE';

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
    len += L.latLng(coords[i][0], coords[i][1]).distanceTo(L.latLng(coords[i+1][0], coords[i+1][1]));
  }
  return len;
};

const interpolateRoute = (coords: [number, number][], progress: number): { lat: number, lng: number, heading: number } => {
  if (!coords || coords.length === 0) return { lat: 0, lng: 0, heading: 0 };
  if (coords.length === 1) return { lat: coords[0][0], lng: coords[0][1], heading: 0 };
  if (progress <= 0) return { lat: coords[0][0], lng: coords[0][1], heading: getHeading(coords[0][0], coords[0][1], coords[1][0], coords[1][1]) };
  if (progress >= 1) {
    const last = coords.length - 1;
    return { lat: coords[last][0], lng: coords[last][1], heading: getHeading(coords[last-1][0], coords[last-1][1], coords[last][0], coords[last][1]) };
  }

  const totalLength = computePolylineLength(coords);
  if (totalLength === 0) return { lat: coords[0][0], lng: coords[0][1], heading: 0 };

  const targetDist = totalLength * progress;

  let currentDist = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = L.latLng(coords[i][0], coords[i][1]);
    const p2 = L.latLng(coords[i+1][0], coords[i+1][1]);
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
      stops: []
    };
  });
};

// Cached DivIcons to guarantee DOM element persistence across zoom & pan
const truckIconCache = new Map<string, L.DivIcon>();

const getTruckIcon = (risk: string, heading: number, isSelected: boolean) => {
  const roundedHeading = Math.round(heading / 10) * 10;
  const cacheKey = `${risk}-${roundedHeading}-${isSelected}`;
  if (truckIconCache.has(cacheKey)) {
    return truckIconCache.get(cacheKey)!;
  }

  const color = risk === 'HIGH' ? 'var(--status-crit)' : (risk === 'MEDIUM' ? 'var(--status-warn)' : 'var(--status-ok)');
  const truckSvg = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="${color}">
      <rect x="5" y="2" width="14" height="20" rx="3"/>
      <rect x="7" y="4" width="10" height="5" rx="1" fill="#111827" opacity="0.9"/>
    </svg>
  `;

  const icon = L.divIcon({
    className: `truck-marker-container ${isSelected ? 'selected' : ''}`,
    html: `
      <div class="truck-marker-inner ${risk.toLowerCase()}" style="transform: rotate(${roundedHeading}deg);">
        ${truckSvg}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });

  truckIconCache.set(cacheKey, icon);
  return icon;
};

const stopIconCache = new Map<string, L.DivIcon>();

const getStopIcon = (type: string, isHighlighted: boolean, isActive: boolean) => {
  const cacheKey = `${type}-${isHighlighted}-${isActive}`;
  if (stopIconCache.has(cacheKey)) {
    return stopIconCache.get(cacheKey)!;
  }

  let iconHtml = '';
  const color = isActive ? '#fff' : (isHighlighted ? 'var(--text-secondary)' : 'var(--text-tertiary)');
  const bg = isActive ? 'var(--accent)' : 'var(--bg-card)';
  
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

  const icon = L.divIcon({
    className: 'stop-marker',
    html: `<div style="background: ${bg}; border: 1px solid var(--border); border-radius: 50%; padding: 4px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.5);">${iconHtml}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12]
  });

  stopIconCache.set(cacheKey, icon);
  return icon;
};

const destinationIconCache = L.divIcon({
  className: 'destination-marker',
  html: `<div class="dest-pin"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
  popupAnchor: [0, -10]
});

// Decoupled Map Controller: Recenter camera ONLY when a new driver is explicitly selected
function MapController({ lat, lng, activeDriverId }: { lat?: number, lng?: number, activeDriverId: string | null }) {
  const map = useMap();
  const lastSelectedDriverId = useRef<string | null>(null);

  useEffect(() => {
    if (activeDriverId && activeDriverId !== lastSelectedDriverId.current) {
      lastSelectedDriverId.current = activeDriverId;
      if (lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
        map.panTo([lat, lng], { animate: true, duration: 0.6 });
      }
    } else if (!activeDriverId) {
      lastSelectedDriverId.current = null;
    }
  }, [activeDriverId, lat, lng, map]);

  return null;
}

function MapResizeHandler({ isVisible, selectedDriverId }: { isVisible: boolean; selectedDriverId?: string | null }) {
  const map = useMap();

  useEffect(() => {
    if (!isVisible) return;

    const triggerResize = () => {
      try {
        map.invalidateSize({ animate: false });
      } catch (e) {
        // ignore
      }
    };

    triggerResize();
    const raf1 = requestAnimationFrame(() => triggerResize());
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(() => triggerResize()));
    const timer1 = setTimeout(triggerResize, 100);
    const timer2 = setTimeout(triggerResize, 300);

    const container = map.getContainer();
    if (!container) return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); clearTimeout(timer1); clearTimeout(timer2); };

    let resizeTimer: any;
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(triggerResize, 50);
    });
    observer.observe(container);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, [isVisible, selectedDriverId, map]);

  return null;
}

function FleetBoundsController({ driverLocations, isVisible }: { driverLocations: any[]; isVisible: boolean }) {
  const map = useMap();
  const initialFitDone = useRef(false);

  useEffect(() => {
    if (!isVisible || initialFitDone.current || !driverLocations || driverLocations.length === 0) return;

    const validPoints: [number, number][] = [];
    driverLocations.forEach(driver => {
      if (Number.isFinite(driver.currentLat) && Number.isFinite(driver.currentLng) && driver.currentLat !== 0 && driver.currentLng !== 0) {
        validPoints.push([driver.currentLat, driver.currentLng]);
      }
      if (driver.destination && Number.isFinite(driver.destination.lat) && Number.isFinite(driver.destination.lng)) {
        validPoints.push([driver.destination.lat, driver.destination.lng]);
      }
      if (driver.routeCoords) {
        driver.routeCoords.forEach(([lat, lng]: [number, number]) => {
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            validPoints.push([lat, lng]);
          }
        });
      }
    });

    if (validPoints.length > 0) {
      const bounds = L.latLngBounds(validPoints);
      if (bounds.isValid()) {
        initialFitDone.current = true;
        map.invalidateSize();
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 7, animate: false });
      }
    }
  }, [isVisible, driverLocations, map]);

  return null;
}

function GlobalMapControls({ driverLocations, activeDriverId }: { driverLocations: any[]; activeDriverId: string | null }) {
  const map = useMap();

  const handleFitFleet = () => {
    const validPoints: [number, number][] = [];
    driverLocations.forEach(driver => {
      if (Number.isFinite(driver.currentLat) && Number.isFinite(driver.currentLng) && driver.currentLat !== 0 && driver.currentLng !== 0) {
        validPoints.push([driver.currentLat, driver.currentLng]);
      }
      if (driver.destination && Number.isFinite(driver.destination.lat) && Number.isFinite(driver.destination.lng)) {
        validPoints.push([driver.destination.lat, driver.destination.lng]);
      }
      if (driver.routeCoords) {
        driver.routeCoords.forEach(([lat, lng]: [number, number]) => {
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            validPoints.push([lat, lng]);
          }
        });
      }
    });

    if (validPoints.length > 0) {
      const bounds = L.latLngBounds(validPoints);
      if (bounds.isValid()) {
        map.invalidateSize();
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 7, animate: true });
      }
    } else {
      map.setView(MAP_CENTER, 6);
    }
  };

  const selectedDriver = driverLocations.find(d => d.id === activeDriverId);

  return (
    <div className="map-global-controls">
      <button className="map-btn" onClick={() => map.zoomIn()} title="Zoom In">
        <ZoomIn size={16} />
      </button>
      <button className="map-btn" onClick={() => map.zoomOut()} title="Zoom Out">
        <ZoomOut size={16} />
      </button>
      <button className="map-btn" onClick={handleFitFleet} title="Fit Entire Fleet Bounds">
        <Focus size={16} />
        <span>Fit Fleet</span>
      </button>
      {selectedDriver && Number.isFinite(selectedDriver.currentLat) && Number.isFinite(selectedDriver.currentLng) && (
        <button 
          className="map-btn active" 
          onClick={() => {
            map.setView([selectedDriver.currentLat, selectedDriver.currentLng], 9, { animate: true });
          }} 
          title="Track Selected Truck"
        >
          <Navigation size={16} />
          <span>Track Truck</span>
        </button>
      )}
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
  const [activeTab, setActiveTab] = useState<TabState>('OPERATIONS');
  
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

  const [fleetFilter, setFleetFilter] = useState<FleetFilter>('ALL');
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState<boolean>(false);
  const [cmdQuery, setCmdQuery] = useState<string>('');
  const [notificationsOpen, setNotificationsOpen] = useState<boolean>(false);
  const [notifications] = useState<{ id: string; title: string; desc: string; time: string; type: 'alert' | 'info' }[]>([
    { id: '1', title: 'Midnight Proof Generated', desc: 'Vivek Jeet Patel verified on Midnight ledger.', time: '2m ago', type: 'info' },
    { id: '2', title: 'Settlement Ready', desc: 'Shipment SH-84922 is eligible for ₹3,800 payout.', time: '5m ago', type: 'info' },
    { id: '3', title: 'Compliance Assertion Failed', desc: 'Divyansh Kumar trip rejected on contract safety check.', time: '12m ago', type: 'alert' }
  ]);
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

        return {
          ...driver,
          progress: newProgress,
          currentLat: validLat,
          currentLng: validLng,
          heading: Number.isFinite(heading) ? heading : driver.heading,
          driverStatus,
          stops: updatedStops
        };
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, [simulationSpeed]);

  // Run Real Midnight ZK Verification
  const runVerification = async (driver: DriverSimulation, forceFailure = false) => {
    setStatus('generating');
    setTxHash(null);
    setErrorMsg(null);

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
      logActivity('verifying', 'Submitting Proof to Midnight', 'Evaluating contract safety conditions on-chain...');

      try {
        const payload = {
          tripId: driver.id,
          driverName: driver.name,
          safetyConditionsMet: forceFailure ? false : (driver.score > 50),
          averageSpeedKmH: forceFailure ? 115 : (driver.score > 50 ? 68 : 94),
          restStopsCompleted: forceFailure ? 0 : 2
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
      runVerification(driver, false);
    } else if (scenario === 'HIGH_RISK') {
      const driver = driverLocations.find(d => d.risk === 'HIGH') || driverLocations[0];
      setActiveDriverId(driver.id);
      setActiveView('OPERATIONS');
    } else if (scenario === 'REJECTED') {
      const driver = driverLocations[0];
      setActiveDriverId(driver.id);
      setActiveView('OPERATIONS');
      runVerification(driver, true);
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

  const selectedDriver = driverLocations.find(d => d.id === activeDriverId);
  const filteredDrivers = driverLocations.filter(driver => {
    if (fleetFilter === 'ALL') return true;
    if (fleetFilter === 'ON_ROUTE') return driver.driverStatus === 'DRIVING';
    if (fleetFilter === 'COMPLIANT') return driver.risk === 'LOW';
    if (fleetFilter === 'ATTENTION') return driver.risk === 'MEDIUM';
    if (fleetFilter === 'HIGH_RISK') return driver.risk === 'HIGH';
    return true;
  });

  const pendingVerificationsCount = shipments.filter(s => s.complianceState === 'PENDING').length;
  const pendingSettlementsCount = shipments.filter(s => s.settlementStatus === 'READY_FOR_APPROVAL').length;
  const pendingSettlementTotal = shipments
    .filter(s => s.settlementStatus === 'READY_FOR_APPROVAL')
    .reduce((sum, s) => sum + s.payoutAmount, 0);

  return (
    <div className="app-layout">
      {/* Top Enterprise Header */}
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-logo" onClick={() => setActiveView('OVERVIEW')} style={{ cursor: 'pointer' }}>
            <img src="/fleetshield-logo.png" alt="FleetShield" className="brand-logo-img" />
          </div>
          <span className="brand-badge hide-on-mobile">Fleet Operations</span>
        </div>
        
        <div className="header-actions-group">
          {/* Demo Scenarios */}
          <div className="demo-bar hide-on-mobile">
            <button className={`demo-chip ${demoScenario === 'COMPLIANT' ? 'active' : ''}`} onClick={() => handleTriggerDemoScenario('COMPLIANT')}>Compliant</button>
            <button className={`demo-chip ${demoScenario === 'HIGH_RISK' ? 'active' : ''}`} onClick={() => handleTriggerDemoScenario('HIGH_RISK')}>High Risk</button>
            <button className={`demo-chip ${demoScenario === 'REJECTED' ? 'active' : ''}`} onClick={() => handleTriggerDemoScenario('REJECTED')}>Rejected ZK</button>
          </div>

          <div className="header-divider hide-on-mobile" />

          {/* Sim Controls */}
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

          {/* Runtime Indicators */}
          <span className="chip chip-sim hide-on-mobile">SIMULATION</span>
          <span className="chip chip-live hide-on-mobile">LIVE MIDNIGHT ZK</span>

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

      {/* Main Workspace Body */}
      <main className="app-workspace">
        
        {/* Enterprise Navigation Sidebar */}
        <aside className={`enterprise-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
          <button className="sidebar-close-mobile show-on-mobile-only" onClick={() => setMobileMenuOpen(false)}><X size={16} /></button>
          <div className="role-switcher-container">
            <div className="role-switcher-header">
              <span className="role-label">DEMO ROLE</span>
              <select 
                value={activeRole} 
                onChange={(e) => {
                  const role = e.target.value as RoleMode;
                  setActiveRole(role);
                  if (role === 'Fleet Manager') setActiveView('OVERVIEW');
                  else if (role === 'Dispatcher') setActiveView('SHIPMENTS');
                  else if (role === 'Compliance Officer') setActiveView('COMPLIANCE');
                  else if (role === 'Finance') setActiveView('SETTLEMENTS');
                }}
                className="role-select"
              >
                <option value="Fleet Manager">Fleet Manager</option>
                <option value="Dispatcher">Dispatcher</option>
                <option value="Compliance Officer">Compliance Officer</option>
                <option value="Finance">Finance</option>
              </select>
            </div>
          </div>

          <div className="sidebar-nav-groups">
            <div className="sidebar-group">
              <div className="sidebar-group-title">OVERVIEW</div>
              <button className={`sidebar-item ${activeView === 'OVERVIEW' ? 'active' : ''}`} onClick={() => setActiveView('OVERVIEW')}>
                <LayoutDashboard size={15} />
                <span>Executive Overview</span>
              </button>
            </div>

            <div className="sidebar-group">
              <div className="sidebar-group-title">OPERATIONS</div>
              <button className={`sidebar-item ${activeView === 'OPERATIONS' ? 'active' : ''}`} onClick={() => setActiveView('OPERATIONS')}>
                <MapPin size={15} />
                <span>Fleet Command</span>
              </button>
            </div>

            <div className="sidebar-group">
              <div className="sidebar-group-title">LOGISTICS</div>
              <button className={`sidebar-item ${activeView === 'SHIPMENTS' ? 'active' : ''}`} onClick={() => setActiveView('SHIPMENTS')}>
                <Package size={15} />
                <span>Shipments</span>
              </button>
              <button className={`sidebar-item ${activeView === 'DRIVERS' ? 'active' : ''}`} onClick={() => setActiveView('DRIVERS')}>
                <UserCheck size={15} />
                <span>Drivers</span>
              </button>
            </div>

            <div className="sidebar-group">
              <div className="sidebar-group-title">COMPLIANCE</div>
              <button className={`sidebar-item ${activeView === 'COMPLIANCE' ? 'active' : ''}`} onClick={() => setActiveView('COMPLIANCE')}>
                <ShieldCheck size={15} />
                <span>Verification</span>
                {pendingVerificationsCount > 0 && <span className="nav-badge">{pendingVerificationsCount}</span>}
              </button>
              <button className={`sidebar-item ${activeView === 'PRIVACY_AUDIT' ? 'active' : ''}`} onClick={() => setActiveView('PRIVACY_AUDIT')}>
                <Lock size={15} />
                <span>Privacy Audit</span>
              </button>
              <button className={`sidebar-item ${activeView === 'INCIDENTS' ? 'active' : ''}`} onClick={() => setActiveView('INCIDENTS')}>
                <AlertTriangle size={15} />
                <span>Incidents</span>
                {incidents.length > 0 && <span className="nav-badge" style={{ background: 'var(--crit-dim)', color: 'var(--crit)' }}>{incidents.length}</span>}
              </button>
            </div>

            <div className="sidebar-group">
              <div className="sidebar-group-title">FINANCE</div>
              <button className={`sidebar-item ${activeView === 'SETTLEMENTS' ? 'active' : ''}`} onClick={() => setActiveView('SETTLEMENTS')}>
                <CreditCard size={15} />
                <span>Settlements</span>
                {pendingSettlementsCount > 0 && <span className="nav-badge nav-badge-accent">{pendingSettlementsCount}</span>}
              </button>
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

        {/* Persistent Map Operations View */}
        <div className="operations-workspace enter-fade-up" style={{ display: activeView === 'OPERATIONS' ? 'flex' : 'none' }}>
          {/* Left Data Panel */}
          <aside className={`side-panel ${mobileMenuOpen ? 'mobile-open' : ''}`} onClick={(e) => { if (window.innerWidth <= 768 && (e.target as HTMLElement).closest('.side-panel-tabs')) setMobileMenuOpen(v => !v); }}>
            <div className="mobile-sheet-handle show-on-mobile-only" />
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
                              <button className="copy-btn-inline" onClick={() => navigator.clipboard.writeText(item.txHash!)}>COPY</button>
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

          {/* Center Map */}
          <div className="map-panel">
            <MapContainer 
              center={MAP_CENTER} 
              zoom={6} 
              minZoom={4}
              maxZoom={18}
              worldCopyJump={false}
              scrollWheelZoom={true} 
              style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
            >
              <TileLayer
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                noWrap={true}
                bounds={[[5, 60], [38, 98]]}
              />

              <GlobalMapControls driverLocations={driverLocations} activeDriverId={activeDriverId} />
              <MapResizeHandler isVisible={activeView === 'OPERATIONS'} selectedDriverId={activeDriverId} />
              <FleetBoundsController driverLocations={driverLocations} isVisible={activeView === 'OPERATIONS'} />
              <MapController 
                lat={selectedDriver?.currentLat} 
                lng={selectedDriver?.currentLng} 
                activeDriverId={activeDriverId}
              />

              {/* Truck Markers */}
              {driverLocations.map(driver => {
                if (!Number.isFinite(driver.currentLat) || !Number.isFinite(driver.currentLng) || driver.currentLat === 0 || driver.currentLng === 0) {
                  return null;
                }
                const isSelected = activeDriverId === driver.id;

                return (
                  <Marker 
                    key={`truck-${driver.id}`} 
                    position={[driver.currentLat, driver.currentLng]}
                    icon={getTruckIcon(driver.risk, driver.heading, isSelected)}
                    eventHandlers={{ 
                      click: (e) => {
                        L.DomEvent.stopPropagation(e);
                        setActiveDriverId(driver.id);
                      } 
                    }}
                  >
                    <Popup>
                      <div className="popup-driver-name">{driver.name}</div>
                      <div className="popup-score">Vehicle {driver.id} · Score: {driver.score}</div>
                    </Popup>
                  </Marker>
                );
              })}

              {/* Destination Pins */}
              {driverLocations.map(driver => (
                <Marker 
                  key={`dest-${driver.id}`} 
                  position={[driver.destination.lat, driver.destination.lng]}
                  icon={destinationIconCache}
                >
                  <Popup>
                    <div className="popup-driver-name">{driver.destinationName}</div>
                    <div className="popup-score">Destination for {driver.name}</div>
                  </Popup>
                </Marker>
              ))}

              {/* Stop Markers for Selected Vehicle */}
              {selectedDriver && selectedDriver.stops.map(stop => {
                if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng) || stop.lat === 0 || stop.lng === 0) {
                  return null;
                }
                return (
                  <Marker 
                    key={`stop-${stop.id}`} 
                    position={[stop.lat, stop.lng]}
                    icon={getStopIcon(stop.type, true, stop.status === 'active')}
                  >
                    <Popup>
                      <div className="popup-driver-name">{stop.name}</div>
                      <div className="popup-score">Stop: {stop.type} ({stop.status})</div>
                    </Popup>
                  </Marker>
                );
              })}

              {/* Road Polylines */}
              {driverLocations.map(driver => {
                if (!driver.routeCoords || driver.routeCoords.length < 2) return null;
                const isSelected = activeDriverId === driver.id;
                return (
                  <Polyline 
                    key={`route-poly-${driver.id}`}
                    positions={driver.routeCoords}
                    pathOptions={{
                      color: isSelected ? 'var(--accent)' : 'var(--border)',
                      weight: isSelected ? 4 : 2,
                      opacity: isSelected ? 0.9 : 0.4,
                      dashArray: isSelected ? undefined : '4, 8'
                    }}
                  />
                );
              })}
            </MapContainer>
          </div>

          {/* Right Vehicle Intelligence Drawer */}
          {(() => {
            const selectedDriver = driverLocations.find(d => d.id === activeDriverId);
            return (
              <aside className={`detail-panel ${selectedDriver ? 'open' : ''}`}>
                {!selectedDriver ? (
                  <div className="detail-empty">
                    <Truck size={32} color="var(--text-tertiary)" />
                    <div className="empty-title">No vehicle selected</div>
                    <div className="empty-desc">Click any truck marker on the map to inspect live route, stops, and compliance verification.</div>
                  </div>
                ) : (
                  <>
                    <div className="detail-panel-header">
                      <div className="detail-panel-context">
                        <Truck size={12} />
                        <span>Vehicle Intelligence</span>
                      </div>
                      <div className="detail-panel-title-row">
                        <div>
                          <div className="detail-panel-driver">{selectedDriver.name}</div>
                          <div className="detail-panel-sub-row">
                            <span className="detail-panel-vehicle-id">RIG {selectedDriver.id}</span>
                            <span className={`badge ${selectedDriver.risk === 'HIGH' ? 'badge-crit' : (selectedDriver.risk === 'MEDIUM' ? 'badge-warn' : 'badge-ok')}`}>
                              {selectedDriver.risk} RISK
                            </span>
                          </div>
                        </div>
                        <button className="detail-close-btn" onClick={() => setActiveDriverId(null)}>
                          <X size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="detail-panel-body">
                      <div className="compact-summary-grid">
                        <div className="summary-item">
                          <span className="summary-label">DRIVER SCORE</span>
                          <span className={`summary-value ${selectedDriver.score < 50 ? 'text-crit' : (selectedDriver.score < 75 ? 'text-warn' : 'text-ok')}`}>
                            {selectedDriver.score} / 100
                          </span>
                        </div>
                        <div className="summary-item">
                          <span className="summary-label">CURRENT SPEED</span>
                          <span className="summary-value">68 km/h</span>
                        </div>
                        <div className="summary-item">
                          <span className="summary-label">ROUTE DISTANCE</span>
                          <span className="summary-value">{selectedDriver.distance} km</span>
                        </div>
                        <div className="summary-item">
                          <span className="summary-label">SIMULATION STATUS</span>
                          <span className="summary-value text-accent">{selectedDriver.driverStatus}</span>
                        </div>
                      </div>

                      <div className="focus-block">
                        <div className="focus-header">
                          <span className="focus-tag">ACTIVE STOP</span>
                          <span className="focus-meta">Progress: {Math.round(selectedDriver.progress * 100)}%</span>
                        </div>
                        <div className="focus-title">{selectedDriver.destinationName}</div>
                        <div className="next-stop-row">
                          <span className="next-stop-label">Destination ETA</span>
                          <span className="next-stop-name">11:45 AM</span>
                        </div>
                      </div>

                      <div className="detail-section">
                        <div className="detail-section-title">
                          <ShieldCheck size={14} />
                          MIDNIGHT ZK COMPLIANCE PROVER
                        </div>
                        
                        <div className="zk-audit-trail">
                          <div className={`zk-audit-step ${status !== 'idle' ? 'success' : ''}`}>
                            <div className="zk-step-left">
                              <HardDrive size={14} />
                              <span>1. PRIVATE TELEMETRY</span>
                            </div>
                            <span className="zk-step-status-chip">{status !== 'idle' ? 'COMPLETE' : 'PENDING'}</span>
                          </div>

                          <div className={`zk-audit-step ${(status === 'generating' || status === 'verifying' || status === 'success' || status === 'error') ? 'active' : ''} ${status === 'verifying' || status === 'success' || status === 'error' ? 'success' : ''}`}>
                            <div className="zk-step-left">
                              {status === 'generating' ? <div className="spinner-small" /> : <Lock size={14} />}
                              <span>2. ZK PROOF GENERATION</span>
                            </div>
                            <span className="zk-step-status-chip">{status === 'generating' ? 'COMPUTING...' : ((status === 'verifying' || status === 'success' || status === 'error') ? 'COMPLETE' : 'PENDING')}</span>
                          </div>

                          <div className={`zk-audit-step ${(status === 'verifying' || status === 'success' || status === 'error') ? 'active' : ''} ${status === 'success' || status === 'error' ? 'success' : ''}`}>
                            <div className="zk-step-left">
                              {status === 'verifying' ? <div className="spinner-small" /> : <Server size={14} />}
                              <span>3. MIDNIGHT VERIFICATION</span>
                            </div>
                            <span className="zk-step-status-chip">{status === 'verifying' ? 'EVALUATING...' : ((status === 'success' || status === 'error') ? 'COMPLETE' : 'PENDING')}</span>
                          </div>

                          <div className={`zk-audit-step ${status === 'success' ? 'success' : ''} ${status === 'error' ? 'rejected' : ''}`}>
                            <div className="zk-step-left">
                              {status === 'success' ? <CheckCircle2 size={14} color="var(--status-ok)" /> : (status === 'error' ? <XCircle size={14} color="var(--status-crit)" /> : <Shield size={14} />)}
                              <span>4. COMPLIANCE RESULT</span>
                            </div>
                            <span className="zk-step-status-chip">{status === 'success' ? 'VERIFIED' : (status === 'error' ? 'REJECTED' : 'PENDING')}</span>
                          </div>
                        </div>

                        {status === 'success' && txHash && (
                          <div className="terminal" style={{ marginTop: '0.75rem' }}>
                            <div className="terminal-header">
                              <span style={{ color: 'var(--status-ok)', fontWeight: 600 }}>✓ COMPLIANCE VERIFIED</span>
                              <span className="terminal-success">[ON-CHAIN]</span>
                            </div>
                            <div className="activity-tx" style={{ width: '100%', justifyContent: 'space-between' }}>
                              <span className="tx-hash">{txHash.substring(0, 22)}...</span>
                              <button className="copy-btn-inline" onClick={() => navigator.clipboard.writeText(txHash)}>COPY</button>
                            </div>
                          </div>
                        )}

                        {status === 'error' && errorMsg && (
                          <div className="terminal" style={{ marginTop: '0.75rem', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                            <div className="terminal-header">
                              <span style={{ color: 'var(--status-crit)', fontWeight: 600 }}>✕ COMPLIANCE REJECTED</span>
                              <span className="terminal-error">[FAILED]</span>
                            </div>
                            <div className="terminal-body terminal-error" style={{ fontSize: '0.6875rem' }}>
                              {errorMsg}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="detail-panel-footer">
                      <button 
                        className="btn btn-primary btn-large"
                        onClick={() => runVerification(selectedDriver, false)}
                        disabled={status === 'generating' || status === 'verifying'}
                      >
                        {(status === 'generating' || status === 'verifying') ? <div className="spinner" /> : <Shield size={16} />}
                        Verify Compliance
                      </button>
                    </div>
                  </>
                )}
              </aside>
            );
          })()}
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
