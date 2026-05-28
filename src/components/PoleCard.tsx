// PoleCard.tsx — displays summary info for a single pole.
//
// Presentational component: receives data via props, renders HTML, no state.

import React from 'react';
import { Pole } from '../types/Pole';

interface PoleCardProps {
    pole: Pole;
}

const attachmentColors: Record<string, string> = {
    Power:   '#e74c3c',
    Telecom: '#3498db',
    Fiber:   '#2ecc71',
};

const PoleCard: React.FC<PoleCardProps> = ({ pole }) => {
    return (
        <div style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '16px',
            backgroundColor: '#fff',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}>
            <h3 style={{ margin: '0 0 12px 0' }}>Pole #{pole.id}</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <p style={{ margin: 0 }}>
                    📏 Height: <strong>{pole.height ? `${pole.height} ft` : 'unknown'}</strong>
                </p>
                <p style={{ margin: 0 }}>
                    📍 Lat: <strong>{pole.latitude.toFixed(5)}</strong>
                </p>
                <p style={{ margin: 0 }}>
                    📍 Lng: <strong>{pole.longitude.toFixed(5)}</strong>
                </p>
            </div>

            <div>
                <p style={{ margin: '0 0 8px 0', fontWeight: 'bold' }}>
                    Attachments ({pole.attachments.length})
                </p>
                {pole.attachments.map(att => (
                    <div key={att.id} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '4px 8px',
                        marginBottom: '4px',
                        borderRadius: '4px',
                        backgroundColor: '#f8f9fa',
                        borderLeft: `4px solid ${attachmentColors[att.type] ?? '#999'}`,
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
