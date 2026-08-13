import fs from "fs";

const p = "artifacts/burger-gn/src/pages/Checkout.tsx";
let s = fs.readFileSync(p, "utf8");

// Fix literal backslash-n corruption from earlier PowerShell edit
s = s.replace("</>\\n      </main>", "</>\n      </main>");
s = s.replace(/<\/>\s*\\n\s*<\/main>/g, "</>\n      </main>");

// Strip leftover framer props on plain <section> tags
s = s.replace(
  /<section key="([^"]+)"\s*\n\s*initial=\{\{[^}]+\}\} animate=\{\{[^}]+\}\} exit=\{\{[^}]+\}\}\s*\n\s*className=/g,
  '<section key="$1"\n              className=',
);

fs.writeFileSync(p, s);
console.log("literal broken?", s.includes("</>\\n"));
console.log("section with initial", (s.match(/<section[^>]*initial=/g) || []).length);
console.log("closing main ok", s.includes("</>\n      </main>"));
