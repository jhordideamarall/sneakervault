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
      activity_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_holder: string | null
          account_number: string | null
          bank_name: string | null
          created_at: string
          currency: string
          current_balance: number
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          notes: string | null
          opening_balance: number
          type: Database["public"]["Enums"]["bank_account_type"]
          updated_at: string
        }
        Insert: {
          account_holder?: string | null
          account_number?: string | null
          bank_name?: string | null
          created_at?: string
          currency?: string
          current_balance?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          notes?: string | null
          opening_balance?: number
          type: Database["public"]["Enums"]["bank_account_type"]
          updated_at?: string
        }
        Update: {
          account_holder?: string | null
          account_number?: string | null
          bank_name?: string | null
          created_at?: string
          currency?: string
          current_balance?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          notes?: string | null
          opening_balance?: number
          type?: Database["public"]["Enums"]["bank_account_type"]
          updated_at?: string
        }
        Relationships: []
      }
      bank_transactions: {
        Row: {
          amount: number
          balance_after: number | null
          bank_account_id: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          is_reconciled: boolean
          reconciled_at: string | null
          reconciled_by: string | null
          reference_no: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          transaction_date: string
          type: Database["public"]["Enums"]["bank_transaction_type"]
        }
        Insert: {
          amount: number
          balance_after?: number | null
          bank_account_id: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          is_reconciled?: boolean
          reconciled_at?: string | null
          reconciled_by?: string | null
          reference_no?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          transaction_date?: string
          type: Database["public"]["Enums"]["bank_transaction_type"]
        }
        Update: {
          amount?: number
          balance_after?: number | null
          bank_account_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          is_reconciled?: boolean
          reconciled_at?: string | null
          reconciled_by?: string | null
          reference_no?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          transaction_date?: string
          type?: Database["public"]["Enums"]["bank_transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_reconciled_by_fkey"
            columns: ["reconciled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          normal_balance: Database["public"]["Enums"]["coa_normal_balance"]
          parent_id: string | null
          type: Database["public"]["Enums"]["coa_type"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          normal_balance: Database["public"]["Enums"]["coa_normal_balance"]
          parent_id?: string | null
          type: Database["public"]["Enums"]["coa_type"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          normal_balance?: Database["public"]["Enums"]["coa_normal_balance"]
          parent_id?: string | null
          type?: Database["public"]["Enums"]["coa_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payment_allocations: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          payment_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          payment_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "customer_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payments: {
        Row: {
          amount: number
          attachment_url: string | null
          bank_account_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string
          id: string
          notes: string | null
          payment_date: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_number: string
          reference_no: string | null
        }
        Insert: {
          amount: number
          attachment_url?: string | null
          bank_account_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_number: string
          reference_no?: string | null
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          bank_account_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_number?: string
          reference_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_payments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          channel: Database["public"]["Enums"]["customer_channel"]
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          npwp: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          channel?: Database["public"]["Enums"]["customer_channel"]
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          npwp?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          channel?: Database["public"]["Enums"]["customer_channel"]
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          npwp?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      delete_requests: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["delete_entity_type"]
          id: string
          reason: string
          requested_by: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["delete_request_status"]
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["delete_entity_type"]
          id?: string
          reason: string
          requested_by: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["delete_request_status"]
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["delete_entity_type"]
          id?: string
          reason?: string
          requested_by?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["delete_request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "delete_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delete_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          account_code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          bank_account_id: string
          category_id: string
          created_at: string
          created_by: string | null
          description: string
          expense_date: string
          expense_number: string
          id: string
          paid_at: string | null
          paid_by: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          receipt_path: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["expense_status"]
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          bank_account_id: string
          category_id: string
          created_at?: string
          created_by?: string | null
          description: string
          expense_date: string
          expense_number: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          receipt_path?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          bank_account_id?: string
          category_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          expense_date?: string
          expense_number?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          receipt_path?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          month: number
          notes: string | null
          status: Database["public"]["Enums"]["fiscal_period_status"]
          year: number
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          month: number
          notes?: string | null
          status?: Database["public"]["Enums"]["fiscal_period_status"]
          year: number
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          month?: number
          notes?: string | null
          status?: Database["public"]["Enums"]["fiscal_period_status"]
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_periods_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_messages: {
        Row: {
          attachment_urls: string[] | null
          content: string
          created_at: string | null
          id: string
          is_read: boolean | null
          is_system: boolean
          metadata: Json | null
          parent_id: string | null
          receiver_id: string
          related_entity_id: string | null
          related_entity_type: string | null
          sender_id: string
          subject: string | null
        }
        Insert: {
          attachment_urls?: string[] | null
          content: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          is_system?: boolean
          metadata?: Json | null
          parent_id?: string | null
          receiver_id: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          sender_id: string
          subject?: string | null
        }
        Update: {
          attachment_urls?: string[] | null
          content?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          is_system?: boolean
          metadata?: Json | null
          parent_id?: string | null
          receiver_id?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          sender_id?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "internal_messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "internal_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          entry_date: string
          entry_number: string
          id: string
          notes: string | null
          reversed_by: string | null
          source_id: string | null
          source_type: Database["public"]["Enums"]["journal_source"]
          status: Database["public"]["Enums"]["journal_status"]
          total_credit: number
          total_debit: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          entry_date?: string
          entry_number: string
          id?: string
          notes?: string | null
          reversed_by?: string | null
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["journal_source"]
          status?: Database["public"]["Enums"]["journal_status"]
          total_credit?: number
          total_debit?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          entry_date?: string
          entry_number?: string
          id?: string
          notes?: string | null
          reversed_by?: string | null
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["journal_source"]
          status?: Database["public"]["Enums"]["journal_status"]
          total_credit?: number
          total_debit?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          credit: number
          debit: number
          description: string | null
          entry_id: string
          id: string
          line_order: number
        }
        Insert: {
          account_id: string
          credit?: number
          debit?: number
          description?: string | null
          entry_id: string
          id?: string
          line_order?: number
        }
        Update: {
          account_id?: string
          credit?: number
          debit?: number
          description?: string | null
          entry_id?: string
          id?: string
          line_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_imports: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          file_name: string | null
          id: string
          kind: string
          marketplace: Database["public"]["Enums"]["marketplace_type"]
          matched_count: number
          mismatch_count: number
          notes: string | null
          period_end: string
          period_start: string
          raw_file_url: string | null
          status: Database["public"]["Enums"]["marketplace_import_status"]
          total_fee: number
          total_gmv: number
          total_net: number
          total_orders: number
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          file_name?: string | null
          id?: string
          kind?: string
          marketplace: Database["public"]["Enums"]["marketplace_type"]
          matched_count?: number
          mismatch_count?: number
          notes?: string | null
          period_end: string
          period_start: string
          raw_file_url?: string | null
          status?: Database["public"]["Enums"]["marketplace_import_status"]
          total_fee?: number
          total_gmv?: number
          total_net?: number
          total_orders?: number
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          file_name?: string | null
          id?: string
          kind?: string
          marketplace?: Database["public"]["Enums"]["marketplace_type"]
          matched_count?: number
          mismatch_count?: number
          notes?: string | null
          period_end?: string
          period_start?: string
          raw_file_url?: string | null
          status?: Database["public"]["Enums"]["marketplace_import_status"]
          total_fee?: number
          total_gmv?: number
          total_net?: number
          total_orders?: number
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_imports_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_imports_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_sku_map: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          id: string
          marketplace_product_id: string | null
          marketplace_sku: string
          marketplace_variation_id: string | null
          product_id: string
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          created_by?: string | null
          id?: string
          marketplace_product_id?: string | null
          marketplace_sku: string
          marketplace_variation_id?: string | null
          product_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          marketplace_product_id?: string | null
          marketplace_sku?: string
          marketplace_variation_id?: string | null
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_sku_map_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          digest_mode: boolean | null
          muted_event_types: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          digest_mode?: boolean | null
          muted_event_types?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          digest_mode?: boolean | null
          muted_event_types?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_items: {
        Row: {
          barcode_scanned: string
          created_at: string
          id: string
          packing_session_id: string
          product_id: string
          sell_price: number
          unit_hpp: number
        }
        Insert: {
          barcode_scanned: string
          created_at?: string
          id?: string
          packing_session_id: string
          product_id: string
          sell_price?: number
          unit_hpp?: number
        }
        Update: {
          barcode_scanned?: string
          created_at?: string
          id?: string
          packing_session_id?: string
          product_id?: string
          sell_price?: number
          unit_hpp?: number
        }
        Relationships: [
          {
            foreignKeyName: "packing_items_packing_session_id_fkey"
            columns: ["packing_session_id"]
            isOneToOne: false
            referencedRelation: "packing_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_sessions: {
        Row: {
          completed_at: string | null
          courier: string
          courier_custom: string | null
          created_at: string
          created_by: string
          id: string
          packed_at: string | null
          packed_by: string
          platform: string
          platform_order_id: string | null
          returned_at: string | null
          shipped_at: string | null
          status: Database["public"]["Enums"]["session_status"]
          status_updated_by: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          courier: string
          courier_custom?: string | null
          created_at?: string
          created_by: string
          id?: string
          packed_at?: string | null
          packed_by: string
          platform: string
          platform_order_id?: string | null
          returned_at?: string | null
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          status_updated_by?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          courier?: string
          courier_custom?: string | null
          created_at?: string
          created_by?: string
          id?: string
          packed_at?: string | null
          packed_by?: string
          platform?: string
          platform_order_id?: string | null
          returned_at?: string | null
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          status_updated_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packing_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_sessions_packed_by_fkey"
            columns: ["packed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_sessions_status_updated_by_fkey"
            columns: ["status_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_condition_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_condition: Database["public"]["Enums"]["product_condition"]
          previous_condition:
            | Database["public"]["Enums"]["product_condition"]
            | null
          product_id: string
          reason: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_condition: Database["public"]["Enums"]["product_condition"]
          previous_condition?:
            | Database["public"]["Enums"]["product_condition"]
            | null
          product_id: string
          reason?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_condition?: Database["public"]["Enums"]["product_condition"]
          previous_condition?:
            | Database["public"]["Enums"]["product_condition"]
            | null
          product_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_condition_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_condition_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string
          brand: string
          color: string | null
          condition: Database["public"]["Enums"]["product_condition"]
          condition_updated_at: string | null
          condition_updated_by: string | null
          created_at: string
          default_supplier_id: string | null
          defect_reason: string | null
          first_inbound_at: string | null
          hpp: number
          id: string
          image_url: string | null
          is_active: boolean
          model: string
          price_offline: number
          price_shopee: number | null
          price_tiktok: number | null
          price_tokopedia: number | null
          price_website: number | null
          quantity: number
          sell_price: number
          size: number
          size_label: string
          sku: string
          updated_at: string
        }
        Insert: {
          barcode: string
          brand: string
          color?: string | null
          condition?: Database["public"]["Enums"]["product_condition"]
          condition_updated_at?: string | null
          condition_updated_by?: string | null
          created_at?: string
          default_supplier_id?: string | null
          defect_reason?: string | null
          first_inbound_at?: string | null
          hpp?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          model: string
          price_offline?: number
          price_shopee?: number | null
          price_tiktok?: number | null
          price_tokopedia?: number | null
          price_website?: number | null
          quantity?: number
          sell_price?: number
          size?: number
          size_label?: string
          sku: string
          updated_at?: string
        }
        Update: {
          barcode?: string
          brand?: string
          color?: string | null
          condition?: Database["public"]["Enums"]["product_condition"]
          condition_updated_at?: string | null
          condition_updated_by?: string | null
          created_at?: string
          default_supplier_id?: string | null
          defect_reason?: string | null
          first_inbound_at?: string | null
          hpp?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          model?: string
          price_offline?: number
          price_shopee?: number | null
          price_tiktok?: number | null
          price_tokopedia?: number | null
          price_website?: number | null
          quantity?: number
          sell_price?: number
          size?: number
          size_label?: string
          sku?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_condition_updated_by_fkey"
            columns: ["condition_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          roles: Database["public"]["Enums"]["user_role"][]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          roles?: Database["public"]["Enums"]["user_role"][]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          roles?: Database["public"]["Enums"]["user_role"][]
          updated_at?: string
        }
        Relationships: []
      }
      purchase_batches: {
        Row: {
          authenticity_confirmed: boolean
          brand: string
          created_at: string
          created_by: string | null
          defect_quantity: number
          id: string
          is_active: boolean
          model: string
          notes: string | null
          ordered_at: string
          product_id: string | null
          quantity: number
          received_at: string | null
          returned_to_supplier: number
          supplier_id: string
          unit_cost: number
        }
        Insert: {
          authenticity_confirmed?: boolean
          brand: string
          created_at?: string
          created_by?: string | null
          defect_quantity?: number
          id?: string
          is_active?: boolean
          model: string
          notes?: string | null
          ordered_at: string
          product_id?: string | null
          quantity: number
          received_at?: string | null
          returned_to_supplier?: number
          supplier_id: string
          unit_cost: number
        }
        Update: {
          authenticity_confirmed?: boolean
          brand?: string
          created_at?: string
          created_by?: string | null
          defect_quantity?: number
          id?: string
          is_active?: boolean
          model?: string
          notes?: string | null
          ordered_at?: string
          product_id?: string | null
          quantity?: number
          received_at?: string | null
          returned_to_supplier?: number
          supplier_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoices: {
        Row: {
          attachment_url: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string
          notes: string | null
          paid_amount: number
          po_id: string | null
          status: Database["public"]["Enums"]["purchase_invoice_status"]
          subtotal: number
          supplier_id: string
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number: string
          notes?: string | null
          paid_amount?: number
          po_id?: string | null
          status?: Database["public"]["Enums"]["purchase_invoice_status"]
          subtotal?: number
          supplier_id: string
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          paid_amount?: number
          po_id?: string | null
          status?: Database["public"]["Enums"]["purchase_invoice_status"]
          subtotal?: number
          supplier_id?: string
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_lines: {
        Row: {
          created_at: string
          id: string
          new_brand: string | null
          new_color: string | null
          new_model: string | null
          new_size: number | null
          new_sku: string | null
          notes: string | null
          ordered_qty: number
          po_id: string
          product_id: string | null
          received_qty: number
          subtotal: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          new_brand?: string | null
          new_color?: string | null
          new_model?: string | null
          new_size?: number | null
          new_sku?: string | null
          notes?: string | null
          ordered_qty: number
          po_id: string
          product_id?: string | null
          received_qty?: number
          subtotal?: number
          unit_cost: number
        }
        Update: {
          created_at?: string
          id?: string
          new_brand?: string | null
          new_color?: string | null
          new_model?: string | null
          new_size?: number | null
          new_sku?: string | null
          notes?: string | null
          ordered_qty?: number
          po_id?: string
          product_id?: string | null
          received_qty?: number
          subtotal?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          dp_amount: number
          dp_bank_account_id: string | null
          expected_date: string | null
          id: string
          notes: string | null
          order_date: string
          payment_type: string
          po_number: string
          shipping: number
          status: Database["public"]["Enums"]["po_status"]
          subtotal: number
          supplier_id: string
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          dp_amount?: number
          dp_bank_account_id?: string | null
          expected_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          payment_type?: string
          po_number: string
          shipping?: number
          status?: Database["public"]["Enums"]["po_status"]
          subtotal?: number
          supplier_id: string
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          dp_amount?: number
          dp_bank_account_id?: string | null
          expected_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          payment_type?: string
          po_number?: string
          shipping?: number
          status?: Database["public"]["Enums"]["po_status"]
          subtotal?: number
          supplier_id?: string
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_dp_bank_account_id_fkey"
            columns: ["dp_bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          created_at: string
          id: string
          new_product_id: string | null
          new_size: number | null
          original_product_id: string
          original_size: number
          packing_item_id: string
          processed_at: string | null
          processed_by: string | null
          reason: string
          status: Database["public"]["Enums"]["return_status"]
          type: Database["public"]["Enums"]["return_type"]
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          new_product_id?: string | null
          new_size?: number | null
          original_product_id: string
          original_size: number
          packing_item_id: string
          processed_at?: string | null
          processed_by?: string | null
          reason: string
          status?: Database["public"]["Enums"]["return_status"]
          type: Database["public"]["Enums"]["return_type"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          new_product_id?: string | null
          new_size?: number | null
          original_product_id?: string
          original_size?: number
          packing_item_id?: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string
          status?: Database["public"]["Enums"]["return_status"]
          type?: Database["public"]["Enums"]["return_type"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "returns_new_product_id_fkey"
            columns: ["new_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_original_product_id_fkey"
            columns: ["original_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_packing_item_id_fkey"
            columns: ["packing_item_id"]
            isOneToOne: false
            referencedRelation: "packing_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_invoice_lines: {
        Row: {
          created_at: string
          id: string
          invoice_id: string
          notes: string | null
          product_id: string | null
          product_label: string
          qty: number
          subtotal: number
          unit_cost: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_id: string
          notes?: string | null
          product_id?: string | null
          product_label: string
          qty: number
          subtotal?: number
          unit_cost?: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          invoice_id?: string
          notes?: string | null
          product_id?: string | null
          product_label?: string
          qty?: number
          subtotal?: number
          unit_cost?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoice_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_invoices: {
        Row: {
          channel: Database["public"]["Enums"]["customer_channel"]
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string
          discount: number
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string
          marketplace_fee: number
          marketplace_order_id: string | null
          notes: string | null
          paid_amount: number
          settled_at: string | null
          settlement_fee_actual: number | null
          settlement_net: number | null
          settlement_ref: string | null
          settlement_status: string
          shipping: number
          status: Database["public"]["Enums"]["sales_invoice_status"]
          subtotal: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["customer_channel"]
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name: string
          discount?: number
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number: string
          marketplace_fee?: number
          marketplace_order_id?: string | null
          notes?: string | null
          paid_amount?: number
          settled_at?: string | null
          settlement_fee_actual?: number | null
          settlement_net?: number | null
          settlement_ref?: string | null
          settlement_status?: string
          shipping?: number
          status?: Database["public"]["Enums"]["sales_invoice_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["customer_channel"]
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string
          discount?: number
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          marketplace_fee?: number
          marketplace_order_id?: string | null
          notes?: string | null
          paid_amount?: number
          settled_at?: string | null
          settlement_fee_actual?: number | null
          settlement_net?: number | null
          settlement_ref?: string | null
          settlement_status?: string
          shipping?: number
          status?: Database["public"]["Enums"]["sales_invoice_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          performed_by: string | null
          product_id: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
          type: Database["public"]["Enums"]["stock_movement_type"]
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          performed_by?: string | null
          product_id: string
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          type: Database["public"]["Enums"]["stock_movement_type"]
          unit_cost?: number
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          performed_by?: string | null
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          type?: Database["public"]["Enums"]["stock_movement_type"]
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_opname_lines: {
        Row: {
          counted_at: string | null
          counted_by: string | null
          created_at: string
          id: string
          physical_qty: number | null
          product_id: string
          reason: string | null
          session_id: string
          system_qty: number
          unit_cost: number
          updated_at: string
          variance: number | null
        }
        Insert: {
          counted_at?: string | null
          counted_by?: string | null
          created_at?: string
          id?: string
          physical_qty?: number | null
          product_id: string
          reason?: string | null
          session_id: string
          system_qty: number
          unit_cost?: number
          updated_at?: string
          variance?: number | null
        }
        Update: {
          counted_at?: string | null
          counted_by?: string | null
          created_at?: string
          id?: string
          physical_qty?: number | null
          product_id?: string
          reason?: string | null
          session_id?: string
          system_qty?: number
          unit_cost?: number
          updated_at?: string
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_opname_lines_counted_by_fkey"
            columns: ["counted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_opname_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_opname_lines_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "stock_opname_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_opname_sessions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          id: string
          notes: string | null
          opname_date: string
          opname_number: string
          reviewed_at: string | null
          reviewed_by: string | null
          scope: string
          started_by: string | null
          status: Database["public"]["Enums"]["stock_opname_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          opname_date?: string
          opname_number: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          scope?: string
          started_by?: string | null
          status?: Database["public"]["Enums"]["stock_opname_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          opname_date?: string
          opname_number?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          scope?: string
          started_by?: string | null
          status?: Database["public"]["Enums"]["stock_opname_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_opname_sessions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_opname_sessions_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_opname_sessions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_opname_sessions_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      vendor_payment_allocations: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          payment_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          payment_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "vendor_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_payments: {
        Row: {
          amount: number
          attachment_url: string | null
          bank_account_id: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_number: string
          reference_no: string | null
          supplier_id: string
        }
        Insert: {
          amount: number
          attachment_url?: string | null
          bank_account_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_number: string
          reference_no?: string | null
          supplier_id: string
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          bank_account_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_number?: string
          reference_no?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vp_bank_account_fk"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      app_post_journal: {
        Args: {
          p_description: string
          p_entry_date: string
          p_lines: Json
          p_source_id: string
          p_source_type: Database["public"]["Enums"]["journal_source"]
          p_user_id: string
        }
        Returns: string
      }
      bootstrap_employee_role: {
        Args: {
          p_email: string
          p_role: Database["public"]["Enums"]["user_role"]
        }
        Returns: undefined
      }
      bootstrap_first_owner: { Args: { p_email: string }; Returns: undefined }
      cleanup_old_chat_attachments: { Args: never; Returns: undefined }
      create_stock_movement: {
        Args: {
          p_notes?: string
          p_product_id: string
          p_quantity: number
          p_reference_id?: string
          p_reference_type?: string
          p_type: Database["public"]["Enums"]["stock_movement_type"]
          p_unit_cost?: number
        }
        Returns: string
      }
      create_system_notification: {
        Args: {
          p_content: string
          p_metadata?: Json
          p_receiver_id: string
          p_related_entity_id?: string
          p_related_entity_type?: string
          p_subject?: string
        }
        Returns: string
      }
      decrement_product_quantity: {
        Args: { p_id: string; qty: number }
        Returns: boolean
      }
      generate_customer_payment_number: { Args: never; Returns: string }
      generate_expense_number: { Args: never; Returns: string }
      generate_journal_entry_number: { Args: never; Returns: string }
      generate_opname_number: { Args: never; Returns: string }
      generate_po_number: { Args: never; Returns: string }
      generate_purchase_invoice_number: { Args: never; Returns: string }
      generate_sales_invoice_number: { Args: never; Returns: string }
      generate_vendor_payment_number: { Args: never; Returns: string }
      get_my_roles: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"][]
      }
      get_account_balances: {
        Args: { p_from?: string | null; p_to?: string | null }
        Returns: {
          account_id: string
          balance: number
          code: string
          name: string
          normal_balance: string
          parent_id: string | null
          total_credit: number
          total_debit: number
          type: string
        }[]
      }
      get_account_ledger: {
        Args: {
          p_account_id: string
          p_from?: string | null
          p_to?: string | null
        }
        Returns: {
          account_code: string
          account_description: string | null
          account_id: string
          account_is_active: boolean
          account_is_system: boolean
          account_name: string
          account_normal_balance: string
          account_parent_id: string | null
          account_type: string
          closing_balance: number
          credit: number | null
          debit: number | null
          description: string | null
          entry_date: string | null
          entry_id: string | null
          entry_number: string | null
          line_description: string | null
          line_id: string | null
          opening_balance: number
          running_balance: number | null
          source_id: string | null
          source_type: string | null
          status: string | null
          total_credit: number
          total_debit: number
        }[]
      }
      get_purchase_order_list: {
        Args: {
          p_limit?: number
          p_status?: string | null
          p_supplier_id?: string | null
        }
        Returns: {
          created_at: string
          expected_date: string | null
          id: string
          line_count: number
          order_date: string
          po_number: string
          status: string
          supplier_id: string
          supplier_name: string
          total: number
        }[]
      }
      get_receivable_purchase_orders: {
        Args: never
        Returns: {
          expected_date: string | null
          id: string
          order_date: string
          po_number: string
          status: string
          supplier_name: string
          total: number
          total_ordered: number
          total_received: number
          total_remaining: number
        }[]
      }
      get_sales_invoice_list: {
        Args: { p_limit?: number }
        Returns: {
          channel: string
          created_at: string
          customer_id: string | null
          customer_name: string
          discount: number
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string
          line_count: number
          marketplace_fee: number
          marketplace_order_id: string | null
          notes: string | null
          paid_amount: number
          shipping: number
          status: string
          subtotal: number
          tax: number
          total: number
        }[]
      }
      get_inventory_page: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string | null }
        Returns: {
          barcode: string
          brand: string
          color: string | null
          condition: Database["public"]["Enums"]["product_condition"]
          created_at: string
          defect_reason: string | null
          dormant_qty: number
          first_inbound_at: string | null
          hpp: number
          id: string
          image_url: string | null
          is_active: boolean
          model: string
          normal_qty: number
          price_offline: number
          quantity: number
          sell_price: number
          size: number
          size_label: string
          sku: string
          supplier_name: string | null
          total_models: number
          total_qty: number
          total_sku: number
        }[]
      }
      get_inventory_summary: {
        Args: { p_search?: string | null }
        Returns: {
          defect_qty: number
          dormant_qty: number
          normal_qty: number
          total_models: number
          total_qty: number
          total_sku: number
        }[]
      }
      has_any_role: {
        Args: { required: Database["public"]["Enums"]["user_role"][] }
        Returns: boolean
      }
      has_role: {
        Args: { required: Database["public"]["Enums"]["user_role"] }
        Returns: boolean
      }
      import_marketplace_order_atomic: {
        Args: { p_payload: Json }
        Returns: Json
      }
      increment_product_quantity: {
        Args: { p_id: string; qty: number }
        Returns: undefined
      }
      pos_checkout: { Args: { p_payload: Json }; Returns: Json }
      recalculate_hpp_by_model:
        | { Args: { p_brand: string; p_model: string }; Returns: undefined }
        | {
            Args: {
              p_brand: string
              p_model: string
              p_new_qty: number
              p_new_unit_cost: number
            }
            Returns: undefined
          }
      recalculate_hpp_by_sku: {
        Args: {
          p_new_qty: number
          p_new_unit_cost: number
          p_product_id: string
        }
        Returns: undefined
      }
      search_products_fuzzy: {
        Args: { p_limit?: number; p_query: string; p_threshold?: number }
        Returns: {
          barcode: string
          brand: string
          color: string
          condition: Database["public"]["Enums"]["product_condition"]
          hpp: number
          id: string
          image_url: string
          model: string
          price_offline: number
          quantity: number
          sell_price: number
          similarity: number
          size: number
          sku: string
        }[]
      }
      settle_marketplace_atomic: { Args: { p_payload: Json }; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      update_product_condition: {
        Args: {
          p_new_condition: Database["public"]["Enums"]["product_condition"]
          p_product_id: string
          p_reason?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      bank_account_type: "cash" | "bank" | "ewallet" | "marketplace_balance"
      bank_transaction_type: "debit" | "credit"
      coa_normal_balance: "debit" | "credit"
      coa_type:
        | "asset"
        | "liability"
        | "equity"
        | "revenue"
        | "expense"
        | "cogs"
      customer_channel:
        | "wa"
        | "shopee"
        | "tiktok"
        | "offline"
        | "website"
        | "mixed"
        | "tokopedia"
      delete_entity_type:
        | "product"
        | "packing_session"
        | "stock_movement"
        | "purchase_batch"
      delete_request_status: "pending" | "approved" | "rejected"
      expense_status: "draft" | "approved" | "paid" | "rejected" | "voided"
      fiscal_period_status: "open" | "closed"
      journal_source:
        | "manual"
        | "purchase_invoice"
        | "vendor_payment"
        | "sales_invoice"
        | "customer_payment"
        | "stock_adjustment"
        | "opening_balance"
        | "closing"
        | "other"
        | "expense"
      journal_status: "draft" | "posted" | "reversed"
      marketplace_import_status:
        | "uploaded"
        | "parsed"
        | "confirmed"
        | "cancelled"
      marketplace_type: "shopee" | "tiktok" | "tokopedia" | "lazada" | "other"
      payment_method: "cash" | "bank_transfer" | "marketplace" | "other"
      po_status: "draft" | "approved" | "receiving" | "completed" | "cancelled"
      product_condition: "normal" | "defect" | "dormant"
      purchase_invoice_status: "unpaid" | "partial" | "paid" | "cancelled"
      return_status: "pending" | "verified" | "processed" | "cancelled"
      return_type: "exchange_size" | "refund"
      sales_invoice_status:
        | "draft"
        | "issued"
        | "partial"
        | "paid"
        | "cancelled"
      session_status:
        | "packing"
        | "shipped"
        | "completed"
        | "has_return"
        | "cancelled"
      stock_movement_type:
        | "inbound"
        | "outbound"
        | "return_in"
        | "return_out"
        | "adjustment"
      stock_opname_status:
        | "open"
        | "counting"
        | "review"
        | "approved"
        | "cancelled"
      user_role:
        | "owner"
        | "admin_gudang"
        | "admin_online"
        | "shopkeeper"
        | "finance"
    }
    CompositeTypes: {
      [_ in never]: never
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
      bank_account_type: ["cash", "bank", "ewallet", "marketplace_balance"],
      bank_transaction_type: ["debit", "credit"],
      coa_normal_balance: ["debit", "credit"],
      coa_type: ["asset", "liability", "equity", "revenue", "expense", "cogs"],
      customer_channel: [
        "wa",
        "shopee",
        "tiktok",
        "offline",
        "website",
        "mixed",
        "tokopedia",
      ],
      delete_entity_type: [
        "product",
        "packing_session",
        "stock_movement",
        "purchase_batch",
      ],
      delete_request_status: ["pending", "approved", "rejected"],
      expense_status: ["draft", "approved", "paid", "rejected", "voided"],
      fiscal_period_status: ["open", "closed"],
      journal_source: [
        "manual",
        "purchase_invoice",
        "vendor_payment",
        "sales_invoice",
        "customer_payment",
        "stock_adjustment",
        "opening_balance",
        "closing",
        "other",
        "expense",
      ],
      journal_status: ["draft", "posted", "reversed"],
      marketplace_import_status: [
        "uploaded",
        "parsed",
        "confirmed",
        "cancelled",
      ],
      marketplace_type: ["shopee", "tiktok", "tokopedia", "lazada", "other"],
      payment_method: ["cash", "bank_transfer", "marketplace", "other"],
      po_status: ["draft", "approved", "receiving", "completed", "cancelled"],
      product_condition: ["normal", "defect", "dormant"],
      purchase_invoice_status: ["unpaid", "partial", "paid", "cancelled"],
      return_status: ["pending", "verified", "processed", "cancelled"],
      return_type: ["exchange_size", "refund"],
      sales_invoice_status: ["draft", "issued", "partial", "paid", "cancelled"],
      session_status: [
        "packing",
        "shipped",
        "completed",
        "has_return",
        "cancelled",
      ],
      stock_movement_type: [
        "inbound",
        "outbound",
        "return_in",
        "return_out",
        "adjustment",
      ],
      stock_opname_status: [
        "open",
        "counting",
        "review",
        "approved",
        "cancelled",
      ],
      user_role: [
        "owner",
        "admin_gudang",
        "admin_online",
        "shopkeeper",
        "finance",
      ],
    },
  },
} as const
