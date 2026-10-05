import http from 'node:http';
import {readFile, realpath, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../app/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp','.mp3':'audio/mpeg','.ico':'image/x-icon'};
export function createPreviewServer(){
 return http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','no-store');
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
  try{
   const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   if(pathname.includes('\\')||pathname.includes('\0')||pathname.split('/').some(p=>p.startsWith('.'))){res.writeHead(403);res.end();return;}
   const file=path.resolve(root,'.'+(pathname==='/'?'/play.html':pathname));
   const actual=await realpath(file),relative=path.relative(root,actual);
   if(relative.startsWith('..')||path.isAbsolute(relative)||!types[path.extname(actual)]){res.writeHead(403);res.end();return;}
   const info=await stat(actual);if(!info.isFile()){res.writeHead(404);res.end();return;}
   res.writeHead(200,{'Content-Type':types[path.extname(actual)],'Content-Length':info.size});
   res.end(req.method==='HEAD'?undefined:await readFile(actual));
  }catch(e){res.writeHead(e instanceof URIError?400:404);res.end();}
 });
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const port=Number(process.env.PORT||4173),host=process.env.HOST||'0.0.0.0';
 createPreviewServer().listen(port,host,()=>console.log(`Smolensk Poker: http://localhost:${port}/ (listening on ${host})`));
}
