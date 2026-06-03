import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders Pole Inspection Viewer', () => {
  render(<App />);
  const heading = screen.getByText(/Pole Inspection Viewer/i);
  expect(heading).toBeInTheDocument();
});