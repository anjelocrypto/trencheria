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
      active_coins: {
        Row: {
          amount: number
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          expires_at: string
          id: string
          issued_by: string | null
          position_x: number
          position_y: number
          position_z: number
        }
        Insert: {
          amount?: number
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          expires_at: string
          id: string
          issued_by?: string | null
          position_x: number
          position_y: number
          position_z: number
        }
        Update: {
          amount?: number
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          issued_by?: string | null
          position_x?: number
          position_y?: number
          position_z?: number
        }
        Relationships: []
      }
      admin_wallets: {
        Row: {
          added_at: string
          label: string | null
          wallet_address: string
        }
        Insert: {
          added_at?: string
          label?: string | null
          wallet_address: string
        }
        Update: {
          added_at?: string
          label?: string | null
          wallet_address?: string
        }
        Relationships: []
      }
      chat_rate_log: {
        Row: {
          id: string
          sent_at: string
          wallet_address: string
        }
        Insert: {
          id?: string
          sent_at?: string
          wallet_address: string
        }
        Update: {
          id?: string
          sent_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
      clan_members: {
        Row: {
          clan_id: string
          id: string
          joined_at: string
          role: string
          wallet_address: string
        }
        Insert: {
          clan_id: string
          id?: string
          joined_at?: string
          role?: string
          wallet_address: string
        }
        Update: {
          clan_id?: string
          id?: string
          joined_at?: string
          role?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "clan_members_clan_id_fkey"
            columns: ["clan_id"]
            isOneToOne: false
            referencedRelation: "clans"
            referencedColumns: ["id"]
          },
        ]
      }
      clans: {
        Row: {
          color: Database["public"]["Enums"]["clan_color"]
          created_at: string
          id: string
          leader_wallet: string
          max_members: number
          member_count: number
          name: string
          updated_at: string
        }
        Insert: {
          color: Database["public"]["Enums"]["clan_color"]
          created_at?: string
          id?: string
          leader_wallet: string
          max_members?: number
          member_count?: number
          name: string
          updated_at?: string
        }
        Update: {
          color?: Database["public"]["Enums"]["clan_color"]
          created_at?: string
          id?: string
          leader_wallet?: string
          max_members?: number
          member_count?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      coin_claims: {
        Row: {
          claimed_at: string
          coin_id: string
          id: string
          wallet_address: string
        }
        Insert: {
          claimed_at?: string
          coin_id: string
          id?: string
          wallet_address: string
        }
        Update: {
          claimed_at?: string
          coin_id?: string
          id?: string
          wallet_address?: string
        }
        Relationships: []
      }
      game_rooms: {
        Row: {
          created_at: string
          current_player_count: number
          host_display_name: string
          host_player_id: string
          id: string
          last_heartbeat_at: string
          max_players: number
          room_code: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_player_count?: number
          host_display_name?: string
          host_player_id: string
          id?: string
          last_heartbeat_at?: string
          max_players?: number
          room_code: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_player_count?: number
          host_display_name?: string
          host_player_id?: string
          id?: string
          last_heartbeat_at?: string
          max_players?: number
          room_code?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      player_accounts: {
        Row: {
          character_type: string
          community_name: string | null
          created_at: string
          display_name: string
          faction_id: string | null
          id: string
          last_login_at: string
          last_position_x: number | null
          last_position_y: number | null
          last_position_z: number | null
          updated_at: string
          wallet_address: string
        }
        Insert: {
          character_type?: string
          community_name?: string | null
          created_at?: string
          display_name?: string
          faction_id?: string | null
          id?: string
          last_login_at?: string
          last_position_x?: number | null
          last_position_y?: number | null
          last_position_z?: number | null
          updated_at?: string
          wallet_address: string
        }
        Update: {
          character_type?: string
          community_name?: string | null
          created_at?: string
          display_name?: string
          faction_id?: string | null
          id?: string
          last_login_at?: string
          last_position_x?: number | null
          last_position_y?: number | null
          last_position_z?: number | null
          updated_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
      player_balances: {
        Row: {
          created_at: string
          id: string
          total_coins_collected: number
          trencheri_balance: number
          updated_at: string
          wallet_address: string
        }
        Insert: {
          created_at?: string
          id?: string
          total_coins_collected?: number
          trencheri_balance?: number
          updated_at?: string
          wallet_address: string
        }
        Update: {
          created_at?: string
          id?: string
          total_coins_collected?: number
          trencheri_balance?: number
          updated_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
      player_progression: {
        Row: {
          areas_secured: string[]
          created_at: string
          enemies_killed: number
          id: string
          structures_built: number
          tier: number
          total_stone_gathered: number
          total_wood_gathered: number
          updated_at: string
          wallet_address: string
        }
        Insert: {
          areas_secured?: string[]
          created_at?: string
          enemies_killed?: number
          id?: string
          structures_built?: number
          tier?: number
          total_stone_gathered?: number
          total_wood_gathered?: number
          updated_at?: string
          wallet_address: string
        }
        Update: {
          areas_secured?: string[]
          created_at?: string
          enemies_killed?: number
          id?: string
          structures_built?: number
          tier?: number
          total_stone_gathered?: number
          total_wood_gathered?: number
          updated_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
      room_players: {
        Row: {
          display_name: string
          id: string
          is_connected: boolean
          is_host: boolean
          joined_at: string
          last_seen_at: string
          player_id: string
          room_id: string
        }
        Insert: {
          display_name?: string
          id?: string
          is_connected?: boolean
          is_host?: boolean
          joined_at?: string
          last_seen_at?: string
          player_id: string
          room_id: string
        }
        Update: {
          display_name?: string
          id?: string
          is_connected?: boolean
          is_host?: boolean
          joined_at?: string
          last_seen_at?: string
          player_id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_players_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "game_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      security_logs: {
        Row: {
          created_at: string
          details: Json | null
          event_type: string
          id: string
          wallet_address: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          wallet_address?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          wallet_address?: string | null
        }
        Relationships: []
      }
      territories: {
        Row: {
          center_x: number
          center_z: number
          claimed_at: string | null
          created_at: string
          id: string
          name: string
          owning_clan_id: string | null
          radius: number
          region_id: string
          updated_at: string
          war_cooldown_until: string | null
          war_state: Database["public"]["Enums"]["territory_war_state"]
        }
        Insert: {
          center_x?: number
          center_z?: number
          claimed_at?: string | null
          created_at?: string
          id: string
          name: string
          owning_clan_id?: string | null
          radius?: number
          region_id: string
          updated_at?: string
          war_cooldown_until?: string | null
          war_state?: Database["public"]["Enums"]["territory_war_state"]
        }
        Update: {
          center_x?: number
          center_z?: number
          claimed_at?: string | null
          created_at?: string
          id?: string
          name?: string
          owning_clan_id?: string | null
          radius?: number
          region_id?: string
          updated_at?: string
          war_cooldown_until?: string | null
          war_state?: Database["public"]["Enums"]["territory_war_state"]
        }
        Relationships: [
          {
            foreignKeyName: "territories_owning_clan_id_fkey"
            columns: ["owning_clan_id"]
            isOneToOne: false
            referencedRelation: "clans"
            referencedColumns: ["id"]
          },
        ]
      }
      territory_challenges: {
        Row: {
          attacker_clan_color: string
          attacker_clan_id: string
          attacker_clan_name: string
          cancelled_by: string | null
          challenge_created_at: string
          cooldown_ends_at: string
          created_at: string
          defender_clan_color: string
          defender_clan_id: string
          defender_clan_name: string
          id: string
          resolution: string | null
          resolved_at: string | null
          status: string
          territory_id: string
          updated_at: string
          war_ends_at: string
          war_starts_at: string
        }
        Insert: {
          attacker_clan_color: string
          attacker_clan_id: string
          attacker_clan_name: string
          cancelled_by?: string | null
          challenge_created_at?: string
          cooldown_ends_at: string
          created_at?: string
          defender_clan_color: string
          defender_clan_id: string
          defender_clan_name: string
          id?: string
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          territory_id: string
          updated_at?: string
          war_ends_at: string
          war_starts_at: string
        }
        Update: {
          attacker_clan_color?: string
          attacker_clan_id?: string
          attacker_clan_name?: string
          cancelled_by?: string | null
          challenge_created_at?: string
          cooldown_ends_at?: string
          created_at?: string
          defender_clan_color?: string
          defender_clan_id?: string
          defender_clan_name?: string
          id?: string
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          territory_id?: string
          updated_at?: string
          war_ends_at?: string
          war_starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "territory_challenges_attacker_clan_id_fkey"
            columns: ["attacker_clan_id"]
            isOneToOne: false
            referencedRelation: "clans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "territory_challenges_defender_clan_id_fkey"
            columns: ["defender_clan_id"]
            isOneToOne: false
            referencedRelation: "clans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "territory_challenges_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      territory_history: {
        Row: {
          actor_wallet: string | null
          clan_color: string | null
          clan_id: string | null
          clan_name: string | null
          created_at: string
          event_type: string
          id: string
          territory_id: string
          territory_name: string
        }
        Insert: {
          actor_wallet?: string | null
          clan_color?: string | null
          clan_id?: string | null
          clan_name?: string | null
          created_at?: string
          event_type: string
          id?: string
          territory_id: string
          territory_name: string
        }
        Update: {
          actor_wallet?: string | null
          clan_color?: string | null
          clan_id?: string | null
          clan_name?: string | null
          created_at?: string
          event_type?: string
          id?: string
          territory_id?: string
          territory_name?: string
        }
        Relationships: []
      }
      wallet_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          last_used_at: string
          session_token: string
          wallet_address: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          last_used_at?: string
          session_token: string
          wallet_address: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          last_used_at?: string
          session_token?: string
          wallet_address?: string
        }
        Relationships: []
      }
      war_kills: {
        Row: {
          challenge_id: string
          created_at: string
          id: string
          kill_x: number
          kill_z: number
          killer_clan_id: string
          killer_wallet: string
          territory_id: string
          victim_clan_id: string
          victim_wallet: string
        }
        Insert: {
          challenge_id: string
          created_at?: string
          id?: string
          kill_x: number
          kill_z: number
          killer_clan_id: string
          killer_wallet: string
          territory_id: string
          victim_clan_id: string
          victim_wallet: string
        }
        Update: {
          challenge_id?: string
          created_at?: string
          id?: string
          kill_x?: number
          kill_z?: number
          killer_clan_id?: string
          killer_wallet?: string
          territory_id?: string
          victim_clan_id?: string
          victim_wallet?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_challenge: {
        Args: {
          _challenge_id: string
          _session_token: string
          _wallet_address: string
        }
        Returns: Json
      }
      challenge_territory: {
        Args: {
          _session_token: string
          _territory_id: string
          _wallet_address: string
        }
        Returns: Json
      }
      check_admin_status: {
        Args: { _session_token: string; _wallet_address: string }
        Returns: Json
      }
      claim_territory: {
        Args: {
          _player_x?: number
          _player_z?: number
          _session_token: string
          _territory_id: string
          _wallet_address: string
        }
        Returns: Json
      }
      claim_trencheri_coin:
        | {
            Args: {
              _amount?: number
              _coin_id: string
              _wallet_address: string
            }
            Returns: Json
          }
        | {
            Args: {
              _amount?: number
              _coin_id: string
              _session_token?: string
              _wallet_address: string
            }
            Returns: Json
          }
        | {
            Args: {
              _amount?: number
              _coin_id: string
              _player_x?: number
              _player_z?: number
              _session_token?: string
              _wallet_address: string
            }
            Returns: Json
          }
      cleanup_expired_sessions: { Args: never; Returns: undefined }
      cleanup_old_coin_claims: { Args: never; Returns: undefined }
      cleanup_stale_rooms: { Args: never; Returns: undefined }
      create_clan: {
        Args: {
          _clan_color: string
          _clan_name: string
          _session_token: string
          _wallet_address: string
        }
        Returns: Json
      }
      create_game_room: {
        Args: {
          _display_name: string
          _max_players?: number
          _player_id: string
          _room_code: string
        }
        Returns: string
      }
      create_wallet_account: {
        Args: {
          _character_type?: string
          _community_name?: string
          _display_name?: string
          _wallet_address: string
        }
        Returns: string
      }
      create_wallet_session: {
        Args: { _wallet_address: string }
        Returns: string
      }
      get_active_challenges: { Args: { _limit?: number }; Returns: Json }
      get_active_coins: { Args: { _limit?: number }; Returns: Json }
      get_clan_members: { Args: { _clan_id: string }; Returns: Json }
      get_clans: { Args: { _limit?: number }; Returns: Json }
      get_leaderboard: {
        Args: { _limit?: number }
        Returns: {
          character_type: string
          community_name: string
          display_name: string
          enemies_killed: number
          structures_built: number
          tier: number
          total_score: number
          total_stone_gathered: number
          total_wood_gathered: number
        }[]
      }
      get_my_clan: { Args: { _wallet_address: string }; Returns: Json }
      get_recent_war_kills: {
        Args: { _challenge_id: string; _limit?: number }
        Returns: Json
      }
      get_territories: { Args: never; Returns: Json }
      get_territory_history: {
        Args: { _limit?: number; _territory_id?: string }
        Returns: Json
      }
      get_trencheri_balance: {
        Args: { _wallet_address: string }
        Returns: number
      }
      get_war_kills: { Args: { _challenge_id: string }; Returns: Json }
      heartbeat_room_player: {
        Args: { _player_id: string; _room_id: string }
        Returns: undefined
      }
      is_valid_character_type: { Args: { _type: string }; Returns: boolean }
      issue_trencheri_coins:
        | {
            Args: {
              _lifetime_seconds?: number
              _positions: Json
              _wallet_address: string
            }
            Returns: Json
          }
        | {
            Args: {
              _lifetime_seconds?: number
              _positions: Json
              _session_token?: string
              _wallet_address: string
            }
            Returns: Json
          }
      join_clan: {
        Args: {
          _clan_id: string
          _session_token: string
          _wallet_address: string
        }
        Returns: Json
      }
      join_game_room: {
        Args: { _display_name: string; _player_id: string; _room_code: string }
        Returns: string
      }
      leave_clan: {
        Args: { _session_token: string; _wallet_address: string }
        Returns: Json
      }
      leave_game_room: {
        Args: { _player_id: string; _room_id: string }
        Returns: undefined
      }
      load_player_progression: {
        Args: { _wallet_address: string }
        Returns: Json
      }
      log_war_kill: {
        Args: {
          _kill_x: number
          _kill_z: number
          _session_token: string
          _victim_wallet: string
          _wallet_address: string
        }
        Returns: Json
      }
      login_wallet_account: { Args: { _wallet_address: string }; Returns: Json }
      refresh_game_room_state: {
        Args: { _room_id: string }
        Returns: undefined
      }
      register_with_faction: {
        Args: {
          _community_name?: string
          _display_name?: string
          _faction_id?: string
          _wallet_address: string
        }
        Returns: Json
      }
      release_territory: {
        Args: {
          _session_token: string
          _territory_id: string
          _wallet_address: string
        }
        Returns: Json
      }
      report_pvp_death: {
        Args: {
          _death_x: number
          _death_z: number
          _killer_wallet: string
          _session_token: string
          _victim_wallet: string
        }
        Returns: Json
      }
      resolve_war: {
        Args: {
          _challenge_id: string
          _resolution: string
          _session_token: string
          _wallet_address: string
        }
        Returns: Json
      }
      save_player_progression:
        | {
            Args: {
              _areas_secured: string[]
              _enemies_killed: number
              _structures_built: number
              _tier: number
              _total_stone_gathered: number
              _total_wood_gathered: number
              _wallet_address: string
            }
            Returns: undefined
          }
        | {
            Args: {
              _areas_secured: string[]
              _enemies_killed: number
              _session_token?: string
              _structures_built: number
              _tier: number
              _total_stone_gathered: number
              _total_wood_gathered: number
              _wallet_address: string
            }
            Returns: undefined
          }
      transition_war_states: { Args: never; Returns: Json }
      update_wallet_last_position:
        | {
            Args: {
              _last_position_x: number
              _last_position_y: number
              _last_position_z: number
              _wallet_address: string
            }
            Returns: undefined
          }
        | {
            Args: {
              _last_position_x: number
              _last_position_y: number
              _last_position_z: number
              _session_token?: string
              _wallet_address: string
            }
            Returns: undefined
          }
      update_wallet_profile: {
        Args: {
          _character_type?: string
          _community_name?: string
          _display_name?: string
          _session_token?: string
          _wallet_address: string
        }
        Returns: undefined
      }
      validate_chat: {
        Args: {
          _message_length?: number
          _session_token: string
          _wallet_address: string
        }
        Returns: Json
      }
      verify_admin_session: {
        Args: { _session_token: string; _wallet_address: string }
        Returns: boolean
      }
      verify_wallet_session: {
        Args: { _session_token: string; _wallet_address: string }
        Returns: boolean
      }
    }
    Enums: {
      clan_color:
        | "crimson"
        | "azure"
        | "emerald"
        | "gold"
        | "violet"
        | "silver"
        | "amber"
        | "teal"
        | "ivory"
        | "obsidian"
      territory_war_state:
        | "peaceful"
        | "contested"
        | "active_war"
        | "cooldown"
        | "pending_resolution"
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
      clan_color: [
        "crimson",
        "azure",
        "emerald",
        "gold",
        "violet",
        "silver",
        "amber",
        "teal",
        "ivory",
        "obsidian",
      ],
      territory_war_state: [
        "peaceful",
        "contested",
        "active_war",
        "cooldown",
        "pending_resolution",
      ],
    },
  },
} as const
