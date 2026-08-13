import fs from "fs";

const checkoutPath = "artifacts/burger-gn/src/pages/Checkout.tsx";
let checkout = fs.readFileSync(checkoutPath, "utf8");

checkout = checkout.replace(/<motion\.section/g, "<section");
checkout = checkout.replace(/<\/motion\.section>/g, "</section>");

const feeStart = checkout.indexOf("const feeBanner");
const feeAnim = checkout.indexOf("<AnimatePresence>", feeStart);
const feeAnimEnd = checkout.indexOf("</AnimatePresence>", feeAnim);
if (feeStart >= 0 && feeAnim >= 0 && feeAnimEnd > feeAnim) {
  let block = checkout.slice(feeAnim, feeAnimEnd + "</AnimatePresence>".length);
  block = block.replace("<AnimatePresence>", "");
  block = block.replace("</AnimatePresence>", "");
  block = block.replace(/<motion\.div[^>]*>/g, '<div className="space-y-2">');
  block = block.replace(/<\/motion\.div>/g, "</div>");
  checkout = checkout.slice(0, feeAnim) + block + checkout.slice(feeAnimEnd + "</AnimatePresence>".length);
}

if (!checkout.includes("AnimatePresence")) {
  checkout = checkout.replace(
    "import { motion, AnimatePresence } from 'framer-motion';",
    "import { motion } from 'framer-motion';",
  );
}

fs.writeFileSync(checkoutPath, checkout);
console.log("Checkout AnimatePresence:", (checkout.match(/AnimatePresence/g) || []).length);

const dashPath = "artifacts/burger-gn/src/pages/admin/Dashboard.tsx";
let dash = fs.readFileSync(dashPath, "utf8");

function replaceModalBlock(src, startMarker) {
  const start = src.indexOf(startMarker);
  if (start < 0) return src;
  const anim = src.indexOf("<AnimatePresence>", start);
  if (anim < 0 || anim - start > 80) return src;
  const end = src.indexOf("</AnimatePresence>", anim);
  if (end < 0) return src;
  let block = src.slice(anim, end + "</AnimatePresence>".length);
  // Convert conditional AnimatePresence to always-mounted hidden host is complex;
  // strip animations: keep conditional render without AnimatePresence/motion.
  block = block.replace(/<AnimatePresence>\s*/g, "");
  block = block.replace(/\s*<\/AnimatePresence>/g, "");
  block = block.replace(/<motion\.div[^>]*className="/g, '<div className="');
  block = block.replace(/<motion\.div\s+initial=\{[^}]+\}\s+animate=\{[^}]+\}\s+exit=\{[^}]+\}\s+className="/g, '<div className="');
  // More aggressive motion.div opener removal
  block = block.replace(/<motion\.div(\s+[^>]*)?>/g, (m) => {
    const cls = m.match(/className="([^"]*)"/);
    const onClick = m.match(/onClick=\{[^}]+\}/);
    return `<div${cls ? ` className="${cls[1]}"` : ""}${onClick ? ` ${onClick[0]}` : ""}>`;
  });
  block = block.replace(/<\/motion\.div>/g, "</div>");
  return src.slice(0, anim) + block + src.slice(end + "</AnimatePresence>".length);
}

dash = replaceModalBlock(dash, "{/* Refuse modal */}");
dash = replaceModalBlock(dash, "{/* Refuse receipt modal */}");
dash = replaceModalBlock(dash, "<AnimatePresence>\n        {showCancelled");

// Top banners
dash = replaceModalBlock(dash, "return (\n    <div className=\"min-h-screen");
// The first AnimatePresence is notification - handle manually
{
  const first = dash.indexOf("<AnimatePresence>");
  const end = dash.indexOf("</AnimatePresence>", first);
  if (first >= 0 && end > first) {
    let block = dash.slice(first, end + "</AnimatePresence>".length);
    block = block.replace("<AnimatePresence>", "").replace("</AnimatePresence>", "");
    block = block.replace(/<motion\.div[^>]*>/g, (m) => {
      const cls = m.match(/className="([^"]*)"/);
      return `<div${cls ? ` className="${cls[1]}"` : ""}>`;
    });
    block = block.replace(/<\/motion\.div>/g, "</div>");
    dash = dash.slice(0, first) + block + dash.slice(end + "</AnimatePresence>".length);
  }
}
// prep celebration
{
  const idx = dash.indexOf("{prepCelebration &&");
  if (idx >= 0) {
    const anim = dash.lastIndexOf("<AnimatePresence>", idx);
    const end = dash.indexOf("</AnimatePresence>", idx);
    if (anim >= 0 && end > anim) {
      let block = dash.slice(anim, end + "</AnimatePresence>".length);
      block = block.replace("<AnimatePresence>", "").replace("</AnimatePresence>", "");
      block = block.replace(/<motion\.div[^>]*>/g, (m) => {
        const cls = m.match(/className="([^"]*)"/);
        return `<div${cls ? ` className="${cls[1]}"` : ""}>`;
      });
      block = block.replace(/<\/motion\.div>/g, "</div>");
      dash = dash.slice(0, anim) + block + dash.slice(end + "</AnimatePresence>".length);
    }
  }
}

if (!dash.includes("AnimatePresence") && !dash.includes("motion.")) {
  dash = dash.replace("import { motion, AnimatePresence } from 'framer-motion';\n", "");
} else if (!dash.includes("AnimatePresence")) {
  dash = dash.replace(
    "import { motion, AnimatePresence } from 'framer-motion';",
    "import { motion } from 'framer-motion';",
  );
}

fs.writeFileSync(dashPath, dash);
console.log("Dashboard AnimatePresence:", (dash.match(/AnimatePresence/g) || []).length);
console.log("Dashboard motion.div:", (dash.match(/motion\.div/g) || []).length);
