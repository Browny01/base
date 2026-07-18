const MAX_SOURCE_BYTES = 2_000_000;
const LOGO_SIZE = 256;

export async function prepareProjectLogo(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file for the project logo.");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("Choose an image under 2 MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const canvas = document.createElement("canvas");
    canvas.width = LOGO_SIZE;
    canvas.height = LOGO_SIZE;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare this image.");

    const scale = Math.max(LOGO_SIZE / img.naturalWidth, LOGO_SIZE / img.naturalHeight);
    const sw = LOGO_SIZE / scale;
    const sh = LOGO_SIZE / scale;
    const sx = (img.naturalWidth - sw) / 2;
    const sy = (img.naturalHeight - sh) / 2;

    ctx.clearRect(0, 0, LOGO_SIZE, LOGO_SIZE);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, LOGO_SIZE, LOGO_SIZE);

    const webp = canvas.toDataURL("image/webp", 0.88);
    return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read this image."));
    img.src = src;
  });
}
