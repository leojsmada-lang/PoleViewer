// types/Pole.ts — shared TypeScript type definitions.
//
// TypeScript interfaces describe the *shape* of data objects. They exist only
// at compile time — they're erased from the JavaScript that runs in the browser.
// Defining them in one place means every file that imports Pole/Attachment gets
// the same definition, and TypeScript will catch mismatches at build time.

// Attachment represents a single piece of equipment mounted on a pole.
// The `type` field uses a union of string literals instead of plain `string`
// so TypeScript will error if you accidentally write 'Telephone' or 'fiber'.
export interface Attachment {
    id: number;
    type: 'Power' | 'Telecom' | 'Fiber'; // only these three values are valid
    height: number;   // height above ground where this attachment is mounted (feet)
    diameter: number; // diameter of the attachment hardware (feet)
}

// Pole represents a single utility pole in the field.
// Each pole has a GPS location, physical properties, a condition rating,
// and a list of attachments (wires, cables, etc.) mounted on it.
export interface Pole {
    id: number;
    latitude: number;   // WGS84 decimal degrees (e.g. 33.4734)
    longitude: number;  // WGS84 decimal degrees (e.g. -84.4563)
    height: number;     // total pole height in feet
    age: number;        // years since installation
    condition: 'Good' | 'Fair' | 'Poor'; // inspection rating
    attachments: Attachment[];
}
