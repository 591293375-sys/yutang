'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

async function build() {
  if (process.platform !== 'darwin') {
    console.log('Native desktop integration is macOS-only; window preview remains available.');
    return;
  }
  const root = path.join(__dirname, 'native');
  const include = path.join(root, 'include');
  const output = path.join(root, 'bin');
  fs.mkdirSync(include, { recursive: true });
  fs.mkdirSync(output, { recursive: true });
  const headers = ['node_api.h', 'node_api_types.h', 'js_native_api.h', 'js_native_api_types.h'];
  await Promise.all(headers.map(async (name) => {
    const target = path.join(include, name);
    if (fs.existsSync(target)) return;
    const response = await fetch(`https://raw.githubusercontent.com/nodejs/node/v22.19.0/src/${name}`);
    if (!response.ok) throw new Error(`Node-API header download failed: ${response.status}`);
    fs.writeFileSync(target, await response.text());
  }));
  const license = path.join(include, 'LICENSE.node');
  if (!fs.existsSync(license)) {
    const response = await fetch('https://raw.githubusercontent.com/nodejs/node/v22.19.0/LICENSE');
    if (!response.ok) throw new Error('Could not fetch the Node.js header license.');
    fs.writeFileSync(license, await response.text());
  }
  const run = (command, args) => {
    const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
  };
  const arch = process.env.POND_BUILD_ARCH || process.arch;
  if (!['arm64', 'x64'].includes(arch)) throw new Error('Only arm64 and x64 macOS builds are supported.');
  run('xcrun', ['clang++', '-std=c++17', '-fobjc-arc', '-shared', '-undefined', 'dynamic_lookup',
    '-DNAPI_VERSION=8', '-DNODE_GYP_MODULE_NAME=pond_window', '-arch', arch === 'x64' ? 'x86_64' : 'arm64',
    '-mmacosx-version-min=12.0', '-I', include, '-framework', 'Cocoa', '-framework', 'CoreGraphics',
    path.join(root, 'window-level.mm'), '-o', path.join(output, 'pond-window.node')]);
  run('xcrun', ['swiftc', '-O', '-target', `${arch === 'x64' ? 'x86_64' : 'arm64'}-apple-macosx12.0`,
    path.join(root, 'pointer-helper.swift'), '-o', path.join(output, 'pond-pointer')]);
  fs.chmodSync(path.join(output, 'pond-pointer'), 0o755);
  console.log(`Built native desktop layer and optional mouse listener for macOS ${arch}.`);
}

build().catch((error) => { console.error(error.message); process.exitCode = 1; });
