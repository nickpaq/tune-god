import { open, b, S } from "./lib.tmp.mjs";
const P="/tmp/claude-0/-home-user-tune-god/097905a2-ce7d-57e6-80ba-3260f8a663d5/scratchpad/mk/pack/Rio/";
const p=await open(402,874); await p.waitForTimeout(1200);
await p.click(".cap--menu"); await p.waitForTimeout(300);
await p.locator("summary, button",{hasText:/load individual banks/i}).first().click(); await p.waitForTimeout(200);
const [fc]=await Promise.all([p.waitForEvent("filechooser"),p.locator("button",{hasText:"Load Bank A: Drums"}).first().click()]);
await fc.setFiles(P); await p.waitForTimeout(12000);
await p.click(".cap--menu"); await p.waitForTimeout(300);
await p.locator("summary",{hasText:/appearance/i}).first().click(); await p.waitForTimeout(200);
await p.locator("button",{hasText:/colour scheme/i}).first().click(); await p.waitForTimeout(1000);
await p.screenshot({path:S+"s_scheme.png"});
await p.click(".cap--menu").catch(()=>{});
// chopper picker
await p.keyboard.press("Escape"); await p.waitForTimeout(400);
await p.screenshot({path:S+"s_after.png"});
await b.close();
