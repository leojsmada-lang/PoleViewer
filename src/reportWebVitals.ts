// Web Vitals are a set of real-user performance metrics defined by Google:
//   CLS  — Cumulative Layout Shift    (do things jump around visually?)
//   FID  — First Input Delay          (how fast does the page respond to clicks?)
//   FCP  — First Contentful Paint     (how soon does content appear?)
//   LCP  — Largest Contentful Paint   (how soon is the main content visible?)
//   TTFB — Time to First Byte         (how fast does the server respond?)
//
// This function is called in index.tsx. Passing no argument (as we do) means
// the metrics are collected but silently discarded.
//
// To log them to the console during development, call:
//   reportWebVitals(console.log)
// To send them to an analytics service, pass your own callback function.
import { ReportHandler } from 'web-vitals';

const reportWebVitals = (onPerfEntry?: ReportHandler) => {
  // Only load the web-vitals library if a callback was provided.
  // The dynamic import() keeps this code out of the main bundle when unused.
  if (onPerfEntry && onPerfEntry instanceof Function) {
    import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
      getCLS(onPerfEntry);
      getFID(onPerfEntry);
      getFCP(onPerfEntry);
      getLCP(onPerfEntry);
      getTTFB(onPerfEntry);
    });
  }
};

export default reportWebVitals;
