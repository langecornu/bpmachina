// Component tests for the error boundary: a crash is contained, explained, and recoverable.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from '../../src/components/ErrorBoundary.jsx';

function Broken({ shouldThrow }) {
  if (shouldThrow) {
    throw new Error('boom');
  }
  return <p>All fine</p>;
}

function Harness() {
  const [shouldThrow, setShouldThrow] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setShouldThrow(false)}>
        Fix it
      </button>
      <ErrorBoundary label="the test screen">
        <Broken shouldThrow={shouldThrow} />
      </ErrorBoundary>
    </>
  );
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders its children when nothing is wrong', () => {
    render(
      <ErrorBoundary>
        <Broken shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('All fine')).toBeInTheDocument();
  });

  it('shows a calm alert instead of a blank page, and logs the error', () => {
    render(<Harness />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong in the test screen');
    expect(screen.getByRole('alert')).toHaveTextContent('Your song is safe');
    expect(console.error).toHaveBeenCalled();
  });

  it('recovers when the problem is gone and the person presses Try again', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Fix it' }));
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('All fine')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
