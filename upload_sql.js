#!/usr/bin/env node
/**
 * upload_sql.js
 * Automatically upload and execute SQL files directly to Supabase via Management API.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 1. Resolve Project Reference from config.js or environment
function getProjectRef() {
    if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF.trim();
    try {
        const configPath = path.join(__dirname, 'config.js');
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf8');
            const match = content.match(/https:\/\/([a-zA-Z0-9_-]+)\.supabase\.co/);
            if (match && match[1]) return match[1];
        }
    } catch (e) {}
    return 'sfiezqvhbnpjrtdsmcxc';
}

// 2. Resolve Token from environment, .env, or supabase_token.txt
function getSavedToken() {
    if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();

    const tokenFile = path.join(__dirname, 'supabase_token.txt');
    if (fs.existsSync(tokenFile)) {
        const token = fs.readFileSync(tokenFile, 'utf8').trim();
        if (token) return token;
    }

    const envFile = path.join(__dirname, '.env');
    if (fs.existsSync(envFile)) {
        const envContent = fs.readFileSync(envFile, 'utf8');
        const match = envContent.match(/SUPABASE_ACCESS_TOKEN=([^\r\n]+)/);
        if (match && match[1]) return match[1].trim();
    }

    return null;
}

// 3. Prompt User for Token if not saved
function promptToken() {
    return new Promise((resolve) => {
        console.log('\n======================================================');
        console.log('       SUPABASE PERSONAL ACCESS TOKEN REQUIRED        ');
        console.log('======================================================');
        console.log('To execute SQL files automatically on Supabase:\n');
        console.log('1. Open: https://supabase.com/dashboard/account/tokens');
        console.log('2. Click "Generate new token"');
        console.log('3. Name it (e.g., "Library Schema Runner") and click Generate');
        console.log('4. Copy the generated token (starts with sbp_...)\n');

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question('Paste your Supabase Access Token (sbp_...): ', (answer) => {
            rl.close();
            const token = answer.trim();
            if (token) {
                try {
                    fs.writeFileSync(path.join(__dirname, 'supabase_token.txt'), token, 'utf8');
                    console.log('✓ Token saved to supabase_token.txt for automatic future runs.\n');
                } catch (e) {
                    console.warn('Could not save token to file:', e.message);
                }
            }
            resolve(token);
        });
    });
}

// 4. Execute SQL via Supabase Management API
async function executeSql(projectRef, token, sqlContent, filename) {
    console.log(`\n⏳ Executing "${filename}" on Supabase [${projectRef}]...`);
    const startTime = Date.now();
    const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: sqlContent })
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

        if (!response.ok) {
            let errorText = await response.text();
            try {
                const parsed = JSON.parse(errorText);
                errorText = parsed.message || parsed.error || JSON.stringify(parsed, null, 2);
            } catch (e) {}

            console.error(`\n❌ Execution Failed (HTTP ${response.status}):`);
            console.error(errorText);

            if (response.status === 401 || response.status === 403) {
                console.error('\n💡 Note: The token may be expired or invalid.');
                console.error('Delete "supabase_token.txt" and re-run with a fresh token from:');
                console.error('https://supabase.com/dashboard/account/tokens\n');
            }
            return false;
        }

        const data = await response.json();
        console.log(`\n✅ [SUCCESS] "${filename}" executed successfully in ${elapsed}s!`);
        if (Array.isArray(data) && data.length > 0) {
            console.log(`ℹ Returned ${data.length} row(s).`);
        }
        return true;
    } catch (err) {
        console.error('\n❌ Network or execution error:', err.message);
        return false;
    }
}

// 5. Main CLI Workflow
async function main() {
    console.log('======================================================');
    console.log('     SUPABASE AUTOMATIC SQL FILE RUNNER & UPLOADER    ');
    console.log('======================================================');

    const projectRef = getProjectRef();
    console.log(`Target Project: ${projectRef}`);

    let token = getSavedToken();
    if (!token) {
        token = await promptToken();
    }

    if (!token) {
        console.error('❌ Error: No access token provided. Exiting.');
        process.exit(1);
    }

    // Determine target SQL files
    let targetFiles = process.argv.slice(2).filter(a => !a.startsWith('-'));

    if (targetFiles.length === 0) {
        // Default to supabase_schema.sql if it exists
        const defaultSchema = path.join(__dirname, 'supabase_schema.sql');
        if (fs.existsSync(defaultSchema)) {
            targetFiles.push('supabase_schema.sql');
        } else {
            // Find any .sql files in the directory
            const allSql = fs.readdirSync(__dirname).filter(f => f.endsWith('.sql'));
            if (allSql.length > 0) {
                targetFiles = allSql;
            } else {
                console.error('❌ No .sql files found in directory.');
                process.exit(1);
            }
        }
    }

    let allSuccess = true;
    for (const file of targetFiles) {
        const fullPath = path.isAbsolute(file) ? file : path.join(__dirname, file);
        if (!fs.existsSync(fullPath)) {
            console.error(`\n❌ File not found: ${file}`);
            allSuccess = false;
            continue;
        }

        const sqlContent = fs.readFileSync(fullPath, 'utf8');
        const success = await executeSql(projectRef, token, sqlContent, path.basename(file));
        if (!success) allSuccess = false;
    }

    if (allSuccess) {
        console.log('\n======================================================');
        console.log('🎉 All SQL migrations completed successfully!');
        console.log('======================================================\n');
    } else {
        console.log('\n⚠️ Some SQL executions failed. Review messages above.\n');
        process.exit(1);
    }
}

main();
