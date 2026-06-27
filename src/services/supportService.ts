import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { throwIfError } from "@/lib/supabasePage";
import { config } from "@/config";

export interface SupportTicket {
  id?: string;
  userId?: string | null;
  category: string;
  email: string;
  subject: string;
  message: string;
  createdAt?: string;
}

export interface BugReport {
  id?: string;
  userId?: string | null;
  description: string;
  createdAt?: string;
}

// Simple latency simulator matching mockLatencyMs
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const supportService = {
  async submitTicket(ticket: {
    category: string;
    email: string;
    subject: string;
    message: string;
  }): Promise<{ ok: boolean }> {
    if (config.useMocks) {
      await delay(config.mockLatencyMs);
      console.log("Mock support ticket submitted:", ticket);
      return { ok: true };
    }

    const sb = getSupabase();
    const uid = await currentUserId();
    
    // Attempt database insert
    const { error } = await sb.from("support_tickets").insert({
      user_id: uid,
      category: ticket.category,
      email: ticket.email,
      subject: ticket.subject,
      message: ticket.message,
    });
    throwIfError(error);

    // Call Supabase Edge Function to trigger nodemailer or third-party email.
    // If not implemented or fails, database insert still secures the ticket.
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session?.access_token) {
        await fetch(`${(import.meta as any).env.VITE_SUPABASE_URL}/functions/v1/send-support-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`
          },
          body: JSON.stringify(ticket)
        });
      }
    } catch (err) {
      console.warn("Failed to send support email via edge function:", err);
    }

    return { ok: true };
  },

  async submitBugReport(bug: { description: string }): Promise<{ ok: boolean }> {
    if (config.useMocks) {
      await delay(config.mockLatencyMs);
      console.log("Mock bug report submitted:", bug);
      return { ok: true };
    }

    const sb = getSupabase();
    const uid = await currentUserId();

    const { error } = await sb.from("bug_reports").insert({
      user_id: uid,
      description: bug.description,
    });
    throwIfError(error);

    // Call Supabase Edge Function to trigger any spreadsheet synchronization webhook if configured.
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session?.access_token) {
        await fetch(`${(import.meta as any).env.VITE_SUPABASE_URL}/functions/v1/sync-bug-report`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ ...bug, userId: uid })
        });
      }
    } catch (err) {
      console.warn("Failed to sync bug report via edge function:", err);
    }

    return { ok: true };
  }
};
