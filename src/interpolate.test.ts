import { describe, expect, it } from 'vitest';
import { interpolate } from './interpolate.js';

describe('interpolate', () => {
  it('replaces placeholders', () => {
    expect(interpolate('Hello, {{name}}!', { name: 'Ada' })).toBe('Hello, Ada!');
  });

  it('replaces repeated and multiple placeholders', () => {
    expect(interpolate('{{a}} + {{a}} = {{b}}', { a: 1, b: 2 })).toBe('1 + 1 = 2');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(interpolate('Hi {{name}}', {})).toBe('Hi {{name}}');
  });

  it('does not substitute single braces', () => {
    expect(interpolate('Hi {name}', { name: 'Ada' })).toBe('Hi {name}');
  });
});
