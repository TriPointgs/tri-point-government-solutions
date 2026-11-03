import fs from 'node:fs';
import {brandSolutionsPage} from './brand-solutions-page.mjs';
export const ptzopticsPage=()=>brandSolutionsPage('ptzoptics',JSON.parse(fs.readFileSync(new URL('../content/ptzoptics/catalog.json',import.meta.url),'utf8')));
