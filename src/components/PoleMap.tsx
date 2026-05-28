import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Pole } from '../types/Pole';
import PoleCard from './PoleCard';

const ClickHandler: React.FC<{ onClick: (lat: number, lng: number) => void }> = ({ onClick }) => {
    useMapEvents({
        click(e) {
            onClick(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
};

// Auto-fits the map viewport to show all found poles after a search.
const FitBounds: React.FC<{ poles: Pole[] }> = ({ poles }) => {
    const map = useMap();
    useEffect(() => {
        if (poles.length > 0) {
            const bounds = L.latLngBounds(poles.map(p => [p.latitude, p.longitude] as [number, number]));
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        }
    }, [poles, map]);
    return null;
};

const redIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize:   [25, 41],
    iconAnchor: [12, 41],
    popupAnchor:[1, -34],
    shadowSize: [41, 41],
});

// SVG pin: circle on top of a vertical pole stem.
// Orange = unselected, green = selected.
const createPoleIcon = (selected: boolean) => L.divIcon({
    className: '',
    html: `<svg width="26" height="38" viewBox="0 0 26 38" xmlns="http://www.w3.org/2000/svg">
        <rect x="12" y="16" width="2" height="22" fill="#5C3D1E"/>
        <rect x="4" y="13" width="18" height="2.5" fill="#4A2E10" rx="1"/>
        <circle cx="13" cy="9" r="8" fill="${selected ? '#27ae60' : '#e67e22'}" stroke="white" stroke-width="2"/>
        <text x="13" y="13" text-anchor="middle" font-size="11" fill="white" font-weight="bold" font-family="Arial,sans-serif">P</text>
    </svg>`,
    iconSize: [26, 38],
    iconAnchor: [13, 38],
    popupAnchor: [0, -38],
});

interface PoleMapProps {
    onMapClick:   (lat: number, lng: number) => void;
    clickPoint:   { lat: number; lng: number } | null;
    nearbyPoles:  Pole[];
    selectedPole: Pole | null;
    isSearching:  boolean;
    onPoleSelect: (pole: Pole) => void;
}

const PoleMap: React.FC<PoleMapProps> = ({
    onMapClick,
    clickPoint,
    nearbyPoles,
    selectedPole,
    isSearching,
    onPoleSelect,
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

                    <ClickHandler onClick={onMapClick} />
                    <FitBounds poles={nearbyPoles} />

                    {/* Red pin at clicked point while OSM is loading */}
                    {clickPoint && isSearching && (
                        <Marker position={[clickPoint.lat, clickPoint.lng]} icon={redIcon}>
                            <Popup>Searching for poles…</Popup>
                        </Marker>
                    )}

                    {/* All nearby poles as clickable icons */}
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
                                        onClick={() => onPoleSelect(pole)}
                                        style={{
                                            marginTop: 6, padding: '4px 10px',
                                            background: '#3498db', color: 'white',
                                            border: 'none', borderRadius: 4,
                                            cursor: 'pointer', fontSize: 12,
                                        }}
                                    >
                                        Select this pole
                                    </button>
                                </Popup>
                            </Marker>
                        );
                    })}
                </MapContainer>

                {/* Searching overlay */}
                {isSearching && (
                    <div style={{
                        position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
                        background: 'rgba(0,0,0,0.65)', color: '#fff',
                        padding: '6px 14px', borderRadius: 20,
                        fontSize: 13, fontFamily: 'monospace', zIndex: 1000,
                        pointerEvents: 'none',
                    }}>
                        Searching OSM…
                    </div>
                )}

                {/* Idle hint */}
                {!clickPoint && !isSearching && (
                    <div style={{
                        position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
                        background: 'rgba(0,0,0,0.55)', color: '#fff',
                        padding: '6px 14px', borderRadius: 20,
                        fontSize: 13, fontFamily: 'monospace', zIndex: 1000,
                        pointerEvents: 'none',
                    }}>
                        Click anywhere to find nearby poles
                    </div>
                )}

                {/* Results count badge */}
                {!isSearching && nearbyPoles.length > 0 && (
                    <div style={{
                        position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
                        background: 'rgba(39,174,96,0.85)', color: '#fff',
                        padding: '6px 14px', borderRadius: 20,
                        fontSize: 13, fontFamily: 'monospace', zIndex: 1000,
                        pointerEvents: 'none',
                    }}>
                        {nearbyPoles.length} pole{nearbyPoles.length !== 1 ? 's' : ''} found — click a pin to select
                    </div>
                )}
            </div>

            {/* DETAIL PANEL */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                padding: '16px',
            }}>
                <h3 style={{ margin: '0 0 16px 0', color: '#2c3e50' }}>Pole Details</h3>
                {isSearching && (
                    <div style={{ textAlign: 'center', color: '#888', marginTop: '40px' }}>
                        <p>Querying OpenStreetMap…</p>
                    </div>
                )}
                {!isSearching && selectedPole && <PoleCard pole={selectedPole} />}
                {!isSearching && !selectedPole && nearbyPoles.length > 0 && (
                    <div style={{ textAlign: 'center', color: '#666', marginTop: '40px' }}>
                        <p style={{ fontSize: 15 }}>
                            <strong>{nearbyPoles.length}</strong> pole{nearbyPoles.length !== 1 ? 's' : ''} found nearby.
                        </p>
                        <p style={{ fontSize: 13, color: '#999' }}>Click an orange pin on the map to inspect it.</p>
                    </div>
                )}
                {!isSearching && !selectedPole && nearbyPoles.length === 0 && !clickPoint && (
                    <div style={{ textAlign: 'center', color: '#999', marginTop: '40px' }}>
                        <p>Click the map to find nearby poles</p>
                    </div>
                )}
                {!isSearching && !selectedPole && nearbyPoles.length === 0 && clickPoint && (
                    <div style={{ textAlign: 'center', color: '#c0392b', marginTop: '40px' }}>
                        <p>No poles found within 1,500 m.</p>
                        <p style={{ fontSize: 12 }}>Try clicking closer to a road or power line.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PoleMap;
