import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import fs from "fs";
export const S="/tmp/claude-0/-home-user-tune-god/097905a2-ce7d-57e6-80ba-3260f8a663d5/scratchpad/mk2/";
const mime={".js":"text/javascript",".css":"text/css",".html":"text/html",".woff2":"font/woff2",".svg":"image/svg+xml",".json":"application/json",".webmanifest":"application/manifest+json",".png":"image/png",".wasm":"application/wasm"};
export const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"}).catch(()=>chromium.launch());
export async function open(w=402,h=873){
  const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:3,serviceWorkers:"block",hasTouch:false});
  const p=await ctx.newPage(); await p.addInitScript(()=>{Object.defineProperty(navigator,"standalone",{get:()=>true});});
  p.on("pageerror",e=>console.log("PAGEERR",e.message)); p.on("dialog",d=>{console.log("DIALOG",d.message().slice(0,100));d.accept()});
  await p.route("http://x/**",async r=>{const u=new URL(r.request().url());let f="dist"+(u.pathname==="/"?"/index.html":u.pathname);
    if(!fs.existsSync(f)) return r.fulfill({status:404});
    let body=fs.readFileSync(f);const ext=f.slice(f.lastIndexOf("."));
    if(ext===".css") body=body.toString().replace(/env\(safe-area-inset-top,\s*0px\)/g,"0px").replace(/env\(safe-area-inset-bottom,\s*0px\)/g,"0px");
    r.fulfill({body,contentType:mime[ext]||"application/octet-stream"});});
  await p.goto("http://x/"); return p;
}
