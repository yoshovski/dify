#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { X509Certificate } = require('node:crypto');
const fs = require('node:fs');
const tls = require('node:tls');

const floors = { 22: [22, 23, 4], 24: [24, 22, 1], 26: [26, 12, 1] };
const version = process.versions.node.split('.').map(Number);
const floor = floors[version[0]];
assert(floor, `Unsupported Node major: ${version[0]}`);
assert(version[1] > floor[1] || (version[1] === floor[1] && version[2] >= floor[2]),
  `Node ${process.versions.node} is below the patched version`);
console.log(`PASS Node ${process.versions.node}`);

const pem = fs.readFileSync('/etc/ssl/certs/ca-certificates.crt', 'utf8');
const certificates = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
assert(certificates && certificates.length, 'OS CA store is empty');
for (const certificate of certificates) {
  const subject = new X509Certificate(certificate).subject;
  for (const blocked of ['AAA Certificate Services', 'emSign ECC Root CA - G3']) {
    assert(!subject.split('\n').includes(`CN=${blocked}`), `OS store still trusts ${blocked}`);
  }
}
console.log('PASS OS store: compromised roots absent');

const badHosts = [
  'dv-g3b-noct-emudhra.we-have-a-problem.com',
  'dv-g3b-aaa-noct-emudhra.we-have-a-problem.com',
];
const verificationErrors = new Set([
  'CERT_REVOKED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_GET_ISSUER_CERT',
]);

function probe(host, shouldReject) {
  return new Promise((resolve, reject) => {
    const connection = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: true });
    connection.setTimeout(10000, () => connection.destroy(new Error(`Timeout: ${host}`)));
    connection.once('secureConnect', () => {
      connection.destroy();
      if (shouldReject) reject(new Error(`Accepted compromised chain: ${host}`));
      else { console.log(`PASS valid HTTPS control: ${host}`); resolve(); }
    });
    connection.once('error', error => {
      if (shouldReject && verificationErrors.has(error.code)) {
        console.log(`PASS rejected ${host}: ${error.code}`);
        resolve();
      } else reject(error);
    });
  });
}

async function main() {
  if (process.argv.includes('--online')) {
    await probe('example.com', false);
    for (const host of badHosts) await probe(host, true);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
