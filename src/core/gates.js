import { RAD } from "./geometry.js";

/* ─────────────────────────  KAPI EŞLEME  ─────────────────────────
   Kapı, hizmet ettiği blokların kimliklerini taşır. Koltuk çıktısında
   her koltuğa girilecek kapı bu ilişkiden yazılır.
   ─────────────────────────────────────────────────────────────── */

export function gateMap(plan) {
  const m = new Map();
  plan.shapes.filter((s) => s.type === "door").forEach((d) => {
    (d.blocks || []).forEach((bid) => {
      if (!m.has(bid)) m.set(bid, []);
      m.get(bid).push(d.label);
    });
  });
  return m;
}

/** Her bloğu en yakın kapıya, ayrıca ona yakın sayılabilecek diğer kapılara atar.
 *  Gerçekte bir blok genelde iki girişten beslenir; tek kapıya bağlamak hem
 *  yanlış hem de uzaktaki kapıları sahipsiz bırakıyordu. */
export function autoGates(plan, metas) {
  const doors = plan.shapes.filter((s) => s.type === "door");
  if (!doors.length) return plan.shapes;
  const assign = new Map(doors.map((d) => [d.id, []]));
  metas.forEach(({ b, m }) => {
    const dist = doors.map((d) => ({ d, v: Math.hypot(d.x - m.cx, d.y - m.cy) }))
      .sort((p, q) => p.v - q.v);
    const near = dist[0].v;
    dist.filter((x, i) => i === 0 || x.v <= near * 1.6).slice(0, 3)
      .forEach((x) => assign.get(x.d.id).push(b.id));
  });
  return plan.shapes.map((s) => (s.type === "door" ? { ...s, blocks: assign.get(s.id) || [] } : s));
}

/* ─────────────────────────  SALON SINIRI  ─────────────────────────
   "Duvar" tipindeki şekiller salonun sınırıdır. Sınır dışına taşan
   koltuk fiziksel olarak var olamaz; bu bir çizim hatasıdır ve
   yayına gitmeden yakalanmalıdır.
   ───────────────────────────────────────────────────────────────── */

export function boundaryPolys(plan) {
  const out = [];
  (plan.shapes || []).filter((s) => s.type === "wall").forEach((s) => {
    const cos = Math.cos((s.rot || 0) * RAD), sin = Math.sin((s.rot || 0) * RAD);
    const pts = s.kind === "poly" ? s.pts : [
      { x: -s.w / 2, y: -s.h / 2 }, { x: s.w / 2, y: -s.h / 2 },
      { x: s.w / 2, y: s.h / 2 }, { x: -s.w / 2, y: s.h / 2 },
    ];
    out.push(pts.map((p) => ({ x: s.x + p.x * cos - p.y * sin, y: s.y + p.x * sin + p.y * cos })));
  });
  return out;
}
