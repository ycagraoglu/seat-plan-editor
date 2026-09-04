import { buildSeats } from "./geometry.js";

/* seats.json çıktısının veri şekli — hem editördeki "seats.json" düğmesi
   (exportSeats, tarayıcıya özgü indirme kısmı ayrı kalır) hem de altın
   dosya üretimi (scripts/lib/golden-build.mjs) bunu kullanır; tek kaynak,
   ikisi asla birbirinden sapmaz. metas/levelCounts/gates çağıran tarafça
   hazırlanır. */
export function buildSeatsPayload(plan, metas, levelCounts, gates) {
  const all = [];
  metas.forEach(({ b, m }) => buildSeats(b, m, plan.idTemplate).seats.forEach((s) => {
    if (!s.gap) all.push({ ...s, gate: (gates.get(b.id) || [])[0] || null });
  }));
  const at = {};
  all.forEach((s) => { if (s.at) at[s.at] = (at[s.at] || 0) + 1; });
  return {
    venue: plan.name, unit: "cm", version: plan.published || null,
    seatCount: all.length,
    levels: levelCounts, attributes: at,
    gates: plan.shapes.filter((s) => s.type === "door").map((d) => ({
      label: d.label,
      blocks: (d.blocks || []).map((i) => plan.blocks.find((b) => b.id === i)?.label).filter(Boolean),
    })),
    seats: all.map((s) => ({
      id: s.id, level: s.level, block: s.block, row: s.row, seat: s.num,
      gate: s.gate, x: +s.x.toFixed(1), y: +s.y.toFixed(1), rot: +s.rot.toFixed(1),
      attribute: s.at || null,
    })),
  };
}
