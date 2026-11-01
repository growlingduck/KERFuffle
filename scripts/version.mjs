#!/usr/bin/env node
// The app has one version: "version" in the root package.json. This copies it
// into every other file that carries it, so the installer, the updater and
// Settings → About always agree.
//
//   node scripts/version.mjs            copy the root version everywhere
//   node scripts/version.mjs 0.2.0      set it, then copy
//   node scripts/version.mjs patch      bump it (also minor, major), then copy
//   node scripts/version.mjs --check    exit 1 if any file disagrees (CI)
//
// The engine package keeps its own version: it is a library inside the repo.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const at = (...parts) => join(ROOT, ...parts);

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function readText(file) {
  return readFileSync(file, 'utf8');
}

/** Keep each file's own line endings. */
function writeText(file, text, original) {
  writeFileSync(file, original.includes('\r\n') ? text.replace(/\r?\n/g, '\r\n') : text);
}

function editJson(file, change) {
  const original = readText(file);
  const data = JSON.parse(original);
  change(data);
  writeText(file, JSON.stringify(data, null, 2) + '\n', original);
}

/** Each file that carries the version: how to read it and how to set it. */
const TARGETS = [
  {
    file: at('app', 'package.json'),
    read: (text) => JSON.parse(text).version,
    write: (file, v) => editJson(file, (d) => (d.version = v)),
  },
  {
    file: at('package-lock.json'),
    read: (text) => {
      const lock = JSON.parse(text);
      const versions = [lock.version, lock.packages?.['']?.version, lock.packages?.app?.version];
      return versions.every((x) => x === versions[0]) ? versions[0] : `mixed (${versions.join(', ')})`;
    },
    write: (file, v) =>
      editJson(file, (d) => {
        d.version = v;
        d.packages[''].version = v;
        d.packages.app.version = v;
      }),
  },
  {
    file: at('app', 'src-tauri', 'tauri.conf.json'),
    read: (text) => JSON.parse(text).version,
    write: (file, v) => editJson(file, (d) => (d.version = v)),
  },
  {
    file: at('app', 'src-tauri', 'Cargo.toml'),
    // The first version line is the [package] one.
    read: (text) => /^version = "([^"]*)"/m.exec(text)?.[1],
    write: (file, v) => {
      const text = readText(file);
      writeText(file, text.replace(/^version = "[^"]*"/m, `version = "${v}"`), text);
    },
  },
  {
    file: at('app', 'src-tauri', 'Cargo.lock'),
    read: (text) => /name = "kerfuffle"\r?\nversion = "([^"]*)"/.exec(text)?.[1],
    write: (file, v) => {
      const text = readText(file);
      writeText(file, text.replace(/(name = "kerfuffle"\r?\nversion = )"[^"]*"/, `$1"${v}"`), text);
    },
  },
];

export function readVersion() {
  const { version } = JSON.parse(readText(at('package.json')));
  if (!SEMVER.test(version ?? '')) throw new Error(`The root package.json version "${version}" isn't x.y.z.`);
  return version;
}

/** "0.2.0", or "patch" | "minor" | "major" from the current version. */
export function nextVersion(current, request) {
  if (SEMVER.test(request)) return request;
  const [major, minor, patch] = SEMVER.exec(current).slice(1).map(Number);
  switch (request) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`"${request}" isn't a version (x.y.z) or patch, minor, major.`);
  }
}

export function setVersion(version) {
  editJson(at('package.json'), (d) => (d.version = version));
  syncVersion();
}

/** Files whose version differs from the root one. */
export function mismatches() {
  const version = readVersion();
  return TARGETS.map(({ file, read }) => ({ file, found: read(readText(file)) }))
    .filter(({ found }) => found !== version)
    .map(({ file, found }) => ({ file: relative(ROOT, file), found, expected: version }));
}

export function syncVersion() {
  const version = readVersion();
  for (const { file, read, write } of TARGETS) {
    if (read(readText(file)) !== version) write(file, version);
  }
  return version;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1]);
if (isMain) {
  const arg = process.argv[2];
  try {
    if (arg === '--check') {
      const wrong = mismatches();
      for (const { file, found, expected } of wrong) console.error(`${file}: ${found ?? 'no version'} (expected ${expected})`);
      if (wrong.length > 0) {
        console.error('Run `node scripts/version.mjs` to copy the root version everywhere.');
        process.exit(1);
      }
      console.log(`Version ${readVersion()} everywhere.`);
    } else if (arg) {
      const version = nextVersion(readVersion(), arg);
      setVersion(version);
      console.log(`Version set to ${version}.`);
    } else {
      console.log(`Version ${syncVersion()} copied everywhere.`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
