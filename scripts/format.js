#!/usr/bin/env node

const { spawn } = require('child_process');

const cliGlobs = process.argv.slice(2);
const configuredGlob = process.env.npm_config_glob ?? process.env.npm_config_blob;
const fileGlobs = cliGlobs.length > 0 ? cliGlobs : configuredGlob ? [configuredGlob] : [];
const args = fileGlobs.length > 0 ? ['fmt', ...fileGlobs] : ['fmt'];

const child = spawn('dprint', args, { stdio: 'inherit', shell: true });

child.on('exit', (code) => {
    process.exit(code ?? 1);
});
