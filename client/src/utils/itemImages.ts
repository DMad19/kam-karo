import type { ItemCategory } from "../types/index.ts";

const uploadedPhotoByItemId = new Map<string, string>();

function encodeSvgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const PRESEEDED_SVG: Record<string, string> = {
  item_01: encodeSvgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240">
    <rect width="400" height="240" fill="#FFF1D6"/>
    <circle cx="340" cy="42" r="28" fill="#F5BC38" opacity="0.45"/>
    <rect x="65" y="65" width="270" height="125" rx="18" fill="#4A1C1A"/>
    <rect x="78" y="78" width="244" height="99" rx="12" fill="#E67612" opacity="0.22"/>
    <polygon points="145,95 180,127 145,159 110,127" fill="#F7EFE4" stroke="#F5BC38" stroke-width="3"/>
    <polygon points="200,95 235,127 200,159 165,127" fill="#F7EFE4" stroke="#F5BC38" stroke-width="3"/>
    <polygon points="255,95 290,127 255,159 220,127" fill="#F7EFE4" stroke="#F5BC38" stroke-width="3"/>
    <text x="200" y="216" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="700" fill="#4A1C1A">PURE GHEE KAJU KATLI</text>
  </svg>`),
  item_02: encodeSvgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240">
    <rect width="400" height="240" fill="#FCEAD2"/>
    <circle cx="200" cy="74" r="34" fill="#F5BC38" opacity="0.4"/>
    <path d="M200 44 C215 68 215 88 200 96 C185 88 185 68 200 44 Z" fill="#E67612"/>
    <path d="M200 56 C208 70 208 82 200 88 C192 82 192 70 200 56 Z" fill="#FFF6E5"/>
    <path d="M125 112 Q200 158 275 112 L255 156 Q200 176 145 156 Z" fill="#B81D24"/>
    <ellipse cx="200" cy="112" rx="75" ry="18" fill="#E67612"/>
    <path d="M90 152 Q125 182 160 152 L150 176 Q125 190 100 176 Z" fill="#8C2F1B"/>
    <path d="M240 152 Q275 182 310 152 L300 176 Q275 190 250 176 Z" fill="#8C2F1B"/>
    <text x="200" y="216" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="700" fill="#4A1C1A">HAND-PAINTED TERRACOTTA DIYAS</text>
  </svg>`),
  item_03: encodeSvgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240">
    <rect width="400" height="240" fill="#F9E5D2"/>
    <rect x="85" y="72" width="230" height="114" rx="16" fill="#4A1C1A"/>
    <rect x="102" y="88" width="196" height="82" rx="10" fill="#F5BC38" opacity="0.25"/>
    <rect x="190" y="72" width="20" height="114" fill="#F5BC38"/>
    <rect x="85" y="118" width="230" height="18" fill="#B81D24"/>
    <circle cx="150" cy="110" r="18" fill="#E67612"/>
    <circle cx="250" cy="110" r="18" fill="#F5BC38"/>
    <circle cx="150" cy="152" r="14" fill="#D97706"/>
    <circle cx="250" cy="152" r="14" fill="#B81D24"/>
    <text x="200" y="216" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="700" fill="#4A1C1A">ROYAL DRY-FRUIT HAMPER</text>
  </svg>`),
};

const CATEGORY_FALLBACK_SVG: Record<ItemCategory, string> = {
  sweets: PRESEEDED_SVG.item_01,
  decor: PRESEEDED_SVG.item_02,
  hampers: PRESEEDED_SVG.item_03,
};

export function rememberItemPhoto(itemId: string, imageUrl?: string): void {
  if (imageUrl && imageUrl.trim().length > 0) {
    uploadedPhotoByItemId.set(itemId, imageUrl);
  }
}

export function getItemDisplayImage(item: {
  id: string;
  category: ItemCategory;
  imageUrl?: string;
}): string {
  if (item.imageUrl && item.imageUrl.trim().length > 0) {
    return item.imageUrl;
  }
  const cached = uploadedPhotoByItemId.get(item.id);
  if (cached) {
    return cached;
  }
  return PRESEEDED_SVG[item.id] ?? CATEGORY_FALLBACK_SVG[item.category];
}

export function resizePhotoToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        reject(new Error("Empty image file."));
        return;
      }

      const img = new Image();
      img.onerror = () => reject(new Error("Unsupported image format."));
      img.onload = () => {
        const maxWidth = 640;
        const maxHeight = 480;
        const ratio = Math.min(
          1,
          maxWidth / img.width,
          maxHeight / img.height
        );
        const width = Math.max(1, Math.round(img.width * ratio));
        const height = Math.max(1, Math.round(img.height * ratio));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(result);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}
