import React from "react";
import ReactDOM from "react-dom/client";
import PlanEditor from "./PlanEditor.jsx";
import ErrorBoundary from "./ui/ErrorBoundary.jsx";
/* Biletera tasarım sistemi + bileşen stilleri (A7: eskiden PlanEditor.jsx
   içinde <style>{CSS}</style> olarak enjekte ediliyordu). Sıra önemli:
   tokens önce, onları tüketen bileşen kuralları sonra. Kök bootstrap
   dosyası olduğu için burada — PlanEditor.jsx zaten CSS'ten arındırılıyor. */
import "./styles/tokens.css";
import "./styles/app.css";
/* Aynı iki dosyanın ?raw kopyası — PlanEditor.jsx'in exportSVG()'si indirilen
   SVG'nin KENDİ <style>'ına gömmek için düz metin ister (dışa aktarılan
   dosya sayfanın stylesheet'ine erişemez). ?raw import'u kasıtlı olarak
   BURADA: PlanEditor.jsx'i test betikleri esbuild+çıplak Node import'uyla
   yüklüyor, orada bir ".css" import'u (ham olsa bile) npm test'i kırar. */
import tokensCssText from "./styles/tokens.css?raw";
import appCssText from "./styles/app.css?raw";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PlanEditor cssText={tokensCssText + appCssText} />
    </ErrorBoundary>
  </React.StrictMode>
);
