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
    // Plain insert, never upsert: every path is random, and an upsert needs SELECT/UPDATE rights on
    // storage.objects that the bucket policies (rightly) don't grant — it was refused with "new row violates
    // row-level security policy" on every upload. The old code then stored the image as a base64 data URL in the
    // database row instead, hiding the failure (E2E-015). A failed upload is now an error the screen shows.
    const { error } = await sb.storage.from(BUCKET).upload(path, f, { contentType, upsert: false });
    if (error) {
      throw toApiError({ code: "UPLOAD_FAILED", message: "Couldn't upload the photo. Check your connection and try again." }, 500);
    }
    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  },

  /**
   * Delete a previously uploaded public file, given the URL `upload()` returned.
   *
   * For rolling back orphans: onboarding uploads photos before it inserts the
   * row, so a failed insert used to leave them in the bucket with nothing
   * pointing at them and nothing that would ever collect them
   * (BUSINESS_ONBOARDING #21).
   *
   * Resolves `false` rather than throwing for anything it can't act on — a
   * data-URL left by the removed upload fallback (never in storage to begin with),
   * a URL from some other bucket, or a delete the caller isn't allowed to make.
   * Callers are cleaning up after an error they're already reporting; a failure
   * here must not replace that error with a less useful one.
   */
  async remove(publicUrl: string): Promise<boolean> {
    if (!publicUrl || publicUrl.startsWith("data:")) return false;
    // Public URLs look like …/storage/v1/object/public/<bucket>/<path>. Anything
    // that doesn't, we didn't write.
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const at = publicUrl.indexOf(marker);
    if (at === -1) return false;
    const path = decodeURIComponent(publicUrl.slice(at + marker.length).split("?")[0]);
    if (!path) return false;
    try {
      const { error } = await getSupabase().storage.from(BUCKET).remove([path]);
      return !error;
    } catch {
      return false;
    }
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
    // Plain insert (see upload()): verification-docs grants INSERT only, so an upsert was refused (E2E-015).
    const { error } = await sb.storage.from(PRIVATE_BUCKET).upload(path, f, { contentType, upsert: false });
    if (error) throw toApiError({ code: "UPLOAD_FAILED", message: error.message || "Couldn't upload document" }, 500);
    return path;
  },
};
