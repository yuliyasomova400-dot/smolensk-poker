import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createPreviewServer} from '../scripts/serve.mjs';
const app=new URL('../app/',import.meta.url);
const server=createPreviewServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
after(()=>new Promise(resolve=>server.close(resolve)));
test('preview, static assets, and server-source isolation',async()=>{
 for(const file of ['','table.html?mode=training','login.html','rooms-online.html','js/table-online.js','images/home.png'])assert.equal((await fetch(`${base}/${file}`)).status,200,file);
 for(const file of ['server/schema.sql','.git/config','../package.json','%2e%2e%5cpackage.json'])assert.notEqual((await fetch(`${base}/${file}`)).status,200,file);
 assert.equal((await fetch(base,{method:'POST'})).status,405);
});
test('JavaScript and inline modules parse',async()=>{
 const sources=[];
 for(const file of await readdir(new URL('js/',app)))if(file.endsWith('.js'))sources.push([file,await readFile(new URL('js/'+file,app),'utf8')]);
 for(const file of await readdir(app))if(file.endsWith('.html')){const html=await readFile(new URL(file,app),'utf8');for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))sources.push([file,match[1]]);}
 for(const[name,source]of sources){const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:source,encoding:'utf8'});assert.equal(result.status,0,`${name}: ${result.stderr}`);}
});
test('HTML and CSS local assets resolve',async()=>{
 for(const folder of ['', 'css/'])for(const file of await readdir(new URL(folder,app))){
  if(!/\.(html|css)$/.test(file))continue;
  const fileURL=new URL(folder+file,app),source=await readFile(fileURL,'utf8');
  for(const match of source.matchAll(/(?:src|href)=["']([^"']+)["']|url\(["']?([^)'"\s]+)["']?\)/g)){
   const ref=match[1]||match[2];if(/^(?:https?:|data:|#|javascript:)/.test(ref))continue;
   const url=new URL(ref,fileURL);url.search='';url.hash='';await access(url);
  }
 }
});
