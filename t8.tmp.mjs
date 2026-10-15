import { open, b, S } from "./lib.tmp.mjs";
const L="/tmp/claude-0/-home-user-tune-god/097905a2-ce7d-57e6-80ba-3260f8a663d5/scratchpad/mk/lib";
const p=await open(402,874); await p.waitForTimeout(1200);
await p.screenshot({path:"/tmp/claude-0/-home-user-tune-god/097905a2-ce7d-57e6-80ba-3260f8a663d5/scratchpad/mk2/s_start.png"});
await p.locator("button",{hasText:/^\s*kit\s*$/i}).first().click(); await p.waitForTimeout(800);
const [fc]=await Promise.all([p.waitForEvent("filechooser"),p.locator("button",{hasText:/reconnect files/i}).first().click()]);
await fc.setFiles(L); await p.waitForTimeout(15000);
await p.locator("button",{hasText:/select all/i}).first().click(); await p.waitForTimeout(600);
await p.screenshot({path:S+"s_lib.png"});
await p.locator("button",{hasText:/generate kit/i}).first().click(); await p.waitForTimeout(35000);
const tap=async(i)=>{const r=await p.locator(".pad").nth(i).boundingBox(); await p.mouse.move(r.x+r.width/2,r.y+r.height/2); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(900);};
await p.screenshot({path:S+"s_kitA.png"});
await tap(13); await p.screenshot({path:S+"s_swap.png"});
await p.click('button[aria-label="Sound type mode"]'); await p.waitForTimeout(700); await p.screenshot({path:S+"s_type.png"});
{const r=await p.locator(".pad").nth(13).boundingBox(); await p.mouse.move(r.x+r.width/2,r.y+r.height/2); await p.mouse.down(); await p.mouse.move(r.x+r.width/2+10,r.y+r.height/2-120,{steps:6}); await p.mouse.move(r.x+r.width/2+10,r.y+r.height/2-260,{steps:6}); await p.waitForTimeout(500); await p.screenshot({path:S+"s_drag.png"}); await p.mouse.up(); await p.waitForTimeout(400);}
await p.click('button[aria-label="Bank B"]'); await p.waitForTimeout(600); await p.screenshot({path:S+"s_kitB.png"});
await tap(0);
await p.click('button[aria-label="Tune mode"]'); await p.waitForTimeout(500);
{const k=await p.locator(".key").nth(4).boundingBox(); await p.mouse.move(k.x+k.width/2,k.y+k.height*0.8); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(1500);}
await p.screenshot({path:S+"s_tune.png"});
await p.click('button[aria-label="Bank C"]'); await p.waitForTimeout(600); await p.screenshot({path:S+"s_kitC.png"});
await p.click(".cap--menu"); await p.waitForTimeout(400); await p.screenshot({path:S+"s_menu.png"});
await p.locator("summary",{hasText:/project & sound settings/i}).first().click(); await p.waitForTimeout(200);
await p.locator("button",{hasText:/koala type & pad settings/i}).first().click(); await p.waitForTimeout(800); await p.screenshot({path:S+"s_ktps.png"});
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
console.log(await p.evaluate(()=>[...document.querySelectorAll("button")].filter(e=>e.offsetParent).map(e=>e.textContent.trim().slice(0,30)).join(" | ").slice(0,600)));
await b.close();
