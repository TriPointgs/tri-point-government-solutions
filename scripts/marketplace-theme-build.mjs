import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const THEME_STYLESHEETS=Object.freeze(['blog.css','catalog.css','contact.css','experience.css','fortinet.css','launch-center.css','lenovo.css','network.css','opportunities.css','order-lab.css','order-tracking.css','product-controls.css','shop-preview.css','zoom.css']);
export const THEME_IMPORT='@import url("/assets/marketplace-theme.css");';
export function installMarketplaceTheme(root='dist'){
 const dir=path.join(root,'assets'),theme=path.join(dir,'marketplace-theme.css');
 if(!fs.existsSync(theme))throw Error('Marketplace theme asset is missing.');
 const css=fs.readFileSync(theme,'utf8');
 if(/@import\b/i.test(css))throw Error('The shared theme cannot import another stylesheet.');
 const applied=[];
 for(const name of THEME_STYLESHEETS){
  const file=path.join(dir,name);if(!fs.existsSync(file))continue;
  let original=fs.readFileSync(file,'utf8');
  if(original.startsWith(THEME_IMPORT+'\n'))original=original.slice(THEME_IMPORT.length+1);
  if(/@charset\b/i.test(original))throw Error('Explicit charset needs handling before theme import: '+name);
  fs.writeFileSync(file,THEME_IMPORT+'\n'+original);applied.push(name);
 }
 if(!applied.includes('experience.css')||!applied.includes('shop-preview.css'))throw Error('Core site or shop stylesheet is missing.');
 return applied;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const applied=installMarketplaceTheme();
 console.log('Unified marketplace brand: shared theme installed in '+applied.length+' site and merchant stylesheets; logo artwork and all runtime business logic unchanged.');
}
