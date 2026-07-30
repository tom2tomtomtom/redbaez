import { spawn } from 'node:child_process';

const scripts = ['content', 'check', 'fit'];
let failed = false;

for (const name of scripts) {
  const code = await new Promise(resolve => {
    const child = spawn('node', [`scripts/${name}.mjs`], { stdio: 'inherit' });
    child.on('error', err => {
      console.log(`FAIL ${name} could not be started: ${err.message}`);
      resolve(1);
    });
    child.on('close', resolve);
  });
  if (code !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
