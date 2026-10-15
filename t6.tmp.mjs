import { open, b, S } from "./lib.tmp.mjs";
const P="/tmp/claude-0/-home-user-tune-god/097905a2-ce7d-57e6-80ba-3260f8a663d5/scratchpad/mk/pack";
const p=await open(402,874); await p.waitForTimeout(1200);
const sq=await p.locator("button").filter({hasText:/kit/i}); console.log("kit buttons", await sq.count());
await p.locator("button",{hasText:/^\s*kit\s*$/i}).first().click().catch(e=>console.log("click fail"));
await p.waitForTimeout(1200);
await p.screenshot({path:S+"lib0.png"});
console.log(await p.evaluate(()=>document.body.innerText.slice(0,500)));
await b.close();
