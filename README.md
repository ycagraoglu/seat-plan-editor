# Oturma Planı Editörü

React + Vite ile kurulmuş standart bir proje. Tek bağımlılık `react` /
`react-dom`; editörün tamamı `src/PlanEditor.jsx` içinde, tek dosya.

## Kurulum

```bash
npm install
```

## Geliştirme sunucusu

```bash
npm run dev
```

Tarayıcıda `http://localhost:5173` açılır. Kod değiştikçe sayfa otomatik
güncellenir (HMR).

## Üretim derlemesi

```bash
npm run build
```

`dist/` klasörüne statik dosyalar üretir. Herhangi bir statik barındırma
servisine (Nginx, Vercel, Netlify, S3+CloudFront) olduğu gibi kopyalanabilir;
sunucu tarafı çalışma zamanı gerekmez.

```bash
npm run preview
```

`dist/` çıktısını yerelde denemek için.

## Dosya yapısı

```
seat-plan-editor/
├── index.html          Giriş HTML'i
├── package.json         Bağımlılıklar ve komutlar
├── vite.config.js       Vite yapılandırması
└── src/
    ├── main.jsx         React kök render'ı
    └── PlanEditor.jsx   Editörün tamamı — tek bileşen
```

## Not

`PlanEditor.jsx` şu an kasıtlı olarak **tek dosya**. Bileşenler, yardımcı
fonksiyonlar, sabitler ve stiller (CSS-in-JS, template literal olarak)
hepsi bu dosyada. Proje büyüdükçe mantıklı bir sonraki adım bunu
`src/components/`, `src/lib/`, `src/styles/` gibi klasörlere bölmek olur —
ama bu editörün davranışını değiştirmez, sadece dosya organizasyonunu.
