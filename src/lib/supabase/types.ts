export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

/**
 * Hand-maintained mirror of the SQL schema in supabase/migrations/.
 * Keep in sync manually when a migration changes columns.
 *
 * Two things that were wrong before and are worth not regressing:
 *  1. Every table needs a `Relationships` key. Without it the table does
 *     not satisfy supabase-js's `GenericTable`, `from()` resolves to
 *     `never`, and callers are forced into `as any` — which is exactly
 *     what the codebase had done everywhere.
 *  2. `customers` was missing full_name / email / passport_number even
 *     though the app writes all three.
 */
export interface Database {
  public: {
    Tables: {
      locations: {
        Row: {
          id: string;
          name: string;
          code: string;
          is_airport: boolean;
          dropoff_surcharge_usd: number;
          pickup_surcharge_usd: number;
          requires_stripe: boolean;
          allows_cash: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['locations']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['locations']['Insert']>;
        Relationships: [];
      };
      time_slots: {
        Row: {
          id: string;
          label: string;
          start_time: string;
          end_time: string;
          slot_type: 'window' | 'hourly';
          day_of_week: string;
          specific_date: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['time_slots']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['time_slots']['Insert']>;
        Relationships: [];
      };
      item_tiers: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string;
          supported_items: string;
          weight_spec: string | null;
          icon_emoji: string;
          /** Added in migration 005 — was previously a hardcoded client map. */
          image_url: string | null;
          rate_daily_usd: number;
          /** Per-day rate applied to ALL days once a booking exceeds the
           *  `week_threshold_days` app setting (default 7). */
          rate_weekly_usd: number;
          insurance_fee_usd: number;
          is_active: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['item_tiers']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['item_tiers']['Insert']>;
        Relationships: [];
      };
      addon_services: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string;
          fee_usd: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['addon_services']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['addon_services']['Insert']>;
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          phone: string;
          full_name: string | null;
          /** Required since migration 008 — the email-OTP gate needs somewhere to send codes. */
          email: string;
          passport_number: string | null;
          verified_at: string | null;
          created_at: string;
        };
        Insert: Partial<Omit<Database['public']['Tables']['customers']['Row'], 'id' | 'created_at'>> &
          Pick<Database['public']['Tables']['customers']['Row'], 'phone' | 'email'> & { id?: string };
        Update: Partial<Database['public']['Tables']['customers']['Insert']>;
        Relationships: [];
      };
      bookings: {
        Row: {
          id: string;
          customer_id: string;
          dropoff_location_id: string;
          pickup_location_id: string;
          duration_unit: 'hours' | 'days';
          duration_value: number;
          dropoff_time: string | null;
          pickup_time: string | null;
          storage_start_date: string;
          storage_end_date: string;
          item_total_usd: number;
          dropoff_surcharge_usd: number;
          pickup_surcharge_usd: number;
          insurance_total_usd: number;
          grand_total_usd: number;
          payment_method: 'cash' | 'stripe_simulated';
          payment_status: 'pending' | 'partially_paid' | 'paid' | 'failed';
          booking_status: 'confirmed' | 'in_transit' | 'deposited' | 'picked_up' | 'cancelled';
          qr_code_token: string;
          /** Added in migration 006 — was previously overloaded into `notes`. */
          flight_number: string | null;
          notes: string | null;
          /** Added in migration 006 — who/when a cash payment was physically collected. */
          cash_collected_by: string | null;
          cash_collected_at: string | null;
          /** Added in migration 004 — previously computed but never persisted. */
          insurance_enabled: boolean;
          duration_days: number | null;
          cancelled_at: string | null;
          cancel_reason: string | null;
          /** Dedupes double-submits of the booking form. */
          idempotency_key: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<
          Omit<Database['public']['Tables']['bookings']['Row'], 'id' | 'created_at' | 'updated_at' | 'qr_code_token'>
        > &
          Pick<
            Database['public']['Tables']['bookings']['Row'],
            | 'customer_id'
            | 'dropoff_location_id'
            | 'pickup_location_id'
            | 'storage_start_date'
            | 'storage_end_date'
            | 'payment_method'
          > & { id?: string };
        Update: Partial<Database['public']['Tables']['bookings']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'bookings_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_dropoff_location_id_fkey';
            columns: ['dropoff_location_id'];
            isOneToOne: false;
            referencedRelation: 'locations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_pickup_location_id_fkey';
            columns: ['pickup_location_id'];
            isOneToOne: false;
            referencedRelation: 'locations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_cash_collected_by_fkey';
            columns: ['cash_collected_by'];
            isOneToOne: false;
            referencedRelation: 'staff';
            referencedColumns: ['user_id'];
          },
        ];
      };
      booking_items: {
        Row: {
          id: string;
          booking_id: string;
          tier_id: string;
          quantity: number;
          unit_rate_usd: number;
          line_total_usd: number;
        };
        Insert: Omit<Database['public']['Tables']['booking_items']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['booking_items']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'booking_items_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'booking_items_tier_id_fkey';
            columns: ['tier_id'];
            isOneToOne: false;
            referencedRelation: 'item_tiers';
            referencedColumns: ['id'];
          },
        ];
      };
      booking_addons: {
        Row: {
          id: string;
          booking_id: string;
          addon_id: string;
          fee_usd: number;
        };
        Insert: Omit<Database['public']['Tables']['booking_addons']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['booking_addons']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'booking_addons_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'booking_addons_addon_id_fkey';
            columns: ['addon_id'];
            isOneToOne: false;
            referencedRelation: 'addon_services';
            referencedColumns: ['id'];
          },
        ];
      };
      staff: {
        Row: {
          id: string;
          user_id: string;
          role: 'staff' | 'superadmin';
          full_name: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['staff']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['staff']['Insert']>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          booking_id: string;
          amount_usd: number;
          method: 'cash' | 'stripe';
          status: 'pending' | 'succeeded' | 'failed' | 'refunded';
          stripe_session_id: string | null;
          stripe_payment_intent_id: string | null;
          collected_by: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['payments']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['payments']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'payments_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payments_collected_by_fkey';
            columns: ['collected_by'];
            isOneToOne: false;
            referencedRelation: 'staff';
            referencedColumns: ['user_id'];
          },
        ];
      };
      email_log: {
        Row: {
          id: string;
          booking_id: string | null;
          to_email: string;
          template: string;
          provider: string;
          status: 'sent' | 'failed';
          error: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['email_log']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: never;
        Relationships: [];
      };
      otp_verifications: {
        Row: {
          id: string;
          email: string;
          purpose: 'booking_create' | 'booking_lookup';
          code_hash: string;
          expires_at: string;
          attempts: number;
          max_attempts: number;
          verified_at: string | null;
          used_at: string | null;
          customer_id: string | null;
          request_ip: string | null;
          created_at: string;
        };
        Insert: Partial<Omit<Database['public']['Tables']['otp_verifications']['Row'], 'id' | 'created_at'>> &
          Pick<Database['public']['Tables']['otp_verifications']['Row'], 'email' | 'purpose' | 'code_hash' | 'expires_at'> & {
            id?: string;
          };
        Update: Partial<Database['public']['Tables']['otp_verifications']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'otp_verifications_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_log: {
        Row: {
          id: string;
          table_name: string;
          record_id: string;
          action: 'INSERT' | 'UPDATE' | 'DELETE';
          actor_id: string | null;
          /** Added in 004 — readable actor + summary for the admin panel. */
          actor_email: string | null;
          summary: string | null;
          old_values: Json | null;
          new_values: Json | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['audit_log']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: never;
        Relationships: [];
      };
      /**
       * Dynamic, admin-editable configuration (migration 004).
       * `value` is jsonb so a setting can be number | boolean | string | object.
       * Defaults live in src/lib/settings.ts — keep the two in sync.
       */
      app_settings: {
        Row: {
          key: string;
          value: Json;
          value_type: 'number' | 'boolean' | 'string' | 'json';
          label: string;
          description: string | null;
          category: string;
          min_value: number | null;
          max_value: number | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['app_settings']['Row'], 'updated_at'> & { updated_at?: string };
        Update: Partial<Database['public']['Tables']['app_settings']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

/** Convenience row aliases. */
export type LocationRow = Database['public']['Tables']['locations']['Row'];
export type ItemTierRow = Database['public']['Tables']['item_tiers']['Row'];
export type AddonRow = Database['public']['Tables']['addon_services']['Row'];
export type TimeSlotRow = Database['public']['Tables']['time_slots']['Row'];
export type BookingRow = Database['public']['Tables']['bookings']['Row'];
export type BookingItemRow = Database['public']['Tables']['booking_items']['Row'];
export type CustomerRow = Database['public']['Tables']['customers']['Row'];
export type AuditLogRow = Database['public']['Tables']['audit_log']['Row'];
export type AppSettingRow = Database['public']['Tables']['app_settings']['Row'];
export type PaymentRow = Database['public']['Tables']['payments']['Row'];
export type EmailLogRow = Database['public']['Tables']['email_log']['Row'];
