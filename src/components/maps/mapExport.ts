// ---------------------------------------------------------------------------------------------------------------
// Saving a mind map as an image, in the browser and with no network: the SVG of the whole map (its print copy) with
// the theme's colours written in, as an .svg file, or drawn onto a canvas as a .png.
// ---------------------------------------------------------------------------------------------------------------

/** The fonts a saved image asks for: those of the system, since a file does not carry the app's own. */
const FONT_STACK = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

/**
 * Every `var(--name)` of a text replaced by what `value` gives for it (the colours of the theme); a variable with
 * no value becomes `fallback`.
 */
export function resolveVars(text: string, value: (name: string) => string, fallback = 'currentColor'): string {
  return text.replace(/var\((--[\w-]+)\)/g, (_, name: string) => value(name).trim() || fallback);
}

/** A file name from a title: "mind-map-goodwill-nature-and-valuation". */
export const fileNameOf = (title: string): string =>
  `mind-map-${title
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;

/** The map as a standalone SVG document, `width` by `height`, in the colours of the page's theme. */
export function svgDocument(svg: SVGSVGElement, width: number, height: number): string {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('width', String(width));
  copy.setAttribute('height', String(height));
  copy.setAttribute('viewBox', `0 0 ${width} ${height}`);
  copy.setAttribute('font-family', FONT_STACK);
  copy.removeAttribute('class');
  copy.removeAttribute('aria-hidden');
  const style = getComputedStyle(document.documentElement);
  const text = new XMLSerializer().serializeToString(copy);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${resolveVars(text, (name) => style.getPropertyValue(name), '#888888')}`;
}

/** The SVG drawn onto a canvas and saved as a PNG: twice the size where that is not too large to draw. */
export async function pngOf(svgText: string, width: number, height: number): Promise<Blob> {
  const scale = Math.max(0.25, Math.min(2, 8000 / Math.max(width, height), Math.sqrt(30_000_000 / (width * height))));
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas');
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No image'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Hands a file to the browser to save. */
export function saveFile(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
