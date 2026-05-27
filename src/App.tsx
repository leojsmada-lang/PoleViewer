// App.tsx — the root component of the application.

import React, { useState, useEffect } from 'react';
import './fixLeafletIcons';
import { mockPoles } from './data/mockPoles';
import { fetchPolesFromOSM } from './services/overpassService';
import { Pole } from './types/Pole';
import PoleCard from './components/PoleCard';
import PoleMap from './components/PoleMap';
import PoleViewer3D from './components/PoleViewer3D';

// Centre of the Fayette County search area (used for the OSM Overpass query).
// Change these to relocate the entire pole dataset to a different area.
const SEARCH_LAT = 33.4734;
const SEARCH_LNG = -84.4563;

function App() {
    const [selectedPole, setSelectedPole] = useState<Pole | null>(null);
    const [activeTab, setActiveTab] = useState<'cards' | 'map' | '3d'>('cards');
    const [poles, setPoles] = useState<Pole[]>(mockPoles);
    const [polesSource, setPolesSource] = useState<'mock' | 'osm' | 'loading'>('mock');

    // On mount, try to fetch real pole locations from OSM.
    // Falls back to mockPoles if the network request fails or returns nothing.
    useEffect(() => {
        setPolesSource('loading');
        fetchPolesFromOSM(SEARCH_LAT, SEARCH_LNG, 20).then(osmPoles => {
            if (osmPoles.length > 0) {
                setPoles(osmPoles);
                setPolesSource('osm');
                // Auto-select the first OSM pole so the 3D view has something to show.
                setSelectedPole(osmPoles[0]);
            } else {
                setPoles(mockPoles);
                setPolesSource('mock');
            }
        });
    }, []);

    const tabStyle = (tab: 'cards' | 'map' | '3d'): React.CSSProperties => ({
        padding: '10px 24px',
        cursor: 'pointer',
        border: 'none',
        borderBottom: activeTab === tab ? '3px solid #3498db' : '3px solid transparent',
        backgroundColor: 'transparent',
        fontWeight: activeTab === tab ? 'bold' : 'normal',
        color: activeTab === tab ? '#3498db' : '#666',
        fontSize: '16px'
    });

    const sourceLabel = polesSource === 'loading' ? 'Loading…'
        : polesSource === 'osm' ? `${poles.length} poles (OpenStreetMap)`
        : `${poles.length} poles (demo data)`;

    return (
        <div style={{
            fontFamily: 'Arial',
            padding: '20px',
            backgroundColor: '#f0f2f5',
            minHeight: '100vh'
        }}>

            {/* ── HEADER ──────────────────────────────────────────────────────── */}
            <div style={{
                backgroundColor: '#2c3e50',
                margin: '-20px -20px 20px -20px',
                padding: '20px',
                color: 'white',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div>
                    <h1 style={{ margin: 0 }}>⚡ Pole Inspection Viewer</h1>
                    <p style={{ margin: '4px 0 0 0', opacity: 0.7 }}>{sourceLabel}</p>
                </div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '14px' }}>
                    <span>✅ {poles.filter(p => p.condition === 'Good').length} Good</span>
                    <span>⚠️ {poles.filter(p => p.condition === 'Fair').length} Fair</span>
                    <span>❌ {poles.filter(p => p.condition === 'Poor').length} Poor</span>
                </div>
            </div>

            {/* ── TAB BAR ─────────────────────────────────────────────────────── */}
            <div style={{
                backgroundColor: '#fff',
                borderRadius: '8px',
                marginBottom: '20px',
                padding: '0 16px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
                <button style={tabStyle('cards')} onClick={() => setActiveTab('cards')}>📋 Card View</button>
                <button style={tabStyle('map')}   onClick={() => setActiveTab('map')}>🗺️ Map View</button>
                <button style={tabStyle('3d')}    onClick={() => setActiveTab('3d')}>🏗️ 3D View</button>
            </div>

            {/* ── CARD VIEW ───────────────────────────────────────────────────── */}
            {activeTab === 'cards' && (
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    {poles.map(pole => (
                        <div
                            key={pole.id}
                            onClick={() => setSelectedPole(pole)}
                            style={{
                                cursor: 'pointer',
                                border: selectedPole?.id === pole.id ? '2px solid #3498db' : '2px solid transparent',
                                borderRadius: '10px',
                                width: '280px'
                            }}
                        >
                            <PoleCard pole={pole} />
                        </div>
                    ))}
                </div>
            )}

            {/* ── MAP VIEW ────────────────────────────────────────────────────── */}
            {activeTab === 'map' && (
                <div style={{
                    backgroundColor: '#fff',
                    borderRadius: '8px',
                    padding: '16px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                    <PoleMap
                        onPoleSelect={(pole) => setSelectedPole(pole)}
                        selectedPole={selectedPole}
                        poles={poles}
                    />
                </div>
            )}

            {/* ── 3D VIEW ─────────────────────────────────────────────────────── */}
            {activeTab === '3d' && (
                <div style={{
                    backgroundColor: '#fff',
                    borderRadius: '8px',
                    padding: '16px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                        {poles.map(pole => (
                            <button
                                key={pole.id}
                                onClick={() => setSelectedPole(pole)}
                                style={{
                                    padding: '8px 16px',
                                    cursor: 'pointer',
                                    backgroundColor: selectedPole?.id === pole.id ? '#3498db' : '#f0f2f5',
                                    color: selectedPole?.id === pole.id ? 'white' : '#333',
                                    border: '1px solid #ddd',
                                    borderRadius: '6px',
                                    fontWeight: 'bold'
                                }}
                            >
                                Pole #{pole.id} — {pole.condition}
                            </button>
                        ))}
                    </div>

                    {selectedPole ? (
                        <PoleViewer3D pole={selectedPole} />
                    ) : (
                        <div style={{ textAlign: 'center', color: '#888', padding: '40px' }}>
                            Select a pole above to view it in 3D.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default App;
