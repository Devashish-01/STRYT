// AUTO-GENERATED from the live Supabase schema. Do not edit by hand.
// Regenerate after any migration:  npx supabase gen types typescript --project-id gnswxlfmcwyhmzlfipql > src/types/database.types.ts
// (or via the Supabase MCP generate_typescript_types tool).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_appeals: {
        Row: {
          admin_note: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          owner_user_id: string
          reason: string
          resolved_at: string | null
          status: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          owner_user_id: string
          reason: string
          resolved_at?: string | null
          status?: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          owner_user_id?: string
          reason?: string
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_appeals_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      agreements: {
        Row: {
          agreed_price: number
          created_at: string | null
          dispute_reason: string | null
          id: string
          live_status: string | null
          payment_amount: number | null
          payment_method: string | null
          payment_mode: string | null
          payment_reference: string | null
          payment_status: string
          proposal_id: string | null
          provider_lat: number | null
          provider_lng: number | null
          request_id: string | null
          request_title: string | null
          requester_confirmed: boolean | null
          requester_user_id: string | null
          responder_confirmed: boolean | null
          responder_user_id: string | null
          scheduled_for: string | null
          status: Database["public"]["Enums"]["agreement_status"] | null
          terms: string | null
          tracking_token: string | null
        }
        Insert: {
          agreed_price: number
          created_at?: string | null
          dispute_reason?: string | null
          id?: string
          live_status?: string | null
          payment_amount?: number | null
          payment_method?: string | null
          payment_mode?: string | null
          payment_reference?: string | null
          payment_status?: string
          proposal_id?: string | null
          provider_lat?: number | null
          provider_lng?: number | null
          request_id?: string | null
          request_title?: string | null
          requester_confirmed?: boolean | null
          requester_user_id?: string | null
          responder_confirmed?: boolean | null
          responder_user_id?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["agreement_status"] | null
          terms?: string | null
          tracking_token?: string | null
        }
        Update: {
          agreed_price?: number
          created_at?: string | null
          dispute_reason?: string | null
          id?: string
          live_status?: string | null
          payment_amount?: number | null
          payment_method?: string | null
          payment_mode?: string | null
          payment_reference?: string | null
          payment_status?: string
          proposal_id?: string | null
          provider_lat?: number | null
          provider_lng?: number | null
          request_id?: string | null
          request_title?: string | null
          requester_confirmed?: boolean | null
          requester_user_id?: string | null
          responder_confirmed?: boolean | null
          responder_user_id?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["agreement_status"] | null
          terms?: string | null
          tracking_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agreements_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreements_requester_user_id_fkey"
            columns: ["requester_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreements_responder_user_id_fkey"
            columns: ["responder_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreements_tracking_token_fkey"
            columns: ["tracking_token"]
            isOneToOne: false
            referencedRelation: "tracking_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          cancelled_by: string | null
          created_at: string | null
          customer_avatar: string | null
          customer_name: string | null
          customer_user_id: string
          date_label: string | null
          id: string
          is_walk_in: boolean
          notes: string | null
          package_id: string | null
          package_name: string | null
          package_price: number | null
          payment_amount: number | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string
          photo_url: string | null
          rescheduled_from: string | null
          response_note: string | null
          scheduled_for: string
          status: string
          target_avatar: string | null
          target_id: string
          target_name: string | null
          target_owner_user_id: string
          target_type: string
          time_label: string | null
        }
        Insert: {
          cancelled_by?: string | null
          created_at?: string | null
          customer_avatar?: string | null
          customer_name?: string | null
          customer_user_id: string
          date_label?: string | null
          id?: string
          is_walk_in?: boolean
          notes?: string | null
          package_id?: string | null
          package_name?: string | null
          package_price?: number | null
          payment_amount?: number | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string
          photo_url?: string | null
          rescheduled_from?: string | null
          response_note?: string | null
          scheduled_for: string
          status?: string
          target_avatar?: string | null
          target_id: string
          target_name?: string | null
          target_owner_user_id: string
          target_type: string
          time_label?: string | null
        }
        Update: {
          cancelled_by?: string | null
          created_at?: string | null
          customer_avatar?: string | null
          customer_name?: string | null
          customer_user_id?: string
          date_label?: string | null
          id?: string
          is_walk_in?: boolean
          notes?: string | null
          package_id?: string | null
          package_name?: string | null
          package_price?: number | null
          payment_amount?: number | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string
          photo_url?: string | null
          rescheduled_from?: string | null
          response_note?: string | null
          scheduled_for?: string
          status?: string
          target_avatar?: string | null
          target_id?: string
          target_name?: string | null
          target_owner_user_id?: string
          target_type?: string
          time_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_customer_user_id_fkey"
            columns: ["customer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_rescheduled_from_fkey"
            columns: ["rescheduled_from"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_target_owner_user_id_fkey"
            columns: ["target_owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_slots: {
        Row: {
          created_at: string | null
          date: string | null
          id: string
          reason: string | null
          recurring: boolean
          target_id: string
          target_owner_user_id: string
          target_type: string
          time_label: string | null
          weekday: number | null
        }
        Insert: {
          created_at?: string | null
          date?: string | null
          id?: string
          reason?: string | null
          recurring?: boolean
          target_id: string
          target_owner_user_id: string
          target_type: string
          time_label?: string | null
          weekday?: number | null
        }
        Update: {
          created_at?: string | null
          date?: string | null
          id?: string
          reason?: string | null
          recurring?: boolean
          target_id?: string
          target_owner_user_id?: string
          target_type?: string
          time_label?: string | null
          weekday?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "blocked_slots_target_owner_user_id_fkey"
            columns: ["target_owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bookmarks: {
        Row: {
          created_at: string | null
          id: string
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          target_id: string
          target_type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          target_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      boosts: {
        Row: {
          boost_type: string
          created_at: string | null
          ends_at: string | null
          id: string
          starts_at: string | null
          target_id: string
          target_type: string
        }
        Insert: {
          boost_type: string
          created_at?: string | null
          ends_at?: string | null
          id?: string
          starts_at?: string | null
          target_id: string
          target_type: string
        }
        Update: {
          boost_type?: string
          created_at?: string | null
          ends_at?: string | null
          id?: string
          starts_at?: string | null
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      bug_reports: {
        Row: {
          created_at: string | null
          description: string
          id: string
          reporter_role: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          reporter_role?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          reporter_role?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bug_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      business_access_sessions: {
        Row: {
          business_id: string
          created_ip: string | null
          decided_at: string | null
          expires_at: string | null
          grantee_user_id: string
          id: string
          requested_at: string
          status: string
        }
        Insert: {
          business_id: string
          created_ip?: string | null
          decided_at?: string | null
          expires_at?: string | null
          grantee_user_id: string
          id?: string
          requested_at?: string
          status?: string
        }
        Update: {
          business_id?: string
          created_ip?: string | null
          decided_at?: string | null
          expires_at?: string | null
          grantee_user_id?: string
          id?: string
          requested_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_access_sessions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_access_sessions_grantee_user_id_fkey"
            columns: ["grantee_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      business_login_attempts: {
        Row: {
          attempted_by: string
          fail_count: number
          last_attempt_at: string
          locked_until: string | null
          login_id: string
        }
        Insert: {
          attempted_by: string
          fail_count?: number
          last_attempt_at?: string
          locked_until?: string | null
          login_id: string
        }
        Update: {
          attempted_by?: string
          fail_count?: number
          last_attempt_at?: string
          locked_until?: string | null
          login_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_login_attempts_attempted_by_fkey"
            columns: ["attempted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      business_login_credentials: {
        Row: {
          business_id: string
          created_at: string
          is_enabled: boolean
          login_id: string
          password_hash: string
          require_approval: boolean
          session_hours: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          is_enabled?: boolean
          login_id: string
          password_hash: string
          require_approval?: boolean
          session_hours?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          is_enabled?: boolean
          login_id?: string
          password_hash?: string
          require_approval?: boolean
          session_hours?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_login_credentials_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_packages: {
        Row: {
          business_id: string
          created_at: string
          desc: string
          duration: string
          id: string
          instant_book: boolean
          name: string
          price: number
        }
        Insert: {
          business_id: string
          created_at?: string
          desc?: string
          duration?: string
          id?: string
          instant_book?: boolean
          name: string
          price: number
        }
        Update: {
          business_id?: string
          created_at?: string
          desc?: string
          duration?: string
          id?: string
          instant_book?: boolean
          name?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_packages_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_portfolio_items: {
        Row: {
          business_id: string
          caption: string | null
          created_at: string | null
          id: string
          url: string
        }
        Insert: {
          business_id: string
          caption?: string | null
          created_at?: string | null
          id?: string
          url: string
        }
        Update: {
          business_id?: string
          caption?: string | null
          created_at?: string | null
          id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_portfolio_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_qna: {
        Row: {
          answer: string | null
          answered_at: string | null
          asker_user_id: string
          business_id: string
          created_at: string | null
          id: string
          question: string
          upvotes: number
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          asker_user_id: string
          business_id: string
          created_at?: string | null
          id?: string
          question: string
          upvotes?: number
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          asker_user_id?: string
          business_id?: string
          created_at?: string | null
          id?: string
          question?: string
          upvotes?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_qna_asker_user_id_fkey"
            columns: ["asker_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_qna_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_team_members: {
        Row: {
          avatar: string
          business_id: string
          created_at: string
          id: string
          name: string
          phone: string
          role: string
        }
        Insert: {
          avatar?: string
          business_id: string
          created_at?: string
          id?: string
          name: string
          phone: string
          role?: string
        }
        Update: {
          avatar?: string
          business_id?: string
          created_at?: string
          id?: string
          name?: string
          phone?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_team_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_view_logs: {
        Row: {
          business_id: string
          id: string
          viewed_at: string
        }
        Insert: {
          business_id: string
          id?: string
          viewed_at?: string
        }
        Update: {
          business_id?: string
          id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_view_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          aadhaar_doc_url: string | null
          address_line1: string | null
          available_until: string | null
          boost_reminder_sent: boolean
          boosted_until: string | null
          broadcast_radius: number
          broadcast_radius_km: number | null
          call_count: number | null
          category_id: string | null
          category_name: string | null
          city: string | null
          cover_image: string | null
          created_at: string | null
          deleted_at: string | null
          delivery_time: string | null
          description: string | null
          directions_count: number | null
          disabled_at: string | null
          email: string | null
          gallery: string[] | null
          geom: unknown
          hours: string | null
          id: string
          is_available_now: boolean | null
          is_boosted: boolean | null
          is_featured: boolean | null
          is_new: boolean | null
          is_open_now: boolean | null
          is_verified: boolean | null
          lat: number | null
          lead_credits: number
          lng: number | null
          location_public: boolean | null
          name: string
          offer_text: string | null
          opening_date: string | null
          owner_enabled: boolean
          owner_user_id: string | null
          pan_doc_url: string | null
          payment_timing: string
          phone: string | null
          pincode: string | null
          price_for_two: number | null
          pro_until: string | null
          rating_avg: number | null
          rating_count: number | null
          rejection_reason: string | null
          show_email_publicly: boolean | null
          show_phone_publicly: boolean | null
          slug: string | null
          status: Database["public"]["Enums"]["entity_status"] | null
          sub_category: string | null
          tags: string[] | null
          upi_id: string | null
          verification_document_url: string | null
          verification_documents: string[]
          verification_reason: string | null
          verification_reviewed_at: string | null
          verification_reviewed_by: string | null
          verification_status: string | null
          view_count: number | null
          whatsapp: string | null
        }
        Insert: {
          aadhaar_doc_url?: string | null
          address_line1?: string | null
          available_until?: string | null
          boost_reminder_sent?: boolean
          boosted_until?: string | null
          broadcast_radius?: number
          broadcast_radius_km?: number | null
          call_count?: number | null
          category_id?: string | null
          category_name?: string | null
          city?: string | null
          cover_image?: string | null
          created_at?: string | null
          deleted_at?: string | null
          delivery_time?: string | null
          description?: string | null
          directions_count?: number | null
          disabled_at?: string | null
          email?: string | null
          gallery?: string[] | null
          geom?: unknown
          hours?: string | null
          id?: string
          is_available_now?: boolean | null
          is_boosted?: boolean | null
          is_featured?: boolean | null
          is_new?: boolean | null
          is_open_now?: boolean | null
          is_verified?: boolean | null
          lat?: number | null
          lead_credits?: number
          lng?: number | null
          location_public?: boolean | null
          name: string
          offer_text?: string | null
          opening_date?: string | null
          owner_enabled?: boolean
          owner_user_id?: string | null
          pan_doc_url?: string | null
          payment_timing?: string
          phone?: string | null
          pincode?: string | null
          price_for_two?: number | null
          pro_until?: string | null
          rating_avg?: number | null
          rating_count?: number | null
          rejection_reason?: string | null
          show_email_publicly?: boolean | null
          show_phone_publicly?: boolean | null
          slug?: string | null
          status?: Database["public"]["Enums"]["entity_status"] | null
          sub_category?: string | null
          tags?: string[] | null
          upi_id?: string | null
          verification_document_url?: string | null
          verification_documents?: string[]
          verification_reason?: string | null
          verification_reviewed_at?: string | null
          verification_reviewed_by?: string | null
          verification_status?: string | null
          view_count?: number | null
          whatsapp?: string | null
        }
        Update: {
          aadhaar_doc_url?: string | null
          address_line1?: string | null
          available_until?: string | null
          boost_reminder_sent?: boolean
          boosted_until?: string | null
          broadcast_radius?: number
          broadcast_radius_km?: number | null
          call_count?: number | null
          category_id?: string | null
          category_name?: string | null
          city?: string | null
          cover_image?: string | null
          created_at?: string | null
          deleted_at?: string | null
          delivery_time?: string | null
          description?: string | null
          directions_count?: number | null
          disabled_at?: string | null
          email?: string | null
          gallery?: string[] | null
          geom?: unknown
          hours?: string | null
          id?: string
          is_available_now?: boolean | null
          is_boosted?: boolean | null
          is_featured?: boolean | null
          is_new?: boolean | null
          is_open_now?: boolean | null
          is_verified?: boolean | null
          lat?: number | null
          lead_credits?: number
          lng?: number | null
          location_public?: boolean | null
          name?: string
          offer_text?: string | null
          opening_date?: string | null
          owner_enabled?: boolean
          owner_user_id?: string | null
          pan_doc_url?: string | null
          payment_timing?: string
          phone?: string | null
          pincode?: string | null
          price_for_two?: number | null
          pro_until?: string | null
          rating_avg?: number | null
          rating_count?: number | null
          rejection_reason?: string | null
          show_email_publicly?: boolean | null
          show_phone_publicly?: boolean | null
          slug?: string | null
          status?: Database["public"]["Enums"]["entity_status"] | null
          sub_category?: string | null
          tags?: string[] | null
          upi_id?: string | null
          verification_document_url?: string | null
          verification_documents?: string[]
          verification_reason?: string | null
          verification_reviewed_at?: string | null
          verification_reviewed_by?: string | null
          verification_status?: string | null
          view_count?: number | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "businesses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "businesses_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_items: {
        Row: {
          best_seller: boolean | null
          business_id: string | null
          description: string | null
          id: string
          image: string | null
          inventory_type: string
          is_food: boolean
          is_veg: boolean | null
          name: string
          price: number
          provider_id: string | null
          quantity: number | null
          sale_price: number | null
          sort_order: number | null
          stock_status: Database["public"]["Enums"]["stock_status"] | null
        }
        Insert: {
          best_seller?: boolean | null
          business_id?: string | null
          description?: string | null
          id?: string
          image?: string | null
          inventory_type?: string
          is_food?: boolean
          is_veg?: boolean | null
          name: string
          price: number
          provider_id?: string | null
          quantity?: number | null
          sale_price?: number | null
          sort_order?: number | null
          stock_status?: Database["public"]["Enums"]["stock_status"] | null
        }
        Update: {
          best_seller?: boolean | null
          business_id?: string | null
          description?: string | null
          id?: string
          image?: string | null
          inventory_type?: string
          is_food?: boolean
          is_veg?: boolean | null
          name?: string
          price?: number
          provider_id?: string | null
          quantity?: number | null
          sale_price?: number | null
          sort_order?: number | null
          stock_status?: Database["public"]["Enums"]["stock_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_items_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string | null
          icon: string | null
          id: string
          kind: Database["public"]["Enums"]["category_kind"]
          name: string
          parent_id: string | null
          rejection_reason: string | null
          slug: string
          status: Database["public"]["Enums"]["entity_status"] | null
        }
        Insert: {
          color?: string | null
          icon?: string | null
          id: string
          kind: Database["public"]["Enums"]["category_kind"]
          name: string
          parent_id?: string | null
          rejection_reason?: string | null
          slug: string
          status?: Database["public"]["Enums"]["entity_status"] | null
        }
        Update: {
          color?: string | null
          icon?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["category_kind"]
          name?: string
          parent_id?: string | null
          rejection_reason?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["entity_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      client_errors: {
        Row: {
          app_version: string | null
          context: Json | null
          created_at: string | null
          id: string
          kind: string
          message: string | null
          stack: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          context?: Json | null
          created_at?: string | null
          id?: string
          kind: string
          message?: string | null
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          context?: Json | null
          created_at?: string | null
          id?: string
          kind?: string
          message?: string | null
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      community_posts: {
        Row: {
          area: string | null
          author_avatar: string | null
          author_name: string
          author_ref_id: string | null
          author_type: string
          author_user_id: string | null
          body: string | null
          comments_count: number | null
          created_at: string | null
          geom: unknown
          id: string
          image: string | null
          lat: number | null
          likes_count: number | null
          lng: number | null
          poll_options: Json | null
          recommendations: Json | null
          resolved: boolean | null
          title: string
          type: string
        }
        Insert: {
          area?: string | null
          author_avatar?: string | null
          author_name?: string
          author_ref_id?: string | null
          author_type?: string
          author_user_id?: string | null
          body?: string | null
          comments_count?: number | null
          created_at?: string | null
          geom?: unknown
          id?: string
          image?: string | null
          lat?: number | null
          likes_count?: number | null
          lng?: number | null
          poll_options?: Json | null
          recommendations?: Json | null
          resolved?: boolean | null
          title: string
          type: string
        }
        Update: {
          area?: string | null
          author_avatar?: string | null
          author_name?: string
          author_ref_id?: string | null
          author_type?: string
          author_user_id?: string | null
          body?: string | null
          comments_count?: number | null
          created_at?: string | null
          geom?: unknown
          id?: string
          image?: string | null
          lat?: number | null
          likes_count?: number | null
          lng?: number | null
          poll_options?: Json | null
          recommendations?: Json | null
          resolved?: boolean | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string | null
          has_unread_a: boolean | null
          has_unread_b: boolean | null
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          last_read_at_a: string | null
          last_read_at_b: string | null
          participant_a: string
          participant_b: string
          subject_avatar: string | null
          subject_id: string | null
          subject_name: string | null
          subject_owner_id: string | null
          subject_type: string | null
        }
        Insert: {
          created_at?: string | null
          has_unread_a?: boolean | null
          has_unread_b?: boolean | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          last_read_at_a?: string | null
          last_read_at_b?: string | null
          participant_a: string
          participant_b: string
          subject_avatar?: string | null
          subject_id?: string | null
          subject_name?: string | null
          subject_owner_id?: string | null
          subject_type?: string | null
        }
        Update: {
          created_at?: string | null
          has_unread_a?: boolean | null
          has_unread_b?: boolean | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          last_read_at_a?: string | null
          last_read_at_b?: string | null
          participant_a?: string
          participant_b?: string
          subject_avatar?: string | null
          subject_id?: string | null
          subject_name?: string | null
          subject_owner_id?: string | null
          subject_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_participant_a_fkey"
            columns: ["participant_a"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_participant_b_fkey"
            columns: ["participant_b"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_contacts: {
        Row: {
          contact_user_id: string
          created_at: string | null
          id: string
          owner_user_id: string
        }
        Insert: {
          contact_user_id: string
          created_at?: string | null
          id?: string
          owner_user_id: string
        }
        Update: {
          contact_user_id?: string
          created_at?: string | null
          id?: string
          owner_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_contacts_contact_user_id_fkey"
            columns: ["contact_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_contacts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      endorsements: {
        Row: {
          created_at: string | null
          from_user_id: string
          id: string
          provider_id: string
          skill: string
        }
        Insert: {
          created_at?: string | null
          from_user_id: string
          id?: string
          provider_id: string
          skill: string
        }
        Update: {
          created_at?: string | null
          from_user_id?: string
          id?: string
          provider_id?: string
          skill?: string
        }
        Relationships: [
          {
            foreignKeyName: "endorsements_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endorsements_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      fcm_tokens: {
        Row: {
          created_at: string | null
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fcm_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string | null
          follower_user_id: string
          id: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string | null
          follower_user_id: string
          id?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string | null
          follower_user_id?: string
          id?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_user_id_fkey"
            columns: ["follower_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_passes: {
        Row: {
          created_at: string | null
          id: string
          issued_by_user_id: string
          provider_user_id: string
          purpose: string
          society_id: string
          status: string
          valid_from: string
          valid_until: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          issued_by_user_id: string
          provider_user_id: string
          purpose?: string
          society_id: string
          status?: string
          valid_from?: string
          valid_until: string
        }
        Update: {
          created_at?: string | null
          id?: string
          issued_by_user_id?: string
          provider_user_id?: string
          purpose?: string
          society_id?: string
          status?: string
          valid_from?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "gate_passes_issued_by_user_id_fkey"
            columns: ["issued_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_passes_provider_user_id_fkey"
            columns: ["provider_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_passes_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_points: {
        Row: {
          points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          business_id: string | null
          created_at: string | null
          from_user_id: string | null
          handled: boolean | null
          id: string
          kind: string
          note: string | null
          provider_id: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          from_user_id?: string | null
          handled?: boolean | null
          id?: string
          kind: string
          note?: string | null
          provider_id?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          from_user_id?: string | null
          handled?: boolean | null
          id?: string
          kind?: string
          note?: string | null
          provider_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      live_share_recipients: {
        Row: {
          conversation_id: string | null
          message_id: string | null
          recipient_user_id: string
          share_id: string
        }
        Insert: {
          conversation_id?: string | null
          message_id?: string | null
          recipient_user_id: string
          share_id: string
        }
        Update: {
          conversation_id?: string | null
          message_id?: string | null
          recipient_user_id?: string
          share_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_share_recipients_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_share_recipients_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "live_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      live_shares: {
        Row: {
          accuracy: number | null
          ended_at: string | null
          heading: number | null
          id: string
          lat: number | null
          lng: number | null
          sharer_user_id: string
          started_at: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          accuracy?: number | null
          ended_at?: string | null
          heading?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          sharer_user_id: string
          started_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          accuracy?: number | null
          ended_at?: string | null
          heading?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          sharer_user_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_shares_sharer_user_id_fkey"
            columns: ["sharer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      location_share_grants: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          owner_user_id: string
          requester_user_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          owner_user_id: string
          requester_user_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          owner_user_id?: string
          requester_user_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_share_grants_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_share_grants_requester_user_id_fkey"
            columns: ["requester_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_cards: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          reward: string
          target: number
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          reward?: string
          target?: number
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          reward?: string
          target?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_cards_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string | null
          id: string
          image_url: string | null
          kind: string | null
          meta: Json | null
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          kind?: string | null
          meta?: Json | null
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          kind?: string | null
          meta?: Json | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string | null
          deep_link: string
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string | null
          deep_link?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          deep_link?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          business_id: string | null
          code: string | null
          description: string | null
          id: string
          is_active: boolean | null
          title: string
          valid_until: string | null
        }
        Insert: {
          business_id?: string | null
          code?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          title: string
          valid_until?: string | null
        }
        Update: {
          business_id?: string | null
          code?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          title?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          agreement_id: string
          amount: number
          created_at: string | null
          currency: string
          escrow_status: string
          id: string
          payer_user_id: string
          razorpay_order_id: string
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          agreement_id: string
          amount: number
          created_at?: string | null
          currency?: string
          escrow_status?: string
          id?: string
          payer_user_id: string
          razorpay_order_id: string
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          agreement_id?: string
          amount?: number
          created_at?: string | null
          currency?: string
          escrow_status?: string
          id?: string
          payer_user_id?: string
          razorpay_order_id?: string
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payer_user_id_fkey"
            columns: ["payer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          created_at: string | null
          option_id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          option_id: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          option_id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_items: {
        Row: {
          caption: string | null
          id: string
          provider_id: string | null
          sort_order: number | null
          url: string
        }
        Insert: {
          caption?: string | null
          id?: string
          provider_id?: string | null
          sort_order?: number | null
          url: string
        }
        Update: {
          caption?: string | null
          id?: string
          provider_id?: string | null
          sort_order?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_items_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          author_avatar: string | null
          author_name: string
          author_user_id: string | null
          body: string
          created_at: string | null
          id: string
          listing_id: string | null
          listing_type: string | null
          parent_id: string | null
          phone_visibility: string | null
          post_id: string
          shared_phone: string | null
        }
        Insert: {
          author_avatar?: string | null
          author_name?: string
          author_user_id?: string | null
          body: string
          created_at?: string | null
          id?: string
          listing_id?: string | null
          listing_type?: string | null
          parent_id?: string | null
          phone_visibility?: string | null
          post_id: string
          shared_phone?: string | null
        }
        Update: {
          author_avatar?: string | null
          author_name?: string
          author_user_id?: string | null
          body?: string
          created_at?: string | null
          id?: string
          listing_id?: string | null
          listing_type?: string | null
          parent_id?: string | null
          phone_visibility?: string | null
          post_id?: string
          shared_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string | null
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_payments: {
        Row: {
          amount: number
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          plan: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          status: string
          user_id: string
          valid_until: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          plan: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          status?: string
          user_id: string
          valid_until?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          plan?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          status?: string
          user_id?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pro_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_deletion_requests: {
        Row: {
          created_at: string
          id: string
          reason: string | null
          status: string
          target_id: string | null
          target_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string | null
          status?: string
          target_id?: string | null
          target_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string | null
          status?: string
          target_id?: string | null
          target_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_deletion_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_counters: {
        Row: {
          amount: number
          by_user_id: string
          created_at: string
          id: string
          message: string
          proposal_id: string
        }
        Insert: {
          amount: number
          by_user_id: string
          created_at?: string
          id?: string
          message?: string
          proposal_id: string
        }
        Update: {
          amount?: number
          by_user_id?: string
          created_at?: string
          id?: string
          message?: string
          proposal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_counters_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          broadcast_to_metoo: boolean
          created_at: string | null
          eta: string | null
          id: string
          is_boosted: boolean | null
          message: string | null
          price: number
          request_id: string | null
          responder_avatar: string | null
          responder_entity_id: string | null
          responder_name: string | null
          responder_tagline: string | null
          responder_type: string | null
          responder_user_id: string | null
          status: Database["public"]["Enums"]["proposal_status"] | null
        }
        Insert: {
          broadcast_to_metoo?: boolean
          created_at?: string | null
          eta?: string | null
          id?: string
          is_boosted?: boolean | null
          message?: string | null
          price: number
          request_id?: string | null
          responder_avatar?: string | null
          responder_entity_id?: string | null
          responder_name?: string | null
          responder_tagline?: string | null
          responder_type?: string | null
          responder_user_id?: string | null
          status?: Database["public"]["Enums"]["proposal_status"] | null
        }
        Update: {
          broadcast_to_metoo?: boolean
          created_at?: string | null
          eta?: string | null
          id?: string
          is_boosted?: boolean | null
          message?: string | null
          price?: number
          request_id?: string | null
          responder_avatar?: string | null
          responder_entity_id?: string | null
          responder_name?: string | null
          responder_tagline?: string | null
          responder_type?: string | null
          responder_user_id?: string | null
          status?: Database["public"]["Enums"]["proposal_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_responder_user_id_fkey"
            columns: ["responder_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_packages: {
        Row: {
          created_at: string | null
          description: string
          duration: string
          id: string
          instant_book: boolean | null
          name: string
          price: number
          provider_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string
          duration?: string
          id?: string
          instant_book?: boolean | null
          name: string
          price: number
          provider_id: string
        }
        Update: {
          created_at?: string | null
          description?: string
          duration?: string
          id?: string
          instant_book?: boolean | null
          name?: string
          price?: number
          provider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_packages_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_view_logs: {
        Row: {
          id: string
          provider_id: string
          viewed_at: string
        }
        Insert: {
          id?: string
          provider_id: string
          viewed_at?: string
        }
        Update: {
          id?: string
          provider_id?: string
          viewed_at?: string
        }
        Relationships: []
      }
      providers: {
        Row: {
          availability_note: string | null
          available_until: string | null
          avatar: string | null
          bio: string | null
          boost_reminder_sent: boolean
          category_id: string | null
          category_name: string | null
          created_at: string | null
          deleted_at: string | null
          disabled_at: string | null
          display_name: string
          email: string | null
          geom: unknown
          id: string
          is_available_now: boolean | null
          is_new: boolean | null
          is_verified: boolean | null
          jobs_done: number | null
          lat: number | null
          lead_credits: number
          lng: number | null
          location_public: boolean | null
          owner_enabled: boolean
          payment_timing: string
          phone: string | null
          rating_avg: number | null
          rating_count: number | null
          rejection_reason: string | null
          response_time: string | null
          service_radius_km: number | null
          show_email_publicly: boolean | null
          show_phone_publicly: boolean | null
          skills: string[] | null
          starting_price: number | null
          status: Database["public"]["Enums"]["entity_status"] | null
          sub_category: string | null
          upi_id: string | null
          user_id: string | null
          verification_document_url: string | null
          verification_documents: string[]
          verification_reason: string | null
          verification_reviewed_at: string | null
          verification_reviewed_by: string | null
          verification_status: string | null
          view_count: number | null
        }
        Insert: {
          availability_note?: string | null
          available_until?: string | null
          avatar?: string | null
          bio?: string | null
          boost_reminder_sent?: boolean
          category_id?: string | null
          category_name?: string | null
          created_at?: string | null
          deleted_at?: string | null
          disabled_at?: string | null
          display_name: string
          email?: string | null
          geom?: unknown
          id?: string
          is_available_now?: boolean | null
          is_new?: boolean | null
          is_verified?: boolean | null
          jobs_done?: number | null
          lat?: number | null
          lead_credits?: number
          lng?: number | null
          location_public?: boolean | null
          owner_enabled?: boolean
          payment_timing?: string
          phone?: string | null
          rating_avg?: number | null
          rating_count?: number | null
          rejection_reason?: string | null
          response_time?: string | null
          service_radius_km?: number | null
          show_email_publicly?: boolean | null
          show_phone_publicly?: boolean | null
          skills?: string[] | null
          starting_price?: number | null
          status?: Database["public"]["Enums"]["entity_status"] | null
          sub_category?: string | null
          upi_id?: string | null
          user_id?: string | null
          verification_document_url?: string | null
          verification_documents?: string[]
          verification_reason?: string | null
          verification_reviewed_at?: string | null
          verification_reviewed_by?: string | null
          verification_status?: string | null
          view_count?: number | null
        }
        Update: {
          availability_note?: string | null
          available_until?: string | null
          avatar?: string | null
          bio?: string | null
          boost_reminder_sent?: boolean
          category_id?: string | null
          category_name?: string | null
          created_at?: string | null
          deleted_at?: string | null
          disabled_at?: string | null
          display_name?: string
          email?: string | null
          geom?: unknown
          id?: string
          is_available_now?: boolean | null
          is_new?: boolean | null
          is_verified?: boolean | null
          jobs_done?: number | null
          lat?: number | null
          lead_credits?: number
          lng?: number | null
          location_public?: boolean | null
          owner_enabled?: boolean
          payment_timing?: string
          phone?: string | null
          rating_avg?: number | null
          rating_count?: number | null
          rejection_reason?: string | null
          response_time?: string | null
          service_radius_km?: number | null
          show_email_publicly?: boolean | null
          show_phone_publicly?: boolean | null
          skills?: string[] | null
          starting_price?: number | null
          status?: Database["public"]["Enums"]["entity_status"] | null
          sub_category?: string | null
          upi_id?: string | null
          user_id?: string | null
          verification_document_url?: string | null
          verification_documents?: string[]
          verification_reason?: string | null
          verification_reviewed_at?: string | null
          verification_reviewed_by?: string | null
          verification_status?: string | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "providers_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "providers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      qna_upvotes: {
        Row: {
          created_at: string | null
          id: string
          qna_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          qna_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          qna_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qna_upvotes_qna_id_fkey"
            columns: ["qna_id"]
            isOneToOne: false
            referencedRelation: "business_qna"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qna_upvotes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      queue_settings: {
        Row: {
          avg_service_min: number
          business_id: string
          is_open: boolean
          last_activity_at: string | null
          updated_at: string
        }
        Insert: {
          avg_service_min?: number
          business_id: string
          is_open?: boolean
          last_activity_at?: string | null
          updated_at?: string
        }
        Update: {
          avg_service_min?: number
          business_id?: string
          is_open?: boolean
          last_activity_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      queue_tokens: {
        Row: {
          arrived_at: string | null
          business_id: string
          closed_reason: string | null
          created_at: string
          customer_name: string
          customer_user_id: string | null
          id: string
          party_size: string
          payment_amount: number | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string
          status: string
        }
        Insert: {
          arrived_at?: string | null
          business_id: string
          closed_reason?: string | null
          created_at?: string
          customer_name?: string
          customer_user_id?: string | null
          id?: string
          party_size?: string
          payment_amount?: number | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string
          status?: string
        }
        Update: {
          arrived_at?: string | null
          business_id?: string
          closed_reason?: string | null
          created_at?: string
          customer_name?: string
          customer_user_id?: string | null
          id?: string
          party_size?: string
          payment_amount?: number | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_tokens_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_tokens_customer_user_id_fkey"
            columns: ["customer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          agreement_id: string | null
          comment: string | null
          created_at: string | null
          id: string
          is_verified_booking: boolean
          ratee_id: string
          ratee_type: string
          rater_user_id: string | null
          rating: number
          tip: number | null
        }
        Insert: {
          agreement_id?: string | null
          comment?: string | null
          created_at?: string | null
          id?: string
          is_verified_booking?: boolean
          ratee_id: string
          ratee_type: string
          rater_user_id?: string | null
          rating: number
          tip?: number | null
        }
        Update: {
          agreement_id?: string | null
          comment?: string | null
          created_at?: string | null
          id?: string
          is_verified_booking?: boolean
          ratee_id?: string
          ratee_type?: string
          rater_user_id?: string | null
          rating?: number
          tip?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ratings_rater_user_id_fkey"
            columns: ["rater_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string | null
          details: string | null
          id: string
          reason: string
          reporter_user_id: string | null
          status: string
          target_id: string
          target_name: string
          target_type: string
        }
        Insert: {
          created_at?: string | null
          details?: string | null
          id?: string
          reason: string
          reporter_user_id?: string | null
          status?: string
          target_id: string
          target_name: string
          target_type: string
        }
        Update: {
          created_at?: string | null
          details?: string | null
          id?: string
          reason?: string
          reporter_user_id?: string | null
          status?: string
          target_id?: string
          target_name?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      request_me_toos: {
        Row: {
          created_at: string | null
          request_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          request_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_me_toos_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_me_toos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          area: string | null
          budget_max: number | null
          budget_min: number | null
          category_id: string | null
          category_name: string | null
          created_at: string | null
          deadline: string | null
          description: string | null
          expires_at: string | null
          expires_in_hrs: number | null
          geom: unknown
          group_buy_target: number | null
          id: string
          is_anonymous: boolean | null
          is_boosted: boolean | null
          is_group_buy: boolean | null
          is_recurring: boolean | null
          is_urgent: boolean | null
          lat: number | null
          lng: number | null
          me_too_count: number | null
          photos: string[] | null
          radius_km: number | null
          requester_user_id: string | null
          status: Database["public"]["Enums"]["request_status"] | null
          sub_category: string | null
          title: string
          view_count: number | null
        }
        Insert: {
          area?: string | null
          budget_max?: number | null
          budget_min?: number | null
          category_id?: string | null
          category_name?: string | null
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          expires_at?: string | null
          expires_in_hrs?: number | null
          geom?: unknown
          group_buy_target?: number | null
          id?: string
          is_anonymous?: boolean | null
          is_boosted?: boolean | null
          is_group_buy?: boolean | null
          is_recurring?: boolean | null
          is_urgent?: boolean | null
          lat?: number | null
          lng?: number | null
          me_too_count?: number | null
          photos?: string[] | null
          radius_km?: number | null
          requester_user_id?: string | null
          status?: Database["public"]["Enums"]["request_status"] | null
          sub_category?: string | null
          title: string
          view_count?: number | null
        }
        Update: {
          area?: string | null
          budget_max?: number | null
          budget_min?: number | null
          category_id?: string | null
          category_name?: string | null
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          expires_at?: string | null
          expires_in_hrs?: number | null
          geom?: unknown
          group_buy_target?: number | null
          id?: string
          is_anonymous?: boolean | null
          is_boosted?: boolean | null
          is_group_buy?: boolean | null
          is_recurring?: boolean | null
          is_urgent?: boolean | null
          lat?: number | null
          lng?: number | null
          me_too_count?: number | null
          photos?: string[] | null
          radius_km?: number | null
          requester_user_id?: string | null
          status?: Database["public"]["Enums"]["request_status"] | null
          sub_category?: string | null
          title?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "requests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_requester_user_id_fkey"
            columns: ["requester_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_searches: {
        Row: {
          created_at: string | null
          id: string
          lat: number | null
          lng: number | null
          query: string
          radius_km: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          query: string
          radius_km?: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          query?: string
          radius_km?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_searches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          agreement_id: string
          amount: number
          created_at: string | null
          id: string
          mode: string
          note: string
          tip: number | null
          user_id: string
          with_user_id: string
        }
        Insert: {
          agreement_id: string
          amount?: number
          created_at?: string | null
          id?: string
          mode?: string
          note?: string
          tip?: number | null
          user_id: string
          with_user_id: string
        }
        Update: {
          agreement_id?: string
          amount?: number
          created_at?: string | null
          id?: string
          mode?: string
          note?: string
          tip?: number | null
          user_id?: string
          with_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_with_user_id_fkey"
            columns: ["with_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      societies: {
        Row: {
          address: string
          admin_user_id: string | null
          city: string
          created_at: string | null
          id: string
          join_code: string
          lat: number | null
          lng: number | null
          name: string
          pincode: string
          unit_count: number | null
          verified: boolean | null
        }
        Insert: {
          address?: string
          admin_user_id?: string | null
          city?: string
          created_at?: string | null
          id?: string
          join_code?: string
          lat?: number | null
          lng?: number | null
          name: string
          pincode?: string
          unit_count?: number | null
          verified?: boolean | null
        }
        Update: {
          address?: string
          admin_user_id?: string | null
          city?: string
          created_at?: string | null
          id?: string
          join_code?: string
          lat?: number | null
          lng?: number | null
          name?: string
          pincode?: string
          unit_count?: number | null
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "societies_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      society_members: {
        Row: {
          approved: boolean | null
          id: string
          joined_at: string | null
          role: string
          society_id: string
          unit_number: string
          user_id: string
        }
        Insert: {
          approved?: boolean | null
          id?: string
          joined_at?: string | null
          role?: string
          society_id: string
          unit_number?: string
          user_id: string
        }
        Update: {
          approved?: boolean | null
          id?: string
          joined_at?: string | null
          role?: string
          society_id?: string
          unit_number?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "society_members_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "society_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      stories: {
        Row: {
          allowed_user_ids: string[] | null
          author_avatar: string
          author_name: string
          caption: string
          created_at: string | null
          cta: string
          expires_at: string
          geom: unknown
          hidden_user_ids: string[] | null
          id: string
          image_url: string
          is_highlighted: boolean
          lat: number | null
          lng: number | null
          owner_id: string
          owner_type: string
          user_id: string | null
          visibility: string
        }
        Insert: {
          allowed_user_ids?: string[] | null
          author_avatar?: string
          author_name: string
          caption?: string
          created_at?: string | null
          cta?: string
          expires_at: string
          geom?: unknown
          hidden_user_ids?: string[] | null
          id?: string
          image_url: string
          is_highlighted?: boolean
          lat?: number | null
          lng?: number | null
          owner_id: string
          owner_type: string
          user_id?: string | null
          visibility?: string
        }
        Update: {
          allowed_user_ids?: string[] | null
          author_avatar?: string
          author_name?: string
          caption?: string
          created_at?: string | null
          cta?: string
          expires_at?: string
          geom?: unknown
          hidden_user_ids?: string[] | null
          id?: string
          image_url?: string
          is_highlighted?: boolean
          lat?: number | null
          lng?: number | null
          owner_id?: string
          owner_type?: string
          user_id?: string | null
          visibility?: string
        }
        Relationships: []
      }
      story_views: {
        Row: {
          created_at: string
          id: string
          reaction: string | null
          story_id: string
          viewer_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reaction?: string | null
          story_id: string
          viewer_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reaction?: string | null
          story_id?: string
          viewer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_views_viewer_user_id_fkey"
            columns: ["viewer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_logs: {
        Row: {
          created_at: string | null
          id: string
          log_date: string
          note: string | null
          status: string
          subscription_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          log_date?: string
          note?: string | null
          status?: string
          subscription_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          log_date?: string
          note?: string | null
          status?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_logs_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string | null
          description: string
          frequency: string
          id: string
          next_due: string | null
          price_per_period: number
          provider_avatar: string
          provider_name: string
          provider_user_id: string
          requester_user_id: string
          start_date: string
          status: string
          title: string
        }
        Insert: {
          created_at?: string | null
          description?: string
          frequency?: string
          id?: string
          next_due?: string | null
          price_per_period?: number
          provider_avatar?: string
          provider_name?: string
          provider_user_id: string
          requester_user_id: string
          start_date?: string
          status?: string
          title: string
        }
        Update: {
          created_at?: string | null
          description?: string
          frequency?: string
          id?: string
          next_due?: string | null
          price_per_period?: number
          provider_avatar?: string
          provider_name?: string
          provider_user_id?: string
          requester_user_id?: string
          start_date?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_provider_user_id_fkey"
            columns: ["provider_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_requester_user_id_fkey"
            columns: ["requester_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          category: string
          created_at: string | null
          email: string
          id: string
          message: string
          status: string
          subject: string
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          email: string
          id?: string
          message: string
          status?: string
          subject: string
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          email?: string
          id?: string
          message?: string
          status?: string
          subject?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_tokens: {
        Row: {
          agreement_id: string
          created_at: string | null
          expires_at: string
          id: string
        }
        Insert: {
          agreement_id: string
          created_at?: string | null
          expires_at: string
          id?: string
        }
        Update: {
          agreement_id?: string
          created_at?: string | null
          expires_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_tokens_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      user_list_items: {
        Row: {
          created_at: string | null
          id: string
          list_id: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          list_id: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          list_id?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "user_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      user_lists: {
        Row: {
          created_at: string | null
          emoji: string
          id: string
          name: string
          shared: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          emoji?: string
          id?: string
          name: string
          shared?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          emoji?: string
          id?: string
          name?: string
          shared?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_lists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_saved_coupons: {
        Row: {
          created_at: string | null
          id: string
          offer_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          offer_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          offer_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_saved_coupons_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_saved_coupons_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_stamps: {
        Row: {
          card_id: string
          id: string
          stamps: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          card_id: string
          id?: string
          stamps?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          card_id?: string
          id?: string
          stamps?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_stamps_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "loyalty_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_stamps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          admin_login_id: string | null
          alias: string | null
          area: string | null
          avatar: string | null
          city: string | null
          created_at: string | null
          customer_deleted_at: string | null
          customer_enabled: boolean
          email: string | null
          id: string
          language: string | null
          lat: number | null
          lng: number | null
          location_public: boolean | null
          name: string
          notification_radius_km: number | null
          onboarding_completed_at: string | null
          phone: string | null
          rating_avg: number | null
          rating_count: number | null
          roles: string[]
          show_asks_publicly: boolean | null
          show_badges_publicly: boolean | null
          show_city_publicly: boolean | null
          show_email_publicly: boolean | null
          show_name_publicly: boolean | null
          show_phone_publicly: boolean | null
          show_posts_publicly: boolean | null
          show_rating_publicly: boolean | null
          society_id: string | null
          unit_number: string | null
        }
        Insert: {
          admin_login_id?: string | null
          alias?: string | null
          area?: string | null
          avatar?: string | null
          city?: string | null
          created_at?: string | null
          customer_deleted_at?: string | null
          customer_enabled?: boolean
          email?: string | null
          id: string
          language?: string | null
          lat?: number | null
          lng?: number | null
          location_public?: boolean | null
          name: string
          notification_radius_km?: number | null
          onboarding_completed_at?: string | null
          phone?: string | null
          rating_avg?: number | null
          rating_count?: number | null
          roles?: string[]
          show_asks_publicly?: boolean | null
          show_badges_publicly?: boolean | null
          show_city_publicly?: boolean | null
          show_email_publicly?: boolean | null
          show_name_publicly?: boolean | null
          show_phone_publicly?: boolean | null
          show_posts_publicly?: boolean | null
          show_rating_publicly?: boolean | null
          society_id?: string | null
          unit_number?: string | null
        }
        Update: {
          admin_login_id?: string | null
          alias?: string | null
          area?: string | null
          avatar?: string | null
          city?: string | null
          created_at?: string | null
          customer_deleted_at?: string | null
          customer_enabled?: boolean
          email?: string | null
          id?: string
          language?: string | null
          lat?: number | null
          lng?: number | null
          location_public?: boolean | null
          name?: string
          notification_radius_km?: number | null
          onboarding_completed_at?: string | null
          phone?: string | null
          rating_avg?: number | null
          rating_count?: number | null
          roles?: string[]
          show_asks_publicly?: boolean | null
          show_badges_publicly?: boolean | null
          show_city_publicly?: boolean | null
          show_email_publicly?: boolean | null
          show_name_publicly?: boolean | null
          show_phone_publicly?: boolean | null
          show_posts_publicly?: boolean | null
          show_rating_publicly?: boolean | null
          society_id?: string | null
          unit_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      vouches: {
        Row: {
          created_at: string | null
          from_user_id: string
          id: string
          provider_id: string
        }
        Insert: {
          created_at?: string | null
          from_user_id: string
          id?: string
          provider_id: string
        }
        Update: {
          created_at?: string | null
          from_user_id?: string
          id?: string
          provider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vouches_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouches_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      accept_proposal: { Args: { p_proposal_id: string }; Returns: string }
      accept_proposal_at_price: {
        Args: { p_final_price: number; p_proposal_id: string }
        Returns: string
      }
      accept_proposal_counter: {
        Args: { p_counter_id: string; p_proposal_id: string }
        Returns: string
      }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      admin_recent_users: {
        Args: never
        Returns: {
          admin_login_id: string | null
          alias: string | null
          area: string | null
          avatar: string | null
          city: string | null
          created_at: string | null
          customer_deleted_at: string | null
          customer_enabled: boolean
          email: string | null
          id: string
          language: string | null
          lat: number | null
          lng: number | null
          location_public: boolean | null
          name: string
          notification_radius_km: number | null
          onboarding_completed_at: string | null
          phone: string | null
          rating_avg: number | null
          rating_count: number | null
          roles: string[]
          show_asks_publicly: boolean | null
          show_badges_publicly: boolean | null
          show_city_publicly: boolean | null
          show_email_publicly: boolean | null
          show_name_publicly: boolean | null
          show_phone_publicly: boolean | null
          show_posts_publicly: boolean | null
          show_rating_publicly: boolean | null
          society_id: string | null
          unit_number: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "users"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_resolve_agreement_dispute: {
        Args: { p_id: string; p_resolution: string }
        Returns: undefined
      }
      admin_search_users: {
        Args: { term: string }
        Returns: {
          admin_login_id: string | null
          alias: string | null
          area: string | null
          avatar: string | null
          city: string | null
          created_at: string | null
          customer_deleted_at: string | null
          customer_enabled: boolean
          email: string | null
          id: string
          language: string | null
          lat: number | null
          lng: number | null
          location_public: boolean | null
          name: string
          notification_radius_km: number | null
          onboarding_completed_at: string | null
          phone: string | null
          rating_avg: number | null
          rating_count: number | null
          roles: string[]
          show_asks_publicly: boolean | null
          show_badges_publicly: boolean | null
          show_city_publicly: boolean | null
          show_email_publicly: boolean | null
          show_name_publicly: boolean | null
          show_phone_publicly: boolean | null
          show_posts_publicly: boolean | null
          show_rating_publicly: boolean | null
          society_id: string | null
          unit_number: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "users"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      agreement_cancel: { Args: { p_id: string }; Returns: undefined }
      agreement_claim_payment: {
        Args: {
          p_amount?: number
          p_id: string
          p_method: string
          p_reference?: string
        }
        Returns: undefined
      }
      agreement_complete: { Args: { p_id: string }; Returns: undefined }
      agreement_confirm: {
        Args: { p_id: string }
        Returns: {
          agreed_price: number
          created_at: string | null
          dispute_reason: string | null
          id: string
          live_status: string | null
          payment_amount: number | null
          payment_method: string | null
          payment_mode: string | null
          payment_reference: string | null
          payment_status: string
          proposal_id: string | null
          provider_lat: number | null
          provider_lng: number | null
          request_id: string | null
          request_title: string | null
          requester_confirmed: boolean | null
          requester_user_id: string | null
          responder_confirmed: boolean | null
          responder_user_id: string | null
          scheduled_for: string | null
          status: Database["public"]["Enums"]["agreement_status"] | null
          terms: string | null
          tracking_token: string | null
        }
        SetofOptions: {
          from: "*"
          to: "agreements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      agreement_confirm_payment: { Args: { p_id: string }; Returns: undefined }
      agreement_create_tracking_token: {
        Args: { p_id: string }
        Returns: string
      }
      agreement_dispute: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      agreement_reject_payment: { Args: { p_id: string }; Returns: undefined }
      agreement_start_work: { Args: { p_id: string }; Returns: undefined }
      agreement_submit_review: { Args: { p_id: string }; Returns: undefined }
      agreement_update_live_status: {
        Args: { p_id: string; p_lat?: number; p_lng?: number; p_status: string }
        Returns: {
          agreed_price: number
          created_at: string | null
          dispute_reason: string | null
          id: string
          live_status: string | null
          payment_amount: number | null
          payment_method: string | null
          payment_mode: string | null
          payment_reference: string | null
          payment_status: string
          proposal_id: string | null
          provider_lat: number | null
          provider_lng: number | null
          request_id: string | null
          request_title: string | null
          requester_confirmed: boolean | null
          requester_user_id: string | null
          responder_confirmed: boolean | null
          responder_user_id: string | null
          scheduled_for: string | null
          status: Database["public"]["Enums"]["agreement_status"] | null
          terms: string | null
          tracking_token: string | null
        }
        SetofOptions: {
          from: "*"
          to: "agreements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      appointment_claim_payment: {
        Args: {
          p_amount?: number
          p_id: string
          p_method: string
          p_reference?: string
        }
        Returns: {
          cancelled_by: string | null
          created_at: string | null
          customer_avatar: string | null
          customer_name: string | null
          customer_user_id: string
          date_label: string | null
          id: string
          is_walk_in: boolean
          notes: string | null
          package_id: string | null
          package_name: string | null
          package_price: number | null
          payment_amount: number | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string
          photo_url: string | null
          rescheduled_from: string | null
          response_note: string | null
          scheduled_for: string
          status: string
          target_avatar: string | null
          target_id: string
          target_name: string | null
          target_owner_user_id: string
          target_type: string
          time_label: string | null
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      appointment_confirm_payment: {
        Args: { p_id: string }
        Returns: {
          cancelled_by: string | null
          created_at: string | null
          customer_avatar: string | null
          customer_name: string | null
          customer_user_id: string
          date_label: string | null
          id: string
          is_walk_in: boolean
          notes: string | null
          package_id: string | null
          package_name: string | null
          package_price: number | null
          payment_amount: number | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string
          photo_url: string | null
          rescheduled_from: string | null
          response_note: string | null
          scheduled_for: string
          status: string
          target_avatar: string | null
          target_id: string
          target_name: string | null
          target_owner_user_id: string
          target_type: string
          time_label: string | null
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      appointment_create: {
        Args: {
          p_date_label: string
          p_notes?: string
          p_package_id?: string
          p_package_name?: string
          p_package_price?: number
          p_photo_url?: string
          p_scheduled_for: string
          p_target_id: string
          p_target_type: string
          p_time_label: string
        }
        Returns: {
          cancelled_by: string | null
          created_at: string | null
          customer_avatar: string | null
          customer_name: string | null
          customer_user_id: string
          date_label: string | null
          id: string
          is_walk_in: boolean
          notes: string | null
          package_id: string | null
          package_name: string | null
          package_price: number | null
          payment_amount: number | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string
          photo_url: string | null
          rescheduled_from: string | null
          response_note: string | null
          scheduled_for: string
          status: string
          target_avatar: string | null
          target_id: string
          target_name: string | null
          target_owner_user_id: string
          target_type: string
          time_label: string | null
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      appointment_create_walk_in: {
        Args: {
          p_customer_name: string
          p_customer_phone: string
          p_date_label: string
          p_package_id?: string
          p_package_name?: string
          p_package_price?: number
          p_scheduled_for: string
          p_target_id: string
          p_target_type: string
          p_time_label: string
        }
        Returns: {
          cancelled_by: string | null
          created_at: string | null
          customer_avatar: string | null
          customer_name: string | null
          customer_user_id: string
          date_label: string | null
          id: string
          is_walk_in: boolean
          notes: string | null
          package_id: string | null
          package_name: string | null
          package_price: number | null
          payment_amount: number | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string
          photo_url: string | null
          rescheduled_from: string | null
          response_note: string | null
          scheduled_for: string
          status: string
          target_avatar: string | null
          target_id: string
          target_name: string | null
          target_owner_user_id: string
          target_type: string
          time_label: string | null
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      appointment_record_walk_in_payment: {
        Args: {
          p_amount?: number
          p_id: string
          p_method: string
          p_reference?: string
        }
        Returns: {
          cancelled_by: string | null
          created_at: string | null
          customer_avatar: string | null
          customer_name: string | null
          customer_user_id: string
          date_label: string | null
          id: string
          is_walk_in: boolean
          notes: string | null
          package_id: string | null
          package_name: string | null
          package_price: number | null
          payment_amount: number | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string
          photo_url: string | null
          rescheduled_from: string | null
          response_note: string | null
          scheduled_for: string
          status: string
          target_avatar: string | null
          target_id: string
          target_name: string | null
          target_owner_user_id: string
          target_type: string
          time_label: string | null
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      appointment_reject_payment: {
        Args: { p_id: string }
        Returns: {
          cancelled_by: string | null
          created_at: string | null
          customer_avatar: string | null
          customer_name: string | null
          customer_user_id: string
          date_label: string | null
          id: string
          is_walk_in: boolean
          notes: string | null
          package_id: string | null
          package_name: string | null
          package_price: number | null
          payment_amount: number | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string
          photo_url: string | null
          rescheduled_from: string | null
          response_note: string | null
          scheduled_for: string
          status: string
          target_avatar: string | null
          target_id: string
          target_name: string | null
          target_owner_user_id: string
          target_type: string
          time_label: string | null
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      appointment_transition: {
        Args: { p_id: string; p_response_note?: string; p_status: string }
        Returns: {
          cancelled_by: string | null
          created_at: string | null
          customer_avatar: string | null
          customer_name: string | null
          customer_user_id: string
          date_label: string | null
          id: string
          is_walk_in: boolean
          notes: string | null
          package_id: string | null
          package_name: string | null
          package_price: number | null
          payment_amount: number | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string
          photo_url: string | null
          rescheduled_from: string | null
          response_note: string | null
          scheduled_for: string
          status: string
          target_avatar: string | null
          target_id: string
          target_name: string | null
          target_owner_user_id: string
          target_type: string
          time_label: string | null
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      booked_slots: {
        Args: { p_target_id: string }
        Returns: {
          scheduled_for: string
        }[]
      }
      bump_business_metric: {
        Args: { p_business_id: string; p_metric: string }
        Returns: undefined
      }
      bump_provider_views: {
        Args: { p_provider_id: string }
        Returns: undefined
      }
      business_login_attempt: {
        Args: { p_login_id: string; p_password: string }
        Returns: {
          business_id: string
          business_name: string
          session_id: string
          status: string
        }[]
      }
      businesses_nearby: {
        Args: {
          in_category?: string
          in_lat: number
          in_limit?: number
          in_lng: number
          in_offset?: number
          in_radius_km?: number
        }
        Returns: {
          aadhaar_doc_url: string | null
          address_line1: string | null
          available_until: string | null
          boost_reminder_sent: boolean
          boosted_until: string | null
          broadcast_radius: number
          broadcast_radius_km: number | null
          call_count: number | null
          category_id: string | null
          category_name: string | null
          city: string | null
          cover_image: string | null
          created_at: string | null
          deleted_at: string | null
          delivery_time: string | null
          description: string | null
          directions_count: number | null
          disabled_at: string | null
          email: string | null
          gallery: string[] | null
          geom: unknown
          hours: string | null
          id: string
          is_available_now: boolean | null
          is_boosted: boolean | null
          is_featured: boolean | null
          is_new: boolean | null
          is_open_now: boolean | null
          is_verified: boolean | null
          lat: number | null
          lead_credits: number
          lng: number | null
          location_public: boolean | null
          name: string
          offer_text: string | null
          opening_date: string | null
          owner_enabled: boolean
          owner_user_id: string | null
          pan_doc_url: string | null
          payment_timing: string
          phone: string | null
          pincode: string | null
          price_for_two: number | null
          pro_until: string | null
          rating_avg: number | null
          rating_count: number | null
          rejection_reason: string | null
          show_email_publicly: boolean | null
          show_phone_publicly: boolean | null
          slug: string | null
          status: Database["public"]["Enums"]["entity_status"] | null
          sub_category: string | null
          tags: string[] | null
          upi_id: string | null
          verification_document_url: string | null
          verification_documents: string[]
          verification_reason: string | null
          verification_reviewed_at: string | null
          verification_reviewed_by: string | null
          verification_status: string | null
          view_count: number | null
          whatsapp: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "businesses"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      can_manage_business: { Args: { p_business_id: string }; Returns: boolean }
      cancel_expired_agreements: { Args: never; Returns: undefined }
      claim_first_admin: { Args: { p_login_id: string }; Returns: undefined }
      close_expired_business_sessions: { Args: never; Returns: undefined }
      close_expired_requests: { Args: never; Returns: undefined }
      close_stale_queue_tokens: { Args: never; Returns: undefined }
      community_posts_nearby: {
        Args: {
          in_lat: number
          in_limit?: number
          in_lng: number
          in_offset?: number
          in_radius_km?: number
        }
        Returns: {
          area: string | null
          author_avatar: string | null
          author_name: string
          author_ref_id: string | null
          author_type: string
          author_user_id: string | null
          body: string | null
          comments_count: number | null
          created_at: string | null
          geom: unknown
          id: string
          image: string | null
          lat: number | null
          likes_count: number | null
          lng: number | null
          poll_options: Json | null
          recommendations: Json | null
          resolved: boolean | null
          title: string
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "community_posts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      decide_business_session: {
        Args: { p_approve: boolean; p_session_id: string }
        Returns: undefined
      }
      disablelongtransactions: { Args: never; Returns: string }
      distance_km: {
        Args: {
          in_lat: number
          in_lng: number
          row_lat: number
          row_lng: number
        }
        Returns: number
      }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_leaderboard: {
        Args: never
        Returns: {
          avatar: string
          is_provider: boolean
          metric: string
          name: string
          rank: number
          target_id: string
          value: string
        }[]
      }
      get_live_share: {
        Args: { p_share_id: string }
        Returns: {
          lat: number
          lng: number
          sharer_avatar: string
          sharer_name: string
          status: string
          updated_at: string
        }[]
      }
      get_nearby_user_ids: {
        Args: { p_lat: number; p_lng: number; p_radius_km: number }
        Returns: string[]
      }
      get_own_coords: {
        Args: never
        Returns: {
          lat: number
          lng: number
        }[]
      }
      get_own_profile: {
        Args: never
        Returns: {
          admin_login_id: string | null
          alias: string | null
          area: string | null
          avatar: string | null
          city: string | null
          created_at: string | null
          customer_deleted_at: string | null
          customer_enabled: boolean
          email: string | null
          id: string
          language: string | null
          lat: number | null
          lng: number | null
          location_public: boolean | null
          name: string
          notification_radius_km: number | null
          onboarding_completed_at: string | null
          phone: string | null
          rating_avg: number | null
          rating_count: number | null
          roles: string[]
          show_asks_publicly: boolean | null
          show_badges_publicly: boolean | null
          show_city_publicly: boolean | null
          show_email_publicly: boolean | null
          show_name_publicly: boolean | null
          show_phone_publicly: boolean | null
          show_posts_publicly: boolean | null
          show_rating_publicly: boolean | null
          society_id: string | null
          unit_number: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "users"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_public_profile: {
        Args: { target_id: string }
        Returns: {
          area: string
          avatar: string
          created_at: string
          distance_km: number
          email: string
          id: string
          name: string
          phone: string
          rating_avg: number
          rating_count: number
          show_asks_publicly: boolean
          show_badges_publicly: boolean
          show_city_publicly: boolean
          show_email_publicly: boolean
          show_name_publicly: boolean
          show_phone_publicly: boolean
          show_posts_publicly: boolean
          show_rating_publicly: boolean
        }[]
      }
      get_shared_location: {
        Args: { p_target: string }
        Returns: {
          lat: number
          lng: number
        }[]
      }
      get_tracking: {
        Args: { p_token: string }
        Returns: {
          agreement_id: string
          live_status: string
          provider_avatar: string
          provider_lat: number
          provider_lng: number
          provider_name: string
        }[]
      }
      gettransactionid: { Args: never; Returns: unknown }
      grant_business_access: {
        Args: { p_business_id: string; p_identifier: string }
        Returns: {
          grantee_name: string
          session_id: string
        }[]
      }
      has_business_access: {
        Args: { p_business_id: string; p_uid: string }
        Returns: boolean
      }
      haversine_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      increment_stamp: {
        Args: { p_card_id: string; p_user_id: string }
        Returns: Json
      }
      is_admin:
        | { Args: never; Returns: boolean }
        | { Args: { p_user_id: string }; Returns: boolean }
      is_society_admin: {
        Args: { p_society_id: string; p_user_id: string }
        Returns: boolean
      }
      is_society_member: {
        Args: { p_society_id: string; p_user_id: string }
        Returns: boolean
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      my_business_access_status: {
        Args: { p_business_id: string }
        Returns: boolean
      }
      my_delegated_businesses: { Args: never; Returns: string[] }
      neighborhood_today: {
        Args: { in_lat: number; in_lng: number; in_radius_m?: number }
        Returns: Json
      }
      notification_push_health: {
        Args: never
        Returns: {
          functions_url_configured: boolean
          pg_net_installed: boolean
          service_role_key_configured: boolean
          trigger_installed: boolean
        }[]
      }
      notify_agreement_confirm: {
        Args: { p_agreement_id: string; p_recipient_user_id: string }
        Returns: undefined
      }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      proposal_submit_counter: {
        Args: { p_amount: number; p_message?: string; p_proposal_id: string }
        Returns: {
          amount: number
          by_user_id: string
          created_at: string
          id: string
          message: string
          proposal_id: string
        }
        SetofOptions: {
          from: "*"
          to: "proposal_counters"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      providers_nearby: {
        Args: {
          in_category?: string
          in_lat: number
          in_limit?: number
          in_lng: number
          in_offset?: number
          in_radius_km?: number
        }
        Returns: {
          availability_note: string | null
          available_until: string | null
          avatar: string | null
          bio: string | null
          boost_reminder_sent: boolean
          category_id: string | null
          category_name: string | null
          created_at: string | null
          deleted_at: string | null
          disabled_at: string | null
          display_name: string
          email: string | null
          geom: unknown
          id: string
          is_available_now: boolean | null
          is_new: boolean | null
          is_verified: boolean | null
          jobs_done: number | null
          lat: number | null
          lead_credits: number
          lng: number | null
          location_public: boolean | null
          owner_enabled: boolean
          payment_timing: string
          phone: string | null
          rating_avg: number | null
          rating_count: number | null
          rejection_reason: string | null
          response_time: string | null
          service_radius_km: number | null
          show_email_publicly: boolean | null
          show_phone_publicly: boolean | null
          skills: string[] | null
          starting_price: number | null
          status: Database["public"]["Enums"]["entity_status"] | null
          sub_category: string | null
          upi_id: string | null
          user_id: string | null
          verification_document_url: string | null
          verification_documents: string[]
          verification_reason: string | null
          verification_reviewed_at: string | null
          verification_reviewed_by: string | null
          verification_status: string | null
          view_count: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "providers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      renew_location_share: {
        Args: { p_requester: string }
        Returns: undefined
      }
      request_location_share: { Args: { p_owner: string }; Returns: undefined }
      reschedule_appointment: {
        Args: {
          p_date_label: string
          p_notes?: string
          p_original_id: string
          p_package_id?: string
          p_package_name?: string
          p_package_price?: number
          p_photo_url?: string
          p_scheduled_for: string
          p_time_label: string
        }
        Returns: {
          cancelled_by: string | null
          created_at: string | null
          customer_avatar: string | null
          customer_name: string | null
          customer_user_id: string
          date_label: string | null
          id: string
          is_walk_in: boolean
          notes: string | null
          package_id: string | null
          package_name: string | null
          package_price: number | null
          payment_amount: number | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string
          photo_url: string | null
          rescheduled_from: string | null
          response_note: string | null
          scheduled_for: string
          status: string
          target_avatar: string | null
          target_id: string
          target_name: string | null
          target_owner_user_id: string
          target_type: string
          time_label: string | null
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reserve_catalog_item: { Args: { p_item_id: string }; Returns: undefined }
      resolve_admin_email: { Args: { p_login_id: string }; Returns: string }
      respond_location_share: {
        Args: { p_approve: boolean; p_requester: string }
        Returns: undefined
      }
      revoke_business_session: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      set_admin_login_id: { Args: { p_new_id: string }; Returns: undefined }
      set_business_login: {
        Args: {
          p_business_id: string
          p_enabled: boolean
          p_login_id: string
          p_password: string
          p_require_approval: boolean
          p_session_hours: number
        }
        Returns: undefined
      }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      start_live_share: {
        Args: { p_lat: number; p_lng: number }
        Returns: string
      }
      stop_live_share: { Args: never; Returns: undefined }
      suggest_business_login: {
        Args: { p_business_id: string }
        Returns: string
      }
      sweep_my_appointments: { Args: never; Returns: undefined }
      unlockrows: { Args: { "": string }; Returns: number }
      update_live_share: {
        Args: {
          p_accuracy?: number
          p_heading?: number
          p_lat: number
          p_lng: number
        }
        Returns: undefined
      }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
    }
    Enums: {
      agreement_status:
        | "PENDING"
        | "ACTIVE"
        | "COMPLETED"
        | "CANCELLED"
        | "DISPUTED"
        | "DEPOSIT_PAID"
        | "IN_PROGRESS"
        | "REVIEW"
      category_kind: "BUSINESS" | "SERVICE" | "BOTH"
      entity_status: "DRAFT" | "PENDING" | "ACTIVE" | "REJECTED" | "SUSPENDED"
      proposal_status: "SUBMITTED" | "ACCEPTED" | "REJECTED" | "WITHDRAWN"
      request_status:
        | "OPEN"
        | "IN_PROGRESS"
        | "AGREED"
        | "COMPLETED"
        | "CANCELLED"
        | "EXPIRED"
      stock_status: "IN_STOCK" | "OUT_OF_STOCK" | "LIMITED"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agreement_status: [
        "PENDING",
        "ACTIVE",
        "COMPLETED",
        "CANCELLED",
        "DISPUTED",
        "DEPOSIT_PAID",
        "IN_PROGRESS",
        "REVIEW",
      ],
      category_kind: ["BUSINESS", "SERVICE", "BOTH"],
      entity_status: ["DRAFT", "PENDING", "ACTIVE", "REJECTED", "SUSPENDED"],
      proposal_status: ["SUBMITTED", "ACCEPTED", "REJECTED", "WITHDRAWN"],
      request_status: [
        "OPEN",
        "IN_PROGRESS",
        "AGREED",
        "COMPLETED",
        "CANCELLED",
        "EXPIRED",
      ],
      stock_status: ["IN_STOCK", "OUT_OF_STOCK", "LIMITED"],
    },
  },
} as const
