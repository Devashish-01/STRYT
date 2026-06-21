import { config } from "@/config";
import { mockDelay } from "@/lib/mock";
import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { toApiError } from "@/lib/supabasePage";

// Supabase Storage bucket name. Create a PUBLIC bucket called "uploads"
// in the Supabase dashboard (Storage -> New bucket -> Public).
const BUCKET = "uploads";

const stock = [
  "photo-1517248135467-4c7edcad34c4",
  "photo-1554118811-1e0d58224f24",
  "photo-1563379091339-03b21ab4a4f8",
  "photo-1555507036-ab1f4038808a",
  "photo-1581244277943-fe4a9c777189",
];

function randomPath(uid: string, kind: string, contentType: string) {
  const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const rand = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${uid}/${kind}/${rand}.${ext}`;
}

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= 200 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(img.src);
      const longestSide = Math.max(img.width, img.height);
      const scale = longestSide > 1200 ? 1200 / longestSide : 1;
      const width = img.width * scale;
      const height = img.height * scale;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const lastDot = file.name.lastIndexOf(".");
          const name = lastDot !== -1 ? file.name.slice(0, lastDot) + ".jpg" : file.name + ".jpg";
          resolve(new File([blob], name, { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.82
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      resolve(file);
    };
  });
}

export const uploadService = {
  // Kept for API compatibility. In mocks returns a stock image; with Supabase
  // we upload directly (no presign step), so this just returns a target path.
  async sign(kind: string, contentType: string) {
    if (config.useMocks) {
      const pick = stock[Math.floor(Math.random() * stock.length)];
      const finalUrl = `https://images.unsplash.com/${pick}?auto=format&fit=crop&w=600&q=70`;
      return mockDelay({ putUrl: "mock://upload", finalUrl });
    }
    return { putUrl: randomPath("pending", kind, contentType), finalUrl: "" };
  },

  // Upload the file to Supabase Storage and return the public URL.
  async upload(file: unknown, kind = "photo") {
    if (config.useMocks) {
      if (file instanceof File) {
        return mockDelay(URL.createObjectURL(file), 400);
      }
      const { finalUrl } = await this.sign(kind, "image/jpeg");
      return mockDelay(finalUrl, 400);
    }
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED", message: "Sign in to upload files" }, 401);

    let f = file as File;
    if (f.type.startsWith("image/")) {
      f = await compressImage(f);
    }
    const contentType = f?.type ?? "image/jpeg";
    const path = randomPath(uid, kind, contentType);
    const sb = getSupabase();
    const { error } = await sb.storage.from(BUCKET).upload(path, f, {
      contentType,
      upsert: false,
    });
    if (error) throw toApiError(error);
    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  },
};
