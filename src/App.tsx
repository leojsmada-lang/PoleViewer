import React, { useState } from 'react';
import './fixLeafletIcons';
import { mockPoles } from './data/mockPoles';
import { Pole } from './types/Pole';
import PoleCard from './components/PoleCard';
import PoleMap from './components/PoleMap';
import PoleViewer3D from './components/PoleViewer3D';

function App() {
    const [selectedPole, setSelectedPole] = useState<Pole | null>(null);
    const [activeTab, setActiveTab] = useState<'cards' | 'map' | '3d'>('cards');

    const tabStyle = (tab: 'cards' | 'map' | '3d'): React.CSSProperties => ({
        padding: '10px 24px',
        cursor: 'pointer',
        border: 'none',
        borderBottom: activeTab === tab
            ? '3px solid #3498db'
            : '3px solid transparent',
        backgroundColor: 'transparent',
        fontWeight: activeTab === tab ? 'bold' : 'normal',
        color: activeTab === tab ? '#3498db' : '#666',
        fontSize: '16px'
    });

    return (
        <div style={{
            fontFamily: 'Arial',
            padding: '20px',
            backgroundColor: '#f0f2f5',
            minHeight: '100vh'
        }}>
            {/* HEADER */}
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
                    <p style={{ margin: '4px 0 0 0', opacity: 0.7 }}>
                        {mockPoles.length} poles loaded
                    </p>
                </div>

                {/* Condition summary */}
                <div style={{ display: 'flex', gap: '16px', fontSize: '14px' }}>
                    <span>✅ {mockPoles.filter(p => p.condition === 'Good').length} Good</span>
                    <span>⚠️ {mockPoles.filter(p => p.condition === 'Fair').length} Fair</span>
                    <span>❌ {mockPoles.filter(p => p.condition === 'Poor').length} Poor</span>
                </div>
            </div>

            {/* TABS */}
            <div style={{
                backgroundColor: '#fff',
                borderRadius: '8px',
                marginBottom: '20px',
                padding: '0 16px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
                <button style={tabStyle('cards')} onClick={() => setActiveTab('cards')}>
                    📋 Card View
                </button>
                <button style={tabStyle('map')} onClick={() => setActiveTab('map')}>
                    🗺️ Map View
                </button>
                <button style={tabStyle('3d')} onClick={() => setActiveTab('3d')}>
                    🏗️ 3D View
                </button>
            </div>

            {/* CARD VIEW */}
            {activeTab === 'cards' && (
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    {mockPoles.map(pole => (
                        <div
                            key={pole.id}
                            onClick={() => setSelectedPole(pole)}
                            style={{
                                cursor: 'pointer',
                                border: selectedPole?.id === pole.id
                                    ? '2px solid #3498db'
                                    : '2px solid transparent',
                                borderRadius: '10px',
                                width: '280px'
                            }}
                        >
                            <PoleCard pole={pole} />
                        </div>
                    ))}
                </div>
            )}

            {/* MAP VIEW */}
            {activeTab === 'map' && (
                <div style={{
                    backgroundColor: '#fff',
                    borderRadius: '8px',
                    padding: '16px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                    <PoleMap
                        onPoleSelect={(pole) => {
                            setSelectedPole(pole);
                        }}
                        selectedPole={selectedPole}
                    />
                </div>
            )}

            {/* 3D VIEW */}
            {activeTab === '3d' && (
                <div style={{
                    backgroundColor: '#fff',
                    borderRadius: '8px',
                    padding: '16px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                    {/* Pole selector */}
                    <div style={{
                        display: 'flex',
                        gap: '8px',
                        marginBottom: '16px'
                    }}>
                        {mockPoles.map(pole => (
                            <button
                                key={pole.id}
                                onClick={() => setSelectedPole(pole)}
                                style={{
                                    padding: '8px 16px',
                                    cursor: 'pointer',
                                    backgroundColor: selectedPole?.id === pole.id
                                        ? '#3498db'
                                        : '#f0f2f5',
                                    color: selectedPole?.id === pole.id
                                        ? 'white'
                                        : '#333',
                                    border: '1px solid #ddd',
                                    borderRadius: '6px',
                                    fontWeight: 'bold'
                                }}
                            >
                                Pole #{pole.id} — {pole.condition}
                            </button>
                        ))}
                    </div>

                    {/* 3D Viewer */}
                    {selectedPole
                        ? <PoleViewer3D pole={selectedPole} />
                        : (
                            <div style={{
                                textAlign: 'center',
                                padding: '60px',
                                color: '#999'
                            }}>
                                <p style={{ fontSize: '48px' }}>🏗️</p>
                                <p>Select a pole above to view in 3D</p>
                            </div>
                        )
                    }
                </div>
            )}
        </div>
    );
}

export default App;