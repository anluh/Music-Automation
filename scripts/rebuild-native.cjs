const { execSync } = require('child_process');

console.log(`[Rebuild] Node Version: ${process.version}`);
console.log(`[Rebuild] Rebuilding better-sqlite3...`);

try {
    execSync('npm rebuild better-sqlite3', { stdio: 'inherit' });
    console.log('[Rebuild] Success!');
} catch (e) {
    console.error('[Rebuild] Failed:', e.message);
    process.exit(1);
}
