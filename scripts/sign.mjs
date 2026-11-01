#!/usr/bin/env node
// Code-sign one Windows file. Tauri runs this for the app, the uninstaller and
// the installer (bundle.windows.signCommand, set by scripts/release.mjs), so
// every executable that reaches a shop PC carries the publisher's name.
//
//   node scripts/sign.mjs <file>
//
// Nothing secret is in this file or the repo: the method and its settings come
// from environment variables (docs/release.md, "One-time setup").
//
// KERFUFFLE_SIGN=artifact   Azure Artifact Signing (formerly Trusted Signing), recommended
//   ARTIFACT_SIGNING_ENDPOINT   e.g. https://eus.codesigning.azure.net
//   ARTIFACT_SIGNING_ACCOUNT    the Artifact Signing account name
//   ARTIFACT_SIGNING_PROFILE    the certificate profile name
//   ARTIFACT_SIGNING_DLIB       path to Azure.CodeSigning.Dlib.dll (NuGet Microsoft.ArtifactSigning.Client, bin\x64)
//   Azure sign-in: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET (CI),
//   or `az login` on a PC.
//
// KERFUFFLE_SIGN=certificate   an OV/EV certificate in the Windows store or on its USB token
//   SIGN_CERT_THUMBPRINT        the certificate's SHA-1 thumbprint
//   SIGN_TIMESTAMP_URL          optional; the CA's RFC 3161 timestamp server
//
// SIGNTOOL may point at signtool.exe; otherwise the newest Windows SDK copy is used.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ARTIFACT_TIMESTAMP = 'http://timestamp.acs.microsoft.com';
const DEFAULT_TIMESTAMP = 'http://timestamp.digicert.com';

function need(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} isn't set. See docs/release.md, "One-time setup".`);
  return value;
}

/** signtool.exe from SIGNTOOL, or the newest x64 one in the Windows 10/11 SDK. */
export function findSigntool() {
  if (process.env.SIGNTOOL) return process.env.SIGNTOOL;
  const kits = join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Windows Kits', '10', 'bin');
  const versions = existsSync(kits)
    ? readdirSync(kits)
        .filter((v) => /^10\.\d+\.\d+\.\d+$/.test(v) && existsSync(join(kits, v, 'x64', 'signtool.exe')))
        .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    : [];
  const newest = versions.at(-1);
  if (!newest) throw new Error('signtool.exe not found. Install the Windows SDK "Signing Tools" or set SIGNTOOL.');
  return join(kits, newest, 'x64', 'signtool.exe');
}

/** `signtool verify /pa`: the check docs/release.md asks for. Throws if it fails. */
export function verifySignature(file) {
  execFileSync(findSigntool(), ['verify', '/pa', '/q', file], { stdio: 'inherit' });
}

function sign(file) {
  const method = need('KERFUFFLE_SIGN');
  const signtool = findSigntool();
  const common = ['sign', '/v', '/fd', 'SHA256', '/td', 'SHA256'];

  if (method === 'artifact') {
    const dir = mkdtempSync(join(tmpdir(), 'kerfuffle-sign-'));
    try {
      const metadata = join(dir, 'metadata.json');
      writeFileSync(
        metadata,
        JSON.stringify({
          Endpoint: need('ARTIFACT_SIGNING_ENDPOINT'),
          CodeSigningAccountName: need('ARTIFACT_SIGNING_ACCOUNT'),
          CertificateProfileName: need('ARTIFACT_SIGNING_PROFILE'),
        }),
      );
      const dlib = need('ARTIFACT_SIGNING_DLIB');
      if (!existsSync(dlib)) throw new Error(`ARTIFACT_SIGNING_DLIB points at a missing file: ${dlib}`);
      execFileSync(signtool, [...common, '/tr', ARTIFACT_TIMESTAMP, '/dlib', dlib, '/dmdf', metadata, file], { stdio: 'inherit' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  } else if (method === 'certificate') {
    const timestamp = process.env.SIGN_TIMESTAMP_URL || DEFAULT_TIMESTAMP;
    execFileSync(signtool, [...common, '/tr', timestamp, '/sha1', need('SIGN_CERT_THUMBPRINT'), file], { stdio: 'inherit' });
  } else {
    throw new Error(`KERFUFFLE_SIGN is "${method}"; use "artifact" or "certificate".`);
  }
  verifySignature(file);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1])) {
  const file = process.argv[2];
  try {
    if (!file || !existsSync(file)) throw new Error(`Usage: node scripts/sign.mjs <file>  (got ${file ?? 'nothing'})`);
    sign(file);
  } catch (error) {
    console.error(`Signing failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
