'use strict';
const fs=require('fs');const path=require('path');
const files=[path.resolve(__dirname,'..','assets','app.js'),path.resolve(__dirname,'..','index.html')];let totalBefore=0,totalAfter=0;
for(const file of files){let source=fs.readFileSync(file,'utf8');const before=(source.match(/on(?:click|change|input|submit|keydown|error)="/g)||[]).length;totalBefore+=before;
source=source
 .replace(/onclick="closeTopModal\(\);\s*navigateTo\('([a-z-]+)'\)"/g,'data-ui-action="close-and-navigate" data-nav="$1"')
 .replace(/onclick="closeTopModal\(\)"/g,'data-ui-action="close-top-modal"')
 .replace(/onclick="this\.closest\('\.fixed'\)\.remove\(\)"/g,'data-ui-action="remove-overlay"')
 .replace(/onclick="window\.print\(\)"/g,'data-ui-action="print"')
 .replace(/onclick="([A-Za-z_$][\w$]*)\(\)"/g,'data-ui-call="$1"')
 .replace(/onclick="navigateTo\('([a-z-]+)'\)"/g,'data-nav="$1"');
 fs.writeFileSync(file,source,'utf8');const after=(source.match(/on(?:click|change|input|submit|keydown|error)="/g)||[]).length;totalAfter+=after;console.log(`${path.basename(file)}: ${before} -> ${after}`)}
console.log(`inline handlers total: ${totalBefore} -> ${totalAfter}`);
