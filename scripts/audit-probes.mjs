// Regression checks replacing the original defect-confirmation probes.
import { execFileSync } from 'node:child_process';
execFileSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'apps/chrome-extension/test', 'apps/figma-plugin/test', 'packages/dom-capture/test/integration.test.ts', 'packages/shared-protocol/test/protocol.test.ts', 'packages/scene-graph/test/preflight.test.ts'], { stdio: 'inherit' });
