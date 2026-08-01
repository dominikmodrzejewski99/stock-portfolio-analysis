import { unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";
import { XtbImportError } from "./errors";

type XmlNode = Record<string, unknown>;
export type SheetRow = Record<string, string> & { __rowNumber: string };

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: false,
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") {
    const node = value as XmlNode;
    if ("#text" in node) return textValue(node["#text"]);
    if ("t" in node) return textValue(node.t);
    return Object.values(node).map(textValue).join("");
  }
  return "";
}

function attributeValue(value: unknown, fallback: string): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function decodePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/^\//, "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

export class XlsxWorkbook {
  private readonly files: Partial<Record<string, Uint8Array>>;
  private readonly sharedStrings: string[];
  private readonly sheets = new Map<string, string>();

  constructor(
    bytes: Uint8Array,
    private readonly sourceName: string,
  ) {
    try {
      this.files = unzipSync(bytes);
    } catch {
      throw new XtbImportError("INVALID_WORKBOOK", "Nie można odczytać skoroszytu XLSX.", { file: sourceName });
    }

    this.sharedStrings = this.readSharedStrings();
    this.readSheetMap();
  }

  sheetNames(): string[] {
    return [...this.sheets.keys()];
  }

  rows(sheetName: string): SheetRow[] {
    const path = this.sheets.get(sheetName);
    if (!path) {
      throw new XtbImportError("MISSING_SHEET", `Brak arkusza ${sheetName}.`, {
        file: this.sourceName,
        sheet: sheetName,
      });
    }
    const document = this.parseFile(path);
    const worksheet = document.worksheet as XmlNode | undefined;
    const sheetData = worksheet?.sheetData as XmlNode | undefined;
    const rawRows = asArray(sheetData?.row as XmlNode | XmlNode[] | undefined);

    return rawRows.map((row, index) => {
      const result: SheetRow = { __rowNumber: attributeValue(row.r, String(index + 1)) };
      for (const cell of asArray(row.c as XmlNode | XmlNode[] | undefined)) {
        const reference = attributeValue(cell.r, "A1");
        const column = /^[A-Z]+/.exec(reference)?.[0];
        if (!column) continue;
        const type = attributeValue(cell.t, "");
        const raw = type === "inlineStr" ? textValue((cell.is as XmlNode | undefined)?.t) : textValue(cell.v);
        result[column] = type === "s" && raw ? (this.sharedStrings[Number(raw)] ?? "") : raw.trim();
      }
      return result;
    });
  }

  private readSharedStrings(): string[] {
    if (!this.files["xl/sharedStrings.xml"]) return [];
    const document = this.parseFile("xl/sharedStrings.xml");
    const table = document.sst as XmlNode | undefined;
    return asArray(table?.si as XmlNode | XmlNode[] | undefined).map((item) => textValue(item.t ?? item.r));
  }

  private readSheetMap(): void {
    const workbook = this.parseFile("xl/workbook.xml").workbook as XmlNode | undefined;
    const relationships = this.parseFile("xl/_rels/workbook.xml.rels").Relationships as XmlNode | undefined;
    if (!workbook || !relationships) {
      throw new XtbImportError("INVALID_WORKBOOK", "Skoroszyt nie ma wymaganej struktury.", {
        file: this.sourceName,
      });
    }

    const targets = new Map(
      asArray(relationships.Relationship as XmlNode | XmlNode[] | undefined).map((relation) => [
        String(relation.Id),
        String(relation.Target),
      ]),
    );
    const sheetsNode = workbook.sheets as XmlNode | undefined;
    for (const sheet of asArray(sheetsNode?.sheet as XmlNode | XmlNode[] | undefined)) {
      const target = targets.get(String(sheet.id));
      if (!target) continue;
      const path = target.startsWith("xl/") ? target : `xl/${target}`;
      this.sheets.set(String(sheet.name), decodePath(path));
    }
  }

  private parseFile(path: string): XmlNode {
    const contents = this.files[path];
    if (!contents) {
      throw new XtbImportError("INVALID_WORKBOOK", "Skoroszyt nie ma wymaganego pliku XML.", {
        file: this.sourceName,
      });
    }
    return xml.parse(new TextDecoder().decode(contents)) as XmlNode;
  }
}
