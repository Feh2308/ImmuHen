import fs from "node:fs/promises";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const OUT = "C:/Users/felip/OneDrive/Documents/ImmuHen-main/apresentacao-immuhen/ImmuHen-apresentacao.pptx";
const TMP = "C:/Users/felip/OneDrive/Documents/ImmuHen-main/apresentacao-immuhen-build";
const W = 1280;
const H = 720;
const C = {
  ink: "#172019",
  green: "#1E5A3A",
  green2: "#2D744C",
  sage: "#DCE9DF",
  paper: "#F5F1E8",
  sand: "#E8DDC8",
  white: "#FFFFFF",
  muted: "#657169",
  line: "#C9D2CA",
  gold: "#B68B4C",
};
const FONT = "Aptos";
const DISPLAY = "Aptos Display";

async function bytes(path) {
  const b = await fs.readFile(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

function addText(slide, text, left, top, width, height, style = {}) {
  const s = slide.shapes.add({
    geometry: "textbox",
    position: { left, top, width, height },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  s.text = text;
  s.text.style = {
    typeface: style.typeface || FONT,
    fontSize: style.fontSize || 20,
    color: style.color || C.ink,
    bold: Boolean(style.bold),
    italic: Boolean(style.italic),
    alignment: style.alignment || "left",
    verticalAlignment: style.verticalAlignment || "top",
    wrap: style.wrap || "square",
    autoFit: "shrinkText",
    lineSpacing: style.lineSpacing || 1.05,
    insets: style.insets || { top: 0, right: 0, bottom: 0, left: 0 },
  };
  return s;
}

function rect(slide, left, top, width, height, fill, line = "none", radius = 0) {
  const s = slide.shapes.add({
    geometry: radius ? "roundRect" : "rect",
    position: { left, top, width, height },
    fill,
    line: { style: "solid", fill: line, width: line === "none" ? 0 : 1 },
  });
  if (radius) s.borderRadius = radius;
  return s;
}

function line(slide, left, top, width, color = C.line, weight = 1) {
  return slide.shapes.add({
    geometry: "rect",
    position: { left, top, width, height: weight },
    fill: color,
    line: { style: "solid", fill: "none", width: 0 },
  });
}

function footer(slide, n, light = false) {
  addText(slide, "IMMUHEN", 72, 676, 110, 18, { fontSize: 11, bold: true, color: light ? "#DDE9DF" : C.green });
  addText(slide, String(n).padStart(2, "0"), 1170, 676, 38, 18, { fontSize: 11, bold: true, color: light ? "#DDE9DF" : C.muted, alignment: "right" });
}

function title(slide, eyebrow, headline, sub = "", light = false) {
  addText(slide, eyebrow.toUpperCase(), 72, 54, 440, 22, { fontSize: 13, bold: true, color: light ? C.sage : C.green });
  addText(slide, headline, 72, 94, 760, 104, { fontSize: 38, bold: true, typeface: DISPLAY, color: light ? C.white : C.ink, lineSpacing: 0.92 });
  if (sub) addText(slide, sub, 74, 212, 680, 54, { fontSize: 19, color: light ? "#E3ECE4" : C.muted, lineSpacing: 1.12 });
}

async function addImage(slide, path, left, top, width, height, alt) {
  slide.images.add({ blob: await bytes(path), contentType: "image/png", position: { left, top, width, height }, fit: "cover", alt });
}

function notes(slide, text) {
  slide.speakerNotes.textFrame.setText(text);
  slide.speakerNotes.setVisible(true);
}

async function main() {
  const p = Presentation.create({ slideSize: { width: W, height: H } });
  const hero = `${TMP}/hero-hens.png`;
  const chick = `${TMP}/chick.png`;
  const worker = `${TMP}/worker-hen.png`;

  // 1 — cover
  {
    const s = p.slides.add();
    s.background.fill = C.ink;
    await addImage(s, hero, 0, 0, W, H, "Galinhas saudáveis em aviário iluminado");
    rect(s, 0, 0, 600, H, "#172019CC");
    addText(s, "IMMU", 72, 78, 250, 68, { fontSize: 54, bold: true, typeface: DISPLAY, color: C.white, wrap: "none" });
    addText(s, "HEN", 310, 78, 170, 68, { fontSize: 54, bold: true, typeface: DISPLAY, color: "#B9D7BD", wrap: "none" });
    line(s, 74, 176, 120, C.gold, 4);
    addText(s, "Gestão sanitária avícola\ncom clareza no dia a dia.", 72, 224, 460, 150, { fontSize: 42, bold: true, typeface: DISPLAY, color: C.white, lineSpacing: 0.94 });
    addText(s, "A rotina da granja organizada em um só lugar — do lote ao histórico de vacinação.", 76, 414, 420, 74, { fontSize: 20, color: "#E0E8E0", lineSpacing: 1.12 });
    addText(s, "APRESENTAÇÃO DO SISTEMA", 76, 608, 300, 20, { fontSize: 12, bold: true, color: C.sage });
    footer(s, 1, true);
    notes(s, "[Sources]\nImagem gerada internamente com ImageGen para esta apresentação.\n\nMensagem: o ImmuHen transforma a rotina sanitária em uma operação mais clara e acompanhável.");
  }

  // 2 — stakes
  {
    const s = p.slides.add();
    s.background.fill = C.paper;
    await addImage(s, chick, 742, 0, 538, H, "Pintinho saudável em ambiente limpo");
    rect(s, 742, 0, 538, H, "#1E5A3A18");
    title(s, "O desafio", "Na avicultura, o cuidado precisa virar rotina visível.", "Quando informação fica espalhada, a equipe perde tempo, o histórico se fragmenta e decisões importantes chegam tarde.");
    line(s, 74, 336, 520, C.green, 3);
    addText(s, "O que está em jogo", 74, 368, 250, 30, { fontSize: 24, bold: true, typeface: DISPLAY, color: C.green });
    addText(s, "• saber qual lote está em cada etapa\n• manter o programa de vacinação sob controle\n• registrar o que aconteceu — e encontrar depois", 76, 416, 540, 126, { fontSize: 20, color: C.ink, lineSpacing: 1.24 });
    addText(s, "Cuidar bem também é conseguir provar, acompanhar e agir.", 76, 590, 560, 42, { fontSize: 20, bold: true, color: C.green });
    footer(s, 2);
    notes(s, "[Sources]\nImagem gerada internamente com ImageGen para esta apresentação.\n\nAs dores descritas são uma síntese de rotina operacional, sem números inventados.");
  }

  // 3 — what is it
  {
    const s = p.slides.add();
    s.background.fill = C.white;
    title(s, "O sistema", "ImmuHen é o centro de controle da vacinação da granja.", "Uma plataforma para reunir planejamento, execução e acompanhamento em uma linguagem simples para a operação.");
    const steps = [
      ["01", "Planejar", "Programas e calendário de vacinação por lote."],
      ["02", "Registrar", "Aplicações, responsáveis, doses e observações."],
      ["03", "Acompanhar", "Status, solicitações, alertas e próximos passos."],
      ["04", "Rastrear", "Histórico organizado para consultar quando precisar."],
    ];
    line(s, 102, 360, 1056, C.line, 2);
    steps.forEach(([num, head, body], i) => {
      const x = 84 + i * 276;
      rect(s, x, 345, 42, 42, i === 0 ? C.green : C.sage);
      addText(s, num, x, 355, 42, 18, { fontSize: 13, bold: true, alignment: "center", color: i === 0 ? C.white : C.green });
      addText(s, head, x, 416, 220, 32, { fontSize: 25, bold: true, typeface: DISPLAY, color: C.ink });
      addText(s, body, x, 460, 220, 76, { fontSize: 17, color: C.muted, lineSpacing: 1.14 });
    });
    rect(s, 72, 596, 1136, 44, C.sage);
    addText(s, "Menos improviso na rotina. Mais contexto para cada decisão.", 94, 608, 1090, 20, { fontSize: 18, bold: true, color: C.green });
    footer(s, 3);
    notes(s, "[Sources]\nFuncionalidades sintetizadas a partir do sistema ImmuHen no repositório local: programa, vacinas, acompanhamento, solicitações e rastreabilidade.");
  }

  // 4 — features
  {
    const s = p.slides.add();
    s.background.fill = C.paper;
    title(s, "O que entra na rotina", "Do lote ao histórico: tudo no mesmo lugar.", "O ImmuHen conecta as partes que normalmente ficam separadas entre planilhas, mensagens e anotações.");
    const rows = [
      ["Lotes e aves", "cadastro, alojamento, idade e situação de cada lote"],
      ["Vacinas e estoque", "entradas, saídas, consumo previsto e níveis de atenção"],
      ["Programa", "planejamento por etapas e visualização do que vem a seguir"],
      ["Acompanhamento", "solicitações, responsáveis, notificações e conclusão"],
      ["Rastreabilidade", "histórico da operação e relatórios para consulta"],
    ];
    rows.forEach(([h, b], i) => {
      const y = 318 + i * 62;
      addText(s, h, 82, y, 250, 26, { fontSize: 21, bold: true, typeface: DISPLAY, color: C.green });
      addText(s, b, 370, y + 2, 710, 26, { fontSize: 18, color: C.ink });
      line(s, 82, y + 42, 1016, C.line, 1);
    });
    addText(s, "A operação continua sendo humana. A informação deixa de ficar invisível.", 82, 648, 900, 24, { fontSize: 18, bold: true, color: C.green });
    footer(s, 4);
    notes(s, "[Sources]\nFuncionalidades sintetizadas a partir das páginas e rotas do sistema ImmuHen no repositório local: Aves, Vacinas, Entradas, Estoque, Programa, Acompanhamento, Solicitações, Rastreabilidade e Relatórios.");
  }

  // 5 — value
  {
    const s = p.slides.add();
    s.background.fill = C.green;
    addText(s, "O valor", 72, 58, 200, 22, { fontSize: 13, bold: true, color: C.sage });
    addText(s, "Quando a informação flui,\na equipe trabalha melhor.", 72, 108, 650, 120, { fontSize: 42, bold: true, typeface: DISPLAY, color: C.white, lineSpacing: 0.92 });
    addText(s, "O ganho não está em ter mais uma tela. Está em dar contexto para a próxima ação.", 76, 268, 560, 58, { fontSize: 20, color: "#E2EEE4", lineSpacing: 1.12 });
    const benefits = [
      ["Clareza", "ver o que está programado, pendente ou concluído"],
      ["Disciplina", "padronizar registros sem complicar a rotina"],
      ["Confiança", "consultar o histórico quando a decisão exigir"],
    ];
    benefits.forEach(([h, b], i) => {
      const y = 390 + i * 78;
      line(s, 76, y, 44, C.gold, 3);
      addText(s, h, 142, y - 6, 220, 26, { fontSize: 24, bold: true, typeface: DISPLAY, color: C.white });
      addText(s, b, 390, y - 4, 590, 30, { fontSize: 18, color: "#E2EEE4" });
    });
    footer(s, 5, true);
    notes(s, "[Sources]\nSíntese de valor baseada nas funcionalidades do sistema ImmuHen. Não foram usados indicadores ou percentuais não fornecidos.");
  }

  // 6 — operational scene
  {
    const s = p.slides.add();
    s.background.fill = C.white;
    await addImage(s, worker, 690, 0, 590, H, "Profissional inspecionando galinha em aviário");
    title(s, "Para quem faz acontecer", "Feito para a operação — não para impressionar com complexidade.", "A linguagem da granja: objetiva, visual e orientada ao próximo passo.");
    line(s, 74, 348, 470, C.green, 3);
    addText(s, "Para o responsável técnico", 74, 382, 450, 28, { fontSize: 24, bold: true, typeface: DISPLAY, color: C.green });
    addText(s, "mais visibilidade do programa e do histórico sanitário", 76, 420, 500, 28, { fontSize: 18, color: C.ink });
    addText(s, "Para a equipe de campo", 74, 484, 450, 28, { fontSize: 24, bold: true, typeface: DISPLAY, color: C.green });
    addText(s, "menos dúvida na hora de registrar e executar", 76, 522, 500, 28, { fontSize: 18, color: C.ink });
    addText(s, "Para a gestão", 74, 586, 450, 28, { fontSize: 24, bold: true, typeface: DISPLAY, color: C.green });
    addText(s, "uma visão mais organizada do que está acontecendo", 76, 624, 540, 28, { fontSize: 18, color: C.ink });
    footer(s, 6);
    notes(s, "[Sources]\nImagem gerada internamente com ImageGen para esta apresentação.\n\nPúblicos e benefícios apresentados como posicionamento do produto, sem prometer resultados numéricos.");
  }

  // 7 — close
  {
    const s = p.slides.add();
    s.background.fill = C.paper;
    rect(s, 72, 72, 8, 540, C.gold);
    addText(s, "IMMUHEN", 126, 84, 360, 36, { fontSize: 18, bold: true, color: C.green });
    addText(s, "Mais controle para a granja.\nMais confiança para o próximo ciclo.", 126, 180, 760, 156, { fontSize: 44, bold: true, typeface: DISPLAY, color: C.ink, lineSpacing: 0.94 });
    addText(s, "Conheça o sistema e leve a gestão sanitária para o centro da operação.", 130, 382, 620, 54, { fontSize: 21, color: C.muted });
    rect(s, 130, 506, 350, 58, C.green);
    addText(s, "Organize. Acompanhe. Cuide.", 148, 523, 314, 22, { fontSize: 18, bold: true, color: C.white, alignment: "center" });
    addText(s, "Sistema de gestão sanitária avícola", 130, 620, 400, 20, { fontSize: 14, color: C.green, bold: true });
    addText(s, "IMMUHEN", 1030, 622, 150, 20, { fontSize: 14, bold: true, color: C.green, alignment: "right" });
    footer(s, 7);
    notes(s, "[Sources]\nTexto institucional criado para divulgação do sistema ImmuHen.\n\nEncerramento: convidar o público a conhecer o sistema e iniciar uma conversa comercial.");
  }

  await fs.mkdir(`${TMP}/rendered`, { recursive: true });
  for (const [i, slide] of p.slides.items.entries()) {
    const png = await p.export({ slide, format: "png", scale: 1 });
    await fs.writeFile(`${TMP}/rendered/slide-${i + 1}.png`, new Uint8Array(await png.arrayBuffer()));
    const layout = await slide.export({ format: "layout" });
    await fs.writeFile(`${TMP}/rendered/slide-${i + 1}.layout.json`, await layout.text());
  }
  const montage = await p.export({ format: "webp", montage: true, scale: 1 });
  await fs.writeFile(`${TMP}/rendered/montage.webp`, new Uint8Array(await montage.arrayBuffer()));
  const pptx = await PresentationFile.exportPptx(p);
  await pptx.save(OUT);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
