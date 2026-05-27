// PoleMap.tsx — interactive map view showing all poles as clickable markers.
//
// Uses react-leaflet, which wraps the Leaflet.js mapping library in React
// components. Leaflet renders an interactive map (pan/zoom) using map tiles
// fetched from a tile server (OpenStreetMap in this case).

import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Pole } from '../types/Pole';
import { mockPoles } from '../data/mockPoles';
import PoleCard from './PoleCard';

// Props this component accepts from its parent (App.tsx).
interface PoleMapProps {
    onPoleSelect: (pole: Pole) => void; // called when user clicks a marker
    selectedPole: Pole | null;          // currently selected pole (can be none)
}

const PoleMap: React.FC<PoleMapProps> = ({ onPoleSelect, selectedPole }) => {
    return (
        // Side-by-side layout: map on the left (flex: 2), detail panel on the right (flex: 1).
        // flex: 2 means the map gets 2/3 of the space, the panel gets 1/3.
        <div style={{ display: 'flex', height: '500px', gap: '16px' }}>

            {/* MAP PANEL ─────────────────────────────────────────────────────── */}
            <div style={{ flex: 2, borderRadius: '8px', overflow: 'hidden' }}>
                {/*
                  MapContainer sets up the Leaflet map instance.
                  - center: the initial lat/lng the map is centered on (Pole #1's location)
                  - zoom: initial zoom level (13 = neighborhood scale)
                  This component must only be rendered once — Leaflet doesn't support
                  re-mounting the same map element, which is why it lives in its own component.
                */}
                <MapContainer
                    center={[33.4734, -84.4563]}
                    zoom={13}
                    style={{ height: '100%', width: '100%' }}
                >
                    {/*
                      TileLayer fetches and displays the background map imagery.
                      The URL template uses {s} (subdomain), {z} (zoom), {x}, {y}
                      to request the correct map tile for the current view.
                      OpenStreetMap is free and open — no API key required.
                    */}
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; OpenStreetMap contributors'
                    />

                    {/*
                      Render one Marker per pole. Each Marker sits at the pole's
                      GPS coordinates and shows a Popup when clicked.
                      eventHandlers wires up Leaflet events to React handlers —
                      clicking a marker calls onPoleSelect, which updates the
                      selectedPole state in App.tsx and shows the detail panel.
                    */}
                    {mockPoles.map(pole => (
                        <Marker
                            key={pole.id}
                            position={[pole.latitude, pole.longitude]}
                            eventHandlers={{
                                click: () => onPoleSelect(pole)
                            }}
                        >
                            {/* Popup appears as a small callout above the marker when clicked */}
                            <Popup>
                                <strong>Pole #{pole.id}</strong><br />
                                Condition: {pole.condition}<br />
                                Height: {pole.height} ft<br />
                                Age: {pole.age} years
                            </Popup>
                        </Marker>
                    ))}
                </MapContainer>
            </div>

            {/* DETAIL PANEL ───────────────────────────────────────────────────── */}
            {/*
              Shows a PoleCard for the selected pole, or a placeholder message
              if no pole has been clicked yet.
              The ternary `selectedPole ? <PoleCard .../> : <placeholder>` is
              a common React pattern for conditional rendering.
            */}
            <div style={{
                flex: 1,
                overflowY: 'auto',       // scroll if the card is taller than the panel
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                padding: '16px'
            }}>
                <h3 style={{ margin: '0 0 16px 0', color: '#2c3e50' }}>
                    Pole Details
                </h3>
                {selectedPole
                    ? <PoleCard pole={selectedPole} />
                    : (
                        <div style={{ textAlign: 'center', color: '#999', marginTop: '40px' }}>
                            <p>📍 Click a marker on the map</p>
                            <p>to inspect a pole</p>
                        </div>
                    )
                }
            </div>
        </div>
    );
};

export default PoleMap;
