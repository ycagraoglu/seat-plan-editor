import { buildSeats, DEFAULT_SEAT_KIND, resolvePlanGroups } from "./geometry.js";

/* seats.json çıktısının veri şekli — hem editördeki "seats.json" düğmesi
   (exportSeats, tarayıcıya özgü indirme kısmı ayrı kalır) hem de altın
   dosya üretimi (scripts/lib/golden-build.mjs) bunu kullanır; tek kaynak,
   ikisi asla birbirinden sapmaz. metas/levelCounts/gates çağıran tarafça
   hazırlanır.

   attribute (tek, nullable alan) → seat_kind + features: Evrensel Mekân
   Yerleşim ve Koltuk Planı Değerlendirme Raporu §5.4'ün kendi terimleriyle
   (snake_case) dışa aktarılıyor — bu dosyanın amacı zaten şirketin DB
   şemasını yeniden kuracak ekibe DOĞRU kavramları öğretmek, JSON alan
   adları raporunkiyle birebir örtüşsün diye. seat_kind HİÇBİR ZAMAN null
   değil (raporun modelinde her koltuğun bir türü vardır, "single" dahil);
   features her zaman bir dizi (boş [] olabilir, eskiki gibi null değil —
   0..N bir liste, nullable tekil bir değer değil).

   groups/group (§5.3): AYNI mantık, üçüncü sorumluluk. resolvePlanGroups
   (core/geometry.js — TEK kaynak, masa gruplarını da burada türetir) hem
   kayıtlı hem masa-türevi grupları tek listede döner; top-level `groups`
   bu listenin id/code/name/kind'ı (gates'in {label,blocks} listesiyle
   AYNI desen: iç kimlik değil, doğal anahtar dışa açılır). Koltuk
   satırındaki `group` da `block`/`gate` ile AYNI desen — grubun kod'u
   (natural key), iç id'si değil; grubun kind'ını öğrenmek isteyen
   top-level `groups`e bakar. */
export function buildSeatsPayload(plan, metas, levelCounts, gates) {
  const groupList = resolvePlanGroups(plan);
  const groupById = new Map(groupList.map((g) => [g.id, g]));
  const all = [];
  metas.forEach(({ b, m }) => buildSeats(b, m, plan.idTemplate).seats.forEach((s) => {
    if (!s.gap) all.push({ ...s, gate: (gates.get(b.id) || [])[0] || null });
  }));
  const seatKinds = {}, features = {};
  all.forEach((s) => {
    if (s.seatKind !== DEFAULT_SEAT_KIND) seatKinds[s.seatKind] = (seatKinds[s.seatKind] || 0) + 1;
    s.seatFeatures.forEach((f) => { features[f] = (features[f] || 0) + 1; });
  });
  return {
    venue: plan.name, unit: "cm", version: plan.published || null,
    seatCount: all.length,
    levels: levelCounts, seat_kinds: seatKinds, features,
    gates: plan.shapes.filter((s) => s.type === "door").map((d) => ({
      label: d.label,
      blocks: (d.blocks || []).map((i) => plan.blocks.find((b) => b.id === i)?.label).filter(Boolean),
    })),
    groups: groupList.map(({ id, code, name, kind }) => ({ id, code, name, kind })),
    seats: all.map((s) => ({
      id: s.id, level: s.level, block: s.block, row: s.row, seat: s.num,
      gate: s.gate, x: +s.x.toFixed(1), y: +s.y.toFixed(1), rot: +s.rot.toFixed(1),
      seat_kind: s.seatKind, features: s.seatFeatures,
      group: groupById.get(s.groupId)?.code ?? null,
    })),
  };
}
