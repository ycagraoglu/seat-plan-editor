-- ═══════════════════════════════════════════════════════════════════════════
-- OTURMA PLANI ŞEMASI
--
-- Mimari raporun (§5–§7) modeli, çalıştırılabilir hâlde. Amacı belge ile
-- kodun arasındaki boşluğu kapatmak: raporun sözlükleri burada CHECK,
-- hiyerarşi kuralları burada UNIQUE/FK. Dokuz örnek salon bu şemaya
-- yükleniyor (scripts/db-load.mjs), yani "dışa aktarım rapora uygun"
-- bir iddia değil, veritabanının reddedebileceği bir olgu.
--
-- KAPSAM DIŞI — bilerek yok: fiyat, kategori, satılabilirlik, müsaitlik,
-- bloke, hold, envanter, seçim politikası. Rapor §4.3 bunları Commerce/
-- Pricing ve Inventory'ye veriyor; fiziksel plan tablosunda yerleri yok.
--
-- HEDEF POSTGRESQL, BURADA SQLITE. Üç yerde ayrışıyorlar, üçü de aşağıda
-- geçtiği yerde işaretli:  jsonb → TEXT ·  UNIQUE NULLS NOT DISTINCT →
-- COALESCE'lı tekil indeks ·  uuid → TEXT.  Gerisi birebir taşınır.
-- SQLite'ta şema (namespace) yok: "seating.sections" → "seating_sections".
-- ═══════════════════════════════════════════════════════════════════════════

PRAGMA foreign_keys = ON;

-- ── venue.venues → venue.spaces ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venue_venues (
  tenant_id   TEXT NOT NULL,               -- Postgres: uuid
  id          TEXT NOT NULL,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS venue_spaces (
  tenant_id   TEXT NOT NULL,
  id          TEXT NOT NULL,
  venue_id    TEXT NOT NULL,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, venue_id, code),
  FOREIGN KEY (tenant_id, venue_id) REFERENCES venue_venues (tenant_id, id) ON DELETE CASCADE
);

-- ── seating.seat_plans → seat_plan_versions ───────────────────────────────
CREATE TABLE IF NOT EXISTS seating_seat_plans (
  tenant_id   TEXT NOT NULL,
  id          TEXT NOT NULL,
  space_id    TEXT NOT NULL,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, space_id, code),
  FOREIGN KEY (tenant_id, space_id) REFERENCES venue_spaces (tenant_id, id) ON DELETE CASCADE
);

-- Sürüm YAYIMLANDIKTAN sonra değişmez (rapor §5.4: "published/superseded
-- plan altında değiştirilemez"). Kimlik değişmezliği buna dayanır.
CREATE TABLE IF NOT EXISTS seating_seat_plan_versions (
  tenant_id     TEXT NOT NULL,
  id            TEXT NOT NULL,
  seat_plan_id  TEXT NOT NULL,
  version       INTEGER NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('draft','published','superseded')),
  unit          TEXT NOT NULL DEFAULT 'cm' CHECK (unit IN ('cm','mm','m')),
  published_at  TEXT,                      -- Postgres: timestamptz
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, seat_plan_id, version),
  FOREIGN KEY (tenant_id, seat_plan_id) REFERENCES seating_seat_plans (tenant_id, id) ON DELETE CASCADE
);

-- ── seating.sections — §5.1 hiyerarşi ─────────────────────────────────────
-- Raporun en kritik eksiği buydu: bölümler düz bir listeydi, "Batı Tribünü →
-- Üst Kat → H Blok" temsil edilemiyordu ve "aynı H kodu farklı katta" kod
-- hilesi istiyordu. parent_section_id + kardeş-tekil kod ikisini de çözer.
CREATE TABLE IF NOT EXISTS seating_sections (
  tenant_id          TEXT NOT NULL,
  version_id         TEXT NOT NULL,
  id                 TEXT NOT NULL,
  parent_section_id  TEXT,                 -- NULL = kök
  code               TEXT NOT NULL,
  name               TEXT NOT NULL,
  kind               TEXT NOT NULL CHECK (kind IN (
                       'floor','balcony','stand','tier','section',
                       'box','table_area','general_admission_area')),
  -- §6.2: geometri bölümün de niteliği; kavisli tribün rect.v1'e sığmaz.
  geometry_kind      TEXT CHECK (geometry_kind IN (
                       'point.v1','line.v1','polyline.v1','rect.v1','rounded_rect.v1',
                       'ellipse.v1','arc.v1','polygon.v1','bezier_path.v1')),
  geometry_data      TEXT,                 -- Postgres: jsonb
  PRIMARY KEY (tenant_id, version_id, id),
  FOREIGN KEY (tenant_id, version_id) REFERENCES seating_seat_plan_versions (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, version_id, parent_section_id)
    REFERENCES seating_sections (tenant_id, version_id, id) ON DELETE CASCADE
);

