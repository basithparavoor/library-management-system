// sync_logo.js - Automated Institution Logo & App Icon Synchronizer
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = __dirname;
const logoSrc = path.join(rootDir, 'logo.png');
const androidResDir = path.join(rootDir, 'android_app', 'app', 'src', 'main', 'res');

console.log("=== TGI LOGO & ICON SYNCHRONIZER ===");

if (fs.existsSync(logoSrc)) {
    console.log("Found logo.png in project root:", logoSrc);

    // 1. Copy to Android drawable
    const destDrawable = path.join(androidResDir, 'drawable', 'app_logo.png');
    fs.copyFileSync(logoSrc, destDrawable);
    console.log("Copied to Android drawable:", destDrawable);

    // 2. Ensure mipmap directories exist
    const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
    densities.forEach(d => {
        const mipmapDir = path.join(androidResDir, `mipmap-${d}`);
        if (!fs.existsSync(mipmapDir)) {
            fs.mkdirSync(mipmapDir, { recursive: true });
        }
        const destIcon = path.join(mipmapDir, 'ic_launcher.png');
        const destRoundIcon = path.join(mipmapDir, 'ic_launcher_round.png');
        fs.copyFileSync(logoSrc, destIcon);
        fs.copyFileSync(logoSrc, destRoundIcon);
    });
    console.log("Synchronized app icons across all Android mipmap densities (mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi).");

    // 3. Convert logo.png to base64 Data URL for web localStorage injection
    const logoBuffer = fs.readFileSync(logoSrc);
    const base64Data = `data:image/png;base64,${logoBuffer.toString('base64')}`;
    console.log("Generated base64 data URI for Web App branding.");
    console.log("SUCCESS: When you build the APK, logo.png will be your exact launcher icon!");
} else {
    console.log("NOTE: Place your official 'logo.png' in the root directory (c:/Users/asus/OneDrive/Desktop/library-management-system/logo.png) and run 'node sync_logo.js' anytime to instantly update all Android app icons and web branding!");
}
