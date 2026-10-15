import { open, b, S } from "./lib.tmp.mjs";
const P="/tmp/claude-0/-home-user-tune-god/097905a2-ce7d-57e6-80ba-3260f8a663d5/scratchpad/mk/pack/Rio/";
const p=await open(402,874); await p.waitForTimeout(1200);
async function load(label,dir){
  await p.click(".cap--menu"); await p.waitForTimeout(300);
  if(!(await p.locator("button",{hasText:label}).first().isVisible().catch(()=>false))) await p.locator("summary, button",{hasText:/load individual banks/i}).first().click();
  await p.waitForTimeout(200);
  const [fc]=await Promise.all([p.waitForEvent("filechooser"),p.locator("button",{hasText:label}).first().click()]);
  await fc.setFiles(dir); await p.waitForTimeout(10000);
}
await load("Load Bank A: Drums",P);
await load("Load Bank B: Melodic Loops",P+"Chord Loops");
await load("Load Bank B: 808 & Bass",P);
await load("Load Bank C: One Shots",P+"Melodic One Shots");
const tap=async(i)=>{const r=await p.locator(".pad").nth(i).boundingBox(); await p.mouse.move(r.x+r.width/2,r.y+r.height/2); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(600);};
const union=async(sels)=>{const bs=await Promise.all(sels.map(async s=>(await p.locator(s).first().boundingBox())));const x=Math.min(...bs.map(b=>b.x)),y=Math.min(...bs.map(b=>b.y)),x2=Math.max(...bs.map(b=>b.x+b.width)),y2=Math.max(...bs.map(b=>b.y+b.height));return {x,y,width:x2-x,height:y2-y};};
await p.locator(".padzone").screenshot({path:S+"padsA.png"});
await tap(13); await p.screenshot({path:S+"swapfull.png"});
await p.click('button[aria-label="Bank B"]'); await p.waitForTimeout(500); await p.locator(".padzone").screenshot({path:S+"padsB.png"});
await p.click('button[aria-label="Bank C"]'); await p.waitForTimeout(500); await p.locator(".padzone").screenshot({path:S+"padsC.png"});
await p.click('button[aria-label="Bank B"]'); await tap(0);
await p.click('button[aria-label*="Tune"]'); await p.waitForTimeout(600); 
await p.screenshot({path:S+"tunefull.png"});
await p.click('button[aria-label*="Sound type"]').catch(()=>{}); await p.waitForTimeout(600);
await p.screenshot({path:S+"typefull.png"});
console.log(await p.evaluate(()=>[...document.querySelectorAll("button[aria-label]")].map(e=>e.getAttribute("aria-label")).slice(0,30).join(" | ")));
await b.close();
