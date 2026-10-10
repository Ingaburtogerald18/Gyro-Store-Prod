// Revisa en los .tsx de app/ las reglas de DESIGN.md que se pueden medir:
// colores sueltos, tamaños de letra sueltos, colores de la paleta de Tailwind
// y la variante `secondary`. Sale con código 1 si encuentra alguno.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "app");

// Archivos que reproducen algo ajeno al sistema: el ticket impreso y los logos de terceros.
const ALLOWED_FILES = new Set([
  "components/admin/invoices/Ticket.tsx",
  "components/admin/invoices/TicketPrintModal.tsx",
  "components/ui/social-icons.tsx",
]);

const PALETTE =
  "(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)";

const RULES = [
  {
    name: "color suelto",
    // Un hex dentro de una clase, un estilo o un atributo de color de SVG.
    test: (line) =>
      /(className|style|fill|stroke|color|background)\b[^\n]*#[0-9a-fA-F]{3,8}\b/.test(line) &&
      !/\[stroke=['"]#|\[fill=['"]#/.test(line) &&
      !/design-check: logo/.test(line),
  },
  { name: "tamaño de letra suelto", test: (line) => /\btext-\[\d[^\]]*\]/.test(line) },
  { name: "color de la paleta de Tailwind", test: (line) => new RegExp(`\\b[a-z-]+-${PALETTE}-\\d{2,3}\\b`).test(line) },
  { name: "variante secondary", test: (line) => /variant=["'{]+secondary\b/.test(line) },
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const problems = [];
for (const file of walk(APP)) {
  const rel = path.relative(APP, file).split(path.sep).join("/");
  if (ALLOWED_FILES.has(rel)) continue;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.test(line)) problems.push(`app/${rel}:${i + 1}  ${rule.name}: ${line.trim().slice(0, 120)}`);
    }
  });
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} problema${problems.length === 1 ? "" : "s"} de diseño. Ver DESIGN.md.`);
  process.exit(1);
}
console.log("Diseño: sin problemas.");
