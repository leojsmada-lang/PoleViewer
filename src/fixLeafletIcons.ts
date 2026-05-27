// WHY THIS FILE EXISTS:
// Leaflet (the map library) was designed for traditional web pages where images
// are referenced by simple URL strings. When Webpack (used by CRA) bundles the
// app, it fingerprints and renames asset files (e.g. marker-icon.png becomes
// marker-icon.2273e3d8ad9264b7.png). Leaflet's internal default icon URLs point
// to the original filenames, so they break in a Webpack build — markers show as
// broken images on the map.
//
// The fix: import the images through Webpack so it resolves them to the correct
// hashed filenames, then tell Leaflet to use those resolved URLs as the default
// marker icon. This file is imported once in App.tsx (import './fixLeafletIcons')
// so it runs before any map is rendered.

import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

// L.icon() creates a Leaflet Icon object from the given options.
// iconUrl    — the blue marker pin image
// shadowUrl  — the grey drop-shadow beneath the pin
// iconSize   — pixel dimensions of the marker image [width, height]
// iconAnchor — the pixel offset from the top-left of the image that should
//              sit exactly on the map coordinate [x from left, y from top]
//              [12, 41] means the tip of the pin points at the coordinate.
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

// Override the prototype default so every Marker created anywhere in the app
// uses our fixed icon without needing to pass it explicitly each time.
L.Marker.prototype.options.icon = DefaultIcon;
