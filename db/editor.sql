-- ═══════════════════════════════════════════════════════════════════════════
-- EDİTÖR TABLOSU — mimari raporun şemasının PARÇASI DEĞİL
--
-- Ayrı dosyada olması kasıtlı. schema.sql mekânın kanonik oturma verisidir
-- (bölüm/satır/koltuk); burası editörün ÇALIŞMA BELGESİdir.
--
-- Fark önemli: editörün planı bir ÜRETİM TARİFİdir ("20 sıra, 21..15
-- koltuk, 8° kavis"), koltukların kendisi değil — koltuklar ondan türetilir.
-- Tarifi satır satır ilişkiselleştirmek ne mümkün ne de anlamlı; belge
-- olarak durur. YAYIMLAMA anında tarif çalıştırılıp sonucu schema.sql'e
-- yazılır ve orası dondurulur.
--
-- Yeniden yazacak ekip bu tabloyu kendi belge deposuyla değiştirebilir
-- (jsonb kolon, doküman veritabanı, dosya). Kanonik veri öbür tarafta.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS editor_plans (
  tenant_id   TEXT NOT NULL,
  key         TEXT NOT NULL,
  document    TEXT NOT NULL,               -- plan JSON (Postgres: jsonb)
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS editor_prefs (
  tenant_id   TEXT NOT NULL,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  PRIMARY KEY (tenant_id, key)
);
