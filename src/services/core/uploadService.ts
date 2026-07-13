import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { toApiError } from "@/lib/supabasePage";

// Supabase Storage bucket name. Create a PUBLIC bucket called "uploads"
// in the Supabase dashboard (Storage -> New bucket -> Public).
const BUCKET = "uploads";

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

async function fileToDataUrl(file: File): Promise<string> {
  let f = file;
  if (f.type.startsWith("image/")) {
    f = await compressImage(f);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(f);
  });
}

// Private bucket for verification documents (government ID, business docs).
// NEVER public — no getPublicUrl, no anon/authenticated SELECT policy. Only
// the verification-review Edge Function (service_role) can read these back,
// via short-lived createSignedUrl(). See
// supabase/migrations/20260815_manual_verification.sql.
const PRIVATE_BUCKET = "verification-docs";

export const uploadService = {
  // Upload the file to Supabase Storage and return the public URL.
  async upload(file: unknown, kind = "photo") {
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED", message: "Sign in to upload files" }, 401);

    let f = file as File;
    if (f.type.startsWith("image/")) {
      f = await compressImage(f);
    }
    const contentType = f?.type ?? "image/jpeg";
    const path = randomPath(uid, kind, contentType);
    const sb = getSupabase();
    try {
      const { error } = await sb.storage.from(BUCKET).upload(path, f, {
        contentType,
        upsert: true,
      });
      if (!error) {
        const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
        if (data?.publicUrl) return data.publicUrl;
      }
      console.warn("Storage upload error, falling back to data URL:", error?.message);
    } catch (err) {
      console.warn("Storage upload failed, falling back to data URL:", err);
    }
    return await fileToDataUrl(f);
  },

  /**
   * Upload a verification document (ID / business proof) to the PRIVATE
   * bucket and return its storage path — not a URL. Only reviewers can ever
   * see the file, via a signed URL minted server-side. No data-URL fallback
   * here on purpose: a doc that didn't really land in private storage must
   * fail loudly, never silently degrade to something else.
   */
  async uploadPrivate(file: File, kind = "verification"): Promise<string> {
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED", message: "Sign in to upload files" }, 401);

    let f = file;
    if (f.type.startsWith("image/")) {
      f = await compressImage(f);
    }
    const contentType = f?.type ?? "image/jpeg";
    const path = randomPath(uid, kind, contentType);
    const sb = getSupabase();
    const { error } = await sb.storage.from(PRIVATE_BUCKET).upload(path, f, {
      contentType,
      upsert: true,
    });
    if (error) throw toApiError({ code: "UPLOAD_FAILED", message: error.message || "Couldn't upload document" }, 500);
    return path;
  },
};
