// Lit le baromètre Meilleurtaux et met à jour taux.json (lancé chaque jour par GitHub Actions).
// Si la page est inaccessible ou a changé de forme, taux.json n'est pas modifié.
import { parse } from "./parse-taux.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = "https://www.meilleurtaux.com/credit-immobilier/barometre-des-taux.html";
const res = await fetch(SOURCE, { headers: {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  "Accept-Language": "fr-FR,fr;q=0.9", Accept: "text/html" } });
if (!res.ok) { console.log("Page inaccessible : HTTP " + res.status + ". taux.json inchangé."); process.exit(0); }
const data = parse(await res.text());
if (!Object.keys(data.rates).length) { console.log("Taux introuvables dans la page. taux.json inchangé."); process.exit(0); }
let old = {}; try { old = JSON.parse(readFileSync("taux.json", "utf8")); } catch {}
const next = { date: data.date || old.date || null, source: SOURCE, rates: { ...(old.rates || {}), ...data.rates } };
writeFileSync("taux.json", JSON.stringify(next) + "\n");
console.log("taux.json :", JSON.stringify(next));
