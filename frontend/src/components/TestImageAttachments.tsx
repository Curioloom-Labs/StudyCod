import React from "react";
import { ImagePlus, X } from "lucide-react";
import { uploadStatementImage } from "../lib/api/edu";
import { useTranslation } from "react-i18next";
import { toast } from "../lib/toast";
import { getErrorMessageFromUnknown } from "../lib/safeError";

type TestImageAttachmentsProps = {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
};

export const TestImageAttachments: React.FC<TestImageAttachmentsProps> = ({ value, onChange, disabled = false }) => {
  const { i18n } = useTranslation();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const en = i18n.language?.toLowerCase().startsWith("en") ?? false;
  const images = Array.isArray(value) ? value : [];

  const addImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadStatementImage(file);
      onChange([...images, uploaded.url].slice(0, 8));
    } catch (error: unknown) {
      const message = getErrorMessageFromUnknown(error, "");
      toast.error(message === "UNSUPPORTED_IMAGE_TYPE"
        ? (en ? "Use PNG, JPG, WebP, GIF, AVIF, or SVG images." : "Підтримуються PNG, JPG, WebP, GIF, AVIF або SVG.")
        : message === "IMAGE_TOO_LARGE"
          ? (en ? "Image is too large (maximum 8 MB)." : "Зображення завелике (максимум 8 МБ).")
          : (en ? "Could not upload the image." : "Не вдалося завантажити зображення."));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-text-secondary">{en ? "Test images" : "Зображення тесту"}</span>
        <button type="button" disabled={disabled || uploading || images.length >= 8} onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-text-secondary transition hover:bg-bg-hover hover:text-text-primary disabled:opacity-50">
          <ImagePlus className="size-3.5" aria-hidden="true" />
          {uploading ? (en ? "Uploading…" : "Завантаження…") : (en ? "Add image" : "Додати зображення")}
        </button>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/avif,image/svg+xml" className="hidden" onChange={event => void addImage(event.target.files?.[0])} />
        {images.length > 0 && <span className="text-[11px] text-text-muted">{images.length}/8</span>}
      </div>
      {images.length > 0 && <div className="flex flex-wrap gap-2">{images.map((url, index) => <div key={`${url}-${index}`} className="group relative h-16 w-20 overflow-hidden rounded-lg border border-border bg-bg-base"><img src={url} alt={`${en ? "Test image" : "Зображення тесту"} ${index + 1}`} className="h-full w-full object-cover" loading="lazy" /><button type="button" disabled={disabled} onClick={() => onChange(images.filter((_, imageIndex) => imageIndex !== index))} className="absolute right-1 top-1 rounded-full bg-black/75 p-1 text-white opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100" aria-label={en ? `Remove test image ${index + 1}` : `Видалити зображення тесту ${index + 1}`}><X className="size-3" aria-hidden="true" /></button></div>)}</div>}
    </div>
  );
};

type JsonTest = { imageUrls?: string[]; [key: string]: unknown };

type TestImagesJsonFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

/** Adds uploaded images to a selected test in legacy JSON-based task editors. */
export const TestImagesJsonField: React.FC<TestImagesJsonFieldProps> = ({ value, onChange, disabled = false }) => {
  const { i18n } = useTranslation();
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const en = i18n.language?.toLowerCase().startsWith("en") ?? false;
  let tests: JsonTest[] = [];
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (Array.isArray(parsed)) tests = parsed.map(item => item && typeof item === "object" ? item as JsonTest : {});
  } catch {
    tests = [];
  }
  React.useEffect(() => setSelectedIndex(index => Math.min(index, Math.max(0, tests.length - 1))), [tests.length]);

  const images = Array.isArray(tests[selectedIndex]?.imageUrls) ? tests[selectedIndex]?.imageUrls as string[] : [];
  const updateImages = (next: string[]) => {
    if (!tests[selectedIndex]) return;
    const updated = tests.map((test, index) => index === selectedIndex ? { ...test, imageUrls: next } : test);
    onChange(JSON.stringify(updated, null, 2));
  };

  return (
    <div className="mt-3 rounded-xl border border-border bg-bg-hover p-3">
      {tests.length > 0 ? <label className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-text-secondary">
        {en ? "Attach image to test" : "Додати зображення до тесту"}
        <select value={selectedIndex} onChange={event => setSelectedIndex(Number(event.target.value))} disabled={disabled} className="rounded-lg border border-border bg-bg-base px-2 py-1 text-text-primary">
          {tests.map((_, index) => <option key={index} value={index}>{en ? `Test ${index + 1}` : `Тест ${index + 1}`}</option>)}
        </select>
      </label> : <p className="text-xs text-text-muted">{en ? "Add tests in the JSON above to attach images." : "Спочатку додайте тести у JSON вище, тоді зможете прикріпити картинки."}</p>}
      <TestImageAttachments value={images} onChange={updateImages} disabled={disabled || tests.length === 0} />
    </div>
  );
};

export default TestImageAttachments;
