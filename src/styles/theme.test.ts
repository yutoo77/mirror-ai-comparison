import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./global.css', import.meta.url), 'utf8');
const tokens = new Map(
  [...css.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/g)].map((match) => [
    match[1]!,
    match[2]!,
  ]),
);
function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((value) => parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

describe('blue and white palette', () => {
  it.each([
    ['ink', 'canvas'],
    ['ink-2', 'surface-muted'],
    ['ink-3', 'surface-muted'],
    ['ink-4', 'surface-muted'],
    ['surface', 'accent'],
    ['accent', 'accent-soft'],
    ['nav-text', 'nav'],
    ['warning', 'warning-soft'],
    ['danger', 'danger-soft'],
    ['success', 'success-soft'],
    ['info', 'info-soft'],
  ])(
    'keeps normal text contrast at least 4.5:1 for %s on %s',
    (foreground, background) => {
      const a = tokens.get(foreground)!;
      const b = tokens.get(background)!;
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      const light = Math.max(luminance(a), luminance(b));
      const dark = Math.min(luminance(a), luminance(b));
      expect((light + 0.05) / (dark + 0.05)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
