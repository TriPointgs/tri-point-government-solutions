import {readFileSync} from 'node:fs';
import {brandSolutionsPage} from './brand-solutions-page.mjs';

export function arcticWolfPage(){
 const path=new URL('../content/arctic-wolf/catalog.json',import.meta.url);
 return brandSolutionsPage('arctic-wolf',JSON.parse(readFileSync(path,'utf8')));
}
