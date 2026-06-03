import React from 'react'; // React must be in scope when using JSX syntax
import { render, screen } from '@testing-library/react'; // render: mounts a component into a virtual DOM; screen: query helpers to find rendered elements
import App from './App'; // the root component being tested

// test() registers a single test case; first arg is the display name, second is the function that runs the assertions
test('renders Pole Inspection Viewer', () => {
  render(<App />); // mount the App component into the virtual DOM (no browser needed)
  const heading = screen.getByText(/Pole Inspection Viewer/i); // search the rendered output for any element whose text matches this regex (case-insensitive)
  expect(heading).toBeInTheDocument(); // assertion: the element must actually exist in the DOM; if not found, the test fails
});