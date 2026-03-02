import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImagePlus } from "lucide-react";
import { Button } from "./ui/Button";
import { uploadStatementImage } from "../lib/api/edu";

interface MarkdownImageInsertButtonProps {
  value: string;
  onChange: (value: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  className?: string;
}

export const MarkdownImageInsertButton: React.FC<MarkdownImageInsertButtonProps> = ({
  value,
  onChange,
  textareaRef,
  className
}) => {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const openFilePicker = () => {
    if (uploading) return;
    inputRef.current?.click();
  };

  const insertAtCursor = (insertText: string) => {
    const el = textareaRef?.current;
    if (!el) {
      const next = value ? `${value}\n\n${insertText}` : insertText;
      onChange(next);
      return;
    }

    const start = Number.isFinite(el.selectionStart) ? el.selectionStart : value.length;
    const end = Number.isFinite(el.selectionEnd) ? el.selectionEnd : start;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
    const suffix = after && !after.startsWith("\n") ? "\n\n" : "";
    const next = `${before}${prefix}${insertText}${suffix}${after}`;
    onChange(next);

    const caret = (before + prefix + insertText).length;
    requestAnimationFrame(() => {
      try {
        el.focus();
        el.setSelectionRange(caret, caret);
      } catch {
        // no-op
      }
    });
  };

  const onFileChange = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadStatementImage(file);
      insertAtCursor(result.markdown || `![image](${result.url})`);
    } catch (error: any) {
      const message = error?.response?.data?.message;
      if (message === "UNSUPPORTED_IMAGE_TYPE") {
        alert(tr("Підтримуються лише PNG, JPG, WEBP, GIF, AVIF", "Only PNG, JPG, WEBP, GIF, AVIF are supported"));
      } else if (message === "IMAGE_TOO_LARGE") {
        alert(tr("Зображення завелике (максимум 8MB)", "Image is too large (maximum 8MB)"));
      } else {
        alert(tr("Не вдалося завантажити зображення", "Failed to upload image"));
      }
    } finally {
      setUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={e => onFileChange(e.target.files?.[0] || null)}
      />
      <Button
        type="button"
        variant="ghost"
        onClick={openFilePicker}
        disabled={uploading}
        className={className || "ml-2 text-xs"}
        title={tr("Додати фото в Markdown", "Insert image into Markdown")}
      >
        <ImagePlus className="w-3 h-3 mr-1" />
        {uploading ? tr("Завантаження...", "Uploading...") : tr("Додати фото", "Add image")}
      </Button>
    </>
  );
};

export default MarkdownImageInsertButton;
