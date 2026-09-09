const json = (o) => ({ content: [{ type: "text", text: JSON.stringify(o, null, 2) }] });

export function registerImportTools(server, session) {
  server.registerTool("accept_import", {
    title: "Doğrulanmış kaynak önizlemesini kabul et",
    description: "verify_reference veya verify_spreadsheet başarılı olduktan sonra staged preview planını tek atomik canlı güncelleme olarak aktif plana taşır.",
    inputSchema: {},
  }, async () => {
    const reference = session.importKind === "reference"
      && session.referenceVerified && session.referencePreviewPlan;
    const spreadsheet = session.importKind === "spreadsheet"
      && session.spreadsheetVerified && session.spreadsheetPreviewPlan;
    const plan = reference || spreadsheet;
    if (!plan) throw new Error("Kabul edilecek doğrulanmış önizleme yok; önce build ve verify çağır.");
    const kind = reference ? "referans" : "Excel";
    session.yeni(plan, { baslik: `${kind} aktarımı kabul edildi` });
    return json({ accepted: true, kind, key: session.plan.key, name: session.plan.name,
      seats: session.summaryData().seatCount });
  });

  server.registerTool("cancel_import", {
    title: "Kaynak aktarımını iptal et",
    description: "Aktif planı değiştirmeden bekleyen referans/Excel tarama, analiz ve staged preview durumunu temizler.",
    inputSchema: {},
  }, async () => {
    session.clearImports();
    return json({ cancelled: true });
  });
}
