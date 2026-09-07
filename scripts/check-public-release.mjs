import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowedRoots = new Set(['src', 'docs', 'public', 'scripts', '.github']);
const allowedFiles = new Set([
  'README.md', 'package.json', 'pnpm-lock.yaml', '.gitignore', '.gitattributes',
  '.editorconfig', 'index.html', 'vite.config.ts', 'vitest.config.ts',
  'tsconfig.json', 'eslint.config.js', 'LICENSE', 'SECURITY.md', '.openai/hosting.json',
]);
const textExtensions = new Set(['.md', '.ts', '.tsx', '.js', '.mjs', '.json', '.yml', '.yaml', '.html', '.css', '.svg', '.txt']);
const secretPatterns = [
  ['provider-token', /\bsk-[A-Za-z0-9_-]{20,}/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
  ['google-token', /\bAIza[0-9A-Za-z_-]{30,}/],
  ['private-key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ['personal-local-path', /\b[A-Z]:[\\/]Users[\\/][a-z0-9_-]+[\\/]/i],
  ['personal-email', /\b[A-Z0-9._%+-]+@(?:gmail|outlook|hotmail|yahoo)\.(?:com|co\.jp)\b/i],
];

export function inspectCandidatePath(path) {
  const parts = path.split('/');
  if (parts.includes('..') || path.startsWith('/') || path.includes('\\')) return 'unsafe-path';
  if (!allowedFiles.has(path) && !allowedRoots.has(parts[0])) return 'unreviewed-root';
  if (parts.some((part) => /^(?:\.env(?:\..*)?|node_modules|\.git|\.release)$/.test(part))) return 'private-file';
  if (/\.(?:pem|key|p12|zip|gz|tsbuildinfo|log)$/i.test(path)) return 'private-or-generated-file';
  return null;
}

export function inspectPublicText(text) {
  return secretPatterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

export function inspectHostingConfig(text) {
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 'invalid-hosting-metadata';
    if (Object.keys(value).some((key) => !['project_id', 'static'].includes(key))) return 'unreviewed-hosting-field';
    if (typeof value.project_id !== 'string' || !value.project_id.trim()) return 'invalid-hosting-metadata';
    if (!value.static || typeof value.static !== 'object' || Array.isArray(value.static)) return 'invalid-hosting-metadata';
    if (Object.keys(value.static).some((key) => !['directory', 'not_found_handling'].includes(key))) return 'unreviewed-hosting-field';
    if (value.static.directory !== 'dist' || value.static.not_found_handling !== 'single-page-application') return 'invalid-static-routing';
    return null;
  } catch { return 'invalid-hosting-metadata'; }
}

function checkLinks(path, text) {
  const problems = [];
  for (const match of text.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1];
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) continue;
    const pathname = decodeURIComponent(target.split('#')[0].split('?')[0]);
    if (!pathname) continue;
    const resolved = resolve(dirname(resolve(root, path)), pathname);
    if (relative(root, resolved).startsWith('..') || !existsSync(resolved)) problems.push('broken-local-link');
  }
  return problems;
}

function main() {
  const paths = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))].sort();
  const issues = [];
  for (const path of paths) {
    const pathIssue = inspectCandidatePath(path);
    if (pathIssue) { issues.push({ path, rule: pathIssue }); continue; }
    const absolute = resolve(root, path);
    if (!existsSync(absolute)) continue; // tracked deletion is not an exported file
    if (!lstatSync(absolute).isFile()) { issues.push({ path, rule: 'not-regular-file' }); continue; }
    if (textExtensions.has(extname(path))) {
      const text = readFileSync(absolute, 'utf8');
      if (path === '.openai/hosting.json') {
        const rule = inspectHostingConfig(text);
        if (rule) issues.push({ path, rule });
      }
      for (const rule of inspectPublicText(text)) issues.push({ path, rule });
      if (extname(path) === '.md') for (const rule of checkLinks(path, text)) issues.push({ path, rule });
    }
  }
  // Never print matched text: a failing check must not leak the value it found.
  for (const issue of issues) console.error(`${issue.path}: ${issue.rule}`);
  console.log(`Public-source check: ${paths.length} candidates, ${issues.length} issues.`);
  console.log('Checks current source only; not Git history, images, ownership, or a complete secret/security audit.');
  process.exitCode = issues.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
