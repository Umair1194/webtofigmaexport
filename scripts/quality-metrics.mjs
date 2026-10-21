// Shared by the browser harness and its regression checks. No production imports.
export function percentile(values, fraction) {
  if (!values.length || values.some(value => !Number.isFinite(value))) throw new Error('Expected finite samples');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

export function summarize(samples) {
  if (!samples.length) throw new Error('No measured samples');
  return Object.fromEntries(['captureMs', 'assetsMs', 'encodeMs', 'decodeMs', 'totalMs', 'maxFrameGapMs', 'longTaskMaxMs', 'clipboardBytes'].map(key => [key, {
    median: Math.round(percentile(samples.map(sample => sample[key]), .5)),
    max: Math.round(Math.max(...samples.map(sample => sample[key]))),
  }]));
}

// Compare like-for-like runs only. Timings on different hosts are not a regression signal.
export function compareReports(baseline, current) {
  for (const key of ['schemaVersion', 'fixtureVersion', 'profile', 'userAgent', 'viewport', 'hardwareConcurrency', 'repetitions']) {
    if (JSON.stringify(baseline[key]) !== JSON.stringify(current[key])) throw new Error(`Incomparable reports: ${key} changed`);
  }
  if (baseline.results.length !== current.results.length) throw new Error('Incomparable reports: scenarios changed');
  const changes = [];
  for (const result of current.results) {
    const previous = baseline.results.find(item => item.scenario === result.scenario);
    if (!previous || result.status !== 'passed' || previous.status !== 'passed') throw new Error(`Cannot compare failed/missing scenario: ${result.scenario}`);
    if (JSON.stringify(previous.counts) !== JSON.stringify(result.counts)) changes.push({scenario: result.scenario, metric: 'counts', before: previous.counts, after: result.counts});
    for (const group of ['checks', 'observations']) {
      const keys = new Set((previous.samples || []).flatMap(sample => Object.keys(sample[group] || {})));
      for (const key of keys) {
        const before = previous.samples.every(sample => sample[group]?.[key] === true);
        const after = result.samples?.length && result.samples.every(sample => sample[group]?.[key] === true);
        if (before && !after) changes.push({scenario: result.scenario, metric: `${group}.${key}`, before: true, after: false});
      }
    }
    for (const [key, value] of Object.entries(result.summary)) {
      const before = previous.summary[key].median;
      // Require both a 25% change and a useful absolute increase to avoid timer noise.
      const allowance = key === 'clipboardBytes' ? 1024 : 50;
      if (value.median > before * 1.25 && value.median - before > allowance) changes.push({scenario: result.scenario, metric: key, before, after: value.median});
    }
  }
  return changes;
}
