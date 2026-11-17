/** Downscale an image data URL to a JPEG (max side in px) to keep vision tokens low. */
export function resizeToJpeg(src: string, max = 768): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not supported"));
      ctx.drawImage(img, 0, 0, c.width, c.height);
      // Slightly lower quality is fine for food ID and cuts upload + token cost.
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => reject(new Error("Could not read that image"));
    img.src = src;
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}
