import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { GEOFENCES } from './App';
import {
  Shield, ShieldCheck, Navigation, Focus, ZoomIn, ZoomOut,
  ChevronRight, Truck, X, Lock, HardDrive, Server,
  CheckCircle2, XCircle, AlertOctagon, Layers, RotateCcw
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type DriverStatus = 'DRIVING' | 'RESTING' | 'REFUELING' | 'DELIVERING' | 'AT_SERVICE' | 'ARRIVED';
type StopType = 'Rest' | 'Fuel' | 'Delivery' | 'Service' | 'Depot' | 'Destination';

interface RoutePoint { lat: number; lng: number; }

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

interface Props {
  driverLocations: DriverSimulation[];
  activeDriverId: string | null;
  status: 'idle' | 'generating' | 'verifying' | 'success' | 'error';
  txHash: string | null;
  errorMsg: string | null;
  simulationTime: Date;
  simulationSpeed: number;
  onSelectDriver: (id: string | null) => void;
  onVerify: (driver: DriverSimulation) => void;
  isVisible: boolean;
  incidents?: any[];
}

type MapMode = 'NORMAL' | 'TRAFFIC' | 'RISK';

// ─── Icon Factories ───────────────────────────────────────────────────────────

const truckIconCache = new Map<string, L.DivIcon>();

const RISK_HEX: Record<string, string> = {
  HIGH: '#f43f5e',
  MEDIUM: '#f59e0b',
  LOW: '#10b981',
};

function getTruckIcon(risk: string, heading: number, isSelected: boolean): L.DivIcon {
  const roundedHeading = Math.round(heading / 10) * 10;
  const key = `${risk}-${roundedHeading}-${isSelected}`;
  if (truckIconCache.has(key)) return truckIconCache.get(key)!;

  const color = RISK_HEX[risk] || '#10b981';
  const size = isSelected ? 40 : 30;
  const half = size / 2;
  const glow = isSelected ? `box-shadow:0 0 0 2px ${color},0 0 14px ${color}66;` : '';

  const icon = L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(8,11,15,0.9);border:2px solid ${color};${glow}transform:rotate(${roundedHeading}deg);transition:all 0.2s ease;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="${color}">
        <rect x="5" y="2" width="14" height="20" rx="3"/>
        <rect x="7" y="4" width="10" height="5" rx="1" fill="#111827" opacity="0.9"/>
      </svg>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [half, half],
    popupAnchor: [0, -half],
  });
  truckIconCache.set(key, icon);
  return icon;
}

