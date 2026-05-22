import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Pole } from '../types/Pole';
import { mockPoles } from '../data/mockPoles';
import PoleCard from './PoleCard';

interface PoleMapProps {
    onPoleSelect: (pole: Pole) => void;
    selectedPole: Pole | null;
}

const PoleMap: React.FC<PoleMapProps> = ({ onPoleSelect, selectedPole }) => {
    return (
        <div style={{ display: 'flex', height: '500px', gap: '16px' }}>

            {/* MAP PANEL */}
            <div style={{ flex: 2, borderRadius: '8px', overflow: 'hidden' }}>
                <MapContainer
                    center={[33.4734, -84.4563]}
                    zoom={13}
                    style={{ height: '100%', width: '100%' }}
                >
                    {/* Background map tiles from OpenStreetMap */}
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; OpenStreetMap contributors'
                    />

                    {/* Drop a marker for every pole */}
                    {mockPoles.map(pole => (
                        <Marker
                            key={pole.id}
                            position={[pole.latitude, pole.longitude]}
                            eventHandlers={{
                                click: () => onPoleSelect(pole)
                            }}
                        >
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

            {/* DETAIL PANEL */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
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
                        <div style={{
                            textAlign: 'center',
                            color: '#999',
                            marginTop: '40px'
                        }}>
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