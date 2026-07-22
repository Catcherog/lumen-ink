import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const statePath = path.join(root, 'docs/lumen-v2/state/STATE.json');
const errors = [];

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

if (!exists('AGENTS.md')) errors.push('Missing AGENTS.md');
if (!fs.existsSync(statePath)) errors.push('Missing docs/lumen-v2/state/STATE.json');

let state;
try {
  state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
} catch (error) {
  errors.push(`STATE.json is invalid JSON: ${error.message}`);
}

if (state) {
  const statuses = new Set([
    'ready_for_trae',
    'awaiting_gpt_acceptance',
    'changes_requested',
    'awaiting_user_decision',
    'blocked',
    'complete',
    'gpt_evidence_review_pass',
  ]);
  const actors = new Set(['trae', 'gpt', 'user', 'none', 'user_or_trae_for_merge']);
  if (!statuses.has(state.status)) errors.push(`Invalid status: ${state.status}`);
  if (!actors.has(state.nextActor)) errors.push(`Invalid nextActor: ${state.nextActor}`);
  if (!state.currentTask) errors.push('STATE.currentTask is required');
  if (!state.activeTaskPath || !exists(state.activeTaskPath)) {
    errors.push(`Active task file does not exist: ${state.activeTaskPath}`);
  }
  if ((state.status === 'ready_for_trae' || state.status === 'changes_requested') && state.nextActor !== 'trae') {
    errors.push(`${state.status} requires nextActor=trae`);
  }
  if (state.status === 'awaiting_gpt_acceptance' && state.nextActor !== 'gpt') {
    errors.push('awaiting_gpt_acceptance requires nextActor=gpt');
  }
  if (state.status === 'awaiting_gpt_acceptance' && (!state.latestTraeReport || !exists(state.latestTraeReport))) {
    errors.push('awaiting_gpt_acceptance requires an existing latestTraeReport');
  }
  if (state.status === 'awaiting_user_decision' && state.nextActor !== 'user') {
    errors.push('awaiting_user_decision requires nextActor=user');
  }
}

// .env* 检查：默认阻止全部 .env*，只允许明确模板文件
// 允许：.env.example、.env.sample、.env.template 以及复合模板
//       （如 .env.cloudbase-nosql.preview.example、.env.local.example）
// 拒绝：.env、.env.local、.env.production、.env.development、.env.local.secret
//       及其他不以 .example/.sample/.template 结尾的 .env* 真实环境文件
const forbiddenNames = [
  (name) => {
    const isEnvFile = /^\.env(?:\..+)?$/i.test(name);
    // 复合模板正则：.env 后可跟零或多个 .<segment> 中间段，最后必须以
    // .example / .sample / .template 结尾。中间段字符类 [a-z0-9_-] 不允许
    // 点号，避免正则误匹配跨段路径。
    const isAllowedTemplate =
      /^\.env(?:\.[a-z0-9_-]+)*\.(example|sample|template)$/i.test(name);
    return isEnvFile && !isAllowedTemplate;
  },
  (name) => /providers\.json$/i.test(name),
  (name) => /private.*key/i.test(name),
];
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bghp_[A-Za-z0-9]{30,}\b/,
  /Authorization:\s*Bearer\s+[A-Za-z0-9._-]{16,}/i,
];

const textExtensions = new Set([
  '.md',
  '.json',
  '.txt',
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.yml',
  '.yaml',
]);

// 只检查将被提交到仓库的文件（git 跟踪文件 + 未被 .gitignore 排除的新文件）
// 这样本地运行与 CI 行为一致，不会误报已被 .gitignore 排除的本地敏感文件
let committableFiles;
try {
  const tracked = execSync('git ls-files', { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  const untracked = execSync('git ls-files --others --exclude-standard', { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  committableFiles = new Set([...tracked, ...untracked]);
} catch {
  // 不在 git 仓库中时回退到扫描所有文件
  committableFiles = null;
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist', 'build'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      walk(full);
    } else {
      // 在 git 仓库中，只检查将被提交的文件
      if (committableFiles && !committableFiles.has(rel)) continue;
      if (forbiddenNames.some((check) => check(entry.name))) errors.push(`Forbidden filename: ${rel}`);
      const ext = path.extname(entry.name).toLowerCase();
      // 复合模板（如 .env.cloudbase-nosql.preview.example）也需要扫描内容，
      // 因为 ext 取最后一段（.example），不在 textExtensions 中。
      const isEnvTemplate =
        /^\.env(?:\.[a-z0-9_-]+)*\.(example|sample|template)$/i.test(entry.name);
      const shouldScanContent = textExtensions.has(ext) || isEnvTemplate;
      if (shouldScanContent) {
        const text = fs.readFileSync(full, 'utf8');
        for (const pattern of secretPatterns) {
          if (pattern.test(text)) errors.push(`Possible secret in ${rel}: ${pattern}`);
        }
      }
    }
  }
}
walk(root);

if (errors.length) {
  console.error('Lumen collaboration check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('Lumen collaboration state and basic public-repo safety checks passed.');
