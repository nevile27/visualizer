export function downloadUrl(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
}

export function downloadText(text: string, filename: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  downloadUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function computedColor(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function resolvePaint(svg: SVGSVGElement) {
  svg.querySelectorAll("*").forEach((node) => {
    for (const attr of ["fill", "stroke"]) {
      const value = node.getAttribute(attr);
      if (!value?.includes("var(")) continue;
      node.setAttribute(
        attr,
        value.replace(/var\((--[\w-]+)\)/g, (_, token: string) => computedColor(token, "")),
      );
    }
  });
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image"));
    image.src = url;
  });
}

export async function svgElementToPng(svg: SVGSVGElement, filename: string) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  resolvePaint(clone);
  const width = Number(svg.getAttribute("width")) || svg.clientWidth;
  const height = Number(svg.getAttribute("height")) || svg.clientHeight;
  const xml = new XMLSerializer().serializeToString(clone);
  const blobUrl = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = await loadImage(blobUrl);
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = computedColor("--stage", "#0c1016");
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    downloadUrl(canvas.toDataURL("image/png"), filename);
  } catch {
    downloadUrl(blobUrl, filename.replace(/\.png$/, ".svg"));
    return;
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
  }
}
