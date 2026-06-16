import React, { useState, useCallback, useRef } from 'react';
import './fixLeafletIcons';
import { findPolesInBounds } from './services/overpassService';
import { Pole } from './types/Pole';
import PoleMap from './components/PoleMap';
import PoleViewer3D from './components/PoleViewer3D';

const MIN_ZOOM = 13;

function App() {
    const [selectedPole, setSelectedPole] = useState<Pole | null>(null);
    const [nearbyPoles, setNearbyPoles]   = useState<Pole[]>([]);
    const [activeTab, setActiveTab]       = useState<'map' | '3d'>('map');
    const [isSearching, setIsSearching]   = useState(false);
    const [isZoomedOut, setIsZoomedOut]   = useState(false);
    const [searchError, setSearchError]   = useState('');
    const requestId = useRef(0);

    const handleViewIn3D = useCallback((pole: Pole) => {
        setSelectedPole(pole);
        setActiveTab('3d');
    }, []);

    const handleBoundsChange = useCallback(async (
        south: number, west: number, north: number, east: number, zoom: number
    ) => {
        if (zoom < MIN_ZOOM) {
            setIsZoomedOut(true);
            setNearbyPoles([]);
            setSelectedPole(null);
            setSearchError('');
            return;
        }
        setIsZoomedOut(false);

        // Discard responses that arrive after a newer request has started.
        const id = ++requestId.current;
        setIsSearching(true);
        setSearchError('');

        try {
            const poles = await findPolesInBounds(south, west, north, east);
            if (id !== requestId.current) return;

            setIsSearching(false);
            setNearbyPoles(poles);
            setSearchError('');
            // Keep the selection only if the pole is still in the new result set.
            setSelectedPole(prev => (prev && poles.some(p => p.id === prev.id) ? prev : null));
        } catch (err: any) {
            if (id !== requestId.current) return;

            setIsSearching(false);
            setNearbyPoles([]);
            setSelectedPole(null);
            setSearchError(err?.message ?? 'Unable to query OpenStreetMap.');
        }
    }, []);

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
                    Pan and zoom the map to discover OSM power poles. Click a pin to inspect it in 3D.
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
                        onBoundsChange={handleBoundsChange}
                        nearbyPoles={nearbyPoles}
                        selectedPole={selectedPole}
                        isSearching={isSearching}
                        isZoomedOut={isZoomedOut}
                        searchError={searchError}
                        onPoleSelect={setSelectedPole}
                        onViewIn3D={handleViewIn3D}
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
                            <p style={{ fontSize: 13 }}>Go to Map View and click a pole pin to select one.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default App;
