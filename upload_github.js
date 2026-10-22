#!/usr/bin/env node
/**
 * upload_github.js
 * Automatically upload and sync library management system files directly to GitHub
 * via GitHub REST API without requiring git CLI to be installed.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');

const DEFAULT_REPO_NAME = 'library-management-system';
const DEFAULT_BRANCH = 'main';

// Files and folders to ignore
const IGNORED_PATHS = [
    'node_modules',
    '.git',
    '.gemini',
    'jdks',
    'caches',
    'daemon',
    'native',
    'wrapper',
    '.idea',
    '.tmp',
    'build',
    '.gradle',
    'downloads',
    'supabase_token.txt',
    'github_token.txt',
    '.env',
    '.env.local',
    'upload_github.cjs',
    'Thumbs.db',
    '.DS_Store'
];

function isIgnored(relPath) {
    const normalized = relPath.replace(/\\/g, '/');
    const parts = normalized.split('/');
    
    // Check ignored folders and dot-directories (except .gitignore)
    if (parts.some(p => IGNORED_PATHS.includes(p) || (p.startsWith('.') && p !== '.gitignore'))) {
        return true;
    }
    if (normalized.endsWith('.log')) return true;
    if (normalized.toLowerCase().includes('token.txt')) return true;
    if (normalized.endsWith('.apk') || normalized.endsWith('.jar')) return true;
    return false;
}

// HTTP request helper for GitHub API
function githubRequest(endpoint, method = 'GET', token, body = null) {
    return new Promise((resolve, reject) => {
        const url = endpoint.startsWith('https://') ? endpoint : `https://api.github.com${endpoint}`;
        const parsed = new URL(url);

        const headers = {
            'User-Agent': 'TGI-Library-Automated-Sync',
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${token}`
        };

        let payload = null;
        if (body) {
            payload = JSON.stringify(body);
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = Buffer.byteLength(payload);
        }

        const req = https.request({
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method,
            headers
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsedJson = null;
                try {
                    parsedJson = data ? JSON.parse(data) : {};
                } catch (e) {
                    parsedJson = data;
                }
                resolve({ status: res.statusCode, data: parsedJson });
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

// 1. Resolve Token from environment, github_token.txt, or .env
function getSavedToken() {
    if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
    if (process.env.GH_TOKEN) return process.env.GH_TOKEN.trim();

    const tokenFile = path.join(__dirname, 'github_token.txt');
    if (fs.existsSync(tokenFile)) {
        const token = fs.readFileSync(tokenFile, 'utf8').trim();
        if (token) return token;
    }

    const envFile = path.join(__dirname, '.env');
    if (fs.existsSync(envFile)) {
        const envContent = fs.readFileSync(envFile, 'utf8');
        const match = envContent.match(/GITHUB_TOKEN=([^\r\n]+)/);
        if (match && match[1]) return match[1].trim();
    }

    return null;
}

// Prompt for token if not saved
function promptInput(questionText, isPassword = false) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(questionText, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

// Recursive directory reader
function getAllFiles(dirPath, arrayOfFiles = [], rootDir = dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relPath = path.relative(rootDir, fullPath);

        if (isIgnored(relPath)) continue;

        if (entry.isDirectory()) {
            getAllFiles(fullPath, arrayOfFiles, rootDir);
        } else {
            arrayOfFiles.push({
                fullPath,
                relPath: relPath.replace(/\\/g, '/')
            });
        }
    }

    return arrayOfFiles;
}

async function main() {
    console.log('======================================================');
    console.log('       TGI LIBRARY - AUTOMATED GITHUB SYNC           ');
    console.log('======================================================\n');

    let token = getSavedToken();

    if (!token) {
        console.log('No GitHub Token detected in environment or github_token.txt.\n');
        console.log('To create your GitHub token:');
        console.log('1. Go to: https://github.com/settings/tokens?type=beta or https://github.com/settings/tokens');
        console.log('2. Click "Generate new token (classic)"');
        console.log('3. Check the "repo" scope (Full control of private repositories)');
        console.log('4. Copy the generated token.\n');

        token = await promptInput('Paste your GitHub Personal Access Token (ghp_...): ');

        if (!token) {
            console.error('❌ Error: GitHub Token is required to upload files.');
            process.exit(1);
        }

        const save = await promptInput('Save token to github_token.txt for 1-click future uploads? (y/n): ');
        if (save.toLowerCase() === 'y' || save.toLowerCase() === 'yes') {
            fs.writeFileSync(path.join(__dirname, 'github_token.txt'), token, 'utf8');
            console.log('✓ Token saved securely to github_token.txt (git-ignored).\n');
        }
    }

    // Authenticate user
    console.log('⏳ Verifying token with GitHub API...');
    const userRes = await githubRequest('/user', 'GET', token);

    if (userRes.status !== 200) {
        console.error(`❌ Authentication failed (HTTP ${userRes.status}):`, userRes.data.message || userRes.data);
        process.exit(1);
    }

    const username = userRes.data.login;
    console.log(`✓ Authenticated successfully as @${username} (${userRes.data.name || username})\n`);

    // Repository Setup
    const repoName = process.env.GITHUB_REPO || DEFAULT_REPO_NAME;
    console.log(`⏳ Checking repository "${username}/${repoName}"...`);

    let repoRes = await githubRequest(`/repos/${username}/${repoName}`, 'GET', token);

    if (repoRes.status === 404) {
        console.log(`Repository does not exist yet. Creating "https://github.com/${username}/${repoName}"...`);
        const createRes = await githubRequest('/user/repos', 'POST', token, {
            name: repoName,
            description: 'TGI Enterprise Library Management System ERP & Self-Service Kiosk Suite',
            private: false,
            auto_init: true
        });

        if (createRes.status !== 201) {
            console.error('❌ Failed to create repository:', createRes.data);
            process.exit(1);
        }
        console.log('✓ Repository created successfully!');
        // Allow GitHub a moment to initialize the repo
        await new Promise(r => setTimeout(r, 2000));
    } else {
        console.log(`✓ Repository found! Preparing to sync files...\n`);
    }

    // Collect project files
    const allFiles = getAllFiles(__dirname);
    console.log(`📁 Found ${allFiles.length} files to upload/sync.\n`);

    // Upload blobs in parallel batches
    console.log('⏳ Creating Git file blobs...');
    const treeItems = [];
    const BATCH_SIZE = 8;

    for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
        const chunk = allFiles.slice(i, i + BATCH_SIZE);
        await Promise.all(chunk.map(async (file) => {
            const fileData = fs.readFileSync(file.fullPath);
            const base64Content = fileData.toString('base64');

            const blobRes = await githubRequest(`/repos/${username}/${repoName}/git/blobs`, 'POST', token, {
                content: base64Content,
                encoding: 'base64'
            });

            if (blobRes.status === 201) {
                treeItems.push({
                    path: file.relPath,
                    mode: '100644',
                    type: 'blob',
                    sha: blobRes.data.sha
                });
                process.stdout.write('.');
            } else {
                console.warn(`\n⚠️ Failed to upload blob for ${file.relPath}:`, blobRes.data.message);
            }
        }));
    }

    console.log(`\n✓ Uploaded ${treeItems.length} file blobs successfully.`);

    // Get current HEAD commit of default branch
    let defaultBranch = repoRes.data.default_branch || DEFAULT_BRANCH;
    let parentCommitSha = null;

    const refRes = await githubRequest(`/repos/${username}/${repoName}/git/ref/heads/${defaultBranch}`, 'GET', token);
    if (refRes.status === 200 && refRes.data.object) {
        parentCommitSha = refRes.data.object.sha;
    } else {
        // Try master fallback
        const masterRes = await githubRequest(`/repos/${username}/${repoName}/git/ref/heads/master`, 'GET', token);
        if (masterRes.status === 200 && masterRes.data.object) {
            parentCommitSha = masterRes.data.object.sha;
            defaultBranch = 'master';
        }
    }

    // Create Git Tree
    console.log('⏳ Generating Git tree structure...');
    const treePayload = { tree: treeItems };
    if (parentCommitSha) {
        // base_tree ensures clean merge/sync
        const parentCommitRes = await githubRequest(`/repos/${username}/${repoName}/git/commits/${parentCommitSha}`, 'GET', token);
        if (parentCommitRes.status === 200 && parentCommitRes.data.tree) {
            treePayload.base_tree = parentCommitRes.data.tree.sha;
        }
    }

    const treeRes = await githubRequest(`/repos/${username}/${repoName}/git/trees`, 'POST', token, treePayload);
    if (treeRes.status !== 201) {
        console.error('❌ Failed to create git tree:', treeRes.data);
        process.exit(1);
    }

    const newTreeSha = treeRes.data.sha;

    // Create Commit
    console.log('⏳ Committing changes...');
    const commitMessage = `Update Library Management System - ${new Date().toISOString().replace('T', ' ').substring(0, 19)}`;
    const commitPayload = {
        message: commitMessage,
        tree: newTreeSha,
        parents: parentCommitSha ? [parentCommitSha] : []
    };

    const commitRes = await githubRequest(`/repos/${username}/${repoName}/git/commits`, 'POST', token, commitPayload);
    if (commitRes.status !== 201) {
        console.error('❌ Failed to create commit:', commitRes.data);
        process.exit(1);
    }

    const newCommitSha = commitRes.data.sha;

    // Update branch reference (Fast-Forward / Push)
    console.log(`⏳ Pushing to branch "${defaultBranch}"...`);
    let pushRes = await githubRequest(`/repos/${username}/${repoName}/git/refs/heads/${defaultBranch}`, 'PATCH', token, {
        sha: newCommitSha,
        force: true
    });

    if (pushRes.status !== 200) {
        // If ref doesn't exist, create it
        pushRes = await githubRequest(`/repos/${username}/${repoName}/git/refs`, 'POST', token, {
            ref: `refs/heads/${defaultBranch}`,
            sha: newCommitSha
        });
    }

    if (pushRes.status === 200 || pushRes.status === 201) {
        console.log('\n======================================================');
        console.log('🎉 SUCCESS! All files uploaded to GitHub!');
        console.log('======================================================');
        console.log(`\nRepository URL: https://github.com/${username}/${repoName}`);
        console.log(`Branch:         ${defaultBranch}`);
        console.log(`Commit SHA:     ${newCommitSha.substring(0, 7)}`);
        console.log(`Total Files:    ${treeItems.length}`);
        console.log('\nYou can run `upload_github.bat` anytime to push new updates!\n');
    } else {
        console.error('❌ Failed to update branch reference:', pushRes.data);
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
});
