import type { Document, Json } from "./protocol.ts";
/** The same record representation is used by D1 and incremental Cloud clients. */
export function encodeNodes(document: Document) {
  const nodes = new Map<string, string>();
  for (const [root, value] of Object.entries(document)) {
    const records =
      Array.isArray(value) &&
      value.every(
        (v) =>
          v &&
          typeof v === "object" &&
          !Array.isArray(v) &&
          typeof v.id === "string",
      ) &&
      new Set(value.map((v) => (v as Document).id)).size === value.length;
    if (records) {
      nodes.set(
        JSON.stringify([root]),
        JSON.stringify({
          kind: "records",
          order: (value as Document[]).map((v) => v.id),
        }),
      );
      for (const record of value as Document[])
        nodes.set(JSON.stringify([root, record.id]), JSON.stringify(record));
    } else
      nodes.set(
        JSON.stringify([root]),
        JSON.stringify({ kind: "value", value }),
      );
  }
  return nodes;
}
export function decodeNodes(
  nodes: Map<string, string>,
  partial = false,
): Document {
  const document = Object.create(null) as Document;
  for (const [key, raw] of nodes) {
    const path = JSON.parse(key);
    if (
      !Array.isArray(path) ||
      ![1, 2].includes(path.length) ||
      path.some((k) => typeof k !== "string")
    )
      throw new Error("Invalid stored node");
    if (path.length !== 1) continue;
    const metadata = JSON.parse(raw);
    if (metadata.kind === "records") {
      if (
        !Array.isArray(metadata.order) ||
        new Set(metadata.order).size !== metadata.order.length ||
        metadata.order.some((id: unknown) => typeof id !== "string")
      )
        throw new Error("Invalid record order");
      document[path[0]] = metadata.order.map((id: string) => {
        const record = nodes.get(JSON.stringify([path[0], id]));
        if (record === undefined && !partial)
          throw new Error(
            "Incomplete stored record; no changes were acknowledged.",
          );
        const value = record === undefined ? { id } : JSON.parse(record);
        if (
          !value ||
          typeof value !== "object" ||
          Array.isArray(value) ||
          value.id !== id
        )
          throw new Error("Invalid stored record");
        return value as Json;
      });
    } else if (metadata.kind === "value") document[path[0]] = metadata.value;
    else throw new Error("Invalid stored root");
  }
  return document;
}
