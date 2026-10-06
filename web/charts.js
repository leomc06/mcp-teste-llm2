// Gráficos em SVG desenhado à mão, sem biblioteca externa (decisão: web/
// continua 100% estático/offline, sem CDN). Cores vêm das variáveis
// --chart-series-1..8 (web/styles.css), validadas com o script da skill
// dataviz contra o fundo real desta página (--surface:#2a3640).

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);

  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }

  return el;
}

// Barra horizontal: rótulo direto por categoria (nunca só cor pra
// identidade) + tooltip nativo via <title>. Retorna false sem desenhar
// nada quando não há dado útil (lista vazia ou todos os valores zero) —
// quem chama decide o que mostrar no lugar (ver Edge case do plano: resumo
// executivo com filtro sem nenhum ticket no período).
export function renderBarChart(container, rows, { valueKey = "value", labelKey = "label" } = {}) {
  container.replaceChildren();

  const max = Math.max(0, ...rows.map((row) => row[valueKey] ?? 0));

  if (rows.length === 0 || max <= 0) {
    return false;
  }

  const rowHeight = 32;
  const labelWidth = 130;
  const trackWidth = 250;
  const valueGutter = 45;
  const width = labelWidth + trackWidth + valueGutter;
  const height = rows.length * rowHeight;

  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width: "100%",
    height: String(height),
    role: "img",
    "aria-label": "Gráfico de barras",
  });

  rows.forEach((row, index) => {
    const y = index * rowHeight;
    const value = row[valueKey] ?? 0;
    const barWidth = (value / max) * trackWidth;
    const colorIndex = (index % 8) + 1;

    const label = svgEl("text", {
      x: "0",
      y: String(y + rowHeight / 2 + 4),
      fill: "var(--text)",
      "font-size": "12",
    });
    label.textContent = String(row[labelKey] ?? "");

    const track = svgEl("rect", {
      x: String(labelWidth),
      y: String(y + 6),
      width: String(trackWidth),
      height: String(rowHeight - 14),
      rx: "4",
      fill: "var(--chart-grid)",
    });

    const bar = svgEl("rect", {
      x: String(labelWidth),
      y: String(y + 6),
      width: String(Math.max(barWidth, value > 0 ? 2 : 0)),
      height: String(rowHeight - 14),
      rx: "4",
      fill: `var(--chart-series-${colorIndex})`,
    });

    const title = svgEl("title");
    title.textContent = `${row[labelKey]}: ${value}`;
    bar.append(title);

    const valueText = svgEl("text", {
      x: String(labelWidth + trackWidth + 8),
      y: String(y + rowHeight / 2 + 4),
      fill: "var(--muted)",
      "font-size": "12",
    });
    valueText.textContent = String(value);

    svg.append(label, track, bar, valueText);
  });

  container.append(svg);
  return true;
}

// Donut (stroke-dasharray) — só sensato quando as linhas somam um todo
// (percentual já existe nos dados, até 6 categorias). Nunca usado pra
// kind:"operacional" (contadores independentes, não é todo-e-partes).
export function renderPieChart(container, rows, { valueKey = "value", labelKey = "label", percentKey = "percent" } = {}) {
  container.replaceChildren();

  const total = rows.reduce((sum, row) => sum + (row[valueKey] ?? 0), 0);

  if (rows.length === 0 || total <= 0) {
    return false;
  }

  const size = 160;
  const radius = 56;
  const strokeWidth = 28;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const svg = svgEl("svg", {
    viewBox: `0 0 ${size} ${size}`,
    width: String(size),
    height: String(size),
    role: "img",
    "aria-label": "Gráfico de pizza",
  });

  const legend = document.createElement("ul");
  legend.className = "chart-legend";

  let offset = 0;

  rows.forEach((row, index) => {
    const value = row[valueKey] ?? 0;
    const fraction = value / total;
    const dash = fraction * circumference;
    const colorIndex = (index % 8) + 1;
    const percentLabel = row[percentKey] !== undefined
      ? `${row[percentKey]}%`
      : `${Math.round(fraction * 100)}%`;

    const circle = svgEl("circle", {
      cx: String(center),
      cy: String(center),
      r: String(radius),
      fill: "none",
      stroke: `var(--chart-series-${colorIndex})`,
      "stroke-width": String(strokeWidth),
      "stroke-dasharray": `${dash} ${circumference - dash}`,
      "stroke-dashoffset": String(-offset),
      transform: `rotate(-90 ${center} ${center})`,
    });

    const title = svgEl("title");
    title.textContent = `${row[labelKey]}: ${value} (${percentLabel})`;
    circle.append(title);

    svg.append(circle);
    offset += dash;

    const item = document.createElement("li");
    item.className = "chart-legend-item";

    const swatch = document.createElement("span");
    swatch.className = "chart-legend-swatch";
    swatch.style.background = `var(--chart-series-${colorIndex})`;

    item.append(swatch, document.createTextNode(`${row[labelKey]} (${percentLabel})`));
    legend.append(item);
  });

  container.append(svg, legend);
  return true;
}
