const MAX_FILE_BYTES = 8_000_000;

export interface PreparedProjectFile {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

export async function prepareProjectFile(file: File): Promise<PreparedProjectFile> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name} is too large. Keep uploads under 8 MB.`);
  }

  return {
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    dataUrl: await readAsDataUrl(file),
  };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}
