'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const folder=process.argv[2]||'installers',repository=process.env.GITHUB_REPOSITORY;
assert.equal(repository,'rohanrich/curar-desktop');
function gh(args){return execFileSync('gh',args,{encoding:'utf8',maxBuffer:1024*1024*4})}
const all=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else all.push(file)}}walk(folder);
const manifests=all.filter(file=>/^checksums-(win32|darwin|linux)\.json$/.test(path.basename(file)));
assert.equal(manifests.length,3,'Require all three platform checksums');
const version=require('../package.json').version,tag='v'+version,files=[],commits=new Set();
for(const manifest of manifests){const data=JSON.parse(fs.readFileSync(manifest));assert.equal(data.version,version);assert(/^[a-f0-9]{40}$/.test(data.commit));commits.add(data.commit);for(const item of data.files){assert(/^Curar-(Doctor|Patient)-[\d.]+-(win|mac|linux)-(x64|universal|x86_64|amd64)(?:-Installer)?\.(exe|dmg|AppImage|deb)$/.test(item.name));const matches=all.filter(file=>path.basename(file)===item.name);assert.equal(matches.length,1,'Exactly one installer per name');const file=matches[0];assert.equal(fs.statSync(file).size,item.bytes);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),item.sha256);files.push({file,name:item.name,bytes:item.bytes,sha256:item.sha256})}files.push({file:manifest,name:path.basename(manifest),bytes:fs.statSync(manifest).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(manifest)).digest('hex')})}
assert.equal(commits.size,1,'All platform artifacts must use the same source commit');
assert.equal(files.length,11);assert.equal(new Set(files.map(file=>file.name)).size,11);
const commit=[...commits][0];
if(process.argv[3]){const run=JSON.parse(fs.readFileSync(process.argv[3]));assert.equal(run.head_sha,commit);assert.equal(run.name,'Build Curar desktop apps');assert.equal(run.repository.full_name,repository)}
let release;
try{release=JSON.parse(gh(['api','repos/'+repository+'/releases/tags/'+tag]))}catch{gh(['release','create',tag,'--repo',repository,'--target',commit,'--title','Curar Desktop '+version,'--notes-file','RELEASE-NOTES.md']);release=JSON.parse(gh(['api','repos/'+repository+'/releases/tags/'+tag]))}
assert.equal(release.target_commitish,commit,'Do not overwrite another source release');
for(const item of files){const existing=release.assets.find(asset=>asset.name===item.name);if(existing){assert.equal(existing.state,'uploaded');assert.equal(existing.size,item.bytes);assert.equal(existing.digest,'sha256:'+item.sha256,'Do not replace a published installer');console.log('Verified existing: '+item.name)}else{gh(['release','upload',tag,'--repo',repository,item.file]);console.log('Published: '+item.name)}}
console.log('Release complete: '+release.html_url);
