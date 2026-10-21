import fs from 'node:fs/promises';
import {compareReports} from './quality-metrics.mjs';
const [baseline, current] = process.argv.slice(2);
if (!baseline || !current) {
  console.error('Usage: node scripts/compare-quality-reports.mjs baseline.json current.json');
  process.exitCode = 2;
} else {
  try {
    const changes = compareReports(JSON.parse(await fs.readFile(baseline, 'utf8')), JSON.parse(await fs.readFile(current, 'utf8')));
    console.log(JSON.stringify({status: changes.length ? 'review-required' : 'within-comparison-budget', changes, note: 'This compares browser harness reports, not actual Figma rendering. Review source/Figma screenshots separately.'}, null, 2));
    process.exitCode = changes.length ? 1 : 0;
  } catch (error) {console.error(error.message); process.exitCode = 2;}
}
