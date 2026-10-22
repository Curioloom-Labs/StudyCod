import { afterEach, describe, expect, it, vi } from "vitest";
import { optimizeCertificateTemplateImages } from "./optimizeTemplateImages";

afterEach(() => vi.unstubAllGlobals());

describe("optimizeCertificateTemplateImages", () => {
  it("compresses large embedded raster images in HTML and CSS", async () => {
    const originalImage = `data:image/png;base64,${"a".repeat(160_000)}`;
    const context = { drawImage: vi.fn() };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob: (callback: BlobCallback) => callback(new Blob(["small"], { type: "image/webp" })),
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["original".repeat(20_000)], { type: "image/png" }),
    }));
    vi.stubGlobal("Image", class {
      naturalWidth = 4000;
      naturalHeight = 2000;
      src = "";
      async decode() {}
    });
    vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:certificate-image"),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal("FileReader", class {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        this.result = "data:image/webp;base64,c21hbGw=";
        this.onload?.();
      }
    });

    const optimized = await optimizeCertificateTemplateImages({
      name: "Tournament diploma",
      htmlTemplate: `<img src="${originalImage}">`,
      cssTemplate: `.background { background: url("${originalImage}"); }`,
    });

    expect(optimized.name).toBe("Tournament diploma");
    expect(optimized.htmlTemplate).toContain("data:image/webp;base64,c21hbGw=");
    expect(optimized.cssTemplate).toContain("data:image/webp;base64,c21hbGw=");
    expect(optimized.htmlTemplate).not.toContain(originalImage);
    expect(canvas.width).toBe(2400);
    expect(canvas.height).toBe(1200);
    expect(context.drawImage).toHaveBeenCalledTimes(2);
  });

  it("leaves small and remote images unchanged", async () => {
    const template = {
      htmlTemplate: '<img src="data:image/png;base64,c2hvcnQ=">',
      cssTemplate: ".background { background-image: url(https://example.com/bg.png); }",
    };

    await expect(optimizeCertificateTemplateImages(template)).resolves.toEqual(template);
  });
});
