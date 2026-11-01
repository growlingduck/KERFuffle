#!/usr/bin/env node
// Build a KERFuffle release: the signed installer, its updater signature, the
// latest.json the installed apps read, and checksums. docs/release.md has the
// one-time setup and the checklist around this.
//
//   node scripts/release.mjs [version|patch|minor|major] [options]
//
//   version         set the version first (x.y.z, or bump patch/minor/major)
//   --notes "…"     what changed, shown on the release page (default: a pointer to the release page)
//   --unsigned      skip code signing (test builds only; never publish one)
//   --skip-tests    don't run lint and tests first (CI runs them in an earlier job)
//   --allow-dirty   build with uncommitted changes (test builds only)
//   --test-feed URL a test build that updates from URL/latest.json over plain http
//                   (e.g. http://127.0.0.1:8765), to try the update flow on one PC.
//                   Implies --unsigned. See docs/release.md, "Testing an update".
//
// Environment:
//   KERFUFFLE_SIGN and its settings     code signing; see scripts/sign.mjs
//   TAURI_SIGNING_PRIVATE_KEY           the updater private key, or a path to it
//                                       (default: %USERPROFILE%\.tauri\kerfuffle-updater.key)
//   TAURI_SIGNING_PRIVATE_KEY_PASSWORD  its password, if it has one
//
// Output: release/v<version>/, or release/v<version>-test/ (git-ignored).

import { execSync } from 'node:child_process';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySignature } from './sign.mjs';
import { mismatches, nextVersion, readVersion, ROOT, setVersion } from './version.mjs';

const REPO = 'growlingduck/KERFuffle';
const TAURI_DIR = join(ROOT, 'app', 'src-tauri');
const NSIS_DIR = join(TAURI_DIR, 'target', 'release', 'bundle', 'nsis');
const DEFAULT_UPDATER_KEY = join(homedir(), '.tauri', 'kerfuffle-updater.key');

function parseArgs(argv) {
  const options = { version: null, notes: null, unsigned: false, skipTests: false, allowDirty: false, testFeed: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--notes') options.notes = argv[++i] ?? '';
    else if (arg === '--unsigned') options.unsigned = true;
    else if (arg === '--skip-tests') options.skipTests = true;
    else if (arg === '--allow-dirty') options.allowDirty = true;
    else if (arg === '--test-feed') {
      options.testFeed = (argv[++i] ?? '').replace(/\/$/, '');
      if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(options.testFeed)) {
        throw new Error('--test-feed takes a local address, like http://127.0.0.1:8765');
      }
      options.unsigned = true;
    }
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else options.version = arg;
  }
  return options;
}

function step(text) {
  console.log(`\n=== ${text}`);
}

