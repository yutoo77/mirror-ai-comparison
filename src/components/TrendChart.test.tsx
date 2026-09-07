// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrendChart } from './TrendChart';

describe('saved trend labels', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  it('keeps every point when multiple campaigns share a date label', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const data = [0.2, 0.4, 0.6].map((value) => ({
      label: '9/5',
      visibility: value,
      accuracy: value,
      evidence: value,
    }));
    const { container, rerender } = render(<TrendChart data={data} />);
    expect(container.querySelectorAll('.chart-x-label')).toHaveLength(3);
    rerender(<TrendChart data={data.slice(1)} />);
    expect(container.querySelectorAll('.chart-x-label')).toHaveLength(2);
    expect(errors).not.toHaveBeenCalled();
  });
});
