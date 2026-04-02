#!/usr/bin/env node

/**
 * Cache Buster: Inject git commit hash into HTML files
 * Runs before each Cloudflare Pages deploy to bust cache
 * 
 * Usage: node scripts/inject-version.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get short git commit hash
let commitHash = 'dev';
try {
  commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  console.log(`📦 Cache buster: Using commit hash ${commitHash}`);
} catch (err) {
  console.warn('⚠️  Could not get git commit hash, using default "dev"');
}

// Find all HTML files in public/
const publicDir = path.join(__dirname, '../public');
const htmlFiles = [];

function findHtmlFiles(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory() && file !== 'icons') {
      findHtmlFiles(filePath);
    } else if (file.endsWith('.html')) {
      htmlFiles.push(filePath);
    }
  });
}

findHtmlFiles(publicDir);

console.log(`🔍 Found ${htmlFiles.length} HTML files`);

// Inject version hash into script tags
htmlFiles.forEach(filePath => {
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;

  // Replace script src tags with version query param
  // Matches: src="/js/file.js" or src="/js/file.js?v=..."
  content = content.replace(
    /src="(\/js\/[^"]+?)(\?v=[^"]*)?"/g,
    `src="$1?v=${commitHash}"`
  );

  // Also handle auth.js in script tags
  content = content.replace(
    /src="(\/js\/auth\.js)(\?v=[^"]*)?"/g,
    `src="$1?v=${commitHash}"`
  );

  // Write back if changed
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf-8');
    const relPath = path.relative(publicDir, filePath);
    console.log(`✅ Updated ${relPath}`);
  }
});

console.log(`🚀 Cache buster complete! All scripts now have ?v=${commitHash}`);
