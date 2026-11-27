import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const output=path.resolve(root,'dist');
if(path.dirname(output)!==root)throw Error('Build output is outside the project.');
if(fs.existsSync(output)){
 if(fs.lstatSync(output).isSymbolicLink())throw Error('Build output is a link.');
 fs.rmSync(output,{recursive:true,force:true});
}
