import React, { useState } from 'react';
import './fixLeafletIcons';
import { findPolesInArea } from './services/overpassService';
import { Pole } from './types/Pole';
import PoleMap from './components/PoleMap';
import PoleViewer3D from './components/PoleViewer3D';

function App() {
    const [selectedPole, setSelectedPole]   = useState<Pole | null>(null);
    const [nearbyPoles, setNearbyPoles]     = useState<Pole[]>([]);
    const [activeTab, setActiveTab]         = useState<'map' | '3d'>('map');
    const [clickPoint, setClickPoint]       = useState<{ lat: number; lng: number } | null>(null);
    const [isSearching, setIsSearching]     = useState(false);

    const handleMapClick = async (lat: number, lng: number) => {
        setClickPoint({ lat, lng });
        setSelectedPole(null);
        setNearbyPoles([]);
        setIsSearching(true);
        const poles = await findPolesInArea(lat, lng);
        setIsSearching(false);
        setNearbyPoles(poles);
    };

    const tabStyle = (tab: 'map' | '3d'): React.CSSProperties => ({
        padding: '10px 24px',
        cursor: 'pointer',
        border: 'none',
        borderBottom: activeTab === tab ? '3px solid #3498db' : '3px solid transparent',
        backgroundColor: 'transparent',
        fontWeight: activeTab === tab ? 'bold' : 'normal',
        color: activeTab === tab ? '#3498db' : '#666',
        fontSize: '16px',
    });

    return (
        <div style={{ fontFamily: 'Arial', padding: '20px', backgroundColor: '#f0f2f5', minHeight: '100vh' }}>

            {/* HEADER */}
            <div style={{
                backgroundColor: '#2c3e50',
                margin: '-20px -20px 20px -20px',
                padding: '20px',
                color: 'white',
            }}>
                <h1 style={{ margin: 0 }}>Pole Inspection Viewer</h1>
                <p style={{ margin: '4px 0 0 0', opacity: 0.7 }}>
                    Click the map to find nearby OSM power poles, select one to inspect, and render it in 3D with USGS LiDAR.
                </p>
            </div>

            {/* TAB BAR */}
            <div style={{
                backgroundColor: '#fff',
                borderRadius: '8px',
                marginBottom: '20px',
                padding: '0 16px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            }}>
                <button style={tabStyle('map')} onClick={() => setActiveTab('map')}>Map View</button>
                <button style={tabStyle('3d')}  onClick={() => setActiveTab('3d')}>3D View</button>
            </div>

            {/* MAP VIEW */}
            {activeTab === 'map' && (
                <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                    <PoleMap
                        onMapClick={handleMapClick}
                        clickPoint={clickPoint}
                        nearbyPoles={nearbyPoles}
                        selectedPole={selectedPole}
                        isSearching={isSearching}
                        onPoleSelect={setSelectedPole}
                    />
                </div>
            )}

            {/* 3D VIEW */}
            {activeTab === '3d' && (
                <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                    {selectedPole ? (
                        <PoleViewer3D pole={selectedPole} />
                    ) : (
                        <div style={{ textAlign: 'center', color: '#888', padding: '60px 0' }}>
                            <p style={{ fontSize: 16 }}>No pole selected.</p>
                            <p style={{ fontSize: 13 }}>Go to Map View and click near a power line to find a pole.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default App;
