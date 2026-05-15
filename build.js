/**
 * build.js — Production build script
 * Builds the React frontend into backend/public so one Node process serves everything on one port.
 */
const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT     = __dirname;
const FRONTEND = path.join(ROOT, 'frontend');
const BACKEND  = path.join(ROOT, 'backend');

console.log('\n🔨  CUDE — Production Build\n');

// 1. Install deps
console.log('📦  Installing backend dependencies...');
execSync('npm install --production', { cwd: BACKEND, stdio: 'inherit' });

console.log('📦  Installing frontend dependencies...');
execSync('npm install', { cwd: FRONTEND, stdio: 'inherit' });

// 2. Build frontend
console.log('\n⚛️   Building React frontend...');
execSync('npm run build', { cwd: FRONTEND, stdio: 'inherit' });

// 3. Verify dist exists
const distDir = path.join(FRONTEND, 'dist');
if (!fs.existsSync(distDir)) {
  console.error('❌  Build failed — dist/ not created'); process.exit(1);
}

const files = fs.readdirSync(distDir);
console.log(`\n✅  Build complete — ${files.length} files in frontend/dist/`);
console.log('\n🚀  Start the app with:\n');
console.log('    cd backend');
console.log('    ANTHROPIC_API_KEY=sk-ant-... node server.js\n');
console.log('    Then open: http://localhost:3001\n');
