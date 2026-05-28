export interface Attachment {
    id: number;
    type: 'Power' | 'Telecom' | 'Fiber';
    height: number;   // height above ground where this attachment is mounted (feet)
    diameter: number; // diameter of the attachment hardware (feet)
}

export interface Pole {
    id: number;
    latitude: number;
    longitude: number;
    height?: number;      // feet — optional; OSM rarely carries this tag
    attachments: Attachment[];
}