const destIcon = L.divIcon({
  className: '',
  html: `<div style="width:10px;height:10px;border-radius:50%;background:#14b8a6;border:2px solid rgba(20,184,166,0.4);box-shadow:0 0 8px rgba(20,184,166,0.5);"></div>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

// ─── Map Sub-components ───────────────────────────────────────────────────────

function MapController({ lat, lng, activeDriverId }: { lat?: number; lng?: number; activeDriverId: string | null }) {
  const map = useMap();
  const lastId = useRef<string | null>(null);

  useEffect(() => {
    if (activeDriverId && activeDriverId !== lastId.current) {
      lastId.current = activeDriverId;
      if (lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0) {
        map.panTo([lat, lng], { animate: true, duration: 0.8 });
      }
    } else if (!activeDriverId) {
      lastId.current = null;
    }
  }, [activeDriverId, lat, lng, map]);

  return null;
}

function MapResizeHandler({ isVisible }: { isVisible: boolean }) {
  const map = useMap();
  const prev = useRef(false);

  useEffect(() => {
    if (isVisible && !prev.current) {
      const t = setTimeout(() => map.invalidateSize({ animate: false }), 60);
      return () => clearTimeout(t);
    }
    prev.current = isVisible;
  }, [isVisible, map]);

  return null;
}

// ─── Fleet Roster Widget ──────────────────────────────────────────────────────

const RISK_CSS: Record<string, string> = {
  HIGH: 'badge-crit',
  MEDIUM: 'badge-warn',
  LOW: 'badge-ok',
};

function FleetRoster({
  drivers, activeId, onSelect,
}: { drivers: DriverSimulation[]; activeId: string | null; onSelect: (id: string | null) => void }) {
  return (
    <div className="om-widget om-roster">
      <div className="om-widget-head">
        <div className="om-widget-title"><Truck size={11} /><span>Active Fleet</span></div>
        <span className="om-widget-count">{drivers.length} RIGS</span>
      </div>
      <div className="om-roster-body">
        {drivers.map(d => {
          const sel = d.id === activeId;
          const color = RISK_HEX[d.risk] || '#10b981';
          return (
            <button key={d.id} className={`om-roster-row ${sel ? 'sel' : ''}`} onClick={() => onSelect(sel ? null : d.id)}>
              <div className="om-roster-dot" style={{ background: color }} />
              <div className="om-roster-info">
                <div className="om-roster-name">{d.name}</div>
                <div className="om-roster-meta">{d.id} · {Math.round(d.progress * 100)}%</div>
              </div>
              <div className="om-roster-end">
                <span className={`badge ${RISK_CSS[d.risk]}`}>{d.risk}</span>
                <div className="om-mini-bar">
                  <div className="om-mini-fill" style={{ width: `${d.progress * 100}%`, background: color }} />
                </div>
              </div>
              {sel && <ChevronRight size={10} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Vehicle Intelligence Widget ──────────────────────────────────────────────

function VehicleIntel({
  driver, status, txHash, errorMsg, onClose, onVerify,
}: {
  driver: DriverSimulation;
  status: Props['status'];
  txHash: string | null;
  errorMsg: string | null;
  onClose: () => void;
  onVerify: (d: DriverSimulation) => void;
}) {
  const scoreColor = driver.score < 50 ? 'var(--crit)' : driver.score < 75 ? 'var(--warn)' : 'var(--ok)';

  const vStatus = driver.verificationStatus || (
    driver.complianceState === 'VERIFIED' ? 'success' :
      driver.complianceState === 'REJECTED' ? 'error' :
        status
  );
  const vTxHash = driver.txHash !== undefined ? driver.txHash : txHash;
  const vErrorMsg = driver.errorMsg !== undefined ? driver.errorMsg : errorMsg;
  const busy = vStatus === 'generating' || vStatus === 'verifying';
  const nextStop = driver.stops.find(s => s.status === 'pending' || s.status === 'active');

  type StepState = 'done' | 'active' | 'pending' | 'error';
  const steps: { label: string; icon: React.ReactNode; state: StepState }[] = [
    {
      label: 'PRIVATE TELEMETRY',
      icon: <HardDrive size={11} />,
      state: vStatus !== 'idle' ? 'done' : 'pending',
    },
    {
      label: 'ZK PROOF GENERATION',
      icon: <Lock size={11} />,
      state: vStatus === 'generating' ? 'active'
        : (vStatus === 'verifying' || vStatus === 'success' || vStatus === 'error') ? 'done'
          : 'pending',
    },
    {
      label: 'MIDNIGHT ON-CHAIN',
      icon: <Server size={11} />,
      state: vStatus === 'verifying' ? 'active'
        : (vStatus === 'success' || vStatus === 'error') ? 'done'
          : 'pending',
    },
    {
      label: 'COMPLIANCE RESULT',
      icon: vStatus === 'success' ? <CheckCircle2 size={11} /> : vStatus === 'error' ? <XCircle size={11} /> : <Shield size={11} />,
      state: vStatus === 'success' ? 'done' : vStatus === 'error' ? 'error' : 'pending',
    },
  ];

  return (
    <div className="om-widget om-vi enter-fade-up">
      {/* Header */}
      <div className="om-vi-hd">
        <div className="om-vi-dot" style={{ background: RISK_HEX[driver.risk] }} />
        <div className="om-vi-hd-text">
          <div className="om-vi-dname">{driver.name}</div>
          <div className="om-vi-dsub">RIG {driver.id} &nbsp;·&nbsp; <span className={`badge ${RISK_CSS[driver.risk]}`}>{driver.risk}</span></div>
        </div>
        <button className="om-close" onClick={onClose}><X size={13} /></button>
      </div>

      {/* Stats */}
      <div className="om-vi-stats">
        <div className="om-vi-stat">
          <span className="om-vi-slabel">SCORE</span>
          <span className="om-vi-sval" style={{ color: scoreColor }}>{driver.score}</span>
        </div>
        <div className="om-vi-stat">
          <span className="om-vi-slabel">PROGRESS</span>
          <span className="om-vi-sval">{Math.round(driver.progress * 100)}%</span>
        </div>
        <div className="om-vi-stat">
          <span className="om-vi-slabel">DISTANCE</span>
          <span className="om-vi-sval">{driver.distance}km</span>
        </div>
        <div className="om-vi-stat">
          <span className="om-vi-slabel">STATUS</span>
          <span className="om-vi-sval om-vi-status">{driver.driverStatus}</span>
        </div>
      </div>

      {/* Route progress */}
      <div className="om-vi-route">
        <div className="om-vi-rbar">
          <div className="om-vi-rfill" style={{ width: `${driver.progress * 100}%` }} />
        </div>
        <div className="om-vi-rlabels">
          <span>Origin</span>
          <span>{driver.destinationName}</span>
        </div>
      </div>

      {/* Next stop */}
      {nextStop && (
        <div className="om-vi-nextstop">
          <Navigation size={10} style={{ color: 'var(--accent)' }} />
          <span className="om-vi-ns-label">NEXT:</span>
          <span className="om-vi-ns-name">{nextStop.name}</span>
          <span className="om-vi-ns-type">{nextStop.type}</span>
        </div>
      )}

      {/* ZK Steps */}
      <div className="om-vi-zk">
        <div className="om-vi-zk-title"><ShieldCheck size={10} />MIDNIGHT ZK PROVER</div>
        <div className="om-zk-list">
          {steps.map((s, i) => (
            <div key={i} className={`om-zk-row ${s.state}`}>
              <div className="om-zk-icon">{s.state === 'active' ? <div className="om-spin" /> : s.icon}</div>
              <span className="om-zk-label">{i + 1}. {s.label}</span>
              <span className="om-zk-chip">
                {s.state === 'done' ? 'DONE' : s.state === 'active' ? '…' : s.state === 'error' ? 'FAIL' : '—'}
              </span>
            </div>
          ))}
        </div>

        {vStatus === 'success' && vTxHash && (
          <div className="om-vi-tx ok">
            <CheckCircle2 size={10} style={{ color: 'var(--ok)' }} />
            <span className="om-vi-txhash">{vTxHash.substring(0, 20)}…</span>
            <button className="om-vi-copy" onClick={() => navigator.clipboard.writeText(vTxHash)}>COPY</button>
          </div>
        )}
        {vStatus === 'error' && (
          <div className="om-vi-tx err" title={vErrorMsg || 'Contract assertion failed: Safety conditions not met'}>
            <AlertOctagon size={11} style={{ color: 'var(--crit)', flexShrink: 0 }} />
            <span className="om-vi-txhash" style={{ color: 'var(--crit)', whiteSpace: 'normal', lineHeight: 1.3, fontSize: '9.5px' }}>
              {(() => {
                if (!vErrorMsg) return 'Safety conditions not met: Cannot verify trip';
                if (vErrorMsg.includes('Safety conditions not met') || vErrorMsg.includes('failed assert')) {
                  return 'Safety conditions not met (Score < 50 / Speed Violation)';
                }
                if (vErrorMsg.includes('Failed to connect') || vErrorMsg.includes('Offline')) {
                  return 'Verification API Offline (localhost:4000)';
                }
                return vErrorMsg.length > 60 ? `${vErrorMsg.substring(0, 60)}…` : vErrorMsg;
              })()}
            </span>
          </div>
        )}
      </div>

      {/* Verify */}
      <button className="om-verify" onClick={() => onVerify(driver)} disabled={busy}>
        {busy ? <div className="om-spin" /> : <Shield size={13} />}
        {busy ? 'Verifying on Midnight…' : 'Run ZK Verification'}
      </button>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

const MAP_CENTER: [number, number] = [23.5, 76.0];

// Captures the Leaflet map instance for use outside MapContainer
function MapRefCapture({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; }, [map, mapRef]);
  return null;
}

export default function OperationsMap({
  driverLocations, activeDriverId, status, txHash, errorMsg, simulationTime, onSelectDriver, onVerify, isVisible, incidents = [],
}: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const [satellite, setSatellite] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>('NORMAL');
  const [isFollowing, setIsFollowing] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayProgress, setReplayProgress] = useState(0);

  const selectedDriver = driverLocations.find(d => d.id === activeDriverId);

  // Follow Mode Effect
  useEffect(() => {
    if (isFollowing && selectedDriver && mapRef.current) {
      mapRef.current.panTo([selectedDriver.currentLat, selectedDriver.currentLng], { animate: true, duration: 1.0 });
    }
  }, [selectedDriver?.currentLat, selectedDriver?.currentLng, isFollowing]);

  // Journey Replay Effect
  useEffect(() => {
    if (isReplaying) {
      const interval = setInterval(() => {
        setReplayProgress(prev => {
          if (prev >= 1) {
            clearInterval(interval);
            setIsReplaying(false);
            return 0;
          }
          return prev + 0.05;
        });
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isReplaying]);

  const fitFleet = () => {
    const map = mapRef.current;
    if (!map) return;
    const valid = driverLocations.filter(d => Number.isFinite(d.currentLat) && d.currentLat !== 0);
    if (!valid.length) return;
    const bounds = L.latLngBounds(valid.map(d => [d.currentLat, d.currentLng] as [number, number]));
    valid.forEach(d => bounds.extend([d.destination.lat, d.destination.lng]));
    map.fitBounds(bounds.pad(0.12), { animate: true, duration: 0.7 });
  };

  const tileUrl = satellite
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const tileAttrib = satellite ? '&copy; Esri' : '&copy; <a href="https://carto.com/">CARTO</a>';

  return (
    <div className="om-root">
      {/* Full-viewport map */}
      <MapContainer
        center={MAP_CENTER}
        zoom={6}
        minZoom={4}
        maxZoom={18}
        maxBounds={[[5.0, 65.0], [38.0, 100.0]]}
        maxBoundsViscosity={1.0}
        scrollWheelZoom={true}
        zoomControl={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <TileLayer url={tileUrl} attribution={tileAttrib} />
        <MapRefCapture mapRef={mapRef} />
        <MapResizeHandler isVisible={isVisible} />
        <MapController lat={selectedDriver?.currentLat} lng={selectedDriver?.currentLng} activeDriverId={activeDriverId} />

        {/* Routes */}
        {driverLocations.map(d => {
          if (!d.routeCoords || d.routeCoords.length < 2) return null;
          const sel = d.id === activeDriverId;

          if (mapMode === 'TRAFFIC' && d.id !== activeDriverId) {
            return (
              <Polyline key={`r-${d.id}`} positions={d.routeCoords} pathOptions={{
                color: '#64748b', weight: 2, opacity: 0.2, dashArray: '6 10'
              }} />
            );
          }

          return (
            <Polyline key={`r-${d.id}`} positions={d.routeCoords} pathOptions={{
              color: sel ? '#14b8a6' : (mapMode === 'RISK' ? (RISK_HEX[d.risk] || '#10b981') : '#10b981'),
              weight: sel ? 4 : 2,
              opacity: sel ? 0.9 : 0.28,
              dashArray: sel ? undefined : '6 10',
            }} />
          );
        })}

        {/* Geofences */}
        {GEOFENCES.map(gf => (
          <Circle key={gf.id} center={[gf.lat, gf.lng]} radius={gf.radius} pathOptions={{
            color: gf.color, fillColor: gf.color, fillOpacity: 0.1, weight: 1
          }}>
            <Popup>{gf.name}</Popup>
          </Circle>
        ))}

        {/* Destinations */}
        {driverLocations.map(d => (
          <Marker key={`dest-${d.id}`} position={[d.destination.lat, d.destination.lng]} icon={destIcon}>
            <Popup>
              <div className="popup-driver-name">{d.destinationName}</div>
              <div className="popup-score">{d.name}</div>
            </Popup>
          </Marker>
        ))}

        {/* Stop pins */}
        {selectedDriver?.stops.map(stop => {
          if (!Number.isFinite(stop.lat) || stop.lat === 0) return null;
          const stopColors: Record<string, string> = {
            Rest: '#0ea5e9', Fuel: '#f59e0b', Delivery: '#10b981',
            Service: '#8b5cf6', Depot: '#14b8a6', Destination: '#14b8a6',
          };
          const sc = stopColors[stop.type] || '#94a3b8';
          const opacity = stop.status === 'completed' ? '0.3' : '1';
          return (
            <Marker key={`stop-${stop.id}`} position={[stop.lat, stop.lng]} icon={L.divIcon({
              className: '',
              html: `<div style="width:18px;height:18px;border-radius:50%;background:rgba(8,11,15,0.9);border:2px solid ${sc};display:flex;align-items:center;justify-content:center;${stop.status === 'active' ? `box-shadow:0 0 8px ${sc}88;` : ''}"><div style="width:5px;height:5px;border-radius:50%;background:${sc};opacity:${opacity}"></div></div>`,
              iconSize: [18, 18],
              iconAnchor: [9, 9],
            })}>
              <Popup className="custom-popup">
                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{stop.name}</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>{stop.type} Stop</div>
                <div style={{ fontSize: '0.75rem', marginTop: '6px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Status:</span>
                  <span style={{ color: stop.status === 'completed' ? '#10b981' : stop.status === 'active' ? '#f59e0b' : '#94a3b8', textTransform: 'uppercase' }}>{stop.status}</span>
                </div>
                <div style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Duration:</span>
                  <span>{Math.round(stop.durationMs / 60000)} mins</span>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Truck markers */}
        {driverLocations.map(d => {
          const sel = d.id === activeDriverId;
          const replayActive = isReplaying && sel && d.routeCoords && d.routeCoords.length > 0;

          let lat = d.currentLat;
          let lng = d.currentLng;

          if (replayActive) {
            // Interpolate coordinates for replay
            const len = d.routeCoords.length;
            const targetIdx = Math.min(Math.floor(replayProgress * len), len - 1);
            lat = d.routeCoords[targetIdx][0];
            lng = d.routeCoords[targetIdx][1];
          }

          if (!Number.isFinite(lat) || lat === 0) return null;

          return (
            <Marker key={`t-${d.id}`}
              position={[lat, lng]}
              icon={getTruckIcon(d.risk, d.heading, sel)}
              eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); onSelectDriver(sel ? null : d.id); } }}
              zIndexOffset={sel ? 1000 : 0}
            >
              {sel && (
                <Tooltip direction="top" offset={[0, -25]} opacity={1} permanent className="compliance-badge-tooltip">
                  <div className={`badge-content ${(d.verificationStatus === 'generating' || d.verificationStatus === 'verifying') ? 'pending' :
                    d.complianceState === 'REJECTED' ? 'rejected' :
                      d.complianceState === 'PENDING' ? 'pending' :
                        'verified'
                    }`} onClick={(e) => { e.stopPropagation(); onVerify(d); }}>
                    {(d.verificationStatus === 'generating' || d.verificationStatus === 'verifying') ? (
                      <>
                        <div className="om-spin" style={{ width: 10, height: 10, borderWidth: 1 }} />
                        <span style={{ color: 'var(--status-warn)' }}>VERIFYING ON MIDNIGHT...</span>
                      </>
                    ) : d.complianceState === 'REJECTED' ? (
                      <>
                        <XCircle size={12} color="var(--status-crit)" />
                        <span style={{ color: 'var(--status-crit)' }}>COMPLIANCE: REJECTED</span>
                      </>
                    ) : d.complianceState === 'PENDING' ? (
                      <>
                        <Shield size={12} color="var(--status-warn)" />
                        <span style={{ color: 'var(--status-warn)' }}>COMPLIANCE: PENDING</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={12} color="var(--status-ok)" />
                        <span style={{ color: 'var(--status-ok)' }}>COMPLIANCE: VERIFIED</span>
                      </>
                    )}
                  </div>
                </Tooltip>
              )}
              <Popup>
                <div className="popup-driver-name">{d.name}</div>
                <div className="popup-score">{d.id} · Score {d.score}</div>
              </Popup>
            </Marker>
          );
        })}

        {/* Accident Markers */}
        {incidents.filter(inc => inc.type === 'ACCIDENT').map(inc => {
          const d = driverLocations.find(drv => drv.id === inc.vehicleId);
          if (!d || !Number.isFinite(d.currentLat) || d.currentLat === 0) return null;
          return (
            <Marker key={`acc-${inc.id}`} position={[d.currentLat, d.currentLng]} zIndexOffset={9999}
              icon={L.divIcon({
                className: '',
                html: `<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(8,11,15,0.9);border:2px solid var(--crit);box-shadow:0 0 0 2px var(--crit),0 0 14px rgba(244,63,94,0.4);">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--crit)" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>
                          <line x1="12" y1="8" x2="12" y2="12"></line>
                          <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                      </div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 18],
              })}
            >
              <Popup className="accident-popup">
                <div className="accident-tooltip-card">
                  <div className="accident-tooltip-header">
                    <AlertOctagon size={11} />
                    <span>ACCIDENT</span>
                  </div>
                  <div className="accident-tooltip-title">{inc.vehicleId} · {inc.driverName}</div>
                  <div className="accident-tooltip-desc">{inc.description}</div>
                  <span className="accident-tooltip-pill">COMPLIANCE: PENDING</span>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* ── Overlay UI ── */}

      {/* Top status bar */}
      <div className="om-topbar">
        <div className="om-topbar-l">
          <span className="om-simtime">{simulationTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <div className="om-chip-sim">SIMULATION</div>
          <div className="om-chip-live"><div className="om-live-dot" />MIDNIGHT ZK</div>
        </div>
        <div className="om-topbar-r">
          <span>{driverLocations.filter(d => d.driverStatus === 'DRIVING').length} driving</span>
          <span className="om-topbar-sep">·</span>
          <span style={{ color: 'var(--crit)' }}>{driverLocations.filter(d => d.risk === 'HIGH').length} high risk</span>
          <span className="om-topbar-sep">·</span>
          <span style={{ color: 'var(--ok)' }}>{driverLocations.filter(d => d.risk === 'LOW').length} compliant</span>
        </div>
      </div>

      {/* Left: Fleet Roster */}
      <div className="om-left-col">
        <FleetRoster drivers={driverLocations} activeId={activeDriverId} onSelect={onSelectDriver} />
      </div>

      {/* Right: Vehicle Intel */}
      {selectedDriver && !isReplaying && (
        <div className="om-right-col">
          <VehicleIntel
            driver={selectedDriver}
            status={status}
            txHash={txHash}
            errorMsg={errorMsg}
            onClose={() => onSelectDriver(null)}
            onVerify={onVerify}
          />
        </div>
      )}

      {/* Top Center: Route Advisor */}
      {selectedDriver && (
        <div className="om-route-advisor">
          <div className="ra-header">
            <span className="ra-title">ROUTE ADVISOR</span>
            <span className="ra-vehicle">{selectedDriver.id}</span>
          </div>
          <div className="ra-progress-row">
            <span className="ra-origin">{selectedDriver.start.lat === 28.6139 ? 'Delhi' : selectedDriver.start.lat === 26.9124 ? 'Jaipur' : 'Depot'}</span>
            <div className="ra-progress-bar">
              <div className="ra-progress-fill" style={{ width: `${selectedDriver.progress * 100}%` }} />
            </div>
            <span className="ra-destination">{selectedDriver.destinationName}</span>
          </div>
          <div className="ra-stats">
            <div className="ra-stat">
              <span className="ra-stat-label">Progress</span>
              <span className="ra-stat-val">{Math.round(selectedDriver.progress * 100)}%</span>
            </div>
            <div className="ra-stat">
              <span className="ra-stat-label">Remaining</span>
              <span className="ra-stat-val">{Math.round(selectedDriver.distance * (1 - selectedDriver.progress))} km</span>
            </div>
            <div className="ra-stat">
              <span className="ra-stat-label">Next Stop</span>
              <span className="ra-stat-val">{selectedDriver.stops.find(s => s.status === 'pending' || s.status === 'active')?.name || 'Destination'}</span>
            </div>
          </div>
          <div className="ra-actions">
            <button className={`btn-ra ${isFollowing ? 'active' : ''}`} onClick={() => setIsFollowing(f => !f)}>
              <Focus size={12} /> {isFollowing ? 'Following' : 'Follow'}
            </button>
            <button className={`btn-ra ${isReplaying ? 'active' : ''}`} onClick={() => {
              if (!isReplaying) {
                setReplayProgress(0);
                setIsReplaying(true);
              } else {
                setIsReplaying(false);
              }
            }}>
              <RotateCcw size={12} /> Replay
            </button>
          </div>
        </div>
      )}

      {/* Bottom-right: Map Controls */}
      {/* Bottom-right: Map Controls */}
      <div className="om-ctrls">
        <div className="om-ctrl-group">
          <button className={`om-ctrl-btn ${mapMode === 'NORMAL' ? 'active' : ''}`} onClick={() => setMapMode('NORMAL')}>
            <Layers size={12} /><span>Normal</span>
          </button>
          <button className={`om-ctrl-btn ${mapMode === 'TRAFFIC' ? 'active' : ''}`} onClick={() => setMapMode('TRAFFIC')}>
            <Layers size={12} /><span>Traffic</span>
          </button>
          <button className={`om-ctrl-btn ${mapMode === 'RISK' ? 'active' : ''}`} onClick={() => setMapMode('RISK')}>
            <Layers size={12} /><span>Risk Layer</span>
          </button>
        </div>
        <div className="om-ctrl-group">
          <button className={`om-ctrl-btn ${satellite ? 'active' : ''}`} onClick={() => setSatellite(v => !v)}>
            <Layers size={12} />
            <span>{satellite ? 'Dark Map' : 'Satellite'}</span>
          </button>
          <button className="om-ctrl-btn" onClick={fitFleet} title="Fit fleet">
            <Focus size={13} />
            <span>Fleet</span>
          </button>
        </div>
        <div className="om-ctrl-group">
          <button className="om-ctrl-btn om-ctrl-icon" onClick={() => mapRef.current?.zoomIn()} title="Zoom in"><ZoomIn size={13} /></button>
          <button className="om-ctrl-btn om-ctrl-icon" onClick={() => mapRef.current?.zoomOut()} title="Zoom out"><ZoomOut size={13} /></button>
          <button className="om-ctrl-btn om-ctrl-icon" title="Clear selection" onClick={() => onSelectDriver(null)}>
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Hint when nothing selected */}
      {!selectedDriver && (
        <div className="om-hint">Click any truck to inspect vehicle intelligence</div>
      )}
    </div>
  );
}

