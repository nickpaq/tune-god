import { open, b, S } from "./lib.tmp.mjs";
const p=await open(); await p.waitForTimeout(1500);
await p.screenshot({path:S+"start.png"});
await p.click(".cap--menu"); await p.waitForTimeout(500);
await p.screenshot({path:S+"menu0.png"});
console.log(await p.evaluate(()=>[...document.querySelectorAll(".menu button, .menu summary, .menu label")].map(e=>e.textContent.trim().slice(0,50)).join(" | ")));
await b.close();