-- §5.1'in kısıtı. Postgres'te tablo içinde:
--   UNIQUE NULLS NOT DISTINCT (tenant_id, version_id, parent_section_id, code)
-- SQLite NULL'ları BİRBİRİNDEN FARKLI saydığı için kök bölümlerde kısıt
-- çalışmazdı; COALESCE'lı tekil indeks aynı anlamı verir.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sections_sibling_code
  ON seating_sections (tenant_id, version_id, COALESCE(parent_section_id, ''), code);

CREATE INDEX IF NOT EXISTS ix_sections_parent ON seating_sections (tenant_id, version_id, parent_section_id);

-- ── seating.rows ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seating_rows (
  tenant_id   TEXT NOT NULL,
  version_id  TEXT NOT NULL,
  id          TEXT NOT NULL,
  section_id  TEXT NOT NULL,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, version_id, id),
  UNIQUE (tenant_id, version_id, section_id, code),
  FOREIGN KEY (tenant_id, version_id, section_id)
    REFERENCES seating_sections (tenant_id, version_id, id) ON DELETE CASCADE
);

-- ── seating.seat_types — §5.4 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seating_seat_types (
  tenant_id   TEXT NOT NULL,
  version_id  TEXT NOT NULL,
  id          TEXT NOT NULL,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  -- Raporun kontrollü sözlüğü. 'tech' RAPORDA YOK — editöre özgü uzantı
  -- (ızgarada yer kaplayan ama seyirci koltuğu olmayan konum: kamera
  -- platformu, ışık masası). Ekip bunu ya sözlüğe alır ya da o konumları
  -- koltuk yerine shape olarak modeller; karar onların.
  seat_kind   TEXT NOT NULL CHECK (seat_kind IN (
                'single','loveseat','wheelchair_space','companion','stool','tech')),
  PRIMARY KEY (tenant_id, version_id, id),
  UNIQUE (tenant_id, version_id, code),
  FOREIGN KEY (tenant_id, version_id) REFERENCES seating_seat_plan_versions (tenant_id, id) ON DELETE CASCADE
);

-- ── seating.seat_groups — §5.3 ────────────────────────────────────────────
-- Üçüncü sorumluluk: seat_kind "bu ne", features "bu ne özellikte",
-- seat_group "hangi yerlerle birlikte tek birim". Satış politikası burada
-- DEĞİL — o Inventory/Commerce'in işi (rapor §4.3).
CREATE TABLE IF NOT EXISTS seating_seat_groups (
  tenant_id   TEXT NOT NULL,
  version_id  TEXT NOT NULL,
  id          TEXT NOT NULL,
  section_id  TEXT,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('table','box','loveseat','pod','companion_group')),
  PRIMARY KEY (tenant_id, version_id, id),
  UNIQUE (tenant_id, version_id, code),
  FOREIGN KEY (tenant_id, version_id, section_id)
    REFERENCES seating_sections (tenant_id, version_id, id) ON DELETE CASCADE
);

