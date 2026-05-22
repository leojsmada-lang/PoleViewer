export interface Attachment {
    id: number;
    type: 'Power' | 'Telecom' | 'Fiber';
    height: number;
    diameter: number;
}

export interface Pole {
    id: number;
    latitude: number;
    longitude: number;
    height: number;
    age: number;
    condition: 'Good' | 'Fair' | 'Poor';
    attachments: Attachment[];
}