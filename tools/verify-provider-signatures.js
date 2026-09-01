#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'github', 'provider-signatures.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const publicKey = fs.readFileSync(path.join(root, 'tools', 'provider-signing-public.pem'), 'utf8');
if (manifest.version !== 1 || manifest.algorithm !== 'SHA256withECDSA') {
  throw new Error('Unsupported provider signature manifest');
}

let checked = 0;
for (const [url, meta] of Object.entries(manifest.providers || {})) {
  const marker = '/github/providers/';
  const i = url.indexOf(marker);
  if (i < 0) throw new Error(`Invalid provider URL: ${url}`);
  const relative = url.slice(i + 1);
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Missing signed file: ${relative}`);

  const source = fs.readFileSync(file);
  const hash = crypto.createHash('sha256').update(source).digest('hex');
  if (hash !== meta.sha256) throw new Error(`SHA-256 mismatch: ${relative}`);

  const verifier = crypto.createVerify('SHA256');
  verifier.update(source);
  verifier.end();
  if (!verifier.verify(publicKey, Buffer.from(meta.signature, 'base64'))) {
    throw new Error(`Signature mismatch: ${relative}`);
  }
  checked++;
}
console.log(`Verified ${checked} signed provider files.`);