-- ── seating.seats ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seating_seats (
  tenant_id     TEXT NOT NULL,
  version_id    TEXT NOT NULL,
  id            TEXT NOT NULL,
  row_id        TEXT NOT NULL,
  seat_type_id  TEXT NOT NULL,
  group_id      TEXT,
  code          TEXT NOT NULL,             -- kalıcı adres; biletin dayandığı kimlik
  label         TEXT NOT NULL,             -- görünen numara ("12", "A")
  x             REAL NOT NULL,
  y             REAL NOT NULL,
  rotation      REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, version_id, id),
  UNIQUE (tenant_id, version_id, code),
  FOREIGN KEY (tenant_id, version_id, row_id)
    REFERENCES seating_rows (tenant_id, version_id, id) ON DELETE CASCADE,
  -- §5.4'ün composite FK'i: koltuk BAŞKA sürümün tipine bağlanamaz.
  FOREIGN KEY (tenant_id, version_id, seat_type_id)
    REFERENCES seating_seat_types (tenant_id, version_id, id),
  FOREIGN KEY (tenant_id, version_id, group_id)
    REFERENCES seating_seat_groups (tenant_id, version_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_seats_row ON seating_seats (tenant_id, version_id, row_id);
CREATE INDEX IF NOT EXISTS ix_seats_group ON seating_seats (tenant_id, version_id, group_id);

-- features 0..N olduğu için ayrı tablo: "tüm erişilebilir koltuklar"
-- sorgusu bir JSON taraması değil, indeksli bir join olsun.
CREATE TABLE IF NOT EXISTS seating_seat_features (
  tenant_id   TEXT NOT NULL,
  version_id  TEXT NOT NULL,
  seat_id     TEXT NOT NULL,
  feature     TEXT NOT NULL CHECK (feature IN ('accessible','restrictedView')),
  PRIMARY KEY (tenant_id, version_id, seat_id, feature),
  FOREIGN KEY (tenant_id, version_id, seat_id)
    REFERENCES seating_seats (tenant_id, version_id, id) ON DELETE CASCADE
);

-- ── seating.shapes — §6.3, satılabilir envanterden AYRI ───────────────────
CREATE TABLE IF NOT EXISTS seating_shapes (
  tenant_id      TEXT NOT NULL,
  version_id     TEXT NOT NULL,
  id             TEXT NOT NULL,
  shape_kind     TEXT NOT NULL CHECK (shape_kind IN (
                   'stage','screen','field','court','goal','table','bar','wall',
                   'barrier','aisle','entrance','exit','amenity','label',
                   'restricted_area','standing_area','decoration')),
  geometry_kind  TEXT NOT NULL CHECK (geometry_kind IN (
                   'point.v1','line.v1','polyline.v1','rect.v1','rounded_rect.v1',
                   'ellipse.v1','arc.v1','polygon.v1','bezier_path.v1')),
  geometry_data  TEXT NOT NULL,            -- Postgres: jsonb
  z_index        INTEGER NOT NULL DEFAULT 0,
  label          TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (tenant_id, version_id, id),
  FOREIGN KEY (tenant_id, version_id) REFERENCES seating_seat_plan_versions (tenant_id, id) ON DELETE CASCADE
);

-- ── §5.5 giriş / yönlendirme — fiyat ve envanter TAŞIMAZ ──────────────────
CREATE TABLE IF NOT EXISTS seating_entrances (
  tenant_id   TEXT NOT NULL,
  version_id  TEXT NOT NULL,
  id          TEXT NOT NULL,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  PRIMARY KEY (tenant_id, version_id, id),
  UNIQUE (tenant_id, version_id, code),
  FOREIGN KEY (tenant_id, version_id) REFERENCES seating_seat_plan_versions (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS seating_entrance_sections (
  tenant_id    TEXT NOT NULL,
  version_id   TEXT NOT NULL,
  entrance_id  TEXT NOT NULL,
  section_id   TEXT NOT NULL,
  PRIMARY KEY (tenant_id, version_id, entrance_id, section_id),
  FOREIGN KEY (tenant_id, version_id, entrance_id)
    REFERENCES seating_entrances (tenant_id, version_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, version_id, section_id)
    REFERENCES seating_sections (tenant_id, version_id, id) ON DELETE CASCADE
);

-- Koltuk düzeyinde yönlendirme: bölüm eşlemesinden daha ayrıntılı adres
-- gerektiğinde ("B Kapısı → Üst Kat → H Blok → A Sırası → 12").
CREATE TABLE IF NOT EXISTS seating_entrance_seats (
  tenant_id    TEXT NOT NULL,
  version_id   TEXT NOT NULL,
  entrance_id  TEXT NOT NULL,
  seat_id      TEXT NOT NULL,
  PRIMARY KEY (tenant_id, version_id, entrance_id, seat_id),
  FOREIGN KEY (tenant_id, version_id, entrance_id)
    REFERENCES seating_entrances (tenant_id, version_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, version_id, seat_id)
    REFERENCES seating_seats (tenant_id, version_id, id) ON DELETE CASCADE
);
