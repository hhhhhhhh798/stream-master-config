#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const providersRoot = path.join(root, 'github', 'providers');
const output = path.join(root, 'github', 'provider-signatures.json');

const privateKey = process.env.PROVIDER_SIGNING_PRIVATE_KEY;
const rawBase = (process.env.PROVIDER_RAW_BASE ||
  'https://raw.githubusercontent.com/hhhhhhhh798/stream-master-config/main/')
  .replace(/\/+$/, '/') ;

if (!privateKey) {
  console.error('PROVIDER_SIGNING_PRIVATE_KEY is required.');
  process.exit(2);
}

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.js')) out.push(full);
  }
  return out.sort();
}

const sign = crypto.createSign('SHA256');
const providers = {};
for (const file of walk(providersRoot)) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  const source = fs.readFileSync(file);
  const hash = crypto.createHash('sha256').update(source).digest('hex');

  const signer = crypto.createSign('SHA256');
  signer.update(source);
  signer.end();
  const signature = signer.sign(privateKey).toString('base64');

  const url = rawBase + relative;
  providers[url] = { sha256: hash, signature };
}

const manifest = {
  version: 1,
  algorithm: 'SHA256withECDSA',
  generated_at: new Date().toISOString(),
  providers
};

fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Signed ${Object.keys(providers).length} provider JavaScript files.`);
