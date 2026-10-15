import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
for(const dir of ['api/src','api/tests','scripts'])for(const file of await readdir(dir)){if(file.endsWith('.mjs')){const r=spawnSync(process.execPath,['--check',`${dir}/${file}`],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}}
console.log('All Node modules passed syntax checks.');
