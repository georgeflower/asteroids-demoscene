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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      current_high_scores: {
        Row: {
          created_at: string
          id: string
          initials: string
          level: number | null
          score: number
          session_token: string | null
          source: string | null
          time_played_seconds: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          initials: string
          level?: number | null
          score: number
          session_token?: string | null
          source?: string | null
          time_played_seconds?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          initials?: string
          level?: number | null
          score?: number
          session_token?: string | null
          source?: string | null
          time_played_seconds?: number | null
        }
        Relationships: []
      }
      game_session_checkpoints: {
        Row: {
          asteroids_destroyed: number | null
          bullets_fired: number | null
          id: string
          level: number
          reported_at: string
          score: number
          session_token: string
        }
        Insert: {
          asteroids_destroyed?: number | null
          bullets_fired?: number | null
          id?: string
          level?: number
          reported_at?: string
          score?: number
          session_token: string
        }
        Update: {
          asteroids_destroyed?: number | null
          bullets_fired?: number | null
          id?: string
          level?: number
          reported_at?: string
          score?: number
          session_token?: string
        }
        Relationships: []
      }
      game_sessions: {
        Row: {
          expired: boolean
          id: string
          last_submission_at: string | null
          pow_challenge: string | null
          pow_difficulty: number | null
          session_nonce: string | null
          started_at: string
          submission_count: number
          token: string
        }
        Insert: {
          expired?: boolean
          id?: string
          last_submission_at?: string | null
          pow_challenge?: string | null
          pow_difficulty?: number | null
          session_nonce?: string | null
          started_at?: string
          submission_count?: number
          token: string
        }
        Update: {
          expired?: boolean
          id?: string
          last_submission_at?: string | null
          pow_challenge?: string | null
          pow_difficulty?: number | null
          session_nonce?: string | null
          started_at?: string
          submission_count?: number
          token?: string
        }
        Relationships: []
      }
      high_scores: {
        Row: {
          created_at: string
          id: string
          initials: string
          score: number
        }
        Insert: {
          created_at?: string
          id?: string
          initials: string
          score: number
        }
        Update: {
          created_at?: string
          id?: string
          initials?: string
          score?: number
        }
        Relationships: []
      }
      score_audit_log: {
        Row: {
          created_at: string
          id: string
          score_id: string
          session_token: string | null
          submission_method: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          score_id: string
          session_token?: string | null
          submission_method?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          score_id?: string
          session_token?: string | null
          submission_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "score_audit_log_score_id_fkey"
            columns: ["score_id"]
            isOneToOne: false
            referencedRelation: "current_high_scores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_sessions: { Args: never; Returns: undefined }
      insert_score_with_audit: {
        Args: {
          p_initials: string
          p_level: number
          p_score: number
          p_session_token: string
          p_source: string
          p_time_played_seconds: number
        }
        Returns: string
      }
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
