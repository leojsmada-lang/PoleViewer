// PoleCard.tsx — a single card that displays one pole's summary info.
//
// This is a "presentational" component — it receives data via props and
// renders HTML. It has no state and makes no network requests. Keeping
// display logic separate from data-fetching logic makes components easier
// to test and reuse.

import React from 'react';
import { Pole } from '../types/Pole';

// PoleCardProps defines what data this component expects to receive.
// React.FC<PoleCardProps> means "a Function Component that takes PoleCardProps".
interface PoleCardProps {
    pole: Pole;
}

const PoleCard: React.FC<PoleCardProps> = ({ pole }) => {
    // `pole` is destructured from props — shorthand for `const pole = props.pole`.

    // A lookup table mapping condition strings to inline CSS styles.
    // Record<string, React.CSSProperties> means "an object whose keys are strings
    // and values are valid CSS style objects". Using a lookup table instead of
    // if/else keeps the rendering JSX clean.
    const conditionStyles: Record<string, React.CSSProperties> = {
        Good: { backgroundColor: '#d4edda', color: '#155724', padding: '4px 10px', borderRadius: '12px' },
        Fair: { backgroundColor: '#fff3cd', color: '#856404', padding: '4px 10px', borderRadius: '12px' },
        Poor: { backgroundColor: '#f8d7da', color: '#721c24', padding: '4px 10px', borderRadius: '12px' },
    };

    // Color-codes each attachment type for the left border stripe on each row.
    const attachmentColors: Record<string, string> = {
        Power:   '#e74c3c', // red
        Telecom: '#3498db', // blue
        Fiber:   '#2ecc71'  // green
    };

    return (
        <div style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '16px',
            backgroundColor: '#fff',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
            {/* Header row: pole ID on the left, condition badge on the right */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Pole #{pole.id}</h3>
                {/* conditionStyles[pole.condition] picks the matching style object */}
                <span style={conditionStyles[pole.condition]}>
                    {pole.condition}
                </span>
            </div>

            {/* 2-column grid of key stats */}
            <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <p style={{ margin: 0 }}>📏 Height: <strong>{pole.height} ft</strong></p>
                <p style={{ margin: 0 }}>📅 Age: <strong>{pole.age} yrs</strong></p>
                <p style={{ margin: 0 }}>📍 Lat: <strong>{pole.latitude}</strong></p>
                <p style={{ margin: 0 }}>📍 Lng: <strong>{pole.longitude}</strong></p>
            </div>

            {/* Attachment list — one row per attachment */}
            <div style={{ marginTop: '12px' }}>
                <p style={{ margin: '0 0 8px 0', fontWeight: 'bold' }}>
                    Attachments ({pole.attachments.length})
                </p>
                {/* .map() transforms the attachments array into an array of JSX elements.
                    The `key` prop is required by React when rendering lists — it lets React
                    efficiently update only the changed items when the list changes. */}
                {pole.attachments.map(att => (
                    <div key={att.id} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '4px 8px',
                        marginBottom: '4px',
                        borderRadius: '4px',
                        backgroundColor: '#f8f9fa',
                        // Template literal dynamically injects the color for this attachment type
                        borderLeft: `4px solid ${attachmentColors[att.type]}`
                    }}>
                        <span>{att.type}</span>
                        <span>{att.height} ft</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default PoleCard;
