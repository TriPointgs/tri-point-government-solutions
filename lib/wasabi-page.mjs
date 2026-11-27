import fs from 'node:fs';
import {brandSolutionsPage} from './brand-solutions-page.mjs';
export const wasabiPage=()=>brandSolutionsPage('wasabi',JSON.parse(fs.readFileSync(new URL('../content/wasabi/catalog.json',import.meta.url),'utf8')));
