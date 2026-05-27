// mockPoles.ts — sample pole data used during development.
//
// Because the app doesn't yet connect to a real backend API, this static
// array acts as a stand-in database. It lets you build and test the UI
// without needing a server. When a real API exists, this import can be
// swapped out for a fetch() call without changing any component code
// (as long as the data shape still matches the Pole interface).
//
// All three poles are located in Fayette County, Georgia — the same area
// targeted by the USGS LiDAR datasets loaded in lidarService.ts.

import { Pole } from '../types/Pole';

export const mockPoles: Pole[] = [
    {
        id: 1,
        latitude: 33.4734,
        longitude: -84.4563,
        height: 40,      // feet
        age: 15,         // years
        condition: 'Good',
        attachments: [
            { id: 1, type: 'Power',   height: 35, diameter: 0.5 },
            { id: 2, type: 'Telecom', height: 28, diameter: 0.3 }
        ]
    },
    {
        id: 2,
        latitude: 33.4801,
        longitude: -84.4612,
        height: 38,
        age: 32,         // older pole — explains the 'Poor' condition rating
        condition: 'Poor',
        attachments: [
            { id: 3, type: 'Power', height: 33, diameter: 0.5 },
            { id: 4, type: 'Fiber', height: 25, diameter: 0.2 }
        ]
    },
    {
        id: 3,
        latitude: 33.4755,
        longitude: -84.4590,
        height: 42,
        age: 8,
        condition: 'Fair',
        attachments: [
            { id: 5, type: 'Power',   height: 37, diameter: 0.5 },
            { id: 6, type: 'Telecom', height: 30, diameter: 0.3 },
            { id: 7, type: 'Fiber',   height: 22, diameter: 0.2 }
        ]
    }
];
