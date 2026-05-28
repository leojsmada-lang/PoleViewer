// PoleMap.tsx — interactive map view.
//
// The user clicks anywhere on the map; the click coordinates are passed up to
// App.tsx which queries OSM and returns the nearest pole. That pole is then
// displayed as a marker here.
//
// useMapEvents is a react-leaflet hook that lets a child component subscribe
// to Leaflet map events (click, zoom, move, etc.) without needing a ref to
// the map instance directly.

import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Pole } from '../types/Pole';
import PoleCard from './PoleCard';

// A small child component whose only job is to listen for map clicks and
// forward them to the parent. It renders nothing — returning null is valid JSX.
const ClickHandler: React.FC<{ onClick: (lat: number, lng: number) => void }> = ({ onClick }) => {
    useMapEvents({
        click(e) {
            onClick(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
};

// A red pin used to mark the user's clicked location while OSM is loading.
const redIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize:   [25, 41],
    iconAnchor: [12, 41],
    popupAnchor:[1, -34],
    shadowSize: [41, 41],
});

interface PoleMapProps {
    onMapClick:    (lat: number, lng: number) => void;
    clickPoint:    { lat: number; lng: number } | null; // where the user last clicked
    nearestPole:   Pole | null;                          // OSM result (null while loading)
    isSearching:   boolean;
    onPoleSelect:  (pole: Pole) => void;
}

const PoleMap: React.FC<PoleMapProps> = ({
    onMapClick,
    clickPoint,
    nearestPole,
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

                    {/* Red pin at the clicked point — shown while loading */}
                    {clickPoint && isSearching && (
                        <Marker position={[clickPoint.lat, clickPoint.lng]} icon={redIcon}>
                            <Popup>Searching for nearest pole…</Popup>
                        </Marker>
                    )}

                    {/* Blue default marker for the found OSM pole */}
                    {nearestPole && (
                        <Marker
                            position={[nearestPole.latitude, nearestPole.longitude]}
                            eventHandlers={{ click: () => onPoleSelect(nearestPole) }}
                        >
                            <Popup>
                                <strong>OSM Pole #{nearestPole.id}</strong><br />
                                {nearestPole.height ? `Height: ${nearestPole.height} ft` : 'Height: unknown'}<br />
                                Lat: {nearestPole.latitude.toFixed(5)}<br />
                                Lng: {nearestPole.longitude.toFixed(5)}
                            </Popup>
                        </Marker>
                    )}
                </MapContainer>

                {/* Searching overlay hint */}
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

                {/* Idle hint when nothing has been clicked yet */}
                {!clickPoint && !isSearching && (
                    <div style={{
                        position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
                        background: 'rgba(0,0,0,0.55)', color: '#fff',
                        padding: '6px 14px', borderRadius: 20,
                        fontSize: 13, fontFamily: 'monospace', zIndex: 1000,
                        pointerEvents: 'none',
                    }}>
                        Click anywhere to find the nearest pole
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
                {!isSearching && nearestPole && <PoleCard pole={nearestPole} />}
                {!isSearching && !nearestPole && !clickPoint && (
                    <div style={{ textAlign: 'center', color: '#999', marginTop: '40px' }}>
                        <p>Click the map to find a nearby pole</p>
                    </div>
                )}
                {!isSearching && !nearestPole && clickPoint && (
                    <div style={{ textAlign: 'center', color: '#c0392b', marginTop: '40px' }}>
                        <p>No pole found within 500 m.</p>
                        <p style={{ fontSize: 12 }}>Try clicking closer to a road or power line.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PoleMap;
