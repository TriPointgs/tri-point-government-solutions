import {readdirSync} from 'node:fs';import {spawnSync} from 'node:child_process';
for(const dir of ['api','lib','assets','scripts'])for(const file of readdirSync(dir).filter(p=>/\.(mjs|js)$/.test(p))){const r=spawnSync(process.execPath,['--check',`${dir}/${file}`],{encoding:'utf8'});if(r.status!==0){console.error(r.stderr);process.exit(1);}}
console.log('Server, client and build JavaScript syntax checks passed.');
