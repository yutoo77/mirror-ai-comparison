import { test } from 'vitest';
import assert from 'node:assert/strict';
import { inspectCandidatePath, inspectPublicText, inspectHostingConfig } from './check-public-release.mjs';

test('keeps credentials, archives, unknown roots and traversal out of the export', () => {
  for (const path of ['.env', 'docs/.env.local', 'public/key.pem', 'docs/archive.zip', '.git/config', 'misc/data.json', '../README.md', 'docs/../secret.md', '.openai/secrets.json']) {
    assert.notEqual(inspectCandidatePath(path), null, path);
  }
  for (const path of ['README.md', 'src/main.tsx', 'docs/PRIVACY.md', '.github/workflows/ci.yml', '.openai/hosting.json']) {
    assert.equal(inspectCandidatePath(path), null, path);
  }
});

test('allows only static public hosting metadata, never runtime secrets', () => {
  const config = { project_id: 'test-project', static: { directory: 'dist', not_found_handling: 'single-page-application' } };
  assert.equal(inspectHostingConfig(JSON.stringify(config)), null);
  assert.notEqual(inspectHostingConfig(JSON.stringify({ ...config, secrets: { example: 'private' } })), null);
  assert.notEqual(inspectHostingConfig(JSON.stringify({ ...config, static: { directory: '../private' } })), null);
  assert.notEqual(inspectHostingConfig('null'), null);
});

test('reports labels without returning possible secret values', () => {
  const syntheticKey = 'sk-' + 'x'.repeat(24);
  assert.deepEqual(inspectPublicText(syntheticKey), ['provider-token']);
  assert.deepEqual(inspectPublicText('API keys are not required.'), []);
});