function run(command, cwd = ROOT, env = process.env) {
  execSync(command, { cwd, env, stdio: 'inherit' });
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function megabytes(file) {
  return `${(statSync(file).size / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Check a Tauri updater signature (a base64 minisign signature) against the
 * public key in tauri.conf.json, so a release signed with the wrong key, one
 * the installed apps would refuse, never leaves this PC.
 */
export function verifyUpdaterSignature(file, signatureB64, pubkeyB64) {
  const pubLines = Buffer.from(pubkeyB64, 'base64').toString('utf8').trim().split(/\r?\n/);
  const pub = Buffer.from(pubLines[1] ?? '', 'base64');
  const sigLines = Buffer.from(signatureB64, 'base64').toString('utf8').trim().split(/\r?\n/);
  const sig = Buffer.from(sigLines[1] ?? '', 'base64');
  const trusted = (sigLines[2] ?? '').replace(/^trusted comment: /, '');
  const globalSig = Buffer.from(sigLines[3] ?? '', 'base64');
  if (pub.length !== 42 || sig.length !== 74 || globalSig.length !== 64) throw new Error('The updater key or signature is malformed.');
  if (!pub.subarray(2, 10).equals(sig.subarray(2, 10))) {
    throw new Error('The installer was signed with a different updater key than the public key in tauri.conf.json.');
  }
  const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pub.subarray(10)]), format: 'der', type: 'spki' });
  const algorithm = sig.subarray(0, 2).toString('latin1');
  const bytes = readFileSync(file);
  const message = algorithm === 'ED' ? createHash('blake2b512').update(bytes).digest() : bytes;
  if (!verify(null, message, key, sig.subarray(10))) throw new Error('The updater signature does not match the installer.');
  if (!verify(null, Buffer.concat([sig.subarray(10), Buffer.from(trusted, 'utf8')]), key, globalSig)) {
    throw new Error('The updater signature’s trusted comment does not verify.');
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  step('Checks');
  const dirty = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim();
  if (dirty && !options.allowDirty) throw new Error('Uncommitted changes. Commit them first (or pass --allow-dirty for a test build).');
  if (!options.unsigned && !process.env.KERFUFFLE_SIGN) {
    throw new Error('KERFUFFLE_SIGN isn’t set, so the installer can’t be code-signed. See docs/release.md (or pass --unsigned for a test build).');
  }
  const env = { ...process.env };
  if (!env.TAURI_SIGNING_PRIVATE_KEY) {
    if (!existsSync(DEFAULT_UPDATER_KEY)) throw new Error(`No updater key: set TAURI_SIGNING_PRIVATE_KEY or put the key at ${DEFAULT_UPDATER_KEY}.`);
    env.TAURI_SIGNING_PRIVATE_KEY = DEFAULT_UPDATER_KEY;
  }
  env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= '';

  if (options.version) {
    const version = nextVersion(readVersion(), options.version);
    setVersion(version);
    console.log(`Version set to ${version}. Commit and tag it once the release is out (docs/release.md).`);
  }
  const wrong = mismatches();
  if (wrong.length > 0) throw new Error(`Version out of step in ${wrong.map((w) => w.file).join(', ')}. Run node scripts/version.mjs.`);
  const version = readVersion();
  const tag = `v${version}`;
  const kind = options.testFeed ? ` (TEST build, updates from ${options.testFeed})` : options.unsigned ? ' (UNSIGNED test build)' : '';
  console.log(`KERFuffle ${version}${kind}`);

  if (!options.skipTests) {
    step('Lint and tests');
    run('npm run lint');
    run('npm test');
    run('cargo test --locked', TAURI_DIR);
  }

  step('Build');
  const configDir = mkdtempSync(join(tmpdir(), 'kerfuffle-release-'));
  const releaseConfig = join(configDir, 'tauri.release.conf.json');
  const bundle = { createUpdaterArtifacts: true };
  if (!options.unsigned) bundle.windows = { signCommand: { cmd: process.execPath, args: [join(ROOT, 'scripts', 'sign.mjs'), '%1'] } };
  const config = { bundle };
  if (options.testFeed) {
    config.plugins = { updater: { endpoints: [`${options.testFeed}/latest.json`], dangerousInsecureTransportProtocol: true } };
  }
  writeFileSync(releaseConfig, JSON.stringify(config, null, 2));
  try {
    run(`npm run tauri -w app -- build --config "${releaseConfig}"`, ROOT, env);
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }

  step('Artifacts');
  const installerName = `KERFuffle_${version}_x64-setup.exe`;
  const installer = join(NSIS_DIR, installerName);
  const signatureFile = `${installer}.sig`;
  if (!existsSync(installer) || !existsSync(signatureFile)) throw new Error(`Expected ${installer} and its .sig. Did the build finish?`);
  const signature = readFileSync(signatureFile, 'utf8').trim();
  const { plugins } = JSON.parse(readFileSync(join(TAURI_DIR, 'tauri.conf.json'), 'utf8'));
  verifyUpdaterSignature(installer, signature, plugins.updater.pubkey);
  console.log('Updater signature matches the public key in tauri.conf.json.');
  if (!options.unsigned) {
    verifySignature(installer);
    console.log('signtool verify /pa passed.');
  }

  const out = join(ROOT, 'release', options.testFeed ? `${tag}-test` : tag);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  copyFileSync(installer, join(out, installerName));
  copyFileSync(signatureFile, join(out, `${installerName}.sig`));

  const baseUrl = options.testFeed ?? `https://github.com/${REPO}/releases/download/${tag}`;
  const notes = options.notes ?? `KERFuffle ${version}. What changed: https://github.com/${REPO}/releases/tag/${tag}`;
  const latest = {
    version,
    notes,
    pub_date: new Date().toISOString(),
    platforms: { 'windows-x86_64': { signature, url: `${baseUrl}/${encodeURIComponent(installerName)}` } },
  };
  writeFileSync(join(out, 'latest.json'), JSON.stringify(latest, null, 2) + '\n');
  writeFileSync(join(out, 'notes.md'), notes + '\n');

  const files = [installerName, `${installerName}.sig`, 'latest.json'].map((name) => join(out, name));
  const sums = files.map((file) => `${sha256(file)}  ${basename(file)}`).join('\n') + '\n';
  writeFileSync(join(out, 'SHA256SUMS.txt'), sums);

  step(`Done: ${out}`);
  for (const file of files) console.log(`  ${basename(file).padEnd(36)} ${megabytes(file).padStart(8)}`);
  console.log('\nSHA-256:');
  console.log(sums.trimEnd().replace(/^/gm, '  '));
  if (options.unsigned) {
    console.log('\nUNSIGNED test build: don’t publish it.');
  } else {
    console.log(`\nNext (docs/release.md): commit, tag ${tag}, push the tag. CI builds, signs and drafts the release;`);
    console.log('or upload these files to a draft GitHub release by hand. Test the draft, then publish it.');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(`\nRelease stopped: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
