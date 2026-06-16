import React, { useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Pole } from '../types/Pole';
import PoleCard from './PoleCard';

const MIN_ZOOM = 13;

// Fires onBoundsChange whenever the user stops panning or zooming (debounced
// 600 ms). Also fires once on mount so the initial viewport is queried.
const ViewportPoller: React.FC<{
    onBoundsChange: (s: number, w: number, n: number, e: number, zoom: number) => void;
}> = ({ onBoundsChange }) => {
    const map = useMap();
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Keep a stable ref so the debounced callback always calls the latest version.
    const cbRef = useRef(onBoundsChange);
    cbRef.current = onBoundsChange;

    const schedule = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            const b = map.getBounds();
            cbRef.current(b.getSouth(), b.getWest(), b.getNorth(), b.getEast(), map.getZoom());
        }, 600);
    }, [map]);

    useMapEvents({ moveend: schedule, zoomend: schedule });

    useEffect(() => {
        schedule();
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [schedule]);

    return null;
};

// SVG pin: wooden stem + crossarm circle. Orange = unselected, green = selected.
const createPoleIcon = (selected: boolean) => L.divIcon({
    className: '',
    html: `<svg width="26" height="38" viewBox="0 0 26 38" xmlns="http://www.w3.org/2000/svg">
        <rect x="12" y="16" width="2" height="22" fill="#5C3D1E"/>
        <rect x="4" y="13" width="18" height="2.5" fill="#4A2E10" rx="1"/>
        <circle cx="13" cy="9" r="8" fill="${selected ? '#27ae60' : '#e67e22'}" stroke="white" stroke-width="2"/>
        <text x="13" y="13" text-anchor="middle" font-size="11" fill="white" font-weight="bold" font-family="Arial,sans-serif">P</text>
    </svg>`,
    iconSize:    [26, 38],
    iconAnchor:  [13, 38],
    popupAnchor: [0, -38],
});

interface PoleMapProps {
    onBoundsChange: (s: number, w: number, n: number, e: number, zoom: number) => void;
    nearbyPoles:    Pole[];
    selectedPole:   Pole | null;
    isSearching:    boolean;
    isZoomedOut:    boolean;
    searchError:    string;
    onPoleSelect:   (pole: Pole) => void;
    onViewIn3D:     (pole: Pole) => void;
}

const PoleMap: React.FC<PoleMapProps> = ({
    onBoundsChange,
    nearbyPoles,
    selectedPole,
    isSearching,
    isZoomedOut,
    searchError,
    onPoleSelect,
    onViewIn3D,
}) => {
    return (
        <div style={{ display: 'flex', height: '500px', gap: '16px' }}>

            {/* MAP PANEL */}
            <div style={{ flex: 2, borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
                <MapContainer
                    center={[33.4734, -84.4563]}
                    zoom={13}
                    style={{ height: '100%', width: '100%' }}
                >
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; OpenStreetMap contributors'
                    />

                    <ViewportPoller onBoundsChange={onBoundsChange} />

                    {/* All visible poles as clickable icons */}
                    {nearbyPoles.map(pole => {
                        const isSelected = selectedPole?.id === pole.id;
                        return (
                            <Marker
                                key={pole.id}
                                position={[pole.latitude, pole.longitude]}
                                icon={createPoleIcon(isSelected)}
                                zIndexOffset={isSelected ? 1000 : 0}
                                eventHandlers={{ click: () => onPoleSelect(pole) }}
                            >
                                <Popup>
                                    <strong>OSM Pole #{pole.id}</strong><br />
                                    {pole.height ? `Height: ${pole.height} ft` : 'Height: unknown'}<br />
                                    Lat: {pole.latitude.toFixed(5)}<br />
                                    Lng: {pole.longitude.toFixed(5)}<br />
                                    <button
                                        onClick={() => onViewIn3D(pole)}
                                        style={{
                                            marginTop: 6, padding: '4px 10px',
                                            background: '#3498db', color: 'white',
                                            border: 'none', borderRadius: 4,
                                            cursor: 'pointer', fontSize: 12,
                                        }}
                                    >
                                        View in 3D
                                    </button>
                                </Popup>
                            </Marker>
                        );
                    })}
                </MapContainer>

                {/* Overlay badges */}
                {isSearching && (
                    <div style={overlayStyle}>Querying OSM…</div>
                )}
                {searchError && !isSearching && (
                    <div style={{ ...overlayStyle, background: 'rgba(192,57,43,0.95)' }}>
                        OpenStreetMap query failed — {searchError}
                    </div>
                )}
                {isZoomedOut && !isSearching && !searchError && (
                    <div style={overlayStyle}>Zoom in (level {MIN_ZOOM}+) to see poles</div>
                )}
                {!isZoomedOut && !isSearching && !searchError && nearbyPoles.length > 0 && (
                    <div style={{ ...overlayStyle, background: 'rgba(39,174,96,0.85)' }}>
                        {nearbyPoles.length} pole{nearbyPoles.length !== 1 ? 's' : ''} in view — click a pin to select
                    </div>
                )}
                {!isZoomedOut && !isSearching && !searchError && nearbyPoles.length === 0 && (
                    <div style={overlayStyle}>No poles found in this area</div>
                )}
            </div>

            {/* DETAIL PANEL */}
            <div style={{
                flex: 1, overflowY: 'auto',
                backgroundColor: '#f8f9fa', borderRadius: '8px', padding: '16px',
            }}>
                <h3 style={{ margin: '0 0 16px 0', color: '#2c3e50' }}>Pole Details</h3>

                {isSearching && (
                    <div style={detailHintStyle}><p>Querying OpenStreetMap…</p></div>
                )}
                {!isSearching && selectedPole && (
                    <PoleCard pole={selectedPole} />
                )}
                {!isSearching && !selectedPole && !isZoomedOut && nearbyPoles.length > 0 && (
                    <div style={detailHintStyle}>
                        <p style={{ fontSize: 15 }}>
                            <strong>{nearbyPoles.length}</strong> pole{nearbyPoles.length !== 1 ? 's' : ''} in view.
                        </p>
                        <p style={{ fontSize: 13, color: '#999' }}>Click an orange pin to inspect it.</p>
                    </div>
                )}
                {!isSearching && !selectedPole && isZoomedOut && (
                    <div style={detailHintStyle}>
                        <p style={{ fontSize: 13, color: '#999' }}>Zoom in on the map to discover poles.</p>
                    </div>
                )}
                {!isSearching && !selectedPole && !isZoomedOut && searchError && (
                    <div style={detailHintStyle}>
                        <p style={{ color: '#c0392b' }}>OpenStreetMap query failed.</p>
                        <p style={{ fontSize: 12, color: '#999' }}>{searchError}</p>
                    </div>
                )}
                {!isSearching && !selectedPole && !isZoomedOut && !searchError && nearbyPoles.length === 0 && (
                    <div style={detailHintStyle}>
                        <p style={{ color: '#c0392b' }}>No poles found in this area.</p>
                        <p style={{ fontSize: 12, color: '#999' }}>Try panning toward a road or power line.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const overlayStyle: React.CSSProperties = {
    position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.6)', color: '#fff',
    padding: '6px 14px', borderRadius: 20,
    fontSize: 13, fontFamily: 'monospace', zIndex: 1000,
    pointerEvents: 'none', whiteSpace: 'nowrap',
};

const detailHintStyle: React.CSSProperties = {
    textAlign: 'center', color: '#666', marginTop: '40px',
};

export default PoleMap;
