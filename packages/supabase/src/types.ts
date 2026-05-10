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
          entity_id: string
          entity_type: Database["public"]["Enums"]["delete_entity_type"]
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
      internal_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_read: boolean | null
          receiver_id: string
          related_entity_id: string | null
          related_entity_type: string | null
          sender_id: string
          subject: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          receiver_id: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          sender_id: string
          subject?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          receiver_id?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          sender_id?: string
          subject?: string | null
        }
        Relationships: [
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
      products: {
        Row: {
          barcode: string
          brand: string
          color: string | null
          created_at: string
          default_supplier_id: string | null
          first_inbound_at: string | null
          hpp: number
          id: string
          image_url: string | null
          is_active: boolean
          model: string
          quantity: number
          sell_price: number
          size: number
          sku: string
          updated_at: string
        }
        Insert: {
          barcode: string
          brand: string
          color?: string | null
          created_at?: string
          default_supplier_id?: string | null
          first_inbound_at?: string | null
          hpp?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          model: string
          quantity?: number
          sell_price?: number
          size: number
          sku: string
          updated_at?: string
        }
        Update: {
          barcode?: string
          brand?: string
          color?: string | null
          created_at?: string
          default_supplier_id?: string | null
          first_inbound_at?: string | null
          hpp?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          model?: string
          quantity?: number
          sell_price?: number
          size?: number
          sku?: string
          updated_at?: string
        }
        Relationships: [
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
          type?: Database["public"]["Enums"]["return_type"]
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
          type: Database["public"]["Enums"]["stock_movement_type"]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bootstrap_employee_role: {
        Args: {
          p_email: string
          p_role: Database["public"]["Enums"]["user_role"]
        }
        Returns: undefined
      }
      bootstrap_first_owner: { Args: { p_email: string }; Returns: undefined }
      decrement_product_quantity: {
        Args: { p_id: string; qty: number }
        Returns: boolean
      }
      get_my_roles: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"][]
      }
      has_any_role: {
        Args: { required: Database["public"]["Enums"]["user_role"][] }
        Returns: boolean
      }
      has_role: {
        Args: { required: Database["public"]["Enums"]["user_role"] }
        Returns: boolean
      }
      increment_product_quantity: {
        Args: { p_id: string; qty: number }
        Returns: undefined
      }
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
    }
    Enums: {
      delete_entity_type:
        | "product"
        | "packing_session"
        | "stock_movement"
        | "purchase_batch"
      delete_request_status: "pending" | "approved" | "rejected"
      return_status: "pending" | "verified" | "processed" | "cancelled"
      return_type: "exchange_size" | "refund"
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
      user_role: "owner" | "admin_gudang" | "admin_online" | "shopkeeper"
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
      delete_entity_type: [
        "product",
        "packing_session",
        "stock_movement",
        "purchase_batch",
      ],
      delete_request_status: ["pending", "approved", "rejected"],
      return_status: ["pending", "verified", "processed", "cancelled"],
      return_type: ["exchange_size", "refund"],
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
      user_role: ["owner", "admin_gudang", "admin_online", "shopkeeper"],
    },
  },
} as const
