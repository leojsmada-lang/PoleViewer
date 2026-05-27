// This file runs automatically before every test file in the project.
// CRA configures Jest to load it via the "setupFilesAfterFramework" setting.
//
// '@testing-library/jest-dom' extends Jest's built-in matchers with
// DOM-specific helpers so you can write expressive assertions like:
//   expect(element).toBeInTheDocument()
//   expect(button).toBeDisabled()
//   expect(input).toHaveValue('hello')
// Without this import those matchers would not exist and tests would error.
import '@testing-library/jest-dom';
