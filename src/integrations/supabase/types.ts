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
    PostgrestVersion: "14.15"
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
      archived_records: {
        Row: {
          archived_at: string
          archived_by: string | null
          id: string
          record_data: Json
          record_id: string
          table_name: string
        }
        Insert: {
          archived_at?: string
          archived_by?: string | null
          id?: string
          record_data: Json
          record_id: string
          table_name: string
        }
        Update: {
          archived_at?: string
          archived_by?: string | null
          id?: string
          record_data?: Json
          record_id?: string
          table_name?: string
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
      family_link_attempts: {
        Row: {
          attempted_at: string
          id: number
          parent_user_id: string
          success: boolean
        }
        Insert: {
          attempted_at?: string
          id?: never
          parent_user_id: string
          success?: boolean
        }
        Update: {
          attempted_at?: string
          id?: never
          parent_user_id?: string
          success?: boolean
        }
        Relationships: []
      }
      family_link_codes: {
        Row: {
          child_user_id: string
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          used_at: string | null
        }
        Insert: {
          child_user_id: string
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          used_at?: string | null
        }
        Update: {
          child_user_id?: string
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          used_at?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          attachment_duration: number | null
          attachment_path: string | null
          attachment_type: string | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          read: boolean
          sender_id: string
        }
        Insert: {
          attachment_duration?: number | null
          attachment_path?: string | null
          attachment_type?: string | null
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          read?: boolean
          sender_id: string
        }
        Update: {
          attachment_duration?: number | null
          attachment_path?: string | null
          attachment_type?: string | null
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
      notification_deliveries: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          error: string | null
          id: string
          notification_id: string
          status: Database["public"]["Enums"]["delivery_status"]
          user_id: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          error?: string | null
          id?: string
          notification_id: string
          status: Database["public"]["Enums"]["delivery_status"]
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          error?: string | null
          id?: string
          notification_id?: string
          status?: Database["public"]["Enums"]["delivery_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          email_enabled: boolean
          event_type: Database["public"]["Enums"]["notification_event"]
          id: string
          push_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          email_enabled?: boolean
          event_type: Database["public"]["Enums"]["notification_event"]
          id?: string
          push_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          email_enabled?: boolean
          event_type?: Database["public"]["Enums"]["notification_event"]
          id?: string
          push_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          digest_hour: number
          quiet_hours_enabled: boolean
          quiet_hours_end: number
          quiet_hours_start: number
          updated_at: string
          user_id: string
        }
        Insert: {
          digest_hour?: number
          quiet_hours_enabled?: boolean
          quiet_hours_end?: number
          quiet_hours_start?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          digest_hour?: number
          quiet_hours_enabled?: boolean
          quiet_hours_end?: number
          quiet_hours_start?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          data: Json
          event_type: Database["public"]["Enums"]["notification_event"]
          id: string
          link: string | null
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          event_type: Database["public"]["Enums"]["notification_event"]
          id?: string
          link?: string | null
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          event_type?: Database["public"]["Enums"]["notification_event"]
          id?: string
          link?: string | null
          read_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      parent_contacts: {
        Row: {
          child_user_id: string
          created_at: string
          email: string
          id: string
          last_notified_at: string | null
          view_token: string
        }
        Insert: {
          child_user_id: string
          created_at?: string
          email: string
          id?: string
          last_notified_at?: string | null
          view_token?: string
        }
        Update: {
          child_user_id?: string
          created_at?: string
          email?: string
          id?: string
          last_notified_at?: string | null
          view_token?: string
        }
        Relationships: []
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
          gender: Database["public"]["Enums"]["gender"]
          id: string
          last_active_at: string | null
          last_name: string
          latitude: number | null
          longitude: number | null
          marketing_consent: boolean
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
          gender?: Database["public"]["Enums"]["gender"]
          id?: string
          last_active_at?: string | null
          last_name?: string
          latitude?: number | null
          longitude?: number | null
          marketing_consent?: boolean
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
          gender?: Database["public"]["Enums"]["gender"]
          id?: string
          last_active_at?: string | null
          last_name?: string
          latitude?: number | null
          longitude?: number | null
          marketing_consent?: boolean
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pwa_install_prompt_preferences: {
        Row: {
          created_at: string
          dismiss_count: number
          installed_at: string | null
          next_prompt_at: string | null
          permanently_dismissed: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dismiss_count?: number
          installed_at?: string | null
          next_prompt_at?: string | null
          permanently_dismissed?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dismiss_count?: number
          installed_at?: string | null
          next_prompt_at?: string | null
          permanently_dismissed?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      task_applications: {
        Row: {
          applicant_id: string
          archived_at: string | null
          created_at: string
          id: string
          message: string | null
          status: Database["public"]["Enums"]["application_status"]
          task_id: string
          updated_at: string
        }
        Insert: {
          applicant_id: string
          archived_at?: string | null
          created_at?: string
          id?: string
          message?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          task_id: string
          updated_at?: string
        }
        Update: {
          applicant_id?: string
          archived_at?: string | null
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
      task_drafts: {
        Row: {
          created_at: string
          current_step: number
          form_data: Json
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_step?: number
          form_data?: Json
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_step?: number
          form_data?: Json
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      task_views: {
        Row: {
          created_at: string
          id: string
          task_id: string
          viewer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          task_id: string
          viewer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          task_id?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_views_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          archived_at: string | null
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
          archived_at?: string | null
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
          archived_at?: string | null
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
      user_activity_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          user_id?: string
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
      admin_archive_task: { Args: { _task_id: string }; Returns: undefined }
      archive_record: {
        Args: {
          _record_data: Json
          _record_id: string
          _table: string
          _user_id: string
        }
        Returns: undefined
      }
      archive_task: {
        Args: { _task_id: string; _user_id: string }
        Returns: undefined
      }
      cancel_task: { Args: { _task_id: string }; Returns: undefined }
      complete_task: { Args: { _task_id: string }; Returns: undefined }
      enqueue_notification: {
        Args: {
          _data: Json
          _event: Database["public"]["Enums"]["notification_event"]
          _link: string
          _user_id: string
        }
        Returns: undefined
      }
      ensure_accepted_task_conversation: {
        Args: { _applicant_id: string; _task_id: string }
        Returns: string
      }
      get_public_profile: {
        Args: { _user_id: string }
        Returns: {
          avatar_url: string
          created_at: string
          first_name: string
          gender: Database["public"]["Enums"]["gender"]
          last_name: string
          user_id: string
        }[]
      }
      get_worker_completed_task_count: {
        Args: { _user_id: string }
        Returns: number
      }
      is_chat_media_participant: {
        Args: { object_name: string }
        Returns: boolean
      }
      record_task_view: { Args: { _task_id: string }; Returns: number }
      redeem_family_link_code: {
        Args: { _code_hash: string; _parent_user_id: string }
        Returns: string
      }
      run_parent_digest: { Args: never; Returns: undefined }
      run_quiet_digest: { Args: never; Returns: undefined }
      switch_my_role: {
        Args: { target_role: Database["public"]["Enums"]["app_role"] }
        Returns: Database["public"]["Enums"]["app_role"]
      }
    }
    Enums: {
      gender: "male" | "female" | "unspecified"
      app_role: "tasker" | "bee" | "parent" | "admin"
      application_status: "pending" | "accepted" | "rejected"
      delivery_status: "sent" | "failed" | "skipped"
      notification_channel: "email" | "push"
      notification_event:
        | "application_received"
        | "application_decided"
        | "message_received"
        | "task_completed"
        | "parent_child_accepted"
        | "parent_digest"
        | "family_link_code"
        | "quiet_hours_digest"
        | "task_cancelled"
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
      delivery_status: ["sent", "failed", "skipped"],
      notification_channel: ["email", "push"],
      notification_event: [
        "application_received",
        "application_decided",
        "message_received",
        "task_completed",
        "parent_child_accepted",
        "parent_digest",
        "family_link_code",
        "quiet_hours_digest",
        "task_cancelled",
      ],
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
