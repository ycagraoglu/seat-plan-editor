import { describe, it, expect } from "vitest";
import { buildDbPayload } from "../../src/core/db-export.js";
import { buildMeta } from "../../src/core/geometry.js";
import { gateMap } from "../../src/core/gates.js";
import * as V from "../../src/venues/index.js";

const SEC_KIND=["floor","balcony","stand","tier","section","box","table_area","general_admission_area"];
const GRP_KIND=["table","box","loveseat","pod","companion_group"];
const SEAT_KIND=["single","loveseat","wheelchair_space","companion","stool"];
const FEATURE=["accessible","restrictedView"];
const GEO_KIND=["point.v1","line.v1","polyline.v1","rect.v1","rounded_rect.v1","ellipse.v1","arc.v1","polygon.v1","bezier_path.v1"];
const SHAPE_KIND=["stage","screen","field","court","goal","table","bar","wall","barrier","aisle","entrance","exit","amenity","label","restricted_area","standing_area","decoration"];
const NAMES=["CSO","ZORLU","GS","ULKER","HARBIYE","AYLAK","SUREYYA","AKM","YENIKAPI"];
const P=(k)=>{const v=V[k];return buildDbPayload(v,v.blocks.map(b=>({b,m:buildMeta(b)})),gateMap(v));};
const ALL=NAMES.map(k=>[k,P(k)]);
const gather=(f)=>{const s=new Set();ALL.forEach(([k,p])=>f(p).forEach(x=>s.add(x)));return [...s].sort();};

it("AUDIT", () => {
  const L=[];
  const vocab=(ad,got,dict)=>{const bad=got.filter(x=>!dict.includes(x));
    L.push(`${ad.padEnd(26)} ${bad.length?"FAIL out-of-vocab: "+bad.join(","):"ok"}  [${got.join(" ")}]`);};
  L.push("== VOCABULARY ==");
  vocab("5.1 section.kind", gather(p=>p.sections.map(s=>s.kind)), SEC_KIND);
  vocab("5.3 group.kind", gather(p=>p.seat_groups.map(g=>g.kind)), GRP_KIND);
  vocab("5.4 seat_kind", gather(p=>p.seat_types.map(t=>t.seat_kind)), SEAT_KIND);
  vocab("5.4 features", gather(p=>p.seats.flatMap(s=>s.features||[])), FEATURE);
  vocab("6.2 geometry_kind", gather(p=>p.shapes.map(s=>s.geometry_kind)), GEO_KIND);
  vocab("6.3 shape_kind", gather(p=>p.shapes.map(s=>s.shape_kind)), SHAPE_KIND);

  L.push("== STRUCTURE ==");
  let depth=0,leafBad=0,sibDup=[],cyc=0,rootless=0;
  ALL.forEach(([k,p])=>{
    const byId=new Map(p.sections.map(s=>[s.id,s]));
    const parents=new Set(p.sections.map(s=>s.parent_id).filter(Boolean));
    p.sections.forEach(s=>{let d=1,c=s.parent_id,seen=new Set([s.id]);
      while(c){if(seen.has(c)){cyc++;break;}seen.add(c);if(!byId.has(c)){rootless++;break;}d++;c=byId.get(c).parent_id;}
      depth=Math.max(depth,d);});
    p.rows.forEach(r=>{if(parents.has(r.section_id))leafBad++;});
    const g=new Map();p.sections.forEach(s=>{const key=`${s.parent_id||""}|${s.code}`;
      if(g.has(key))sibDup.push(`${k}:${key}`);else g.set(key,1);});
  });
  L.push(`max depth ${depth} (limit 5) ${depth<=5?"ok":"FAIL"}`);
  L.push(`cycles ${cyc} ${cyc?"FAIL":"ok"} | dangling parent ${rootless} ${rootless?"FAIL":"ok"}`);
  L.push(`sibling code dup ${sibDup.length} ${sibDup.length?"FAIL "+sibDup.slice(0,6).join(","):"ok"}`);
  L.push(`rows on non-leaf section ${leafBad} ${leafBad?"FAIL":"ok"}`);

  L.push("== 6.4 GEOMETRY SANITY ==");
  let nan=0,nonpos=0,thin=0,tot=0;
  ALL.forEach(([k,p])=>p.shapes.forEach(s=>{tot++;const d=s.geometry_data;
    Object.values(d).forEach(x=>{if(typeof x==="number"&&!Number.isFinite(x))nan++;});
    if(d.width!=null&&d.width<=0)nonpos++; if(d.height!=null&&d.height<=0)nonpos++;
    if(d.points&&d.points.length<3)thin++;}));
  L.push(`shapes ${tot} | NaN ${nan} | nonpositive dim ${nonpos} | polygon<3pts ${thin}`);

  L.push("== 5.5 ENTRANCES ==");
  ALL.forEach(([k,p])=>{const w=p.seats.filter(s=>s.entrance_id).length;
    const eids=new Set(p.entrances.map(e=>e.id));
    const orphan=p.seats.filter(s=>s.entrance_id&&!eids.has(s.entrance_id)).length;
    L.push(`  ${k.padEnd(8)} ent ${String(p.entrances.length).padStart(3)} es ${String(p.entrance_sections.length).padStart(3)} seats-with-gate ${w}/${p.seats.length} orphan ${orphan}`);});

  L.push("== SCOPE LEAK ==");
  const bad=/"[^"]*(price|fiyat|sellable|satilabilir|availab|blocked|hold|inventory|status|category)[^"]*"\s*:/i;
  const leaks=[];ALL.forEach(([k,p])=>{const m=JSON.stringify(p).match(bad);if(m)leaks.push(`${k} ${m[0]}`);});
  L.push(leaks.length?"FOUND: "+[...new Set(leaks)].join(" | "):"clean");

  console.log("\n"+L.join("\n")+"\n");
});
