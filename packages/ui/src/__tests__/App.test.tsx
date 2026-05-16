import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App } from '../App';

beforeEach(() => {
  // jsdom has no EventSource; stub it so useScorerStream doesn't throw on mount.
  // @ts-expect-error jsdom polyfill
  globalThis.EventSource = class {
    addEventListener(): void {}
    close(): void {}
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
  };
  // Ensure fetch returns something predictable for credential listing.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ credentials: [] }), { status: 200 })),
  );
});

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getByText('whistleblower')).toBeInTheDocument();
  });

  it('shows "not enrolled" before a persona is loaded', () => {
    render(<App />);
    expect(screen.getByText('not enrolled')).toBeInTheDocument();
  });
});
