const INLINE_RASTER_IMAGE = /data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+/gi;
const MIN_INLINE_IMAGE_LENGTH = 128_000;
const MAX_IMAGE_EDGE = 2400;

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("IMAGE_ENCODING_FAILED"));
    reader.onerror = () => reject(reader.error ?? new Error("IMAGE_ENCODING_FAILED"));
    reader.readAsDataURL(blob);
  });
}

async function optimizeInlineImage(dataUrl: string): Promise<string> {
  if (dataUrl.length < MIN_INLINE_IMAGE_LENGTH) return dataUrl;

  let imageUrl: string | null = null;
  try {
    const source = await fetch(dataUrl);
    if (!source.ok) return dataUrl;
    const sourceBlob = await source.blob();
    imageUrl = URL.createObjectURL(sourceBlob);

    const image = new Image();
    image.src = imageUrl;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) return dataUrl;

    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return dataUrl;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let optimized = await canvasToBlob(canvas, 0.86);
    if (!optimized || optimized.size >= sourceBlob.size) {
      optimized = await canvasToBlob(canvas, 0.72);
    }
    if (!optimized || optimized.size >= sourceBlob.size || !optimized.type.startsWith("image/")) return dataUrl;
    return await blobToDataUrl(optimized);
  } catch {
    // Keep the original if this browser cannot decode or re-encode the image.
    return dataUrl;
  } finally {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }
}

async function optimizeImagesInText(input: string): Promise<string> {
  const matches = Array.from(input.matchAll(INLINE_RASTER_IMAGE), (match) => match[0]);
  if (!matches.length) return input;

  const uniqueImages = Array.from(new Set(matches.filter((image) => image.length >= MIN_INLINE_IMAGE_LENGTH)));
  if (!uniqueImages.length) return input;

  const replacements = new Map<string, string>();
  await Promise.all(uniqueImages.map(async (image) => {
    replacements.set(image, await optimizeInlineImage(image));
  }));

  return input.replace(INLINE_RASTER_IMAGE, (image) => replacements.get(image) ?? image);
}

/** Re-encodes large embedded PNG/JPEG/WebP images before a template is sent to the API. */
export async function optimizeCertificateTemplateImages<T extends {
  htmlTemplate?: string | null;
  cssTemplate?: string | null;
}>(template: T): Promise<T> {
  const [htmlTemplate, cssTemplate] = await Promise.all([
    optimizeImagesInText(String(template.htmlTemplate ?? "")),
    optimizeImagesInText(String(template.cssTemplate ?? "")),
  ]);

  return {
    ...template,
    ...(template.htmlTemplate != null ? { htmlTemplate } : {}),
    ...(template.cssTemplate != null ? { cssTemplate } : {}),
  };
}
