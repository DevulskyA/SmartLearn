import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const capabilityPath = fileURLToPath(new URL('../src-tauri/capabilities/default.json', import.meta.url));
const configPath = fileURLToPath(new URL('../src-tauri/tauri.conf.json', import.meta.url));

test('T42: the remote WebView capability exposes no SQL, filesystem, dialog, shell, or custom command', () => {
  const capability = JSON.parse(readFileSync(capabilityPath, 'utf8'));

  assert.deepEqual(capability.windows, ['main']);
  assert.deepEqual(capability.permissions, ['core:default']);
  assert.equal(
    capability.permissions.some((permission) => /^(sql|fs|dialog|shell):/.test(String(permission))),
    false,
    'adding a native data/file/process permission would expose it to remote content',
  );
});

test('T42: the application window is created by the trusted-origin wrapper, not a local bundled window', () => {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));

  assert.deepEqual(config.app.windows, []);
});
