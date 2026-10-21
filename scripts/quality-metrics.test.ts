import {describe, expect, it} from 'vitest';
// @ts-expect-error Standalone JS shared with the browser harness.
import {percentile, summarize, compareReports} from './quality-metrics.mjs';

describe('quality report comparisons', () => {
  it('reports nearest-rank medians without mutating samples', () => {
    const values = [90, 10, 30];
    expect(percentile(values, .5)).toBe(30);
    expect(values).toEqual([90, 10, 30]);
    expect(() => percentile([], .5)).toThrow();
    expect(() => percentile([NaN], .5)).toThrow();
  });
  const report = (time = 100, layers = 20) => ({schemaVersion: 1, fixtureVersion: 1, profile: 'core-browser-harness', userAgent: 'test', viewport: {width: 1440, height: 1000, devicePixelRatio: 1}, hardwareConcurrency: 8, repetitions: 3, results: [{scenario: 'cards', status: 'passed', counts: {layers}, summary: {captureMs: {median: time, max: time}}}]});
  it('flags material slowdowns and layer drift, but ignores timing noise', () => {
    expect(compareReports(report(), report(130))).toEqual([]);
    expect(compareReports(report(), report(170))).toEqual([{scenario: 'cards', metric: 'captureMs', before: 100, after: 170}]);
    expect(compareReports(report(), report(100, 19))[0].metric).toBe('counts');
  });
  it('rejects different environments and missing/failed scenarios', () => {
    expect(() => compareReports(report(), {...report(), viewport: {width: 768}})).toThrow('viewport');
    expect(() => compareReports(report(), {...report(), results: []})).toThrow('scenarios');
    const failed = report(); failed.results[0].status = 'failed';
    expect(() => compareReports(report(), failed)).toThrow('failed/missing');
  });
  it('summarizes all measured stages, including blocked frames and payload size', () => {
    const sample = {captureMs: 10, assetsMs: 2, encodeMs: 20, decodeMs: 3, totalMs: 35, maxFrameGapMs: 60, longTaskMaxMs: 55, clipboardBytes: 4096};
    expect(summarize([sample, {...sample, encodeMs: 40}]).encodeMs).toEqual({median: 20, max: 40});
  });
  it('flags a formerly working fidelity observation without blocking a known issue improving', () => {
    const withObservation = (preserved: boolean) => ({...report(), results: report().results.map(result => ({...result, samples: [{observations: {nestedStyle: preserved}}]}))});
    expect(compareReports(withObservation(true), withObservation(false))[0].metric).toBe('observations.nestedStyle');
    expect(compareReports(withObservation(false), withObservation(true))).toEqual([]);
  });
});
