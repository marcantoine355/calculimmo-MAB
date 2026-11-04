// Récupère le baromètre des taux Meilleurtaux à chaque appel (mis en cache 6 h par Netlify)
// et renvoie { date, rates: { "20": { bon, tresBon, excellent }, ... } }.
const SOURCE = "https://www.meilleurtaux.com/credit-immobilier/barometre-des-taux.html";

const ENTITIES = { "&nbsp;": " ", "&#160;": " ", "&eacute;": "é", "&egrave;": "è", "&ecirc;": "ê", "&agrave;": "à",
  "&ocirc;": "ô", "&ucirc;": "û", "&ccedil;": "ç", "&amp;": "&", "&#233;": "é", "&#232;": "è", "&#224;": "à", "&rsquo;": "'" };

export function toText(html) {
  let t = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  for (const [k, v] of Object.entries(ENTITIES)) t = t.split(k).join(v);
  return t.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/\s+/g, " ");
}

const n = s => parseFloat(String(s).replace(",", "."));
const ok = v => isFinite(v) && v > 0.3 && v < 12;

// Trois taux d'une même durée : le plus bas = excellent, le plus haut = bon (≈ taux moyen)
function triple(vals) {
  const v = vals.map(n).filter(ok).sort((a, b) => a - b);
  if (v.length !== 3) return null;
  return { excellent: v[0], tresBon: v[1], bon: v[2] };
}

export function parse(html) {
  const text = toText(html);
  const rates = {};
  const P = "(\\d{1,2}(?:[.,]\\d{1,3})?)\\s*%";

  // 1) Tableau « Durée | Bon taux | Très bon taux | Taux excellent »
  const rowRe = new RegExp("(\\d{1,2})\\s*ans\\s+" + P + "\\s+" + P + "\\s+" + P, "g");
  for (const m of text.matchAll(rowRe)) {
    const d = +m[1];
    if (![7, 10, 15, 20, 25].includes(d)) continue;
    const t = triple([m[2], m[3], m[4]]);
    if (t) rates[d] = t;
  }

  // 2) Encadré « Prêt sur 20 ans  Taux excellent 3.55%  Très bon taux 3.7%  Bon taux 3.87% »
  const boxRe = new RegExp("Prêt sur (\\d{1,2}) ans((?:\\s*[A-Za-zÀ-ÿ ]{2,25}?\\s*" + P + "){3})", "g");
  for (const m of text.matchAll(boxRe)) {
    const d = +m[1];
    const vals = [...m[2].matchAll(new RegExp(P, "g"))].map(x => x[1]);
    const t = triple(vals);
    if (t) rates[d] = t;
  }

  // 3) Données éventuellement présentes dans les scripts de la page
  const jsonRe = /["']?(?:duree|duration)["']?\s*:\s*["']?(\d{1,2})["']?[\s\S]{0,200}?(?:excellent)["']?\s*:\s*["']?(\d+[.,]\d+)[\s\S]{0,120}?(?:tres_?bon|veryGood)["']?\s*:\s*["']?(\d+[.,]\d+)[\s\S]{0,120}?(?:bon|good)["']?\s*:\s*["']?(\d+[.,]\d+)/gi;
  for (const m of html.matchAll(jsonRe)) {
    const d = +m[1];
    if (rates[d] || ![7, 10, 15, 20, 25].includes(d)) continue;
    const t = triple([m[2], m[3], m[4]]);
    if (t) rates[d] = t;
  }

  const date = (text.match(/Mise à jour le (\d{2}\/\d{2}\/\d{4})/i) || [])[1]
    || (text.match(/simulation du (\d{1,2} [a-zéû]+ \d{4})/i) || [])[1]
    || null;
  return { date, rates };
}

export default async () => {
  try {
    const res = await fetch(SOURCE, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9",
        Accept: "text/html",
      },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = parse(await res.text());
    if (!Object.keys(data.rates).length) throw new Error("Taux introuvables dans la page");
    return Response.json({ ...data, source: SOURCE, fetchedAt: new Date().toISOString() }, {
      headers: {
        "Cache-Control": "public, max-age=600",
        "Netlify-CDN-Cache-Control": "public, durable, s-maxage=21600, stale-while-revalidate=86400",
      },
    });
  } catch (e) {
    return Response.json({ error: String(e.message || e), rates: {} }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
};

export const config = { path: "/api/taux" };
