import { describe, expect, it, vi } from 'vitest';
import { pushBackInterceptor, runBackInterceptor } from './backInterceptors';

describe('back interceptors', () => {
  it('reports unhandled when nothing is registered', () => {
    expect(runBackInterceptor()).toBe(false);
  });

  it('runs the newest interceptor and stops after it is removed', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    const removeOuter = pushBackInterceptor(outer);
    const removeInner = pushBackInterceptor(inner);
    expect(runBackInterceptor()).toBe(true);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
    removeInner();
    expect(runBackInterceptor()).toBe(true);
    expect(outer).toHaveBeenCalledTimes(1);
    removeOuter();
    expect(runBackInterceptor()).toBe(false);
  });
});
