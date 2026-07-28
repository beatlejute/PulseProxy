const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'releases');

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'manifest.json'), 'utf8'));
const version = manifest.version;
const zipName = `pulseproxy-${version}.zip`;

const filesToInclude = [
    'manifest.json',
    'popup.html',
    'welcome.html',
    'options.html',
    'style.css',
    'PRIVACY_POLICY.md'
];

const dirsToInclude = [
    'dist',
    '_locales',
    'icons'
];

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function checkFilesExist() {
    const missing = [];
    for (const file of filesToInclude) {
        const fullPath = path.join(ROOT_DIR, file);
        if (!fs.existsSync(fullPath)) {
            missing.push(file);
        }
    }
    for (const dir of dirsToInclude) {
        const fullPath = path.join(ROOT_DIR, dir);
        if (!fs.existsSync(fullPath)) {
            missing.push(dir);
        }
    }
    return missing;
}

async function createZip() {
    console.log(`Creating ${zipName}...`);
    
    const missing = checkFilesExist();
    if (missing.length > 0) {
        console.error('Missing required files:');
        missing.forEach(f => console.error(`  - ${f}`));
        console.error('\nRun "npm run build" first.');
        process.exit(1);
    }
    
    ensureDir(OUTPUT_DIR);
    
    const zipPath = path.join(OUTPUT_DIR, zipName);
    
    if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
    }
    
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    return new Promise((resolve, reject) => {
        output.on('close', () => {
            const sizeKB = (archive.pointer() / 1024).toFixed(2);
            console.log(`\n✓ Package created: releases/${zipName} (${sizeKB} KB)`);
            console.log('\nIncluded files:');
            filesToInclude.forEach(f => console.log(`  - ${f}`));
            dirsToInclude.forEach(d => console.log(`  - ${d}/`));
            resolve();
        });
        
        archive.on('error', (err) => {
            reject(err);
        });
        
        archive.pipe(output);
        
        for (const file of filesToInclude) {
            archive.file(path.join(ROOT_DIR, file), { name: file });
        }
        
        for (const dir of dirsToInclude) {
            archive.directory(path.join(ROOT_DIR, dir), dir);
        }
        
        archive.finalize();
    });
}

createZip().catch(err => {
    console.error('Failed to create ZIP archive:', err.message);
    process.exit(1);
});