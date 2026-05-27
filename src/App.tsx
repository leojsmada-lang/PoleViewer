// App.tsx — the root component of the application.
//
// This is the top of the component tree. Every other component is rendered
// from here. App is responsible for:
//   1. Holding shared state (which pole is selected, which tab is active)
//   2. Rendering the header, tab bar, and the correct view for the active tab
//   3. Passing state and callbacks down to child components via props

import React, { useState } from 'react';
import './fixLeafletIcons';          // must run before any map renders (see that file)
import { mockPoles } from './data/mockPoles';
import { Pole } from './types/Pole';
import PoleCard from './components/PoleCard';
import PoleMap from './components/PoleMap';
import PoleViewer3D from './components/PoleViewer3D';

function App() {
    // useState returns [currentValue, setterFunction].
    // When the setter is called, React re-renders the component with the new value.

    // selectedPole tracks which pole the user has clicked on.
    // `null` means no pole is selected yet.
    const [selectedPole, setSelectedPole] = useState<Pole | null>(null);

    // activeTab tracks which of the three views is currently shown.
    // The union type 'cards' | 'map' | '3d' prevents invalid values.
    const [activeTab, setActiveTab] = useState<'cards' | 'map' | '3d'>('cards');

    // tabStyle returns inline CSS for a tab button.
    // The active tab gets a blue underline and bold text; inactive tabs are grey.
    // This is a plain function (not a component) — it returns a style object, not JSX.
    const tabStyle = (tab: 'cards' | 'map' | '3d'): React.CSSProperties => ({
        padding: '10px 24px',
        cursor: 'pointer',
        border: 'none',
        borderBottom: activeTab === tab
            ? '3px solid #3498db'   // active: blue underline
            : '3px solid transparent', // inactive: invisible underline (keeps height stable)
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
            minHeight: '100vh'  // ensures the background fills the full screen height
        }}>

            {/* ── HEADER ──────────────────────────────────────────────────────── */}
            {/* Negative margins pull the header to the edges, overcoming the 20px
                padding on the outer div — a quick way to get a full-width header
                without restructuring the layout. */}
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

                {/* Condition summary — counts how many poles have each rating.
                    .filter() returns a new array of only the matching poles,
                    and .length gives the count. */}
                <div style={{ display: 'flex', gap: '16px', fontSize: '14px' }}>
                    <span>✅ {mockPoles.filter(p => p.condition === 'Good').length} Good</span>
                    <span>⚠️ {mockPoles.filter(p => p.condition === 'Fair').length} Fair</span>
                    <span>❌ {mockPoles.filter(p => p.condition === 'Poor').length} Poor</span>
                </div>
            </div>

            {/* ── TAB BAR ─────────────────────────────────────────────────────── */}
            {/* Clicking a tab calls setActiveTab, which updates state and causes
                React to re-render App, showing the correct view panel below. */}
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

            {/* ── CARD VIEW ───────────────────────────────────────────────────── */}
            {/* The `&&` operator is a React conditional rendering shorthand:
                if activeTab === 'cards' is true, render the div; otherwise render nothing.
                Only one view is in the DOM at a time — the others are fully unmounted,
                which means the 3D scene and map are destroyed when you switch tabs. */}
            {activeTab === 'cards' && (
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    {mockPoles.map(pole => (
                        // Wrapping PoleCard in a clickable div lets us highlight the
                        // selected card with a blue border without modifying PoleCard itself.
                        <div
                            key={pole.id}
                            onClick={() => setSelectedPole(pole)}
                            style={{
                                cursor: 'pointer',
                                border: selectedPole?.id === pole.id
                                    ? '2px solid #3498db'   // selected: blue border
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

            {/* ── MAP VIEW ────────────────────────────────────────────────────── */}
            {activeTab === 'map' && (
                <div style={{
                    backgroundColor: '#fff',
                    borderRadius: '8px',
                    padding: '16px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                    {/* Pass selectedPole down so PoleMap can show the detail panel,
                        and pass a callback so PoleMap can update selectedPole when
                        the user clicks a marker. This is called "lifting state up" —
                        the state lives in App so both the tab bar and map can read it. */}
                    <PoleMap
                        onPoleSelect={(pole) => setSelectedPole(pole)}
                        selectedPole={selectedPole}
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
                    {/* Pole selector buttons — one per pole.
                        The active button gets a blue background via the ternary style. */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                        {mockPoles.map(pole => (
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

                    {/* Show the 3D viewer if a pole is selected, otherwise a prompt.
                        PoleViewer3D mounts a Three.js canvas and starts streaming
                        LiDAR data as soon as it renders. Unmounting it (switching
                        tabs or selecting a different pole) cancels the stream via
                        the cleanup function in its useEffect. */}
                    {selectedPole
                        ? <PoleViewer3D pole={selectedPole} />
                        : (
                            <div style={{ textAlign: 'center', padding: '60px', color: '#999' }}>
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
