import { deflateRawSync, inflateRawSync } from "node:zlib";

/**
 * Small ZIP reader/writer for application archives.
 *
 * This deliberately does not expose extraction-to-filesystem APIs. Uploaded
 * archives are parsed from the central directory, and each entry is inflated
 * only when a caller asks for its bytes. The caller remains responsible for
 * business-level entry/size budgets (see zipUploadValidator.ts).
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP64_SENTINEL_16 = 0xffff;
const ZIP64_SENTINEL_32 = 0xffffffff;
const MAX_ARCHIVE_ENTRIES = 10_000;
const MAX_ENTRY_OUTPUT_BYTES = 64 * 1024 * 1024;

type ParsedEntry = {
  name: string;
  compressionMethod: number;
  flags: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

type WritableEntry = {
  name: string;
  data: Buffer;
};

export class SafeZipEntry {
  public readonly entryName: string;
  public readonly isDirectory: boolean;
  public readonly header: { size: number; compressedSize: number };

  constructor(
    private readonly archive: SafeZipArchive,
    private readonly parsed: ParsedEntry,
  ) {
    this.entryName = parsed.name;
    this.isDirectory = parsed.name.endsWith("/");
    this.header = {
      size: parsed.uncompressedSize,
      compressedSize: parsed.compressedSize,
    };
  }

  getData(): Buffer {
    return this.archive.readEntryData(this.parsed);
  }
}

export default class SafeZipArchive {
  private readonly source: Buffer | null;
  private readonly entries: SafeZipEntry[] = [];
  private readonly writableEntries: WritableEntry[] = [];

  constructor(buffer?: Buffer) {
    this.source = buffer ? Buffer.from(buffer) : null;
    if (this.source) this.parseCentralDirectory(this.source);
  }

  getEntries(): SafeZipEntry[] {
    return this.entries.slice();
  }

  getEntry(name: string): SafeZipEntry | null {
    return this.entries.find(entry => entry.entryName === name) ?? null;
  }

  addFile(name: string, data: Buffer): void {
    if (this.source) throw new Error("Cannot add files to a read-only ZIP archive");
    const normalizedName = String(name);
    const nameBytes = Buffer.from(normalizedName, "utf8");
    if (!normalizedName || nameBytes.length > 0xffff) {
      throw new Error("ZIP_ENTRY_NAME_TOO_LONG");
    }
    this.writableEntries.push({ name: normalizedName, data: Buffer.from(data) });
  }

  toBuffer(): Buffer {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let localOffset = 0;

    for (const entry of this.writableEntries) {
      const name = Buffer.from(entry.name, "utf8");
      const data = entry.data;
      const compressed = deflateRawSync(data);
      const crc = crc32(data);

      const localHeader = Buffer.alloc(30);
      localHeader.writeUInt32LE(LOCAL_FILE_SIGNATURE, 0);
      localHeader.writeUInt16LE(20, 4);
      localHeader.writeUInt16LE(0, 6);
      localHeader.writeUInt16LE(8, 8); // deflate
      localHeader.writeUInt16LE(0, 10);
      localHeader.writeUInt16LE(0, 12);
      localHeader.writeUInt32LE(crc, 14);
      localHeader.writeUInt32LE(compressed.length, 18);
      localHeader.writeUInt32LE(data.length, 22);
      localHeader.writeUInt16LE(name.length, 26);
      localHeader.writeUInt16LE(0, 28);
      localParts.push(localHeader, name, compressed);

      const centralHeader = Buffer.alloc(46);
      centralHeader.writeUInt32LE(CENTRAL_DIRECTORY_SIGNATURE, 0);
      centralHeader.writeUInt16LE(20, 4);
      centralHeader.writeUInt16LE(20, 6);
      centralHeader.writeUInt16LE(0, 8);
      centralHeader.writeUInt16LE(8, 10);
      centralHeader.writeUInt16LE(0, 12);
      centralHeader.writeUInt16LE(0, 14);
      centralHeader.writeUInt32LE(crc, 16);
      centralHeader.writeUInt32LE(compressed.length, 20);
      centralHeader.writeUInt32LE(data.length, 24);
      centralHeader.writeUInt16LE(name.length, 28);
      centralHeader.writeUInt16LE(0, 30);
      centralHeader.writeUInt16LE(0, 32);
      centralHeader.writeUInt16LE(0, 34);
      centralHeader.writeUInt16LE(0, 36);
      centralHeader.writeUInt32LE(0, 38);
      centralHeader.writeUInt32LE(localOffset, 42);
      centralParts.push(centralHeader, name);

      localOffset += localHeader.length + name.length + compressed.length;
      if (localOffset > ZIP64_SENTINEL_32) throw new Error("ZIP_ARCHIVE_TOO_LARGE");
    }

    const localData = Buffer.concat(localParts);
    const centralData = Buffer.concat(centralParts);
    if (this.writableEntries.length > ZIP64_SENTINEL_16 || centralData.length > ZIP64_SENTINEL_32) {
      throw new Error("ZIP64_NOT_SUPPORTED");
    }

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(EOCD_SIGNATURE, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(this.writableEntries.length, 8);
    eocd.writeUInt16LE(this.writableEntries.length, 10);
    eocd.writeUInt32LE(centralData.length, 12);
    eocd.writeUInt32LE(localData.length, 16);
    eocd.writeUInt16LE(0, 20);
    return Buffer.concat([localData, centralData, eocd]);
  }

  readEntryData(parsed: ParsedEntry): Buffer {
    if (!this.source) throw new Error("ZIP_SOURCE_NOT_AVAILABLE");
    if (parsed.flags & 0x1) throw new Error("ENCRYPTED_ZIP_ENTRY_NOT_SUPPORTED");

    const localOffset = parsed.localHeaderOffset;
    if (localOffset < 0 || localOffset + 30 > this.source.length || this.source.readUInt32LE(localOffset) !== LOCAL_FILE_SIGNATURE) {
      throw new Error("INVALID_ZIP_LOCAL_HEADER");
    }

    const fileNameLength = this.source.readUInt16LE(localOffset + 26);
    const extraLength = this.source.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + fileNameLength + extraLength;
    const dataEnd = dataStart + parsed.compressedSize;
    if (dataStart < 0 || dataEnd < dataStart || dataEnd > this.source.length) {
      throw new Error("INVALID_ZIP_ENTRY_DATA");
    }
    if (parsed.uncompressedSize > MAX_ENTRY_OUTPUT_BYTES) throw new Error("ZIP_ENTRY_OUTPUT_TOO_LARGE");

    const compressed = this.source.subarray(dataStart, dataEnd);
    if (parsed.compressionMethod === 0) {
      if (compressed.length !== parsed.uncompressedSize) throw new Error("INVALID_ZIP_ENTRY_SIZE");
      return Buffer.from(compressed);
    }
    if (parsed.compressionMethod !== 8) throw new Error("ZIP_COMPRESSION_NOT_SUPPORTED");

    const inflated = inflateRawSync(compressed, { maxOutputLength: MAX_ENTRY_OUTPUT_BYTES });
    if (inflated.length !== parsed.uncompressedSize) throw new Error("INVALID_ZIP_ENTRY_SIZE");
    return inflated;
  }

  private parseCentralDirectory(buffer: Buffer): void {
    const eocdOffset = findEndOfCentralDirectory(buffer);
    if (eocdOffset < 0) throw new Error("INVALID_ZIP_END_OF_CENTRAL_DIRECTORY");

    const entriesOnDisk = buffer.readUInt16LE(eocdOffset + 8);
    const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
    const centralSize = buffer.readUInt32LE(eocdOffset + 12);
    const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
    if (
      entriesOnDisk === ZIP64_SENTINEL_16 ||
      totalEntries === ZIP64_SENTINEL_16 ||
      centralSize === ZIP64_SENTINEL_32 ||
      centralOffset === ZIP64_SENTINEL_32
    ) {
      throw new Error("ZIP64_NOT_SUPPORTED");
    }
    if (entriesOnDisk !== totalEntries || totalEntries > MAX_ARCHIVE_ENTRIES) throw new Error("ZIP_ARCHIVE_TOO_MANY_ENTRIES");
    if (centralOffset + centralSize > buffer.length || centralOffset < 0) throw new Error("INVALID_ZIP_CENTRAL_DIRECTORY");

    let offset = centralOffset;
    for (let index = 0; index < totalEntries; index += 1) {
      if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
        throw new Error("INVALID_ZIP_CENTRAL_ENTRY");
      }
      const flags = buffer.readUInt16LE(offset + 8);
      const compressionMethod = buffer.readUInt16LE(offset + 10);
      const compressedSize = buffer.readUInt32LE(offset + 20);
      const uncompressedSize = buffer.readUInt32LE(offset + 24);
      const fileNameLength = buffer.readUInt16LE(offset + 28);
      const extraLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      const localHeaderOffset = buffer.readUInt32LE(offset + 42);
      const nameStart = offset + 46;
      const nextOffset = nameStart + fileNameLength + extraLength + commentLength;
      if (nextOffset > buffer.length || compressedSize === ZIP64_SENTINEL_32 || uncompressedSize === ZIP64_SENTINEL_32 || localHeaderOffset === ZIP64_SENTINEL_32) {
        throw new Error("ZIP64_NOT_SUPPORTED");
      }

      const name = buffer.subarray(nameStart, nameStart + fileNameLength).toString("utf8");
      const parsed: ParsedEntry = {
        name,
        compressionMethod,
        flags,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
      };
      this.entries.push(new SafeZipEntry(this, parsed));
      offset = nextOffset;
    }
  }
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimumOffset = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (offset < 0 || buffer.readUInt32LE(offset) !== EOCD_SIGNATURE) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength <= buffer.length) return offset;
  }
  return -1;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
