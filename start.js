const { execSync, spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');

const BACKEND  = path.join(__dirname, 'backend');
const FRONTEND = path.join(__dirname, 'frontend');

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  CUDE — Configurable Universal Discovery Engine v3.0             ║');
console.log('║  Agentic Data Discovery & Governance Platform                   ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

if (!process.env.ANTHROPIC_API_KEY) {
  console.log('⚠  ANTHROPIC_API_KEY not set — all 6 agents will use realistic mock responses.');
  console.log('   Set it with: export ANTHROPIC_API_KEY=sk-ant-...\n');
}
if (!process.env.OPENAI_API_KEY) {
  console.log('⚠  OPENAI_API_KEY not set — audio transcription will be simulated.');
  console.log('   Set it with: export OPENAI_API_KEY=sk-...\n');
}

if (!fs.existsSync(path.join(BACKEND, 'node_modules'))) {
  console.log('📦  Installing backend dependencies...');
  execSync('npm install', { cwd: BACKEND, stdio: 'inherit' });
}
if (!fs.existsSync(path.join(FRONTEND, 'node_modules'))) {
  console.log('📦  Installing frontend dependencies...');
  execSync('npm install', { cwd: FRONTEND, stdio: 'inherit' });
}

const isWin = process.platform === 'win32';

const backend = spawn('node', ['server.js'], {
  cwd: BACKEND, stdio: 'inherit', shell: isWin,
  env: { ...process.env, PORT: process.env.PORT || '3001' }
});

setTimeout(() => {
  const frontend = spawn('npm', ['run', 'dev'], {
    cwd: FRONTEND, stdio: 'inherit', shell: true   // shell:true required on Windows
  });
  frontend.on('exit', code => process.exit(code ?? 0));
}, 1800);

backend.on('exit', code => { if (code) { console.error('Backend crashed with code', code); process.exit(code); } });
process.on('SIGINT', () => { backend.kill(); process.exit(0); });
