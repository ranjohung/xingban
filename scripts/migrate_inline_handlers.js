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
 .replace(/onclick="([A-Za-z_$][\w$]*)\(([^"${}]*)\)"/g,(all,name,raw)=>{
   const allowed=new Set(['callEmergencyContact','filterDialogues','filterRecordsByChild','finishEmergencySession','showEmergencyStrategies','showFamilyTool','startEmergency','switchDialogueTab']);if(!allowed.has(name))return all;
   const normalized=raw.trim().replace(/'/g,'"');try{const args=JSON.parse(`[${normalized}]`);return `data-ui-call="${name}" data-ui-args='${JSON.stringify(args)}'`}catch(_){return all}
 })
 .replace(/onclick="navigateTo\('([a-z-]+)'\)"/g,'data-nav="$1"');
source=source.replace(/oninput="onRecordsSearch\(this\.value\)"/g,'data-ui-input="records"').replace(/oninput="onStrategiesSearch\(this\.value\)"/g,'data-ui-input="strategies"').replace(/oninput="onCommunitySearch\(this\.value\)"/g,'data-ui-input="community"').replace(/oninput="updateIntensity\(this\.value\)"/g,'data-ui-input="intensity"').replace(/oninput="document\.getElementById\('edit-intensity-value'\)\.textContent = this\.value <= 3 \? '低' : this\.value <= 6 \? '中等' : '高'"/g,'data-ui-input="editIntensity"').replace(/oninput="document\.getElementById\('loneliness-score-display'\)\.textContent=this\.value"/g,'data-ui-input="loneliness"')
 .replace(/onchange="handlePhotoSelect\(event\)"/g,'data-ui-change="photo"').replace(/onchange="handleRiskCategory\(this\.value\)"/g,'data-ui-change="risk"').replace(/onchange="document\.getElementById\('child-other-diagnosis'\)\.classList\.toggle\('hidden',this\.value!=='OTHER'\)"/g,'data-ui-change="diagnosis"').replace(/onchange="toggleDeletionChildField\(this\.value\)"/g,'data-ui-change="deletion"')
 .replace(/onchange="toggleSetting\('([^']+)'\s*,\s*this\.checked\)"/g,'data-ui-change="setting" data-setting="$1"').replace(/onchange="toggleStrategyStep\(\$\{id\},\$\{index\},this\.checked\)"/g,'data-ui-change="strategyStep" data-strategy="${Number(id)}" data-step="${Number(index)}"')
 .replace(/onkeydown="if\(event\.key==='Enter'\)sendPeerMessage\(\)"/g,'data-ui-enter="send-peer"').replace(/onsubmit="event\.preventDefault\(\);handleLogin\(\)"/g,'data-ui-submit="login"');
 fs.writeFileSync(file,source,'utf8');const after=(source.match(/on(?:click|change|input|submit|keydown|error)="/g)||[]).length;totalAfter+=after;console.log(`${path.basename(file)}: ${before} -> ${after}`)}
console.log(`inline handlers total: ${totalBefore} -> ${totalAfter}`);
