import React from 'react';
import { Pole } from '../types/Pole';

interface PoleCardProps {
    pole: Pole;
}

const PoleCard: React.FC<PoleCardProps> = ({ pole }) => {

    const conditionStyles: Record<string, React.CSSProperties> = {
        Good: { backgroundColor: '#d4edda', color: '#155724', padding: '4px 10px', borderRadius: '12px' },
        Fair: { backgroundColor: '#fff3cd', color: '#856404', padding: '4px 10px', borderRadius: '12px' },
        Poor: { backgroundColor: '#f8d7da', color: '#721c24', padding: '4px 10px', borderRadius: '12px' },
    };

    const attachmentColors: Record<string, string> = {
        Power: '#e74c3c',
        Telecom: '#3498db',
        Fiber: '#2ecc71'
    };

    return (
        <div style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '16px',
            backgroundColor: '#fff',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Pole #{pole.id}</h3>
                <span style={conditionStyles[pole.condition]}>
                    {pole.condition}
                </span>
            </div>

            <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <p style={{ margin: 0 }}>📏 Height: <strong>{pole.height} ft</strong></p>
                <p style={{ margin: 0 }}>📅 Age: <strong>{pole.age} yrs</strong></p>
                <p style={{ margin: 0 }}>📍 Lat: <strong>{pole.latitude}</strong></p>
                <p style={{ margin: 0 }}>📍 Lng: <strong>{pole.longitude}</strong></p>
            </div>

            <div style={{ marginTop: '12px' }}>
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