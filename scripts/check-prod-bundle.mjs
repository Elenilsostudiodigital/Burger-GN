const html = await (await fetch("https://burger-gn.vercel.app/")).text();
const m = html.match(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/);
console.log("bundle", m?.[1] || "none");
if (!m) process.exit(1);
const js = await (await fetch(`https://burger-gn.vercel.app/assets/${m[1]}`)).text();
console.log("has popLayout", js.includes("popLayout"));
console.log("has mode wait", js.includes('mode:"wait"') || js.includes("mode:'wait'"));
console.log("has Stable list comment marker", js.includes("Stable list") || js.includes("no AnimatePresence/popLayout"));
