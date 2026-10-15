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
const pad=async(i)=>p.locator(".pad").nth(i).boundingBox();
const tap=async(i)=>{const r=await pad(i); await p.mouse.move(r.x+r.width/2,r.y+r.height/2); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(700);};
await p.click('button[aria-label="Bank A"]'); await p.waitForTimeout(400);
await tap(13);
await p.click('button[aria-label="Hot swap mode"]'); await p.waitForTimeout(700);
await p.screenshot({path:S+"swap2.png"});
await p.click('button[aria-label="Sound type mode"]'); await p.waitForTimeout(700);
await p.screenshot({path:S+"type2.png"});
// drag overlay
{const r=await pad(13); await p.mouse.move(r.x+r.width/2,r.y+r.height/2); await p.mouse.down(); await p.mouse.move(r.x+r.width/2+10,r.y+r.height/2-120,{steps:6}); await p.mouse.move(r.x+r.width/2+10,r.y+r.height/2-260,{steps:6}); await p.waitForTimeout(500); await p.screenshot({path:S+"drag.png"}); await p.mouse.up(); await p.waitForTimeout(400);}
// tune with key
await p.click('button[aria-label="Bank B"]'); await p.waitForTimeout(400); await tap(0);
await p.click('button[aria-label="Tune mode"]'); await p.waitForTimeout(500);
await p.locator("text=E").last().click({force:true}).catch(()=>{});
const keys=await p.$$(".key"); console.log("keys",keys.length);
await p.waitForTimeout(700); await p.screenshot({path:S+"tune2.png"});
// menu expanded
await p.click(".cap--menu"); await p.waitForTimeout(300);
for (const t of [/kit & memory/i,/library tools/i,/project & sound settings/i,/appearance/i]) { await p.locator("summary, button",{hasText:t}).first().click().catch(()=>{}); await p.waitForTimeout(150); }
await p.screenshot({path:S+"menu2.png"});
await p.locator("button",{hasText:/koala type & pad settings/i}).first().click().catch(e=>console.log("ktps",e.message.slice(0,60))); await p.waitForTimeout(600);
await p.screenshot({path:S+"ktps.png"});
await p.keyboard.press("Escape");
await b.close();
