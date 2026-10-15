import { open, b, S } from "./lib.tmp.mjs";
const P="/tmp/claude-0/-home-user-tune-god/097905a2-ce7d-57e6-80ba-3260f8a663d5/scratchpad/mk/pack/";
const p=await open(402,874); await p.waitForTimeout(1200);
async function load(label,dir){
  await p.click(".cap--menu"); await p.waitForTimeout(300);
  const g=p.locator("summary, button",{hasText:/load individual banks/i}).first(); 
  if(await p.locator("button",{hasText:label}).count()===0 || !(await p.locator("button",{hasText:label}).first().isVisible())) await g.click();
  await p.waitForTimeout(200);
  const [fc]=await Promise.all([p.waitForEvent("filechooser"),p.locator("button",{hasText:label}).first().click()]);
  await fc.setFiles(dir);
  await p.waitForTimeout(9000);
}
await load("Load Bank A: Drums",P+"Rio");
await p.screenshot({path:S+"a1.png"});
console.log("pads",(await p.$$(".pad--loaded")).length);
await b.close();
