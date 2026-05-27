// index.tsx — the application entry point.
// This is the first file executed when the browser loads the app.
// Its only job is to mount the root React component into the HTML page.

// Leaflet's CSS must be imported globally before any map component renders.
// It provides the map container styles, popup styles, and marker images.
// Importing it here ensures it's loaded once, app-wide.
import 'leaflet/dist/leaflet.css';

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';         // Global CSS (body margins, base font, etc.)
import App from './App';      // The root component — contains all UI
import reportWebVitals from './reportWebVitals';

// ReactDOM.createRoot() is the React 18+ API for rendering.
// It targets the <div id="root"> element in public/index.html —
// that's the single HTML element the entire app lives inside.
// The `as HTMLElement` cast tells TypeScript the element definitely exists
// (getElementById can return null, but we know the HTML has this div).
const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

// root.render() mounts the component tree into the DOM.
// React.StrictMode is a development-only wrapper that:
//   - Intentionally renders components twice to detect side effects
//   - Warns about deprecated APIs
//   - Has zero impact on the production build
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Calling reportWebVitals() with no argument collects metrics silently.
// Pass console.log to see performance numbers in the browser dev console.
reportWebVitals();
