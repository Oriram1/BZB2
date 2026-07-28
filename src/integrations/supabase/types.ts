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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          details: Json | null
          id: string
          success: boolean
          target_identifier: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          details?: Json | null
          id?: string
          success?: boolean
          target_identifier?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          success?: boolean
          target_identifier?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          participant_1: string
          participant_2: string
          task_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          participant_1: string
          participant_2: string
          task_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          participant_1?: string
          participant_2?: string
          task_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          read: boolean
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          read?: boolean
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          read?: boolean
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
        ]
      }
      parent_links: {
        Row: {
          child_user_id: string
          created_at: string
          id: string
          parent_user_id: string
        }
        Insert: {
          child_user_id: string
          created_at?: string
          id?: string
          parent_user_id: string
        }
        Update: {
          child_user_id?: string
          created_at?: string
          id?: string
          parent_user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          age: number | null
          avatar_url: string | null
          created_at: string
          first_name: string
          id: string
          last_name: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          age?: number | null
          avatar_url?: string | null
          created_at?: string
          first_name?: string
          id?: string
          last_name?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          age?: number | null
          avatar_url?: string | null
          created_at?: string
          first_name?: string
          id?: string
          last_name?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      task_applications: {
        Row: {
          applicant_id: string
          created_at: string
          id: string
          message: string | null
          status: Database["public"]["Enums"]["application_status"]
          task_id: string
          updated_at: string
        }
        Insert: {
          applicant_id: string
          created_at?: string
          id?: string
          message?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          task_id: string
          updated_at?: string
        }
        Update: {
          applicant_id?: string
          created_at?: string
          id?: string
          message?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_applications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          category: Database["public"]["Enums"]["task_category"]
          created_at: string
          creator_id: string
          duration_hours: number | null
          expiry_hours: number
          full_desc: string | null
          id: string
          image_url: string | null
          latitude: number | null
          location: string | null
          longitude: number | null
          name: string
          notes: string | null
          payment: number
          payment_type: Database["public"]["Enums"]["payment_type"]
          scheduled_date: string | null
          scheduled_time: string | null
          short_desc: string
          status: Database["public"]["Enums"]["task_status"]
          updated_at: string
          views_count: number
          workers_needed: number
        }
        Insert: {
          category?: Database["public"]["Enums"]["task_category"]
          created_at?: string
          creator_id: string
          duration_hours?: number | null
          expiry_hours?: number
          full_desc?: string | null
          id?: string
          image_url?: string | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name: string
          notes?: string | null
          payment?: number
          payment_type?: Database["public"]["Enums"]["payment_type"]
          scheduled_date?: string | null
          scheduled_time?: string | null
          short_desc: string
          status?: Database["public"]["Enums"]["task_status"]
          updated_at?: string
          views_count?: number
          workers_needed?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["task_category"]
          created_at?: string
          creator_id?: string
          duration_hours?: number | null
          expiry_hours?: number
          full_desc?: string | null
          id?: string
          image_url?: string | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name?: string
          notes?: string | null
          payment?: number
          payment_type?: Database["public"]["Enums"]["payment_type"]
          scheduled_date?: string | null
          scheduled_time?: string | null
          short_desc?: string
          status?: Database["public"]["Enums"]["task_status"]
          updated_at?: string
          views_count?: number
          workers_needed?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "tasker" | "bee" | "parent" | "admin"
      application_status: "pending" | "accepted" | "rejected"
      payment_type: "task" | "hour"
      task_category:
        | "housework"
        | "handyman"
        | "tutoring"
        | "babysitting"
        | "pets"
        | "gardening"
        | "other"
      task_status:
        | "open"
        | "accepted"
        | "in_progress"
        | "completed"
        | "cancelled"
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
      app_role: ["tasker", "bee", "parent", "admin"],
      application_status: ["pending", "accepted", "rejected"],
      payment_type: ["task", "hour"],
      task_category: [
        "housework",
        "handyman",
        "tutoring",
        "babysitting",
        "pets",
        "gardening",
        "other",
      ],
      task_status: [
        "open",
        "accepted",
        "in_progress",
        "completed",
        "cancelled",
      ],
    },
  },
} as const
