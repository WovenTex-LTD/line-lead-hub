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
      app_error_logs: {
        Row: {
          acknowledged: boolean
          created_at: string
          factory_id: string | null
          id: string
          message: string
          metadata: Json | null
          severity: string
          source: string | null
          stack: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          acknowledged?: boolean
          created_at?: string
          factory_id?: string | null
          id?: string
          message: string
          metadata?: Json | null
          severity?: string
          source?: string | null
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          acknowledged?: boolean
          created_at?: string
          factory_id?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          severity?: string
          source?: string | null
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_error_logs_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string | null
          factory_id: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          factory_id?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          factory_id?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      blocker_impact_options: {
        Row: {
          created_at: string | null
          factory_id: string
          id: string
          is_active: boolean | null
          label: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          factory_id: string
          id?: string
          is_active?: boolean | null
          label: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          factory_id?: string
          id?: string
          is_active?: boolean | null
          label?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      blocker_owner_options: {
        Row: {
          created_at: string | null
          factory_id: string
          id: string
          is_active: boolean | null
          label: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          factory_id: string
          id?: string
          is_active?: boolean | null
          label: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          factory_id?: string
          id?: string
          is_active?: boolean | null
          label?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      blocker_types: {
        Row: {
          code: string
          created_at: string | null
          default_impact: Database["public"]["Enums"]["blocker_impact"] | null
          default_owner: string | null
          factory_id: string
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          default_impact?: Database["public"]["Enums"]["blocker_impact"] | null
          default_owner?: string | null
          factory_id: string
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          default_impact?: Database["public"]["Enums"]["blocker_impact"] | null
          default_owner?: string | null
          factory_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "blocker_types_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_factory_memberships: {
        Row: {
          company_name: string | null
          created_at: string | null
          factory_id: string
          id: string
          invited_by: string | null
          is_active: boolean
          user_id: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          factory_id: string
          id?: string
          invited_by?: string | null
          is_active?: boolean
          user_id: string
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          factory_id?: string
          id?: string
          invited_by?: string | null
          is_active?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "buyer_factory_memberships_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_po_access: {
        Row: {
          factory_id: string
          granted_at: string | null
          granted_by: string | null
          id: string
          user_id: string
          work_order_id: string
        }
        Insert: {
          factory_id: string
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          user_id: string
          work_order_id: string
        }
        Update: {
          factory_id?: string
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          user_id?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "buyer_po_access_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_po_access_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_workspace_prefs: {
        Row: {
          alert_thresholds: Json | null
          created_at: string | null
          daily_digest_enabled: boolean | null
          default_po_id: string | null
          factory_id: string
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          alert_thresholds?: Json | null
          created_at?: string | null
          daily_digest_enabled?: boolean | null
          default_po_id?: string | null
          factory_id: string
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          alert_thresholds?: Json | null
          created_at?: string | null
          daily_digest_enabled?: boolean | null
          default_po_id?: string | null
          factory_id?: string
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "buyer_workspace_prefs_default_po_id_fkey"
            columns: ["default_po_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_workspace_prefs_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_analytics: {
        Row: {
          answer_length: number | null
          citations_count: number | null
          conversation_id: string | null
          created_at: string | null
          factory_id: string | null
          feedback: string | null
          feedback_comment: string | null
          id: string
          language: string | null
          message_id: string | null
          no_evidence: boolean | null
          question_text: string | null
          user_role: string | null
        }
        Insert: {
          answer_length?: number | null
          citations_count?: number | null
          conversation_id?: string | null
          created_at?: string | null
          factory_id?: string | null
          feedback?: string | null
          feedback_comment?: string | null
          id?: string
          language?: string | null
          message_id?: string | null
          no_evidence?: boolean | null
          question_text?: string | null
          user_role?: string | null
        }
        Update: {
          answer_length?: number | null
          citations_count?: number | null
          conversation_id?: string | null
          created_at?: string | null
          factory_id?: string | null
          feedback?: string | null
          feedback_comment?: string | null
          id?: string
          language?: string | null
          message_id?: string | null
          no_evidence?: boolean | null
          question_text?: string | null
          user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_analytics_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_analytics_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_analytics_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          created_at: string | null
          factory_id: string | null
          id: string
          is_archived: boolean | null
          language: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          factory_id?: string | null
          id?: string
          is_archived?: boolean | null
          language?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          factory_id?: string | null
          id?: string
          is_archived?: boolean | null
          language?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          citations: Json | null
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          model: string | null
          no_evidence: boolean | null
          role: string
          tokens_used: number | null
        }
        Insert: {
          citations?: Json | null
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          model?: string | null
          no_evidence?: boolean | null
          role: string
          tokens_used?: number | null
        }
        Update: {
          citations?: Json | null
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          model?: string | null
          no_evidence?: boolean | null
          role?: string
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_dropdown_lists: {
        Row: {
          created_at: string
          description: string | null
          factory_id: string
          id: string
          is_active: boolean
          key: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          factory_id: string
          id?: string
          is_active?: boolean
          key: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          factory_id?: string
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_dropdown_lists_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_dropdown_options: {
        Row: {
          created_at: string
          factory_id: string
          id: string
          is_active: boolean
          label: string
          list_id: string
          sort_order: number
          value: string | null
        }
        Insert: {
          created_at?: string
          factory_id: string
          id?: string
          is_active?: boolean
          label: string
          list_id: string
          sort_order?: number
          value?: string | null
        }
        Update: {
          created_at?: string
          factory_id?: string
          id?: string
          is_active?: boolean
          label?: string
          list_id?: string
          sort_order?: number
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_dropdown_options_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_dropdown_options_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "custom_dropdown_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      cutting_actuals: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          actual_per_hour: number | null
          balance: number | null
          buyer: string | null
          colour: string | null
          created_at: string | null
          custom_data: Json | null
          cutting_capacity: number
          cutting_section_id: string | null
          day_cutting: number
          day_input: number
          estimated_cost_currency: string | null
          estimated_cost_value: number | null
          factory_id: string
          hours_actual: number | null
          id: string
          is_late: boolean | null
          lay_capacity: number
          leftover_location: string | null
          leftover_notes: string | null
          leftover_photo_urls: string[] | null
          leftover_quantity: number | null
          leftover_recorded: boolean | null
          leftover_type: string | null
          leftover_unit: string | null
          line_id: string
          man_power: number
          marker_capacity: number
          order_qty: number | null
          ot_hours_actual: number | null
          ot_manpower_actual: number | null
          po_no: string | null
          production_date: string
          style: string | null
          submitted_at: string | null
          submitted_by: string | null
          total_cutting: number | null
          total_input: number | null
          transfer_to_line_id: string | null
          under_qty: number | null
          work_order_id: string
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          actual_per_hour?: number | null
          balance?: number | null
          buyer?: string | null
          colour?: string | null
          created_at?: string | null
          custom_data?: Json | null
          cutting_capacity?: number
          cutting_section_id?: string | null
          day_cutting?: number
          day_input?: number
          estimated_cost_currency?: string | null
          estimated_cost_value?: number | null
          factory_id: string
          hours_actual?: number | null
          id?: string
          is_late?: boolean | null
          lay_capacity?: number
          leftover_location?: string | null
          leftover_notes?: string | null
          leftover_photo_urls?: string[] | null
          leftover_quantity?: number | null
          leftover_recorded?: boolean | null
          leftover_type?: string | null
          leftover_unit?: string | null
          line_id: string
          man_power?: number
          marker_capacity?: number
          order_qty?: number | null
          ot_hours_actual?: number | null
          ot_manpower_actual?: number | null
          po_no?: string | null
          production_date?: string
          style?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          total_cutting?: number | null
          total_input?: number | null
          transfer_to_line_id?: string | null
          under_qty?: number | null
          work_order_id: string
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          actual_per_hour?: number | null
          balance?: number | null
          buyer?: string | null
          colour?: string | null
          created_at?: string | null
          custom_data?: Json | null
          cutting_capacity?: number
          cutting_section_id?: string | null
          day_cutting?: number
          day_input?: number
          estimated_cost_currency?: string | null
          estimated_cost_value?: number | null
          factory_id?: string
          hours_actual?: number | null
          id?: string
          is_late?: boolean | null
          lay_capacity?: number
          leftover_location?: string | null
          leftover_notes?: string | null
          leftover_photo_urls?: string[] | null
          leftover_quantity?: number | null
          leftover_recorded?: boolean | null
          leftover_type?: string | null
          leftover_unit?: string | null
          line_id?: string
          man_power?: number
          marker_capacity?: number
          order_qty?: number | null
          ot_hours_actual?: number | null
          ot_manpower_actual?: number | null
          po_no?: string | null
          production_date?: string
          style?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          total_cutting?: number | null
          total_input?: number | null
          transfer_to_line_id?: string | null
          under_qty?: number | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cutting_actuals_cutting_section_id_fkey"
            columns: ["cutting_section_id"]
            isOneToOne: false
            referencedRelation: "cutting_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cutting_actuals_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cutting_actuals_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cutting_actuals_transfer_to_line_id_fkey"
            columns: ["transfer_to_line_id"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cutting_actuals_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      cutting_sections: {
        Row: {
          created_at: string | null
          cutting_no: string
          factory_id: string
          id: string
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          cutting_no: string
          factory_id: string
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          cutting_no?: string
          factory_id?: string
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cutting_sections_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      cutting_targets: {
        Row: {
          buyer: string | null
          colour: string | null
          created_at: string | null
          cutting_capacity: number
          cutting_section_id: string | null
          day_cutting: number
          day_input: number
          factory_id: string
          hours_planned: number | null
          id: string
          is_late: boolean | null
          lay_capacity: number
          line_id: string
          man_power: number
          marker_capacity: number
          order_qty: number | null
          ot_hours_planned: number | null
          ot_manpower_planned: number | null
          po_no: string | null
          production_date: string
          style: string | null
          submitted_at: string | null
          submitted_by: string | null
          target_per_hour: number | null
          under_qty: number | null
          work_order_id: string
        }
        Insert: {
          buyer?: string | null
          colour?: string | null
          created_at?: string | null
          cutting_capacity?: number
          cutting_section_id?: string | null
          day_cutting?: number
          day_input?: number
          factory_id: string
          hours_planned?: number | null
          id?: string
          is_late?: boolean | null
          lay_capacity?: number
          line_id: string
          man_power?: number
          marker_capacity?: number
          order_qty?: number | null
          ot_hours_planned?: number | null
          ot_manpower_planned?: number | null
          po_no?: string | null
          production_date?: string
          style?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          target_per_hour?: number | null
          under_qty?: number | null
          work_order_id: string
        }
        Update: {
          buyer?: string | null
          colour?: string | null
          created_at?: string | null
          cutting_capacity?: number
          cutting_section_id?: string | null
          day_cutting?: number
          day_input?: number
          factory_id?: string
          hours_planned?: number | null
          id?: string
          is_late?: boolean | null
          lay_capacity?: number
          line_id?: string
          man_power?: number
          marker_capacity?: number
          order_qty?: number | null
          ot_hours_planned?: number | null
          ot_manpower_planned?: number | null
          po_no?: string | null
          production_date?: string
          style?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          target_per_hour?: number | null
          under_qty?: number | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cutting_targets_cutting_section_id_fkey"
            columns: ["cutting_section_id"]
            isOneToOne: false
            referencedRelation: "cutting_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cutting_targets_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cutting_targets_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cutting_targets_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_insights: {
        Row: {
          created_at: string | null
          factory_id: string
          id: string
          insight_date: string
          insights_data: Json
        }
        Insert: {
          created_at?: string | null
          factory_id: string
          id?: string
          insight_date?: string
          insights_data?: Json
        }
        Update: {
          created_at?: string | null
          factory_id?: string
          id?: string
          insight_date?: string
          insights_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "daily_insights_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_daily_sequence: {
        Row: {
          date: string
          factory_id: string
          last_sequence: number
        }
        Insert: {
          date: string
          factory_id: string
          last_sequence?: number
        }
        Update: {
          date?: string
          factory_id?: string
          last_sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_daily_sequence_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_requests: {
        Row: {
          buyer_name: string | null
          carton_count: number | null
          created_at: string
          destination: string
          dispatch_quantity: number
          driver_name: string
          driver_nid: string | null
          factory_id: string
          gate_pass_pdf_url: string | null
          id: string
          photo_url: string | null
          reference_number: string
          rejection_reason: string | null
          remarks: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          style_name: string | null
          submitted_at: string
          submitted_by: string
          truck_number: string
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          buyer_name?: string | null
          carton_count?: number | null
          created_at?: string
          destination: string
          dispatch_quantity?: number
          driver_name: string
          driver_nid?: string | null
          factory_id: string
          gate_pass_pdf_url?: string | null
          id?: string
          photo_url?: string | null
          reference_number: string
          rejection_reason?: string | null
          remarks?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          style_name?: string | null
          submitted_at?: string
          submitted_by: string
          truck_number: string
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          buyer_name?: string | null
          carton_count?: number | null
          created_at?: string
          destination?: string
          dispatch_quantity?: number
          driver_name?: string
          driver_nid?: string | null
          factory_id?: string
          gate_pass_pdf_url?: string | null
          id?: string
          photo_url?: string | null
          reference_number?: string
          rejection_reason?: string | null
          remarks?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          style_name?: string | null
          submitted_at?: string
          submitted_by?: string
          truck_number?: string
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_requests_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_dispatch_reviewed_by"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_dispatch_submitted_by"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_dispatch_work_order"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      document_ingestion_queue: {
        Row: {
          chunks_created: number | null
          chunks_processed: number | null
          completed_at: string | null
          created_at: string | null
          document_id: string
          error_message: string | null
          id: string
          started_at: string | null
          status: string
          total_chunks: number | null
        }
        Insert: {
          chunks_created?: number | null
          chunks_processed?: number | null
          completed_at?: string | null
          created_at?: string | null
          document_id: string
          error_message?: string | null
          id?: string
          started_at?: string | null
          status?: string
          total_chunks?: number | null
        }
        Update: {
          chunks_created?: number | null
          chunks_processed?: number | null
          completed_at?: string | null
          created_at?: string | null
          document_id?: string
          error_message?: string | null
          id?: string
          started_at?: string | null
          status?: string
          total_chunks?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_ingestion_queue_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      email_schedules: {
        Row: {
          created_at: string | null
          day_of_week: number | null
          email: string
          factory_id: string
          id: string
          is_active: boolean | null
          last_sent_at: string | null
          schedule_type: string
          send_time: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          day_of_week?: number | null
          email: string
          factory_id: string
          id?: string
          is_active?: boolean | null
          last_sent_at?: string | null
          schedule_type: string
          send_time?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          day_of_week?: number | null
          email?: string
          factory_id?: string
          id?: string
          is_active?: boolean | null
          last_sent_at?: string | null
          schedule_type?: string
          send_time?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_schedules_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      extras_ledger: {
        Row: {
          attachment_url: string | null
          created_at: string
          created_by: string
          factory_id: string
          id: string
          is_admin_adjustment: boolean
          notes: string | null
          quantity: number
          reference_number: string | null
          transaction_type: Database["public"]["Enums"]["extras_transaction_type"]
          work_order_id: string
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          created_by: string
          factory_id: string
          id?: string
          is_admin_adjustment?: boolean
          notes?: string | null
          quantity: number
          reference_number?: string | null
          transaction_type: Database["public"]["Enums"]["extras_transaction_type"]
          work_order_id: string
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          created_by?: string
          factory_id?: string
          id?: string
          is_admin_adjustment?: boolean
          notes?: string | null
          quantity?: number
          reference_number?: string | null
          transaction_type?: Database["public"]["Enums"]["extras_transaction_type"]
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extras_ledger_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extras_ledger_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_accounts: {
        Row: {
          created_at: string | null
          cutoff_time: string | null
          enabled_modules: string[] | null
          evening_actual_cutoff: string | null
          headcount_cost_currency: string | null
          headcount_cost_value: number | null
          id: string
          is_active: boolean | null
          line_slot_limit: number | null
          logo_url: string | null
          low_stock_threshold: number
          max_lines: number | null
          morning_target_cutoff: string | null
          name: string
          payment_failed_at: string | null
          reactivation_cooldown_days: number | null
          slug: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          subscription_tier:
            | Database["public"]["Enums"]["subscription_tier"]
            | null
          timezone: string | null
          trial_end_date: string | null
          trial_start_date: string | null
          updated_at: string | null
          use_dynamic_forms: boolean | null
        }
        Insert: {
          created_at?: string | null
          cutoff_time?: string | null
          enabled_modules?: string[] | null
          evening_actual_cutoff?: string | null
          headcount_cost_currency?: string | null
          headcount_cost_value?: number | null
          id?: string
          is_active?: boolean | null
          line_slot_limit?: number | null
          logo_url?: string | null
          low_stock_threshold?: number
          max_lines?: number | null
          morning_target_cutoff?: string | null
          name: string
          payment_failed_at?: string | null
          reactivation_cooldown_days?: number | null
          slug: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          subscription_tier?:
            | Database["public"]["Enums"]["subscription_tier"]
            | null
          timezone?: string | null
          trial_end_date?: string | null
          trial_start_date?: string | null
          updated_at?: string | null
          use_dynamic_forms?: boolean | null
        }
        Update: {
          created_at?: string | null
          cutoff_time?: string | null
          enabled_modules?: string[] | null
          evening_actual_cutoff?: string | null
          headcount_cost_currency?: string | null
          headcount_cost_value?: number | null
          id?: string
          is_active?: boolean | null
          line_slot_limit?: number | null
          logo_url?: string | null
          low_stock_threshold?: number
          max_lines?: number | null
          morning_target_cutoff?: string | null
          name?: string
          payment_failed_at?: string | null
          reactivation_cooldown_days?: number | null
          slug?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          subscription_tier?:
            | Database["public"]["Enums"]["subscription_tier"]
            | null
          timezone?: string | null
          trial_end_date?: string | null
          trial_start_date?: string | null
          updated_at?: string | null
          use_dynamic_forms?: boolean | null
        }
        Relationships: []
      }
      finishing_actuals: {
        Row: {
          action_taken_today: string | null
          average_production: number | null
          blocker_description: string | null
          blocker_impact: Database["public"]["Enums"]["blocker_impact"] | null
          blocker_owner: string | null
          blocker_resolution_date: string | null
          blocker_type_id: string | null
          buyer_name: string | null
          created_at: string | null
          custom_data: Json | null
          day_carton: number
          day_hour_actual: number
          day_over_time_actual: number
          day_poly: number
          day_qc_pass: number
          estimated_cost_currency: string | null
          estimated_cost_value: number | null
          factory_id: string
          floor_name: string | null
          has_blocker: boolean | null
          id: string
          item_name: string | null
          line_id: string
          m_power_actual: number
          order_qty: number | null
          ot_manpower_actual: number | null
          photo_urls: string[] | null
          production_date: string
          remarks: string | null
          style_no: string | null
          submitted_at: string | null
          submitted_by: string | null
          total_carton: number
          total_hour: number | null
          total_over_time: number | null
          total_poly: number
          total_qc_pass: number
          unit_name: string | null
          work_order_id: string
        }
        Insert: {
          action_taken_today?: string | null
          average_production?: number | null
          blocker_description?: string | null
          blocker_impact?: Database["public"]["Enums"]["blocker_impact"] | null
          blocker_owner?: string | null
          blocker_resolution_date?: string | null
          blocker_type_id?: string | null
          buyer_name?: string | null
          created_at?: string | null
          custom_data?: Json | null
          day_carton?: number
          day_hour_actual?: number
          day_over_time_actual?: number
          day_poly?: number
          day_qc_pass?: number
          estimated_cost_currency?: string | null
          estimated_cost_value?: number | null
          factory_id: string
          floor_name?: string | null
          has_blocker?: boolean | null
          id?: string
          item_name?: string | null
          line_id: string
          m_power_actual?: number
          order_qty?: number | null
          ot_manpower_actual?: number | null
          photo_urls?: string[] | null
          production_date?: string
          remarks?: string | null
          style_no?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          total_carton?: number
          total_hour?: number | null
          total_over_time?: number | null
          total_poly?: number
          total_qc_pass?: number
          unit_name?: string | null
          work_order_id: string
        }
        Update: {
          action_taken_today?: string | null
          average_production?: number | null
          blocker_description?: string | null
          blocker_impact?: Database["public"]["Enums"]["blocker_impact"] | null
          blocker_owner?: string | null
          blocker_resolution_date?: string | null
          blocker_type_id?: string | null
          buyer_name?: string | null
          created_at?: string | null
          custom_data?: Json | null
          day_carton?: number
          day_hour_actual?: number
          day_over_time_actual?: number
          day_poly?: number
          day_qc_pass?: number
          estimated_cost_currency?: string | null
          estimated_cost_value?: number | null
          factory_id?: string
          floor_name?: string | null
          has_blocker?: boolean | null
          id?: string
          item_name?: string | null
          line_id?: string
          m_power_actual?: number
          order_qty?: number | null
          ot_manpower_actual?: number | null
          photo_urls?: string[] | null
          production_date?: string
          remarks?: string | null
          style_no?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          total_carton?: number
          total_hour?: number | null
          total_over_time?: number | null
          total_poly?: number
          total_qc_pass?: number
          unit_name?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finishing_actuals_blocker_type_id_fkey"
            columns: ["blocker_type_id"]
            isOneToOne: false
            referencedRelation: "blocker_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finishing_actuals_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finishing_actuals_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finishing_actuals_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      finishing_daily_log_history: {
        Row: {
          change_reason: string | null
          changed_at: string
          changed_by: string
          id: string
          log_id: string
          new_values: Json
          old_values: Json | null
        }
        Insert: {
          change_reason?: string | null
          changed_at?: string
          changed_by: string
          id?: string
          log_id: string
          new_values: Json
          old_values?: Json | null
        }
        Update: {
          change_reason?: string | null
          changed_at?: string
          changed_by?: string
          id?: string
          log_id?: string
          new_values?: Json
          old_values?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "finishing_daily_log_history_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "finishing_daily_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      finishing_daily_logs: {
        Row: {
          actual_hours: number | null
          buttoning: number | null
          carton: number | null
          created_at: string
          factory_id: string
          get_up: number | null
          id: string
          inside_check: number | null
          iron: number | null
          is_locked: boolean
          line_id: string | null
          locked_at: string | null
          locked_by: string | null
          log_type: Database["public"]["Enums"]["finishing_log_type"]
          m_power_actual: number | null
          m_power_planned: number | null
          ot_hours_actual: number | null
          ot_hours_planned: number | null
          ot_manpower_actual: number | null
          ot_manpower_planned: number | null
          planned_hours: number | null
          poly: number | null
          production_date: string
          remarks: string | null
          shift: string | null
          submitted_at: string
          submitted_by: string
          thread_cutting: number | null
          top_side_check: number | null
          updated_at: string | null
          updated_by: string | null
          work_order_id: string | null
        }
        Insert: {
          actual_hours?: number | null
          buttoning?: number | null
          carton?: number | null
          created_at?: string
          factory_id: string
          get_up?: number | null
          id?: string
          inside_check?: number | null
          iron?: number | null
          is_locked?: boolean
          line_id?: string | null
          locked_at?: string | null
          locked_by?: string | null
          log_type: Database["public"]["Enums"]["finishing_log_type"]
          m_power_actual?: number | null
          m_power_planned?: number | null
          ot_hours_actual?: number | null
          ot_hours_planned?: number | null
          ot_manpower_actual?: number | null
          ot_manpower_planned?: number | null
          planned_hours?: number | null
          poly?: number | null
          production_date?: string
          remarks?: string | null
          shift?: string | null
          submitted_at?: string
          submitted_by: string
          thread_cutting?: number | null
          top_side_check?: number | null
          updated_at?: string | null
          updated_by?: string | null
          work_order_id?: string | null
        }
        Update: {
          actual_hours?: number | null
          buttoning?: number | null
          carton?: number | null
          created_at?: string
          factory_id?: string
          get_up?: number | null
          id?: string
          inside_check?: number | null
          iron?: number | null
          is_locked?: boolean
          line_id?: string | null
          locked_at?: string | null
          locked_by?: string | null
          log_type?: Database["public"]["Enums"]["finishing_log_type"]
          m_power_actual?: number | null
          m_power_planned?: number | null
          ot_hours_actual?: number | null
          ot_hours_planned?: number | null
          ot_manpower_actual?: number | null
          ot_manpower_planned?: number | null
          planned_hours?: number | null
          poly?: number | null
          production_date?: string
          remarks?: string | null
          shift?: string | null
          submitted_at?: string
          submitted_by?: string
          thread_cutting?: number | null
          top_side_check?: number | null
          updated_at?: string | null
          updated_by?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finishing_daily_logs_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finishing_daily_logs_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finishing_daily_logs_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      finishing_daily_sheets: {
        Row: {
          buyer: string | null
          color: string | null
          created_at: string | null
          created_by: string | null
          factory_id: string
          finishing_no: string | null
          id: string
          item: string | null
          line_id: string
          po_no: string | null
          production_date: string
          style: string | null
          updated_at: string | null
          updated_by: string | null
          work_order_id: string
        }
        Insert: {
          buyer?: string | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          factory_id: string
          finishing_no?: string | null
          id?: string
          item?: string | null
          line_id: string
          po_no?: string | null
          production_date?: string
          style?: string | null
          updated_at?: string | null
          updated_by?: string | null
          work_order_id: string
        }
        Update: {
          buyer?: string | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          factory_id?: string
          finishing_no?: string | null
          id?: string
          item?: string | null
          line_id?: string
          po_no?: string | null
          production_date?: string
          style?: string | null
          updated_at?: string | null
          updated_by?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finishing_daily_sheets_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finishing_daily_sheets_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finishing_daily_sheets_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      finishing_hourly_logs: {
        Row: {
          buttoning_actual: number | null
          buttoning_target: number | null
          carton_actual: number | null
          carton_target: number | null
          get_up_actual: number | null
          get_up_target: number | null
          hour_slot: Database["public"]["Enums"]["finishing_hour_slot"]
          id: string
          inside_check_actual: number | null
          inside_check_target: number | null
          iron_actual: number | null
          iron_target: number | null
          is_locked: boolean | null
          poly_actual: number | null
          poly_target: number | null
          remarks: string | null
          sheet_id: string
          submitted_at: string | null
          submitted_by: string | null
          thread_cutting_actual: number | null
          thread_cutting_target: number | null
          top_side_check_actual: number | null
          top_side_check_target: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          buttoning_actual?: number | null
          buttoning_target?: number | null
          carton_actual?: number | null
          carton_target?: number | null
          get_up_actual?: number | null
          get_up_target?: number | null
          hour_slot: Database["public"]["Enums"]["finishing_hour_slot"]
          id?: string
          inside_check_actual?: number | null
          inside_check_target?: number | null
          iron_actual?: number | null
          iron_target?: number | null
          is_locked?: boolean | null
          poly_actual?: number | null
          poly_target?: number | null
          remarks?: string | null
          sheet_id: string
          submitted_at?: string | null
          submitted_by?: string | null
          thread_cutting_actual?: number | null
          thread_cutting_target?: number | null
          top_side_check_actual?: number | null
          top_side_check_target?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          buttoning_actual?: number | null
          buttoning_target?: number | null
          carton_actual?: number | null
          carton_target?: number | null
          get_up_actual?: number | null
          get_up_target?: number | null
          hour_slot?: Database["public"]["Enums"]["finishing_hour_slot"]
          id?: string
          inside_check_actual?: number | null
          inside_check_target?: number | null
          iron_actual?: number | null
          iron_target?: number | null
          is_locked?: boolean | null
          poly_actual?: number | null
          poly_target?: number | null
          remarks?: string | null
          sheet_id?: string
          submitted_at?: string | null
          submitted_by?: string | null
          thread_cutting_actual?: number | null
          thread_cutting_target?: number | null
          top_side_check_actual?: number | null
          top_side_check_target?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finishing_hourly_logs_sheet_id_fkey"
            columns: ["sheet_id"]
            isOneToOne: false
            referencedRelation: "finishing_daily_sheets"
            referencedColumns: ["id"]
          },
        ]
      }
      finishing_targets: {
        Row: {
          buyer_name: string | null
          created_at: string | null
          custom_data: Json | null
          day_hour_planned: number
          day_over_time_planned: number
          factory_id: string
          floor_name: string | null
          id: string
          is_late: boolean | null
          item_name: string | null
          line_id: string
          m_power_planned: number
          order_qty: number | null
          ot_manpower_planned: number | null
          per_hour_target: number
          production_date: string
          remarks: string | null
          style_no: string | null
          submitted_at: string | null
          submitted_by: string | null
          unit_name: string | null
          work_order_id: string
        }
        Insert: {
          buyer_name?: string | null
          created_at?: string | null
          custom_data?: Json | null
          day_hour_planned?: number
          day_over_time_planned?: number
          factory_id: string
          floor_name?: string | null
          id?: string
          is_late?: boolean | null
          item_name?: string | null
          line_id: string
          m_power_planned: number
          order_qty?: number | null
          ot_manpower_planned?: number | null
          per_hour_target: number
          production_date?: string
          remarks?: string | null
          style_no?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          unit_name?: string | null
          work_order_id: string
        }
        Update: {
          buyer_name?: string | null
          created_at?: string | null
          custom_data?: Json | null
          day_hour_planned?: number
          day_over_time_planned?: number
          factory_id?: string
          floor_name?: string | null
          id?: string
          is_late?: boolean | null
          item_name?: string | null
          line_id?: string
          m_power_planned?: number
          order_qty?: number | null
          ot_manpower_planned?: number | null
          per_hour_target?: number
          production_date?: string
          remarks?: string | null
          style_no?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          unit_name?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finishing_targets_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finishing_targets_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finishing_targets_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      floors: {
        Row: {
          code: string
          created_at: string | null
          factory_id: string
          id: string
          is_active: boolean | null
          name: string
          unit_id: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          factory_id: string
          id?: string
          is_active?: boolean | null
          name: string
          unit_id: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          factory_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          unit_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "floors_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floors_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      form_fields: {
        Row: {
          auto_fill_from: Json | null
          compute_expression: string | null
          data_source: Json | null
          db_column: string | null
          default_value: string | null
          field_type: string
          id: string
          is_active: boolean | null
          is_custom: boolean | null
          is_required: boolean | null
          key: string
          label_key: string
          placeholder: string | null
          section_id: string
          sort_order: number
          template_id: string
          validation: Json | null
          visible_when: Json | null
        }
        Insert: {
          auto_fill_from?: Json | null
          compute_expression?: string | null
          data_source?: Json | null
          db_column?: string | null
          default_value?: string | null
          field_type: string
          id?: string
          is_active?: boolean | null
          is_custom?: boolean | null
          is_required?: boolean | null
          key: string
          label_key: string
          placeholder?: string | null
          section_id: string
          sort_order?: number
          template_id: string
          validation?: Json | null
          visible_when?: Json | null
        }
        Update: {
          auto_fill_from?: Json | null
          compute_expression?: string | null
          data_source?: Json | null
          db_column?: string | null
          default_value?: string | null
          field_type?: string
          id?: string
          is_active?: boolean | null
          is_custom?: boolean | null
          is_required?: boolean | null
          key?: string
          label_key?: string
          placeholder?: string | null
          section_id?: string
          sort_order?: number
          template_id?: string
          validation?: Json | null
          visible_when?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "form_fields_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "form_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_fields_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      form_role_overrides: {
        Row: {
          hidden_field_ids: string[] | null
          hidden_section_ids: string[] | null
          id: string
          required_overrides: Json | null
          role: string
          template_id: string
        }
        Insert: {
          hidden_field_ids?: string[] | null
          hidden_section_ids?: string[] | null
          id?: string
          required_overrides?: Json | null
          role: string
          template_id: string
        }
        Update: {
          hidden_field_ids?: string[] | null
          hidden_section_ids?: string[] | null
          id?: string
          required_overrides?: Json | null
          role?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_role_overrides_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      form_sections: {
        Row: {
          description: string | null
          id: string
          is_active: boolean | null
          is_collapsible: boolean | null
          key: string
          sort_order: number
          template_id: string
          title_key: string
        }
        Insert: {
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_collapsible?: boolean | null
          key: string
          sort_order?: number
          template_id: string
          title_key: string
        }
        Update: {
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_collapsible?: boolean | null
          key?: string
          sort_order?: number
          template_id?: string
          title_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      form_templates: {
        Row: {
          created_at: string | null
          factory_id: string | null
          form_type: string
          id: string
          is_active: boolean | null
          name: string
          target_table: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          factory_id?: string | null
          form_type: string
          id?: string
          is_active?: boolean | null
          name: string
          target_table: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          factory_id?: string | null
          form_type?: string
          id?: string
          is_active?: boolean | null
          name?: string
          target_table?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_templates_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          quantity: number
          sort_order: number
          style_number: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          sort_order?: number
          style_number?: string | null
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          sort_order?: number
          style_number?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          buyer_name: string
          created_at: string
          created_by: string | null
          currency: string
          due_date: string | null
          exchange_rate: number
          factory_id: string
          id: string
          invoice_number: string
          issue_date: string
          notes: string | null
          status: string
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          buyer_name: string
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          exchange_rate?: number
          factory_id: string
          id?: string
          invoice_number: string
          issue_date?: string
          notes?: string | null
          status?: string
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          buyer_name?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          exchange_rate?: number
          factory_id?: string
          id?: string
          invoice_number?: string
          issue_date?: string
          notes?: string | null
          status?: string
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string | null
          document_id: string
          embedding: string | null
          id: string
          page_number: number | null
          section_heading: string | null
          tokens_count: number | null
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string | null
          document_id: string
          embedding?: string | null
          id?: string
          page_number?: number | null
          section_heading?: string | null
          tokens_count?: number | null
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string | null
          document_id?: string
          embedding?: string | null
          id?: string
          page_number?: number | null
          section_heading?: string | null
          tokens_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          content: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          document_type: string
          factory_id: string | null
          id: string
          is_active: boolean | null
          is_global: boolean | null
          language: string | null
          source_url: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          document_type?: string
          factory_id?: string | null
          id?: string
          is_active?: boolean | null
          is_global?: boolean | null
          language?: string | null
          source_url?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          document_type?: string
          factory_id?: string | null
          id?: string
          is_active?: boolean | null
          is_global?: boolean | null
          language?: string | null
          source_url?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      lines: {
        Row: {
          created_at: string | null
          deactivated_at: string | null
          factory_id: string
          floor_id: string | null
          id: string
          is_active: boolean | null
          line_id: string
          name: string | null
          target_efficiency: number | null
          target_per_day: number | null
          target_per_hour: number | null
          unit_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deactivated_at?: string | null
          factory_id: string
          floor_id?: string | null
          id?: string
          is_active?: boolean | null
          line_id: string
          name?: string | null
          target_efficiency?: number | null
          target_per_day?: number | null
          target_per_hour?: number | null
          unit_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deactivated_at?: string | null
          factory_id?: string
          floor_id?: string | null
          id?: string
          is_active?: boolean | null
          line_id?: string
          name?: string | null
          target_efficiency?: number | null
          target_per_day?: number | null
          target_per_hour?: number | null
          unit_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lines_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lines_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lines_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      next_milestone_options: {
        Row: {
          created_at: string | null
          factory_id: string
          id: string
          is_active: boolean | null
          label: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          factory_id: string
          id?: string
          is_active?: boolean | null
          label: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          factory_id?: string
          id?: string
          is_active?: boolean | null
          label?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string | null
          email_enabled: boolean | null
          factory_id: string
          id: string
          in_app_enabled: boolean | null
          notification_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email_enabled?: boolean | null
          factory_id: string
          id?: string
          in_app_enabled?: boolean | null
          notification_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email_enabled?: boolean | null
          factory_id?: string
          id?: string
          in_app_enabled?: boolean | null
          notification_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          data: Json | null
          factory_id: string
          id: string
          is_read: boolean | null
          message: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          factory_id: string
          id?: string
          is_read?: boolean | null
          message?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          factory_id?: string
          id?: string
          is_read?: boolean | null
          message?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      production_note_comments: {
        Row: {
          body: string
          created_at: string
          created_by: string
          id: string
          note_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          id?: string
          note_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          note_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_note_comments_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "production_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      production_notes: {
        Row: {
          action_taken: string | null
          body: string
          created_at: string
          created_by: string
          department: string | null
          factory_id: string
          id: string
          impact: string | null
          line_id: string | null
          resolution_summary: string | null
          resolved_at: string | null
          status: string
          tag: string
          title: string
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          action_taken?: string | null
          body: string
          created_at?: string
          created_by: string
          department?: string | null
          factory_id: string
          id?: string
          impact?: string | null
          line_id?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          status?: string
          tag?: string
          title: string
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          action_taken?: string | null
          body?: string
          created_at?: string
          created_by?: string
          department?: string | null
          factory_id?: string
          id?: string
          impact?: string | null
          line_id?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          status?: string
          tag?: string
          title?: string
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_notes_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_notes_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_notes_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_updates_finishing: {
        Row: {
          average_production: number | null
          blocker_description: string | null
          blocker_impact: Database["public"]["Enums"]["blocker_impact"] | null
          blocker_owner: string | null
          blocker_status: Database["public"]["Enums"]["blocker_status"] | null
          blocker_type_id: string | null
          buyer_name: string | null
          created_at: string | null
          day_carton: number | null
          day_hour: number | null
          day_over_time: number | null
          day_poly: number | null
          day_qc_pass: number | null
          estimated_cost_currency: string | null
          estimated_cost_value: number | null
          factory_id: string
          factory_name: string | null
          floor_name: string | null
          has_blocker: boolean | null
          id: string
          item_name: string | null
          line_id: string
          m_power: number | null
          manpower: number | null
          notes: string | null
          order_quantity: number | null
          ot_hours: number | null
          ot_manpower: number | null
          packed_qty: number | null
          per_hour_target: number | null
          photo_urls: string[] | null
          production_date: string
          qc_fail_qty: number | null
          qc_pass_qty: number
          remarks: string | null
          shift: string | null
          shipped_qty: number | null
          stage_id: string | null
          stage_progress: number | null
          style_no: string | null
          submitted_at: string | null
          submitted_by: string | null
          total_carton: number | null
          total_hour: number | null
          total_over_time: number | null
          total_poly: number | null
          total_qc_pass: number | null
          unit_name: string | null
          work_order_id: string | null
        }
        Insert: {
          average_production?: number | null
          blocker_description?: string | null
          blocker_impact?: Database["public"]["Enums"]["blocker_impact"] | null
          blocker_owner?: string | null
          blocker_status?: Database["public"]["Enums"]["blocker_status"] | null
          blocker_type_id?: string | null
          buyer_name?: string | null
          created_at?: string | null
          day_carton?: number | null
          day_hour?: number | null
          day_over_time?: number | null
          day_poly?: number | null
          day_qc_pass?: number | null
          estimated_cost_currency?: string | null
          estimated_cost_value?: number | null
          factory_id: string
          factory_name?: string | null
          floor_name?: string | null
          has_blocker?: boolean | null
          id?: string
          item_name?: string | null
          line_id: string
          m_power?: number | null
          manpower?: number | null
          notes?: string | null
          order_quantity?: number | null
          ot_hours?: number | null
          ot_manpower?: number | null
          packed_qty?: number | null
          per_hour_target?: number | null
          photo_urls?: string[] | null
          production_date?: string
          qc_fail_qty?: number | null
          qc_pass_qty?: number
          remarks?: string | null
          shift?: string | null
          shipped_qty?: number | null
          stage_id?: string | null
          stage_progress?: number | null
          style_no?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          total_carton?: number | null
          total_hour?: number | null
          total_over_time?: number | null
          total_poly?: number | null
          total_qc_pass?: number | null
          unit_name?: string | null
          work_order_id?: string | null
        }
        Update: {
          average_production?: number | null
          blocker_description?: string | null
          blocker_impact?: Database["public"]["Enums"]["blocker_impact"] | null
          blocker_owner?: string | null
          blocker_status?: Database["public"]["Enums"]["blocker_status"] | null
          blocker_type_id?: string | null
          buyer_name?: string | null
          created_at?: string | null
          day_carton?: number | null
          day_hour?: number | null
          day_over_time?: number | null
          day_poly?: number | null
          day_qc_pass?: number | null
          estimated_cost_currency?: string | null
          estimated_cost_value?: number | null
          factory_id?: string
          factory_name?: string | null
          floor_name?: string | null
          has_blocker?: boolean | null
          id?: string
          item_name?: string | null
          line_id?: string
          m_power?: number | null
          manpower?: number | null
          notes?: string | null
          order_quantity?: number | null
          ot_hours?: number | null
          ot_manpower?: number | null
          packed_qty?: number | null
          per_hour_target?: number | null
          photo_urls?: string[] | null
          production_date?: string
          qc_fail_qty?: number | null
          qc_pass_qty?: number
          remarks?: string | null
          shift?: string | null
          shipped_qty?: number | null
          stage_id?: string | null
          stage_progress?: number | null
          style_no?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          total_carton?: number | null
          total_hour?: number | null
          total_over_time?: number | null
          total_poly?: number | null
          total_qc_pass?: number | null
          unit_name?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_updates_finishing_blocker_type_id_fkey"
            columns: ["blocker_type_id"]
            isOneToOne: false
            referencedRelation: "blocker_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_updates_finishing_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_updates_finishing_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_updates_finishing_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_updates_finishing_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_updates_sewing: {
        Row: {
          action_taken_today: string | null
          blocker_description: string | null
          blocker_impact: Database["public"]["Enums"]["blocker_impact"] | null
          blocker_owner: string | null
          blocker_resolution_date: string | null
          blocker_status: Database["public"]["Enums"]["blocker_status"] | null
          blocker_type_id: string | null
          buyer_name: string | null
          color: string | null
          created_at: string | null
          cumulative_good_total: number | null
          custom_data: Json | null
          estimated_cost_currency: string | null
          estimated_cost_value: number | null
          estimated_ex_factory: string | null
          factory_id: string
          factory_name: string | null
          floor_name: string | null
          has_blocker: boolean | null
          id: string
          item_name: string | null
          line_id: string
          manpower: number | null
          next_milestone: string | null
          notes: string | null
          order_qty: number | null
          ot_hours: number | null
          ot_manpower: number | null
          output_qty: number
          per_hour_target: number | null
          photo_urls: string[] | null
          po_number: string | null
          production_date: string
          reject_qty: number | null
          rework_qty: number | null
          shift: string | null
          smv: number | null
          stage_id: string | null
          stage_progress: number | null
          style_code: string | null
          submitted_at: string | null
          submitted_by: string | null
          target_qty: number | null
          unit_name: string | null
          work_order_id: string | null
        }
        Insert: {
          action_taken_today?: string | null
          blocker_description?: string | null
          blocker_impact?: Database["public"]["Enums"]["blocker_impact"] | null
          blocker_owner?: string | null
          blocker_resolution_date?: string | null
          blocker_status?: Database["public"]["Enums"]["blocker_status"] | null
          blocker_type_id?: string | null
          buyer_name?: string | null
          color?: string | null
          created_at?: string | null
          cumulative_good_total?: number | null
          custom_data?: Json | null
          estimated_cost_currency?: string | null
          estimated_cost_value?: number | null
          estimated_ex_factory?: string | null
          factory_id: string
          factory_name?: string | null
          floor_name?: string | null
          has_blocker?: boolean | null
          id?: string
          item_name?: string | null
          line_id: string
          manpower?: number | null
          next_milestone?: string | null
          notes?: string | null
          order_qty?: number | null
          ot_hours?: number | null
          ot_manpower?: number | null
          output_qty?: number
          per_hour_target?: number | null
          photo_urls?: string[] | null
          po_number?: string | null
          production_date?: string
          reject_qty?: number | null
          rework_qty?: number | null
          shift?: string | null
          smv?: number | null
          stage_id?: string | null
          stage_progress?: number | null
          style_code?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          target_qty?: number | null
          unit_name?: string | null
          work_order_id?: string | null
        }
        Update: {
          action_taken_today?: string | null
          blocker_description?: string | null
          blocker_impact?: Database["public"]["Enums"]["blocker_impact"] | null
          blocker_owner?: string | null
          blocker_resolution_date?: string | null
          blocker_status?: Database["public"]["Enums"]["blocker_status"] | null
          blocker_type_id?: string | null
          buyer_name?: string | null
          color?: string | null
          created_at?: string | null
          cumulative_good_total?: number | null
          custom_data?: Json | null
          estimated_cost_currency?: string | null
          estimated_cost_value?: number | null
          estimated_ex_factory?: string | null
          factory_id?: string
          factory_name?: string | null
          floor_name?: string | null
          has_blocker?: boolean | null
          id?: string
          item_name?: string | null
          line_id?: string
          manpower?: number | null
          next_milestone?: string | null
          notes?: string | null
          order_qty?: number | null
          ot_hours?: number | null
          ot_manpower?: number | null
          output_qty?: number
          per_hour_target?: number | null
          photo_urls?: string[] | null
          po_number?: string | null
          production_date?: string
          reject_qty?: number | null
          rework_qty?: number | null
          shift?: string | null
          smv?: number | null
          stage_id?: string | null
          stage_progress?: number | null
          style_code?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          target_qty?: number | null
          unit_name?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_updates_sewing_blocker_type_id_fkey"
            columns: ["blocker_type_id"]
            isOneToOne: false
            referencedRelation: "blocker_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_updates_sewing_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_updates_sewing_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_updates_sewing_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_updates_sewing_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          assigned_floor_id: string | null
          assigned_unit_id: string | null
          avatar_url: string | null
          buyer_company_name: string | null
          created_at: string | null
          department: string | null
          email: string
          factory_id: string | null
          full_name: string
          id: string
          invitation_status: string | null
          is_active: boolean | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_floor_id?: string | null
          assigned_unit_id?: string | null
          avatar_url?: string | null
          buyer_company_name?: string | null
          created_at?: string | null
          department?: string | null
          email: string
          factory_id?: string | null
          full_name: string
          id: string
          invitation_status?: string | null
          is_active?: boolean | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_floor_id?: string | null
          assigned_unit_id?: string | null
          avatar_url?: string | null
          buyer_company_name?: string | null
          created_at?: string | null
          department?: string | null
          email?: string
          factory_id?: string | null
          full_name?: string
          id?: string
          invitation_status?: string | null
          is_active?: boolean | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          action_type: string
          attempts: number | null
          blocked_until: string | null
          first_attempt_at: string | null
          id: string
          identifier: string
          last_attempt_at: string | null
        }
        Insert: {
          action_type: string
          attempts?: number | null
          blocked_until?: string | null
          first_attempt_at?: string | null
          id?: string
          identifier: string
          last_attempt_at?: string | null
        }
        Update: {
          action_type?: string
          attempts?: number | null
          blocked_until?: string | null
          first_attempt_at?: string | null
          id?: string
          identifier?: string
          last_attempt_at?: string | null
        }
        Relationships: []
      }
      role_feature_access: {
        Row: {
          created_at: string | null
          feature: string
          id: string
          role: string
        }
        Insert: {
          created_at?: string | null
          feature: string
          id?: string
          role: string
        }
        Update: {
          created_at?: string | null
          feature?: string
          id?: string
          role?: string
        }
        Relationships: []
      }
      security_events: {
        Row: {
          created_at: string | null
          details: Json | null
          event_type: string
          factory_id: string | null
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          event_type: string
          factory_id?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          event_type?: string
          factory_id?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      sewing_actuals: {
        Row: {
          action_taken_today: string | null
          actual_per_hour: number | null
          actual_stage_id: string | null
          actual_stage_progress: number
          blocker_description: string | null
          blocker_impact: Database["public"]["Enums"]["blocker_impact"] | null
          blocker_owner: string | null
          blocker_resolution_date: string | null
          blocker_type_id: string | null
          buyer_name: string | null
          created_at: string | null
          cumulative_good_total: number
          custom_data: Json | null
          estimated_cost_currency: string | null
          estimated_cost_value: number | null
          factory_id: string
          floor_name: string | null
          good_today: number
          has_blocker: boolean | null
          hours_actual: number | null
          id: string
          item_name: string | null
          line_id: string
          manpower_actual: number
          order_qty: number | null
          ot_hours_actual: number
          ot_manpower_actual: number | null
          photo_urls: string[] | null
          production_date: string
          reject_today: number
          remarks: string | null
          rework_today: number
          style_code: string | null
          submitted_at: string | null
          submitted_by: string | null
          unit_name: string | null
          work_order_id: string
        }
        Insert: {
          action_taken_today?: string | null
          actual_per_hour?: number | null
          actual_stage_id?: string | null
          actual_stage_progress?: number
          blocker_description?: string | null
          blocker_impact?: Database["public"]["Enums"]["blocker_impact"] | null
          blocker_owner?: string | null
          blocker_resolution_date?: string | null
          blocker_type_id?: string | null
          buyer_name?: string | null
          created_at?: string | null
          cumulative_good_total?: number
          custom_data?: Json | null
          estimated_cost_currency?: string | null
          estimated_cost_value?: number | null
          factory_id: string
          floor_name?: string | null
          good_today?: number
          has_blocker?: boolean | null
          hours_actual?: number | null
          id?: string
          item_name?: string | null
          line_id: string
          manpower_actual?: number
          order_qty?: number | null
          ot_hours_actual?: number
          ot_manpower_actual?: number | null
          photo_urls?: string[] | null
          production_date?: string
          reject_today?: number
          remarks?: string | null
          rework_today?: number
          style_code?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          unit_name?: string | null
          work_order_id: string
        }
        Update: {
          action_taken_today?: string | null
          actual_per_hour?: number | null
          actual_stage_id?: string | null
          actual_stage_progress?: number
          blocker_description?: string | null
          blocker_impact?: Database["public"]["Enums"]["blocker_impact"] | null
          blocker_owner?: string | null
          blocker_resolution_date?: string | null
          blocker_type_id?: string | null
          buyer_name?: string | null
          created_at?: string | null
          cumulative_good_total?: number
          custom_data?: Json | null
          estimated_cost_currency?: string | null
          estimated_cost_value?: number | null
          factory_id?: string
          floor_name?: string | null
          good_today?: number
          has_blocker?: boolean | null
          hours_actual?: number | null
          id?: string
          item_name?: string | null
          line_id?: string
          manpower_actual?: number
          order_qty?: number | null
          ot_hours_actual?: number
          ot_manpower_actual?: number | null
          photo_urls?: string[] | null
          production_date?: string
          reject_today?: number
          remarks?: string | null
          rework_today?: number
          style_code?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          unit_name?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sewing_actuals_actual_stage_id_fkey"
            columns: ["actual_stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sewing_actuals_blocker_type_id_fkey"
            columns: ["blocker_type_id"]
            isOneToOne: false
            referencedRelation: "blocker_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sewing_actuals_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sewing_actuals_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sewing_actuals_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sewing_targets: {
        Row: {
          buyer_name: string | null
          created_at: string | null
          custom_data: Json | null
          estimated_ex_factory: string | null
          factory_id: string
          floor_name: string | null
          hours_planned: number | null
          id: string
          is_late: boolean | null
          item_name: string | null
          line_id: string
          manpower_planned: number
          next_milestone: string | null
          order_qty: number | null
          ot_hours_planned: number
          per_hour_target: number
          planned_stage_id: string | null
          planned_stage_progress: number
          production_date: string
          remarks: string | null
          style_code: string | null
          submitted_at: string | null
          submitted_by: string | null
          target_total_planned: number | null
          unit_name: string | null
          work_order_id: string
        }
        Insert: {
          buyer_name?: string | null
          created_at?: string | null
          custom_data?: Json | null
          estimated_ex_factory?: string | null
          factory_id: string
          floor_name?: string | null
          hours_planned?: number | null
          id?: string
          is_late?: boolean | null
          item_name?: string | null
          line_id: string
          manpower_planned: number
          next_milestone?: string | null
          order_qty?: number | null
          ot_hours_planned?: number
          per_hour_target: number
          planned_stage_id?: string | null
          planned_stage_progress?: number
          production_date?: string
          remarks?: string | null
          style_code?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          target_total_planned?: number | null
          unit_name?: string | null
          work_order_id: string
        }
        Update: {
          buyer_name?: string | null
          created_at?: string | null
          custom_data?: Json | null
          estimated_ex_factory?: string | null
          factory_id?: string
          floor_name?: string | null
          hours_planned?: number | null
          id?: string
          is_late?: boolean | null
          item_name?: string | null
          line_id?: string
          manpower_planned?: number
          next_milestone?: string | null
          order_qty?: number | null
          ot_hours_planned?: number
          per_hour_target?: number
          planned_stage_id?: string | null
          planned_stage_progress?: number
          production_date?: string
          remarks?: string | null
          style_code?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          target_total_planned?: number | null
          unit_name?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sewing_targets_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sewing_targets_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sewing_targets_planned_stage_id_fkey"
            columns: ["planned_stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sewing_targets_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_progress_options: {
        Row: {
          created_at: string | null
          factory_id: string
          id: string
          is_active: boolean | null
          label: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          factory_id: string
          id?: string
          is_active?: boolean | null
          label: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          factory_id?: string
          id?: string
          is_active?: boolean | null
          label?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      stages: {
        Row: {
          code: string
          created_at: string | null
          factory_id: string
          id: string
          is_active: boolean | null
          name: string
          sequence: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          factory_id: string
          id?: string
          is_active?: boolean | null
          name: string
          sequence?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          factory_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          sequence?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stages_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_bin_card_transactions: {
        Row: {
          balance_qty: number
          batch_id: string | null
          bin_card_id: string
          created_at: string | null
          factory_id: string
          id: string
          issue_qty: number
          receive_qty: number
          remarks: string | null
          submitted_by: string | null
          transaction_date: string
          ttl_receive: number
        }
        Insert: {
          balance_qty?: number
          batch_id?: string | null
          bin_card_id: string
          created_at?: string | null
          factory_id: string
          id?: string
          issue_qty?: number
          receive_qty?: number
          remarks?: string | null
          submitted_by?: string | null
          transaction_date?: string
          ttl_receive?: number
        }
        Update: {
          balance_qty?: number
          batch_id?: string | null
          bin_card_id?: string
          created_at?: string | null
          factory_id?: string
          id?: string
          issue_qty?: number
          receive_qty?: number
          remarks?: string | null
          submitted_by?: string | null
          transaction_date?: string
          ttl_receive?: number
        }
        Relationships: [
          {
            foreignKeyName: "storage_bin_card_transactions_bin_card_id_fkey"
            columns: ["bin_card_id"]
            isOneToOne: false
            referencedRelation: "storage_bin_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_bin_card_transactions_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_bin_cards: {
        Row: {
          bin_group_id: string | null
          buyer: string | null
          color: string | null
          construction: string | null
          created_at: string | null
          description: string | null
          factory_id: string
          group_name: string | null
          id: string
          is_header_locked: boolean | null
          package_qty: string | null
          po_set_signature: string | null
          prepared_by: string | null
          prepared_by_user_id: string | null
          style: string | null
          supplier_name: string | null
          updated_at: string | null
          width: string | null
          work_order_id: string
        }
        Insert: {
          bin_group_id?: string | null
          buyer?: string | null
          color?: string | null
          construction?: string | null
          created_at?: string | null
          description?: string | null
          factory_id: string
          group_name?: string | null
          id?: string
          is_header_locked?: boolean | null
          package_qty?: string | null
          po_set_signature?: string | null
          prepared_by?: string | null
          prepared_by_user_id?: string | null
          style?: string | null
          supplier_name?: string | null
          updated_at?: string | null
          width?: string | null
          work_order_id: string
        }
        Update: {
          bin_group_id?: string | null
          buyer?: string | null
          color?: string | null
          construction?: string | null
          created_at?: string | null
          description?: string | null
          factory_id?: string
          group_name?: string | null
          id?: string
          is_header_locked?: boolean | null
          package_qty?: string | null
          po_set_signature?: string | null
          prepared_by?: string | null
          prepared_by_user_id?: string | null
          style?: string | null
          supplier_name?: string | null
          updated_at?: string | null
          width?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_bin_cards_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_bin_cards_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          code: string
          created_at: string | null
          factory_id: string
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          factory_id: string
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          factory_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "units_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_line_assignments: {
        Row: {
          created_at: string
          factory_id: string
          id: string
          line_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          factory_id: string
          id?: string
          line_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          factory_id?: string
          id?: string
          line_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_line_assignments_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_line_assignments_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          factory_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          factory_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          factory_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_signatures: {
        Row: {
          factory_id: string
          id: string
          registered_at: string
          signature_url: string
          updated_at: string
          user_id: string
        }
        Insert: {
          factory_id: string
          id?: string
          registered_at?: string
          signature_url: string
          updated_at?: string
          user_id: string
        }
        Update: {
          factory_id?: string
          id?: string
          registered_at?: string
          signature_url?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_signatures_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_line_assignments: {
        Row: {
          created_at: string
          factory_id: string
          id: string
          line_id: string
          work_order_id: string
        }
        Insert: {
          created_at?: string
          factory_id: string
          id?: string
          line_id: string
          work_order_id: string
        }
        Update: {
          created_at?: string
          factory_id?: string
          id?: string
          line_id?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_line_assignments_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_assignments_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_assignments_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          actual_ex_factory: string | null
          buyer: string
          cm_per_dozen: number | null
          color: string | null
          construction: string | null
          created_at: string | null
          description: string | null
          factory_id: string
          id: string
          is_active: boolean | null
          item: string | null
          line_id: string | null
          order_qty: number
          package_qty: number | null
          planned_ex_factory: string | null
          po_number: string
          smv: number | null
          status: string | null
          style: string
          supplier_name: string | null
          target_per_day: number | null
          target_per_hour: number | null
          updated_at: string | null
          width: string | null
        }
        Insert: {
          actual_ex_factory?: string | null
          buyer: string
          cm_per_dozen?: number | null
          color?: string | null
          construction?: string | null
          created_at?: string | null
          description?: string | null
          factory_id: string
          id?: string
          is_active?: boolean | null
          item?: string | null
          line_id?: string | null
          order_qty?: number
          package_qty?: number | null
          planned_ex_factory?: string | null
          po_number: string
          smv?: number | null
          status?: string | null
          style: string
          supplier_name?: string | null
          target_per_day?: number | null
          target_per_hour?: number | null
          updated_at?: string | null
          width?: string | null
        }
        Update: {
          actual_ex_factory?: string | null
          buyer?: string
          cm_per_dozen?: number | null
          color?: string | null
          construction?: string | null
          created_at?: string | null
          description?: string | null
          factory_id?: string
          id?: string
          is_active?: boolean | null
          item?: string | null
          line_id?: string | null
          order_qty?: number
          package_qty?: number | null
          planned_ex_factory?: string | null
          po_number?: string
          smv?: number | null
          status?: string | null
          style?: string
          supplier_name?: string | null
          target_per_day?: number | null
          target_per_hour?: number | null
          updated_at?: string | null
          width?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factory_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_activate_line: { Args: { _factory_id: string }; Returns: boolean }
      check_rate_limit: {
        Args: {
          p_action_type: string
          p_block_minutes?: number
          p_identifier: string
          p_max_attempts?: number
          p_window_minutes?: number
        }
        Returns: Json
      }
      count_active_lines: { Args: { _factory_id: string }; Returns: number }
      factory_has_active_access: {
        Args: { _factory_id: string }
        Returns: boolean
      }
      get_buyer_membership_count: {
        Args: { _user_id: string }
        Returns: number
      }
      get_plan_max_lines: { Args: { _factory_id: string }; Returns: number }
      get_user_accessible_features: {
        Args: { p_user_id: string }
        Returns: {
          feature: string
        }[]
      }
      get_user_factory_id: { Args: { _user_id: string }; Returns: string }
      has_cutting_role: { Args: { user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_storage_role: { Args: { _user_id: string }; Returns: boolean }
      increment_dispatch_sequence: {
        Args: { p_date: string; p_factory_id: string }
        Returns: number
      }
      is_admin_or_higher: { Args: { _user_id: string }; Returns: boolean }
      is_buyer_role: { Args: { _user_id: string }; Returns: boolean }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
      is_supervisor_or_higher: { Args: { _user_id: string }; Returns: boolean }
      log_security_event: {
        Args: {
          p_details?: Json
          p_event_type: string
          p_factory_id?: string
          p_ip_address?: string
          p_user_agent?: string
          p_user_id?: string
        }
        Returns: undefined
      }
      search_knowledge: {
        Args: {
          match_count?: number
          match_threshold?: number
          p_factory_id?: string
          p_language?: string
          query_embedding: string
        }
        Returns: {
          chunk_id: string
          content: string
          document_id: string
          document_title: string
          document_type: string
          page_number: number
          section_heading: string
          similarity: number
          source_url: string
        }[]
      }
      user_belongs_to_factory: {
        Args: { _factory_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "worker"
        | "supervisor"
        | "admin"
        | "owner"
        | "superadmin"
        | "storage"
        | "cutting"
        | "sewing"
        | "finishing"
        | "buyer"
        | "gate_officer"
      blocker_impact: "low" | "medium" | "high" | "critical"
      blocker_status: "open" | "in_progress" | "resolved"
      extras_transaction_type:
        | "sold"
        | "transferred_to_stock"
        | "replacement_shipment"
        | "scrapped"
        | "donated"
        | "adjustment"
      finishing_hour_slot:
        | "08-09"
        | "09-10"
        | "10-11"
        | "11-12"
        | "12-01"
        | "02-03"
        | "03-04"
        | "04-05"
        | "05-06"
        | "06-07"
        | "OT-1"
        | "OT-2"
        | "OT-3"
        | "OT-4"
        | "OT-5"
      finishing_log_type: "TARGET" | "OUTPUT"
      subscription_tier:
        | "starter"
        | "professional"
        | "enterprise"
        | "unlimited"
        | "growth"
        | "scale"
      update_type: "sewing" | "finishing"
      work_order_status: "not_started" | "in_progress" | "completed" | "on_hold"
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
      app_role: [
        "worker",
        "supervisor",
        "admin",
        "owner",
        "superadmin",
        "storage",
        "cutting",
        "sewing",
        "finishing",
        "buyer",
        "gate_officer",
      ],
      blocker_impact: ["low", "medium", "high", "critical"],
      blocker_status: ["open", "in_progress", "resolved"],
      extras_transaction_type: [
        "sold",
        "transferred_to_stock",
        "replacement_shipment",
        "scrapped",
        "donated",
        "adjustment",
      ],
      finishing_hour_slot: [
        "08-09",
        "09-10",
        "10-11",
        "11-12",
        "12-01",
        "02-03",
        "03-04",
        "04-05",
        "05-06",
        "06-07",
        "OT-1",
        "OT-2",
        "OT-3",
        "OT-4",
        "OT-5",
      ],
      finishing_log_type: ["TARGET", "OUTPUT"],
      subscription_tier: [
        "starter",
        "professional",
        "enterprise",
        "unlimited",
        "growth",
        "scale",
      ],
      update_type: ["sewing", "finishing"],
      work_order_status: ["not_started", "in_progress", "completed", "on_hold"],
    },
  },
} as const
