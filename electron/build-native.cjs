'use strict';
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const NODE_HEADER_CHECKSUMS = {
  'node_api.h': 'd14db85d16f182045c42745a6e44b96e932dfe6e3bfcaac7a1096fae8412c579',
  'node_api_types.h': '8d5d854088d5725fec9775510e0aeeeb790a41ad083c49bb721d950b86e6bd61',
  'js_native_api.h': '048b4efdcd823f30afd323d61c8aba5be285077f9d790feb52a6fa6382df2541',
  'js_native_api_types.h': '0410c31e227f81e2981363c4d543f4832ac3df785343ec64cee621742ff8a034',
  'LICENSE.node': 'e991d81497a85bb24fc6bffae0a3637a6accd6c6bc5ce1f2c5698bd555cf9d49',
};

function verifyChecksum(name, content) {
  const actual = crypto.createHash('sha256').update(content).digest('hex');
  const expected = NODE_HEADER_CHECKSUMS[name];
  if (actual !== expected) {
    throw new Error(`Integrity check failed for ${name}: expected ${expected}, got ${actual}`);
  }
}

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
    const content = await response.text();
    verifyChecksum(name, content);
    fs.writeFileSync(target, content);
  }));
  const license = path.join(include, 'LICENSE.node');
  if (!fs.existsSync(license)) {
    const response = await fetch('https://raw.githubusercontent.com/nodejs/node/v22.19.0/LICENSE');
    if (!response.ok) throw new Error('Could not fetch the Node.js header license.');
    const content = await response.text();
    verifyChecksum('LICENSE.node', content);
    fs.writeFileSync(license, content);
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
