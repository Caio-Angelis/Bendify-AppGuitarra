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
      daily_ranking: {
        Row: {
          created_at: string
          email: string | null
          id: string
          streak_count: number
          user_id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          streak_count?: number
          user_id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          streak_count?: number
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      feedback: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          user_id?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          created_at: string | null
          id: string
          recipient_id: string | null
          requester_id: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          recipient_id?: string | null
          requester_id?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          recipient_id?: string | null
          requester_id?: string | null
          status?: string | null
        }
        Relationships: []
      }
      pedalboard_presets: {
        Row: {
          data: Json
          id: string
          name: string | null
          slot_index: number
          updated_at: string
          user_id: string
        }
        Insert: {
          data?: Json
          id?: string
          name?: string | null
          slot_index: number
          updated_at?: string
          user_id: string
        }
        Update: {
          data?: Json
          id?: string
          name?: string | null
          slot_index?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      practice_logs: {
        Row: {
          created_at: string
          id: string
          practice_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          practice_date: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          practice_date?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          credits: number | null
          email: string | null
          id: string
          level: number | null
          username: string | null
        }
        Insert: {
          credits?: number | null
          email?: string | null
          id: string
          level?: number | null
          username?: string | null
        }
        Update: {
          credits?: number | null
          email?: string | null
          id?: string
          level?: number | null
          username?: string | null
        }
        Relationships: []
      }
      shop_items: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          min_level: number
          name: string
          price: number
          type: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          min_level?: number
          name: string
          price?: number
          type: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          min_level?: number
          name?: string
          price?: number
          type?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          joined_at: string | null
          role: string | null
          team_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string | null
          role?: string | null
          team_id: string
          user_id: string
        }
        Update: {
          joined_at?: string | null
          role?: string | null
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          leader_id: string | null
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          leader_id?: string | null
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          leader_id?: string | null
          name?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_id: string
          unlocked_at: string | null
          user_id: string
        }
        Insert: {
          achievement_id: string
          unlocked_at?: string | null
          user_id: string
        }
        Update: {
          achievement_id?: string
          unlocked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_inventory: {
        Row: {
          acquired_at: string | null
          equipped: boolean | null
          item_id: string
          quantity: number | null
          user_id: string
        }
        Insert: {
          acquired_at?: string | null
          equipped?: boolean | null
          item_id: string
          quantity?: number | null
          user_id: string
        }
        Update: {
          acquired_at?: string | null
          equipped?: boolean | null
          item_id?: string
          quantity?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_inventory_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "shop_items"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _require_auth_uid: { Args: { p_user_id: string }; Returns: string }
      calc_daily_ranking_friends: {
        Args: { p_limit?: number; p_viewer_user_id?: string }
        Returns: {
          email: string
          friends_offense: number
          own_streak: number
          rank: number
          total_offense: number
          user_id: string
        }[]
      }
      consume_user_item: {
        Args: { p_item_type: string; p_user_id: string }
        Returns: undefined
      }
      equip_user_item: {
        Args: { p_item_id: string; p_user_id: string }
        Returns: undefined
      }
      purchase_user_item: { Args: { p_item_id: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

