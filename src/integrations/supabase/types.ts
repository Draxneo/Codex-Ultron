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
      action_items: {
        Row: {
          category: string
          created_at: string | null
          customer_phone: string | null
          description: string | null
          facts: Json | null
          id: string
          job_id: string | null
          metadata: Json | null
          priority: string
          resolved_at: string | null
          resolved_by: string | null
          source: string
          status: string
          suggested_action: string | null
          title: string
        }
        Insert: {
          category: string
          created_at?: string | null
          customer_phone?: string | null
          description?: string | null
          facts?: Json | null
          id?: string
          job_id?: string | null
          metadata?: Json | null
          priority?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string
          status?: string
          suggested_action?: string | null
          title: string
        }
        Update: {
          category?: string
          created_at?: string | null
          customer_phone?: string | null
          description?: string | null
          facts?: Json | null
          id?: string
          job_id?: string | null
          metadata?: Json | null
          priority?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string
          status?: string
          suggested_action?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          created_at: string
          details: string | null
          id: string
          job_id: string | null
          job_task_id: string | null
          performed_by: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          id?: string
          job_id?: string | null
          job_task_id?: string | null
          performed_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          id?: string
          job_id?: string | null
          job_task_id?: string | null
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      addons: {
        Row: {
          active: boolean
          brochure_url: string | null
          cost: number
          created_at: string
          description: string | null
          detail: string | null
          id: string
          image_url: string | null
          name: string
          promo_active: boolean
          promo_percent: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          brochure_url?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          detail?: string | null
          id?: string
          image_url?: string | null
          name: string
          promo_active?: boolean
          promo_percent?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          brochure_url?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          detail?: string | null
          id?: string
          image_url?: string | null
          name?: string
          promo_active?: boolean
          promo_percent?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      admin_card_positions: {
        Row: {
          card_key: string
          category_id: string
          id: string
          sort_order: number
          user_id: string
        }
        Insert: {
          card_key: string
          category_id: string
          id?: string
          sort_order?: number
          user_id: string
        }
        Update: {
          card_key?: string
          category_id?: string
          id?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_card_positions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "admin_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      agent_instructions: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_active: boolean | null
          label: string
          slug: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          content?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label: string
          slug: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string
          slug?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      agent_learnings: {
        Row: {
          correction: string
          created_at: string | null
          id: string
          instruction_slug: string | null
          trigger: string
        }
        Insert: {
          correction: string
          created_at?: string | null
          id?: string
          instruction_slug?: string | null
          trigger: string
        }
        Update: {
          correction?: string
          created_at?: string | null
          id?: string
          instruction_slug?: string | null
          trigger?: string
        }
        Relationships: []
      }
      agent_tools: {
        Row: {
          agent_id: string | null
          config: Json | null
          created_at: string | null
          description: string
          function_name: string
          id: string
          is_enabled: boolean | null
          name: string
        }
        Insert: {
          agent_id?: string | null
          config?: Json | null
          created_at?: string | null
          description?: string
          function_name: string
          id?: string
          is_enabled?: boolean | null
          name: string
        }
        Update: {
          agent_id?: string | null
          config?: Json | null
          created_at?: string | null
          description?: string
          function_name?: string
          id?: string
          is_enabled?: boolean | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tools_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agreement_presentations: {
        Row: {
          created_at: string
          customer_id: string
          enrolled_at: string | null
          first_viewed_at: string | null
          id: string
          last_viewed_at: string | null
          plan_options: Json
          token: string
          view_count: number
        }
        Insert: {
          created_at?: string
          customer_id: string
          enrolled_at?: string | null
          first_viewed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          plan_options?: Json
          token?: string
          view_count?: number
        }
        Update: {
          created_at?: string
          customer_id?: string
          enrolled_at?: string | null
          first_viewed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          plan_options?: Json
          token?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "agreement_presentations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      agreement_visits: {
        Row: {
          agreement_id: string
          created_at: string
          id: string
          job_id: string | null
          notes: string | null
          visit_date: string
        }
        Insert: {
          agreement_id: string
          created_at?: string
          id?: string
          job_id?: string | null
          notes?: string | null
          visit_date?: string
        }
        Update: {
          agreement_id?: string
          created_at?: string
          id?: string
          job_id?: string | null
          notes?: string | null
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "agreement_visits_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "service_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_visits_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      ahri_lookups: {
        Row: {
          ahri_number: string
          certificate_path: string | null
          cooling_cap_btuh: number | null
          created_at: string
          eer2: number | null
          energy_star: boolean | null
          furnace_model: string | null
          hspf2: number | null
          id: string
          indoor_brand: string | null
          indoor_model: string | null
          linked_matchup_id: string | null
          model_status: string | null
          outdoor_brand: string | null
          outdoor_model: string | null
          outdoor_series: string | null
          program_type: string | null
          raw_html: string | null
          raw_json: Json | null
          refrigerant: string | null
          seer2: number | null
        }
        Insert: {
          ahri_number: string
          certificate_path?: string | null
          cooling_cap_btuh?: number | null
          created_at?: string
          eer2?: number | null
          energy_star?: boolean | null
          furnace_model?: string | null
          hspf2?: number | null
          id?: string
          indoor_brand?: string | null
          indoor_model?: string | null
          linked_matchup_id?: string | null
          model_status?: string | null
          outdoor_brand?: string | null
          outdoor_model?: string | null
          outdoor_series?: string | null
          program_type?: string | null
          raw_html?: string | null
          raw_json?: Json | null
          refrigerant?: string | null
          seer2?: number | null
        }
        Update: {
          ahri_number?: string
          certificate_path?: string | null
          cooling_cap_btuh?: number | null
          created_at?: string
          eer2?: number | null
          energy_star?: boolean | null
          furnace_model?: string | null
          hspf2?: number | null
          id?: string
          indoor_brand?: string | null
          indoor_model?: string | null
          linked_matchup_id?: string | null
          model_status?: string | null
          outdoor_brand?: string | null
          outdoor_model?: string | null
          outdoor_series?: string | null
          program_type?: string | null
          raw_html?: string | null
          raw_json?: Json | null
          refrigerant?: string | null
          seer2?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ahri_lookups_linked_matchup_id_fkey"
            columns: ["linked_matchup_id"]
            isOneToOne: false
            referencedRelation: "equipment_matchups"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_connections: {
        Row: {
          created_at: string
          id: string
          source_agent_id: string
          target_agent_id: string
          trigger_description: string
        }
        Insert: {
          created_at?: string
          id?: string
          source_agent_id: string
          target_agent_id: string
          trigger_description?: string
        }
        Update: {
          created_at?: string
          id?: string
          source_agent_id?: string
          target_agent_id?: string
          trigger_description?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_connections_source_agent_id_fkey"
            columns: ["source_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_connections_target_agent_id_fkey"
            columns: ["target_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          created_at: string
          description: string
          edge_function: string | null
          id: string
          label: string
          name: string
          notes: string | null
          position: Json | null
          status: string
          tools: string[] | null
          triggers: string[] | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          edge_function?: string | null
          id?: string
          label: string
          name: string
          notes?: string | null
          position?: Json | null
          status?: string
          tools?: string[] | null
          triggers?: string[] | null
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          edge_function?: string | null
          id?: string
          label?: string
          name?: string
          notes?: string | null
          position?: Json | null
          status?: string
          tools?: string[] | null
          triggers?: string[] | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_model_config: {
        Row: {
          id: string
          label: string
          model: string
          task_key: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          label: string
          model?: string
          task_key: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          label?: string
          model?: string
          task_key?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      api_usage_log: {
        Row: {
          created_at: string
          endpoint: string | null
          estimated_cost_cents: number | null
          function_name: string
          id: string
          metadata: Json | null
          service: string
          tokens_used: number | null
        }
        Insert: {
          created_at?: string
          endpoint?: string | null
          estimated_cost_cents?: number | null
          function_name: string
          id?: string
          metadata?: Json | null
          service: string
          tokens_used?: number | null
        }
        Update: {
          created_at?: string
          endpoint?: string | null
          estimated_cost_cents?: number | null
          function_name?: string
          id?: string
          metadata?: Json | null
          service?: string
          tokens_used?: number | null
        }
        Relationships: []
      }
      auto_assign_rules: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          is_active: boolean
          job_type: string
          priority: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          is_active?: boolean
          job_type: string
          priority?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          is_active?: boolean
          job_type?: string
          priority?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_assign_rules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_profiles: {
        Row: {
          accent_bg: string
          accent_color: string
          badges: Json
          body_1: string
          body_2: string
          brand_key: string
          created_at: string
          display_name: string
          eyebrow: string
          gradient: string
          headline: string
          id: string
          is_active: boolean
          logo_url: string
          pill_bg: string
          refrigerant: Json
          subhead: string
          title: string
          updated_at: string
        }
        Insert: {
          accent_bg?: string
          accent_color?: string
          badges?: Json
          body_1?: string
          body_2?: string
          brand_key: string
          created_at?: string
          display_name?: string
          eyebrow?: string
          gradient?: string
          headline?: string
          id?: string
          is_active?: boolean
          logo_url?: string
          pill_bg?: string
          refrigerant?: Json
          subhead?: string
          title?: string
          updated_at?: string
        }
        Update: {
          accent_bg?: string
          accent_color?: string
          badges?: Json
          body_1?: string
          body_2?: string
          brand_key?: string
          created_at?: string
          display_name?: string
          eyebrow?: string
          gradient?: string
          headline?: string
          id?: string
          is_active?: boolean
          logo_url?: string
          pill_bg?: string
          refrigerant?: Json
          subhead?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      brochure_blocks: {
        Row: {
          accent_bg: string
          accent_color: string
          brand: string
          compressor_type: string
          created_at: string
          expected_lifespan: string
          features: Json
          header_gradient: string
          humidity_desc: string
          id: string
          label: string
          series: string
          sort_order: number
          sound_level: string
          tagline: string
          tier_bg: string
          tier_color: string
          updated_at: string
        }
        Insert: {
          accent_bg?: string
          accent_color?: string
          brand?: string
          compressor_type?: string
          created_at?: string
          expected_lifespan?: string
          features?: Json
          header_gradient?: string
          humidity_desc?: string
          id?: string
          label?: string
          series: string
          sort_order?: number
          sound_level?: string
          tagline?: string
          tier_bg?: string
          tier_color?: string
          updated_at?: string
        }
        Update: {
          accent_bg?: string
          accent_color?: string
          brand?: string
          compressor_type?: string
          created_at?: string
          expected_lifespan?: string
          features?: Json
          header_gradient?: string
          humidity_desc?: string
          id?: string
          label?: string
          series?: string
          sort_order?: number
          sound_level?: string
          tagline?: string
          tier_bg?: string
          tier_color?: string
          updated_at?: string
        }
        Relationships: []
      }
      call_log: {
        Row: {
          ai_summary: string | null
          answered_by: string | null
          call_extraction: Json | null
          contact_name: string | null
          contact_type: string
          created_at: string
          direction: string
          duration_seconds: number | null
          ended_at: string | null
          extracted_data: Json | null
          hcp_note_synced: boolean | null
          id: string
          is_read: boolean
          phone_number: string
          recording_url: string | null
          related_customer_id: string | null
          related_job_id: string | null
          related_vendor_id: string | null
          started_at: string | null
          status: string
          stir_status: string | null
          transcription: string | null
          twilio_sid: string | null
        }
        Insert: {
          ai_summary?: string | null
          answered_by?: string | null
          call_extraction?: Json | null
          contact_name?: string | null
          contact_type?: string
          created_at?: string
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          extracted_data?: Json | null
          hcp_note_synced?: boolean | null
          id?: string
          is_read?: boolean
          phone_number: string
          recording_url?: string | null
          related_customer_id?: string | null
          related_job_id?: string | null
          related_vendor_id?: string | null
          started_at?: string | null
          status?: string
          stir_status?: string | null
          transcription?: string | null
          twilio_sid?: string | null
        }
        Update: {
          ai_summary?: string | null
          answered_by?: string | null
          call_extraction?: Json | null
          contact_name?: string | null
          contact_type?: string
          created_at?: string
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          extracted_data?: Json | null
          hcp_note_synced?: boolean | null
          id?: string
          is_read?: boolean
          phone_number?: string
          recording_url?: string | null
          related_customer_id?: string | null
          related_job_id?: string | null
          related_vendor_id?: string | null
          started_at?: string | null
          status?: string
          stir_status?: string | null
          transcription?: string | null
          twilio_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_log_related_job_id_fkey"
            columns: ["related_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_log_related_vendor_id_fkey"
            columns: ["related_vendor_id"]
            isOneToOne: false
            referencedRelation: "supply_houses"
            referencedColumns: ["id"]
          },
        ]
      }
      call_routing_rules: {
        Row: {
          created_at: string
          department: string
          employee_name: string
          id: string
          is_active: boolean
          priority: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          department: string
          employee_name: string
          id?: string
          is_active?: boolean
          priority?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string
          employee_name?: string
          id?: string
          is_active?: boolean
          priority?: number
          updated_at?: string
        }
        Relationships: []
      }
      cart_addon_rules: {
        Row: {
          badge: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          sort_order: number
          suggestion_kind: string
          suggestion_source_id: string | null
          trigger_kind: string
          trigger_source_id: string | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          badge?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          sort_order?: number
          suggestion_kind: string
          suggestion_source_id?: string | null
          trigger_kind: string
          trigger_source_id?: string | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          badge?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          sort_order?: number
          suggestion_kind?: string
          suggestion_source_id?: string | null
          trigger_kind?: string
          trigger_source_id?: string | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      cart_discounts: {
        Row: {
          auto_apply_tag: string | null
          code: string
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          min_total: number
          updated_at: string
          use_count: number
        }
        Insert: {
          auto_apply_tag?: string | null
          code: string
          created_at?: string
          description?: string | null
          discount_type: string
          discount_value: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_total?: number
          updated_at?: string
          use_count?: number
        }
        Update: {
          auto_apply_tag?: string | null
          code?: string
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_total?: number
          updated_at?: string
          use_count?: number
        }
        Relationships: []
      }
      ce_order_items: {
        Row: {
          ce_order_number: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          item_number: string | null
          job_id: string | null
          mfr_number: string | null
          quantity: number | null
          serial_number: string | null
          subtotal: number | null
          unit_price: number | null
        }
        Insert: {
          ce_order_number: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          item_number?: string | null
          job_id?: string | null
          mfr_number?: string | null
          quantity?: number | null
          serial_number?: string | null
          subtotal?: number | null
          unit_price?: number | null
        }
        Update: {
          ce_order_number?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          item_number?: string | null
          job_id?: string | null
          mfr_number?: string | null
          quantity?: number | null
          serial_number?: string | null
          subtotal?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ce_order_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_templates: {
        Row: {
          body_template: string
          created_at: string
          display_name: string
          fields_schema: Json
          id: string
          is_active: boolean
          subtitle_template: string
          type_key: string
          updated_at: string
          warranty_years: number | null
        }
        Insert: {
          body_template?: string
          created_at?: string
          display_name: string
          fields_schema?: Json
          id?: string
          is_active?: boolean
          subtitle_template?: string
          type_key: string
          updated_at?: string
          warranty_years?: number | null
        }
        Update: {
          body_template?: string
          created_at?: string
          display_name?: string
          fields_schema?: Json
          id?: string
          is_active?: boolean
          subtitle_template?: string
          type_key?: string
          updated_at?: string
          warranty_years?: number | null
        }
        Relationships: []
      }
      chat_channels: {
        Row: {
          created_at: string
          description: string | null
          estimate_id: string | null
          id: string
          is_special: boolean
          job_id: string | null
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          estimate_id?: string | null
          id?: string
          is_special?: boolean
          job_id?: string | null
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          estimate_id?: string | null
          id?: string
          is_special?: boolean
          job_id?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_channels_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_channels_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_huddles: {
        Row: {
          channel_id: string
          ended_at: string | null
          id: string
          participant_ids: string[] | null
          started_at: string
          started_by: string
        }
        Insert: {
          channel_id: string
          ended_at?: string | null
          id?: string
          participant_ids?: string[] | null
          started_at?: string
          started_by: string
        }
        Update: {
          channel_id?: string
          ended_at?: string | null
          id?: string
          participant_ids?: string[] | null
          started_at?: string
          started_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_huddles_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          attachments: Json | null
          channel_id: string
          content: string
          created_at: string
          edited_at: string | null
          id: string
          is_deleted: boolean
          is_pinned: boolean
          pinned_by: string | null
          reply_to_id: string | null
          sender_name: string
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          channel_id: string
          content: string
          created_at?: string
          edited_at?: string | null
          id?: string
          is_deleted?: boolean
          is_pinned?: boolean
          pinned_by?: string | null
          reply_to_id?: string | null
          sender_name: string
          user_id: string
        }
        Update: {
          attachments?: Json | null
          channel_id?: string
          content?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          is_deleted?: boolean
          is_pinned?: boolean
          pinned_by?: string | null
          reply_to_id?: string | null
          sender_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_read_cursors: {
        Row: {
          channel_id: string
          id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          id?: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_read_cursors_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value?: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      comparison_blocks: {
        Row: {
          category: string
          created_at: string
          icon: string
          id: string
          rows: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          icon?: string
          id?: string
          rows?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          icon?: string
          id?: string
          rows?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      copilot_button_clicks: {
        Row: {
          action_key: string
          action_label: string
          context_subtype: string | null
          context_type: string
          created_at: string
          customer_id: string | null
          id: string
          job_id: string | null
          user_id: string | null
        }
        Insert: {
          action_key: string
          action_label: string
          context_subtype?: string | null
          context_type: string
          created_at?: string
          customer_id?: string | null
          id?: string
          job_id?: string | null
          user_id?: string | null
        }
        Update: {
          action_key?: string
          action_label?: string
          context_subtype?: string | null
          context_type?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          job_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      copilot_messages: {
        Row: {
          content: string
          created_at: string
          employee_id: string | null
          id: string
          metadata: Json | null
          role: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          employee_id?: string | null
          id?: string
          metadata?: Json | null
          role: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          employee_id?: string | null
          id?: string
          metadata?: Json | null
          role?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_messages_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "copilot_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_permissions: {
        Row: {
          allowed: boolean
          category: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          allowed?: boolean
          category: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          allowed?: boolean
          category?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: []
      }
      copilot_sessions: {
        Row: {
          call_sid: string | null
          created_at: string
          employee_id: string | null
          ended_at: string | null
          id: string
          label: string
          phone_number: string | null
          user_id: string
        }
        Insert: {
          call_sid?: string | null
          created_at?: string
          employee_id?: string | null
          ended_at?: string | null
          id?: string
          label?: string
          phone_number?: string | null
          user_id: string
        }
        Update: {
          call_sid?: string | null
          created_at?: string
          employee_id?: string | null
          ended_at?: string | null
          id?: string
          label?: string
          phone_number?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_sessions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_training: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          is_active: boolean | null
          updated_at: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      cron_job_runs: {
        Row: {
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          job_name: string
          metadata: Json | null
          rows_processed: number | null
          started_at: string
          status: string
        }
        Insert: {
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          job_name: string
          metadata?: Json | null
          rows_processed?: number | null
          started_at?: string
          status?: string
        }
        Update: {
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          job_name?: string
          metadata?: Json | null
          rows_processed?: number | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      customer_activity_feed: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          body: string | null
          created_at: string
          customer_id: string
          event_type: string
          id: string
          metadata: Json | null
          related_job_id: string | null
          source: string | null
          title: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          body?: string | null
          created_at?: string
          customer_id: string
          event_type: string
          id?: string
          metadata?: Json | null
          related_job_id?: string | null
          source?: string | null
          title: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          body?: string | null
          created_at?: string
          customer_id?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          related_job_id?: string | null
          source?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_activity_feed_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          address_type: string
          city: string | null
          created_at: string
          customer_id: string
          hcp_address_id: string | null
          id: string
          is_primary: boolean
          latitude: string | null
          longitude: string | null
          state: string | null
          street: string | null
          street_line_2: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          address_type?: string
          city?: string | null
          created_at?: string
          customer_id: string
          hcp_address_id?: string | null
          id?: string
          is_primary?: boolean
          latitude?: string | null
          longitude?: string | null
          state?: string | null
          street?: string | null
          street_line_2?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address_type?: string
          city?: string | null
          created_at?: string
          customer_id?: string
          hcp_address_id?: string | null
          id?: string
          is_primary?: boolean
          latitude?: string | null
          longitude?: string | null
          state?: string | null
          street?: string | null
          street_line_2?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_certificates: {
        Row: {
          certificate_type: string
          customer_id: string
          data_snapshot: Json
          generated_at: string
          id: string
          job_id: string | null
          pdf_path: string | null
          token: string
        }
        Insert: {
          certificate_type: string
          customer_id: string
          data_snapshot?: Json
          generated_at?: string
          id?: string
          job_id?: string | null
          pdf_path?: string | null
          token?: string
        }
        Update: {
          certificate_type?: string
          customer_id?: string
          data_snapshot?: Json
          generated_at?: string
          id?: string
          job_id?: string | null
          pdf_path?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_certificates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_certificates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_discovery_answers: {
        Row: {
          created_at: string
          customer_id: string
          field_label: string
          id: string
          job_id: string | null
          value: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          field_label: string
          id?: string
          job_id?: string | null
          value: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          field_label?: string
          id?: string
          job_id?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_discovery_answers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_discovery_answers_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_equipment: {
        Row: {
          brand: string | null
          created_at: string
          customer_id: string
          equipment_type: string
          id: string
          install_date: string | null
          location_note: string | null
          model_number: string | null
          notes: string | null
          serial_number: string | null
          updated_at: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          customer_id: string
          equipment_type?: string
          id?: string
          install_date?: string | null
          location_note?: string | null
          model_number?: string | null
          notes?: string | null
          serial_number?: string | null
          updated_at?: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          customer_id?: string
          equipment_type?: string
          id?: string
          install_date?: string | null
          location_note?: string | null
          model_number?: string | null
          notes?: string | null
          serial_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_equipment_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_intake_tokens: {
        Row: {
          completed_at: string | null
          created_at: string
          customer_id: string | null
          expires_at: string
          id: string
          phone: string | null
          token: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          expires_at?: string
          id?: string
          phone?: string | null
          token?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          expires_at?: string
          id?: string
          phone?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_intake_tokens_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_invoice_items: {
        Row: {
          description: string
          id: string
          invoice_id: string
          quantity: number
          sort_order: number
          source_line_item_id: string | null
          total: number
          unit_price: number
        }
        Insert: {
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          sort_order?: number
          source_line_item_id?: string | null
          total?: number
          unit_price?: number
        }
        Update: {
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          sort_order?: number
          source_line_item_id?: string | null
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "customer_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invoice_items_source_line_item_id_fkey"
            columns: ["source_line_item_id"]
            isOneToOne: false
            referencedRelation: "job_line_items"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_invoices: {
        Row: {
          created_at: string
          hcp_invoice_id: string | null
          id: string
          invoice_number: string | null
          job_id: string
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          payment_plan_count: number | null
          payment_plan_interval: string | null
          po_number: string | null
          public_token: string
          sent_at: string | null
          sent_via: string | null
          status: string
          stripe_checkout_url: string | null
          stripe_payment_intent_id: string | null
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          hcp_invoice_id?: string | null
          id?: string
          invoice_number?: string | null
          job_id: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_plan_count?: number | null
          payment_plan_interval?: string | null
          po_number?: string | null
          public_token?: string
          sent_at?: string | null
          sent_via?: string | null
          status?: string
          stripe_checkout_url?: string | null
          stripe_payment_intent_id?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          hcp_invoice_id?: string | null
          id?: string
          invoice_number?: string | null
          job_id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_plan_count?: number | null
          payment_plan_interval?: string | null
          po_number?: string | null
          public_token?: string
          sent_at?: string | null
          sent_via?: string | null
          status?: string
          stripe_checkout_url?: string | null
          stripe_payment_intent_id?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_invoices_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_notes: {
        Row: {
          author_id: string | null
          author_name: string | null
          body: string
          created_at: string
          customer_id: string
          entity_id: string | null
          id: string
          scope: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          body: string
          created_at?: string
          customer_id: string
          entity_id?: string | null
          id?: string
          scope?: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          body?: string
          created_at?: string
          customer_id?: string
          entity_id?: string | null
          id?: string
          scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_portal_codes: {
        Row: {
          code: string
          created_at: string
          customer_id: string
          expires_at: string
          id: string
          used: boolean
        }
        Insert: {
          code: string
          created_at?: string
          customer_id: string
          expires_at?: string
          id?: string
          used?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          customer_id?: string
          expires_at?: string
          id?: string
          used?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "customer_portal_codes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_portal_invites: {
        Row: {
          accepted_at: string | null
          customer_id: string
          email: string | null
          id: string
          phone: string | null
          sent_at: string
          sent_by: string | null
          sent_by_name: string | null
          status: string
        }
        Insert: {
          accepted_at?: string | null
          customer_id: string
          email?: string | null
          id?: string
          phone?: string | null
          sent_at?: string
          sent_by?: string | null
          sent_by_name?: string | null
          status?: string
        }
        Update: {
          accepted_at?: string | null
          customer_id?: string
          email?: string | null
          id?: string
          phone?: string | null
          sent_at?: string
          sent_by?: string | null
          sent_by_name?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_portal_invites_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_portal_sessions: {
        Row: {
          created_at: string
          customer_id: string
          expires_at: string
          id: string
          token: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          expires_at?: string
          id?: string
          token?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          expires_at?: string
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_portal_sessions_customer_id_fkey"
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
          auto_invoice_enabled: boolean | null
          auto_invoice_settings: Json | null
          city: string | null
          company: string | null
          created_at: string
          default_payment_method_id: string | null
          email: string | null
          email_consent: string | null
          first_name: string | null
          hcp_customer_id: string | null
          id: string
          last_name: string | null
          lead_source: string | null
          lifetime_value: number | null
          mobile_phone: string | null
          notes: string | null
          notifications_enabled: boolean | null
          outstanding_balance: number | null
          phone: string | null
          receipt_email: string | null
          state: string | null
          tags: string[] | null
          text_consent: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          address?: string | null
          auto_invoice_enabled?: boolean | null
          auto_invoice_settings?: Json | null
          city?: string | null
          company?: string | null
          created_at?: string
          default_payment_method_id?: string | null
          email?: string | null
          email_consent?: string | null
          first_name?: string | null
          hcp_customer_id?: string | null
          id?: string
          last_name?: string | null
          lead_source?: string | null
          lifetime_value?: number | null
          mobile_phone?: string | null
          notes?: string | null
          notifications_enabled?: boolean | null
          outstanding_balance?: number | null
          phone?: string | null
          receipt_email?: string | null
          state?: string | null
          tags?: string[] | null
          text_consent?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address?: string | null
          auto_invoice_enabled?: boolean | null
          auto_invoice_settings?: Json | null
          city?: string | null
          company?: string | null
          created_at?: string
          default_payment_method_id?: string | null
          email?: string | null
          email_consent?: string | null
          first_name?: string | null
          hcp_customer_id?: string | null
          id?: string
          last_name?: string | null
          lead_source?: string | null
          lifetime_value?: number | null
          mobile_phone?: string | null
          notes?: string | null
          notifications_enabled?: boolean | null
          outstanding_balance?: number | null
          phone?: string | null
          receipt_email?: string | null
          state?: string | null
          tags?: string[] | null
          text_consent?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: []
      }
      deposit_schedules: {
        Row: {
          created_at: string
          draws: Json
          id: string
          is_active: boolean
          job_type: string
          label: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          draws?: Json
          id?: string
          is_active?: boolean
          job_type: string
          label: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          draws?: Json
          id?: string
          is_active?: boolean
          job_type?: string
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      directions_cache: {
        Row: {
          created_at: string
          dest_lat: number
          dest_lng: number
          distance_meters: number
          duration_in_traffic_seconds: number | null
          duration_seconds: number
          id: string
          origin_lat: number
          origin_lng: number
          route_hash: string | null
        }
        Insert: {
          created_at?: string
          dest_lat: number
          dest_lng: number
          distance_meters: number
          duration_in_traffic_seconds?: number | null
          duration_seconds: number
          id?: string
          origin_lat: number
          origin_lng: number
          route_hash?: string | null
        }
        Update: {
          created_at?: string
          dest_lat?: number
          dest_lng?: number
          distance_meters?: number
          duration_in_traffic_seconds?: number | null
          duration_seconds?: number
          id?: string
          origin_lat?: number
          origin_lng?: number
          route_hash?: string | null
        }
        Relationships: []
      }
      employee_pay_rates: {
        Row: {
          employee_id: string
          id: string
          job_type: string
          rate: number
          rate_type: string
          updated_at: string
        }
        Insert: {
          employee_id: string
          id?: string
          job_type: string
          rate?: number
          rate_type?: string
          updated_at?: string
        }
        Update: {
          employee_id?: string
          id?: string
          job_type?: string
          rate?: number
          rate_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_pay_rates_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_tab_access: {
        Row: {
          allowed_tabs: string[]
          created_at: string | null
          employee_id: string
          id: string
          is_custom: boolean
          updated_at: string | null
        }
        Insert: {
          allowed_tabs?: string[]
          created_at?: string | null
          employee_id: string
          id?: string
          is_custom?: boolean
          updated_at?: string | null
        }
        Update: {
          allowed_tabs?: string[]
          created_at?: string | null
          employee_id?: string
          id?: string
          is_custom?: boolean
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_tab_access_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          email: string | null
          hcp_employee_id: string | null
          home_address: string | null
          hourly_rate: number | null
          id: string
          is_active: boolean | null
          name: string
          desktop_calls_enabled: boolean
          pay_model: string | null
          phone: string | null
          profile_id: string | null
          role: string | null
          softphone_last_seen: string | null
          softphone_route_ready: boolean
          softphone_surface: string | null
        }
        Insert: {
          email?: string | null
          hcp_employee_id?: string | null
          home_address?: string | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          desktop_calls_enabled?: boolean
          pay_model?: string | null
          phone?: string | null
          profile_id?: string | null
          role?: string | null
          softphone_last_seen?: string | null
          softphone_route_ready?: boolean
          softphone_surface?: string | null
        }
        Update: {
          email?: string | null
          hcp_employee_id?: string | null
          home_address?: string | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          desktop_calls_enabled?: boolean
          pay_model?: string | null
          phone?: string | null
          profile_id?: string | null
          role?: string | null
          softphone_last_seen?: string | null
          softphone_route_ready?: boolean
          softphone_surface?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_matchups: {
        Row: {
          afue: number | null
          ahri_certificate_path: string | null
          ahri_number: string | null
          application: string | null
          brand: string
          burnout_rebate: number | null
          coil_model: string | null
          component_price: number | null
          condenser_model: string
          cooling_cap: number | null
          cps_rebate_tier: string | null
          cps_tonnage: number | null
          created_at: string
          early_rebate: number | null
          eer2: number | null
          factory_rebate_price: number | null
          features_benefits: Json | null
          furnace_model: string | null
          heat_kit: string | null
          hspf2: number | null
          id: string
          image_url: string | null
          low_margin_price: number | null
          monthly_payment: number | null
          monthly_payment_120: number | null
          notes: string | null
          seer2: number | null
          system_type: string | null
          tier: string | null
          tonnage: number | null
          total_price: number | null
        }
        Insert: {
          afue?: number | null
          ahri_certificate_path?: string | null
          ahri_number?: string | null
          application?: string | null
          brand: string
          burnout_rebate?: number | null
          coil_model?: string | null
          component_price?: number | null
          condenser_model: string
          cooling_cap?: number | null
          cps_rebate_tier?: string | null
          cps_tonnage?: number | null
          created_at?: string
          early_rebate?: number | null
          eer2?: number | null
          factory_rebate_price?: number | null
          features_benefits?: Json | null
          furnace_model?: string | null
          heat_kit?: string | null
          hspf2?: number | null
          id?: string
          image_url?: string | null
          low_margin_price?: number | null
          monthly_payment?: number | null
          monthly_payment_120?: number | null
          notes?: string | null
          seer2?: number | null
          system_type?: string | null
          tier?: string | null
          tonnage?: number | null
          total_price?: number | null
        }
        Update: {
          afue?: number | null
          ahri_certificate_path?: string | null
          ahri_number?: string | null
          application?: string | null
          brand?: string
          burnout_rebate?: number | null
          coil_model?: string | null
          component_price?: number | null
          condenser_model?: string
          cooling_cap?: number | null
          cps_rebate_tier?: string | null
          cps_tonnage?: number | null
          created_at?: string
          early_rebate?: number | null
          eer2?: number | null
          factory_rebate_price?: number | null
          features_benefits?: Json | null
          furnace_model?: string | null
          heat_kit?: string | null
          hspf2?: number | null
          id?: string
          image_url?: string | null
          low_margin_price?: number | null
          monthly_payment?: number | null
          monthly_payment_120?: number | null
          notes?: string | null
          seer2?: number | null
          system_type?: string | null
          tier?: string | null
          tonnage?: number | null
          total_price?: number | null
        }
        Relationships: []
      }
      estimate_presentations: {
        Row: {
          approved_at: string | null
          cart_source: string | null
          created_at: string
          customer_email: string | null
          customer_phone: string | null
          estimate_id: string
          first_viewed_at: string | null
          id: string
          last_viewed_at: string | null
          paid_at: string | null
          payment_method: string | null
          pricing_snapshot: Json | null
          selected_option_key: string | null
          selected_tiers: string[] | null
          status: string
          stripe_payment_intent_id: string | null
          token: string
          total_amount: number | null
          view_count: number
        }
        Insert: {
          approved_at?: string | null
          cart_source?: string | null
          created_at?: string
          customer_email?: string | null
          customer_phone?: string | null
          estimate_id: string
          first_viewed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          paid_at?: string | null
          payment_method?: string | null
          pricing_snapshot?: Json | null
          selected_option_key?: string | null
          selected_tiers?: string[] | null
          status?: string
          stripe_payment_intent_id?: string | null
          token?: string
          total_amount?: number | null
          view_count?: number
        }
        Update: {
          approved_at?: string | null
          cart_source?: string | null
          created_at?: string
          customer_email?: string | null
          customer_phone?: string | null
          estimate_id?: string
          first_viewed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          paid_at?: string | null
          payment_method?: string | null
          pricing_snapshot?: Json | null
          selected_option_key?: string | null
          selected_tiers?: string[] | null
          status?: string
          stripe_payment_intent_id?: string | null
          token?: string
          total_amount?: number | null
          view_count?: number
        }
        Relationships: []
      }
      estimate_responses: {
        Row: {
          action: string
          estimate_id: string
          id: string
          message: string | null
          payment_preference: string | null
          presentation_id: string | null
          responded_at: string
          selected_addons: Json | null
          selected_tier: string | null
        }
        Insert: {
          action: string
          estimate_id: string
          id?: string
          message?: string | null
          payment_preference?: string | null
          presentation_id?: string | null
          responded_at?: string
          selected_addons?: Json | null
          selected_tier?: string | null
        }
        Update: {
          action?: string
          estimate_id?: string
          id?: string
          message?: string | null
          payment_preference?: string | null
          presentation_id?: string | null
          responded_at?: string
          selected_addons?: Json | null
          selected_tier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimate_responses_presentation_id_fkey"
            columns: ["presentation_id"]
            isOneToOne: false
            referencedRelation: "estimate_presentations"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_reviews: {
        Row: {
          admin_notes: string | null
          created_at: string
          employee_id: string
          estimate_id: string | null
          id: string
          job_id: string
          payment_preference: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          selected_tiers: Json
          status: string
          tech_form_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          employee_id: string
          estimate_id?: string | null
          id?: string
          job_id: string
          payment_preference?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selected_tiers?: Json
          status?: string
          tech_form_id: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          employee_id?: string
          estimate_id?: string | null
          id?: string
          job_id?: string
          payment_preference?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selected_tiers?: Json
          status?: string
          tech_form_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_reviews_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_reviews_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_reviews_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_reviews_tech_form_id_fkey"
            columns: ["tech_form_id"]
            isOneToOne: false
            referencedRelation: "tech_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      estimates: {
        Row: {
          address: string | null
          arrival_end: string | null
          arrival_start: string | null
          assigned_to: string | null
          brochure_sent: boolean | null
          cash_discount_percent: number
          completion_form_sent_at: string | null
          confirmation_sent_at: string | null
          created_at: string
          customer_approved_at: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          description: string | null
          dispatch_sent_at: string | null
          estimate_number: string | null
          estimate_type: string
          hcp_customer_id: string | null
          hcp_id: string | null
          id: string
          on_my_way_sent_at: string | null
          options: Json | null
          presentation_sent_at: string | null
          repair_tiers: Json | null
          scheduled_date: string | null
          source_job_id: string | null
          status: string | null
          synced_at: string | null
          weather_captured_at: string | null
          weather_captured_by: string | null
          weather_condition: string | null
          weather_feels_like_high: number | null
          weather_humidity_max: number | null
          weather_precip_chance: number | null
          weather_source_date: string | null
          weather_summary: string | null
          weather_temp_high: number | null
          weather_temp_low: number | null
          weather_wind_max_mph: number | null
          work_status: string | null
        }
        Insert: {
          address?: string | null
          arrival_end?: string | null
          arrival_start?: string | null
          assigned_to?: string | null
          brochure_sent?: boolean | null
          cash_discount_percent?: number
          completion_form_sent_at?: string | null
          confirmation_sent_at?: string | null
          created_at?: string
          customer_approved_at?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          description?: string | null
          dispatch_sent_at?: string | null
          estimate_number?: string | null
          estimate_type?: string
          hcp_customer_id?: string | null
          hcp_id?: string | null
          id?: string
          on_my_way_sent_at?: string | null
          options?: Json | null
          presentation_sent_at?: string | null
          repair_tiers?: Json | null
          scheduled_date?: string | null
          source_job_id?: string | null
          status?: string | null
          synced_at?: string | null
          weather_captured_at?: string | null
          weather_captured_by?: string | null
          weather_condition?: string | null
          weather_feels_like_high?: number | null
          weather_humidity_max?: number | null
          weather_precip_chance?: number | null
          weather_source_date?: string | null
          weather_summary?: string | null
          weather_temp_high?: number | null
          weather_temp_low?: number | null
          weather_wind_max_mph?: number | null
          work_status?: string | null
        }
        Update: {
          address?: string | null
          arrival_end?: string | null
          arrival_start?: string | null
          assigned_to?: string | null
          brochure_sent?: boolean | null
          cash_discount_percent?: number
          completion_form_sent_at?: string | null
          confirmation_sent_at?: string | null
          created_at?: string
          customer_approved_at?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          description?: string | null
          dispatch_sent_at?: string | null
          estimate_number?: string | null
          estimate_type?: string
          hcp_customer_id?: string | null
          hcp_id?: string | null
          id?: string
          on_my_way_sent_at?: string | null
          options?: Json | null
          presentation_sent_at?: string | null
          repair_tiers?: Json | null
          scheduled_date?: string | null
          source_job_id?: string | null
          status?: string | null
          synced_at?: string | null
          weather_captured_at?: string | null
          weather_captured_by?: string | null
          weather_condition?: string | null
          weather_feels_like_high?: number | null
          weather_humidity_max?: number | null
          weather_precip_chance?: number | null
          weather_source_date?: string | null
          weather_summary?: string | null
          weather_temp_high?: number | null
          weather_temp_low?: number | null
          weather_wind_max_mph?: number | null
          work_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_source_job_id_fkey"
            columns: ["source_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_inquiries: {
        Row: {
          asked_at: string
          created_at: string
          employee_id: string | null
          employee_phone: string
          id: string
          job_id: string
          replied_at: string | null
          reply_text: string | null
          status: string
        }
        Insert: {
          asked_at?: string
          created_at?: string
          employee_id?: string | null
          employee_phone: string
          id?: string
          job_id: string
          replied_at?: string | null
          reply_text?: string | null
          status?: string
        }
        Update: {
          asked_at?: string
          created_at?: string
          employee_id?: string | null
          employee_phone?: string
          id?: string
          job_id?: string
          replied_at?: string | null
          reply_text?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_inquiries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_inquiries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      geocode_cache: {
        Row: {
          address_hash: string | null
          address_input: string
          created_at: string
          formatted_address: string | null
          id: string
          lat: number
          lng: number
          source: string | null
        }
        Insert: {
          address_hash?: string | null
          address_input: string
          created_at?: string
          formatted_address?: string | null
          id?: string
          lat: number
          lng: number
          source?: string | null
        }
        Update: {
          address_hash?: string | null
          address_input?: string
          created_at?: string
          formatted_address?: string | null
          id?: string
          lat?: number
          lng?: number
          source?: string | null
        }
        Relationships: []
      }
      ivr_config: {
        Row: {
          after_hours_audio_url: string | null
          after_hours_caller_id_mode: string
          after_hours_forward_number: string | null
          after_hours_greeting: string
          answering_service_enabled: boolean
          answering_service_label: string | null
          answering_service_number: string | null
          business_days: number[]
          business_hours_end: string
          business_hours_start: string
          created_at: string
          greeting_audio_url: string | null
          greeting_text: string
          hold_music_audio_url: string | null
          id: string
          overflow_after_hours: boolean
          overflow_after_hours_skip_voicemail: boolean
          overflow_on_busy: boolean
          overflow_on_no_answer: boolean
          overflow_ring_seconds_before_handoff: number
          ring_timeout_seconds: number
          timezone: string
          updated_at: string
          voicemail_audio_url: string | null
          voicemail_enabled: boolean
          voicemail_greeting: string
        }
        Insert: {
          after_hours_audio_url?: string | null
          after_hours_caller_id_mode?: string
          after_hours_forward_number?: string | null
          after_hours_greeting?: string
          answering_service_enabled?: boolean
          answering_service_label?: string | null
          answering_service_number?: string | null
          business_days?: number[]
          business_hours_end?: string
          business_hours_start?: string
          created_at?: string
          greeting_audio_url?: string | null
          greeting_text?: string
          hold_music_audio_url?: string | null
          id?: string
          overflow_after_hours?: boolean
          overflow_after_hours_skip_voicemail?: boolean
          overflow_on_busy?: boolean
          overflow_on_no_answer?: boolean
          overflow_ring_seconds_before_handoff?: number
          ring_timeout_seconds?: number
          timezone?: string
          updated_at?: string
          voicemail_audio_url?: string | null
          voicemail_enabled?: boolean
          voicemail_greeting?: string
        }
        Update: {
          after_hours_audio_url?: string | null
          after_hours_caller_id_mode?: string
          after_hours_forward_number?: string | null
          after_hours_greeting?: string
          answering_service_enabled?: boolean
          answering_service_label?: string | null
          answering_service_number?: string | null
          business_days?: number[]
          business_hours_end?: string
          business_hours_start?: string
          created_at?: string
          greeting_audio_url?: string | null
          greeting_text?: string
          hold_music_audio_url?: string | null
          id?: string
          overflow_after_hours?: boolean
          overflow_after_hours_skip_voicemail?: boolean
          overflow_on_busy?: boolean
          overflow_on_no_answer?: boolean
          overflow_ring_seconds_before_handoff?: number
          ring_timeout_seconds?: number
          timezone?: string
          updated_at?: string
          voicemail_audio_url?: string | null
          voicemail_enabled?: boolean
          voicemail_greeting?: string
        }
        Relationships: []
      }
      ivr_menu_options: {
        Row: {
          action_type: string
          assigned_user_ids: string[] | null
          created_at: string
          dept_after_hours_audio_url: string | null
          dept_after_hours_greeting: string | null
          dept_after_hours_sms: string | null
          dept_after_hours_sms_enabled: boolean
          dept_after_hours_sms_template_key: string | null
          dept_business_days: number[] | null
          dept_hours_end: string | null
          dept_hours_start: string | null
          dept_missed_call_sms: string | null
          dept_missed_call_sms_enabled: boolean
          dept_missed_call_sms_template_key: string | null
          dept_no_vm_missed_call_sms: string | null
          dept_no_vm_missed_call_sms_enabled: boolean
          dept_post_call_sms: string | null
          dept_post_call_sms_enabled: boolean
          dept_sat_hours_end: string | null
          dept_sat_hours_start: string | null
          dept_vm_audio_url: string | null
          dept_vm_greeting: string | null
          digit: string
          forward_to: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          action_type?: string
          assigned_user_ids?: string[] | null
          created_at?: string
          dept_after_hours_audio_url?: string | null
          dept_after_hours_greeting?: string | null
          dept_after_hours_sms?: string | null
          dept_after_hours_sms_enabled?: boolean
          dept_after_hours_sms_template_key?: string | null
          dept_business_days?: number[] | null
          dept_hours_end?: string | null
          dept_hours_start?: string | null
          dept_missed_call_sms?: string | null
          dept_missed_call_sms_enabled?: boolean
          dept_missed_call_sms_template_key?: string | null
          dept_no_vm_missed_call_sms?: string | null
          dept_no_vm_missed_call_sms_enabled?: boolean
          dept_post_call_sms?: string | null
          dept_post_call_sms_enabled?: boolean
          dept_sat_hours_end?: string | null
          dept_sat_hours_start?: string | null
          dept_vm_audio_url?: string | null
          dept_vm_greeting?: string | null
          digit: string
          forward_to?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          action_type?: string
          assigned_user_ids?: string[] | null
          created_at?: string
          dept_after_hours_audio_url?: string | null
          dept_after_hours_greeting?: string | null
          dept_after_hours_sms?: string | null
          dept_after_hours_sms_enabled?: boolean
          dept_after_hours_sms_template_key?: string | null
          dept_business_days?: number[] | null
          dept_hours_end?: string | null
          dept_hours_start?: string | null
          dept_missed_call_sms?: string | null
          dept_missed_call_sms_enabled?: boolean
          dept_missed_call_sms_template_key?: string | null
          dept_no_vm_missed_call_sms?: string | null
          dept_no_vm_missed_call_sms_enabled?: boolean
          dept_post_call_sms?: string | null
          dept_post_call_sms_enabled?: boolean
          dept_sat_hours_end?: string | null
          dept_sat_hours_start?: string | null
          dept_vm_audio_url?: string | null
          dept_vm_greeting?: string | null
          digit?: string
          forward_to?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      job_attachment_cache: {
        Row: {
          attachments: Json
          fetched_at: string
          hcp_id: string
          id: string
        }
        Insert: {
          attachments?: Json
          fetched_at?: string
          hcp_id: string
          id?: string
        }
        Update: {
          attachments?: Json
          fetched_at?: string
          hcp_id?: string
          id?: string
        }
        Relationships: []
      }
      job_attachments: {
        Row: {
          category: string | null
          classification_confidence: number | null
          created_at: string
          file_name: string
          file_path: string
          file_type: string | null
          hcp_attachment_id: string | null
          hidden_from_tech_share: boolean
          id: string
          is_annotated: boolean
          job_id: string
          parent_attachment_id: string | null
          synced_to_hcp: boolean | null
        }
        Insert: {
          category?: string | null
          classification_confidence?: number | null
          created_at?: string
          file_name?: string
          file_path: string
          file_type?: string | null
          hcp_attachment_id?: string | null
          hidden_from_tech_share?: boolean
          id?: string
          is_annotated?: boolean
          job_id: string
          parent_attachment_id?: string | null
          synced_to_hcp?: boolean | null
        }
        Update: {
          category?: string | null
          classification_confidence?: number | null
          created_at?: string
          file_name?: string
          file_path?: string
          file_type?: string | null
          hcp_attachment_id?: string | null
          hidden_from_tech_share?: boolean
          id?: string
          is_annotated?: boolean
          job_id?: string
          parent_attachment_id?: string | null
          synced_to_hcp?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "job_attachments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_attachments_parent_attachment_id_fkey"
            columns: ["parent_attachment_id"]
            isOneToOne: false
            referencedRelation: "job_attachments"
            referencedColumns: ["id"]
          },
        ]
      }
      job_cart_items: {
        Row: {
          cart_id: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          kind: string
          metadata: Json | null
          name: string
          quantity: number
          sort_order: number
          source_id: string | null
          tier: string | null
          total_price: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          cart_id: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          kind: string
          metadata?: Json | null
          name: string
          quantity?: number
          sort_order?: number
          source_id?: string | null
          tier?: string | null
          total_price?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          cart_id?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          kind?: string
          metadata?: Json | null
          name?: string
          quantity?: number
          sort_order?: number
          source_id?: string | null
          tier?: string | null
          total_price?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "job_carts"
            referencedColumns: ["id"]
          },
        ]
      }
      job_carts: {
        Row: {
          approved_at: string | null
          created_at: string
          created_by: string | null
          discount_amount: number
          discount_code: string | null
          first_viewed_at: string | null
          id: string
          job_id: string
          last_viewed_at: string | null
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          public_token: string
          receipt_pdf_url: string | null
          receipt_sent_at: string | null
          recovery_sms_sent_at: string | null
          sent_at: string | null
          status: string
          stripe_checkout_url: string | null
          stripe_payment_intent_id: string | null
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          updated_at: string
          view_count: number
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          discount_code?: string | null
          first_viewed_at?: string | null
          id?: string
          job_id: string
          last_viewed_at?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          public_token?: string
          receipt_pdf_url?: string | null
          receipt_sent_at?: string | null
          recovery_sms_sent_at?: string | null
          sent_at?: string | null
          status?: string
          stripe_checkout_url?: string | null
          stripe_payment_intent_id?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
          view_count?: number
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          discount_code?: string | null
          first_viewed_at?: string | null
          id?: string
          job_id?: string
          last_viewed_at?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          public_token?: string
          receipt_pdf_url?: string | null
          receipt_sent_at?: string | null
          recovery_sms_sent_at?: string | null
          sent_at?: string | null
          status?: string
          stripe_checkout_url?: string | null
          stripe_payment_intent_id?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_carts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_equipment: {
        Row: {
          brand: string | null
          confidence: string
          conflicts: Json | null
          created_at: string
          id: string
          is_confirmed: boolean
          job_id: string
          model_number: string | null
          serial_number: string | null
          source: string
          source_id: string | null
          updated_at: string
        }
        Insert: {
          brand?: string | null
          confidence?: string
          conflicts?: Json | null
          created_at?: string
          id?: string
          is_confirmed?: boolean
          job_id: string
          model_number?: string | null
          serial_number?: string | null
          source: string
          source_id?: string | null
          updated_at?: string
        }
        Update: {
          brand?: string | null
          confidence?: string
          conflicts?: Json | null
          created_at?: string
          id?: string
          is_confirmed?: boolean
          job_id?: string
          model_number?: string | null
          serial_number?: string | null
          source?: string
          source_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_equipment_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_invoices: {
        Row: {
          created_at: string
          extracted_items: Json | null
          extraction_status: string | null
          file_path: string
          id: string
          invoice_date: string | null
          invoice_number: string | null
          job_id: string
          match_confidence: string | null
          match_reason: string | null
          match_status: string
          model_number: string | null
          po_number: string | null
          raw_extraction: Json | null
          reviewed_at: string | null
          reviewed_by: string | null
          serial_number: string | null
          source: string
          source_ref_id: string | null
          supply_house_id: string | null
          total_amount: number | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          extracted_items?: Json | null
          extraction_status?: string | null
          file_path: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          job_id: string
          match_confidence?: string | null
          match_reason?: string | null
          match_status?: string
          model_number?: string | null
          po_number?: string | null
          raw_extraction?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          serial_number?: string | null
          source?: string
          source_ref_id?: string | null
          supply_house_id?: string | null
          total_amount?: number | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          extracted_items?: Json | null
          extraction_status?: string | null
          file_path?: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          job_id?: string
          match_confidence?: string | null
          match_reason?: string | null
          match_status?: string
          model_number?: string | null
          po_number?: string | null
          raw_extraction?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          serial_number?: string | null
          source?: string
          source_ref_id?: string | null
          supply_house_id?: string | null
          total_amount?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_invoices_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_invoices_supply_house_id_fkey"
            columns: ["supply_house_id"]
            isOneToOne: false
            referencedRelation: "supply_houses"
            referencedColumns: ["id"]
          },
        ]
      }
      job_line_items: {
        Row: {
          created_at: string
          description: string | null
          hcp_line_item_id: string | null
          id: string
          job_id: string
          kind: string | null
          name: string
          quantity: number
          template_id: string | null
          total_price: number
          unit_price: number
          waived: boolean
          waived_reason: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          hcp_line_item_id?: string | null
          id?: string
          job_id: string
          kind?: string | null
          name: string
          quantity?: number
          template_id?: string | null
          total_price?: number
          unit_price?: number
          waived?: boolean
          waived_reason?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          hcp_line_item_id?: string | null
          id?: string
          job_id?: string
          kind?: string | null
          name?: string
          quantity?: number
          template_id?: string | null
          total_price?: number
          unit_price?: number
          waived?: boolean
          waived_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_line_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_line_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "line_item_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      job_reminders: {
        Row: {
          created_at: string
          customer_response: string | null
          id: string
          job_id: string
          reminder_type: string
          scheduled_for: string
          sent_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          customer_response?: string | null
          id?: string
          job_id: string
          reminder_type?: string
          scheduled_for: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          customer_response?: string | null
          id?: string
          job_id?: string
          reminder_type?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_reminders_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_repair_items: {
        Row: {
          added_by: string | null
          created_at: string | null
          id: string
          job_id: string
          name: string
          notes: string | null
          pricebook_item_id: string | null
          quantity: number | null
          severity: string | null
          unit_price: number
        }
        Insert: {
          added_by?: string | null
          created_at?: string | null
          id?: string
          job_id: string
          name: string
          notes?: string | null
          pricebook_item_id?: string | null
          quantity?: number | null
          severity?: string | null
          unit_price?: number
        }
        Update: {
          added_by?: string | null
          created_at?: string | null
          id?: string
          job_id?: string
          name?: string
          notes?: string | null
          pricebook_item_id?: string | null
          quantity?: number | null
          severity?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_repair_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_repair_items_pricebook_item_id_fkey"
            columns: ["pricebook_item_id"]
            isOneToOne: false
            referencedRelation: "service_pricebook"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          address: string | null
          ahri_number: string | null
          arrival_end: string | null
          arrival_start: string | null
          assigned_to: string | null
          brand: string | null
          completed_at: string | null
          completion_form_sent_at: string | null
          confirmation_sent_at: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          deposit_amount: number | null
          deposit_paid_at: string | null
          description: string | null
          dispatch_sent_at: string | null
          equipment_ordered_at: string | null
          estimate_id: string | null
          finance_dob: string | null
          finance_email: string | null
          finance_paperwork_at: string | null
          follow_up_check_count: number
          follow_up_completed_at: string | null
          follow_up_next_check: string | null
          follow_up_reason: string | null
          hcp_customer_id: string | null
          hcp_id: string | null
          hcp_job_number: string | null
          hcp_note: string | null
          hcp_status: string | null
          hold_reason: string | null
          id: string
          inspection_passed_at: string | null
          inspection_scheduled_at: string | null
          invoice_sent_at: string | null
          is_service_agreement: boolean | null
          job_number: string | null
          job_type: string | null
          jurisdiction: string | null
          jurisdiction_looked_up_at: string | null
          labor_cost: number | null
          last_payment_error: string | null
          last_payment_error_at: string | null
          maint_report_sent_at: string | null
          margin_pct: number | null
          needs_follow_up: boolean
          next_visit_scheduled_at: string | null
          on_my_way_sent_at: string | null
          orientation: string | null
          parts_cost: number | null
          paused_at: string | null
          pay_category: string | null
          payment_collected_at: string | null
          payment_method: string | null
          permit_portal_url: string | null
          permit_pulled_at: string | null
          permit_required: boolean
          photos_uploaded_at: string | null
          pickup_notes: string | null
          pickup_supply_house_id: string | null
          preinstall_sent_at: string | null
          profit: number | null
          quote_generated_at: string | null
          rebate_eligible: boolean
          rebate_submitted_at: string | null
          review_request_sent_at: string | null
          sale_source: string
          scheduled_date: string | null
          season: string | null
          site_visit_missing: boolean
          status: string
          stripe_deposit_session_id: string | null
          synced_at: string | null
          system_type: string | null
          tonnage: number | null
          total_cost: number | null
          warranty_registered_at: string | null
          weather_captured_at: string | null
          weather_captured_by: string | null
          weather_condition: string | null
          weather_feels_like_high: number | null
          weather_humidity_max: number | null
          weather_precip_chance: number | null
          weather_source_date: string | null
          weather_summary: string | null
          weather_temp_high: number | null
          weather_temp_low: number | null
          weather_wind_max_mph: number | null
        }
        Insert: {
          address?: string | null
          ahri_number?: string | null
          arrival_end?: string | null
          arrival_start?: string | null
          assigned_to?: string | null
          brand?: string | null
          completed_at?: string | null
          completion_form_sent_at?: string | null
          confirmation_sent_at?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          deposit_amount?: number | null
          deposit_paid_at?: string | null
          description?: string | null
          dispatch_sent_at?: string | null
          equipment_ordered_at?: string | null
          estimate_id?: string | null
          finance_dob?: string | null
          finance_email?: string | null
          finance_paperwork_at?: string | null
          follow_up_check_count?: number
          follow_up_completed_at?: string | null
          follow_up_next_check?: string | null
          follow_up_reason?: string | null
          hcp_customer_id?: string | null
          hcp_id?: string | null
          hcp_job_number?: string | null
          hcp_note?: string | null
          hcp_status?: string | null
          hold_reason?: string | null
          id?: string
          inspection_passed_at?: string | null
          inspection_scheduled_at?: string | null
          invoice_sent_at?: string | null
          is_service_agreement?: boolean | null
          job_number?: string | null
          job_type?: string | null
          jurisdiction?: string | null
          jurisdiction_looked_up_at?: string | null
          labor_cost?: number | null
          last_payment_error?: string | null
          last_payment_error_at?: string | null
          maint_report_sent_at?: string | null
          margin_pct?: number | null
          needs_follow_up?: boolean
          next_visit_scheduled_at?: string | null
          on_my_way_sent_at?: string | null
          orientation?: string | null
          parts_cost?: number | null
          paused_at?: string | null
          pay_category?: string | null
          payment_collected_at?: string | null
          payment_method?: string | null
          permit_portal_url?: string | null
          permit_pulled_at?: string | null
          permit_required?: boolean
          photos_uploaded_at?: string | null
          pickup_notes?: string | null
          pickup_supply_house_id?: string | null
          preinstall_sent_at?: string | null
          profit?: number | null
          quote_generated_at?: string | null
          rebate_eligible?: boolean
          rebate_submitted_at?: string | null
          review_request_sent_at?: string | null
          sale_source?: string
          scheduled_date?: string | null
          season?: string | null
          site_visit_missing?: boolean
          status?: string
          stripe_deposit_session_id?: string | null
          synced_at?: string | null
          system_type?: string | null
          tonnage?: number | null
          total_cost?: number | null
          warranty_registered_at?: string | null
          weather_captured_at?: string | null
          weather_captured_by?: string | null
          weather_condition?: string | null
          weather_feels_like_high?: number | null
          weather_humidity_max?: number | null
          weather_precip_chance?: number | null
          weather_source_date?: string | null
          weather_summary?: string | null
          weather_temp_high?: number | null
          weather_temp_low?: number | null
          weather_wind_max_mph?: number | null
        }
        Update: {
          address?: string | null
          ahri_number?: string | null
          arrival_end?: string | null
          arrival_start?: string | null
          assigned_to?: string | null
          brand?: string | null
          completed_at?: string | null
          completion_form_sent_at?: string | null
          confirmation_sent_at?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          deposit_amount?: number | null
          deposit_paid_at?: string | null
          description?: string | null
          dispatch_sent_at?: string | null
          equipment_ordered_at?: string | null
          estimate_id?: string | null
          finance_dob?: string | null
          finance_email?: string | null
          finance_paperwork_at?: string | null
          follow_up_check_count?: number
          follow_up_completed_at?: string | null
          follow_up_next_check?: string | null
          follow_up_reason?: string | null
          hcp_customer_id?: string | null
          hcp_id?: string | null
          hcp_job_number?: string | null
          hcp_note?: string | null
          hcp_status?: string | null
          hold_reason?: string | null
          id?: string
          inspection_passed_at?: string | null
          inspection_scheduled_at?: string | null
          invoice_sent_at?: string | null
          is_service_agreement?: boolean | null
          job_number?: string | null
          job_type?: string | null
          jurisdiction?: string | null
          jurisdiction_looked_up_at?: string | null
          labor_cost?: number | null
          last_payment_error?: string | null
          last_payment_error_at?: string | null
          maint_report_sent_at?: string | null
          margin_pct?: number | null
          needs_follow_up?: boolean
          next_visit_scheduled_at?: string | null
          on_my_way_sent_at?: string | null
          orientation?: string | null
          parts_cost?: number | null
          paused_at?: string | null
          pay_category?: string | null
          payment_collected_at?: string | null
          payment_method?: string | null
          permit_portal_url?: string | null
          permit_pulled_at?: string | null
          permit_required?: boolean
          photos_uploaded_at?: string | null
          pickup_notes?: string | null
          pickup_supply_house_id?: string | null
          preinstall_sent_at?: string | null
          profit?: number | null
          quote_generated_at?: string | null
          rebate_eligible?: boolean
          rebate_submitted_at?: string | null
          review_request_sent_at?: string | null
          sale_source?: string
          scheduled_date?: string | null
          season?: string | null
          site_visit_missing?: boolean
          status?: string
          stripe_deposit_session_id?: string | null
          synced_at?: string | null
          system_type?: string | null
          tonnage?: number | null
          total_cost?: number | null
          warranty_registered_at?: string | null
          weather_captured_at?: string | null
          weather_captured_by?: string | null
          weather_condition?: string | null
          weather_feels_like_high?: number | null
          weather_humidity_max?: number | null
          weather_precip_chance?: number | null
          weather_source_date?: string | null
          weather_summary?: string | null
          weather_temp_high?: number | null
          weather_temp_low?: number | null
          weather_wind_max_mph?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_pickup_supply_house_id_fkey"
            columns: ["pickup_supply_house_id"]
            isOneToOne: false
            referencedRelation: "supply_houses"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          chunk_text: string
          created_at: string | null
          embedded_at: string | null
          embedding: string | null
          fts: unknown
          id: string
          metadata: Json | null
          quality_score: number | null
          source_id: string | null
          source_table: string
        }
        Insert: {
          chunk_text: string
          created_at?: string | null
          embedded_at?: string | null
          embedding?: string | null
          fts?: unknown
          id?: string
          metadata?: Json | null
          quality_score?: number | null
          source_id?: string | null
          source_table: string
        }
        Update: {
          chunk_text?: string
          created_at?: string | null
          embedded_at?: string | null
          embedding?: string | null
          fts?: unknown
          id?: string
          metadata?: Json | null
          quality_score?: number | null
          source_id?: string | null
          source_table?: string
        }
        Relationships: []
      }
      known_contacts: {
        Row: {
          auto_action: string | null
          contact_type: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          phone_digits: string
          updated_at: string
        }
        Insert: {
          auto_action?: string | null
          contact_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          phone_digits: string
          updated_at?: string
        }
        Update: {
          auto_action?: string | null
          contact_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone_digits?: string
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          contacted_at: string | null
          converted_at: string | null
          created_at: string
          customer_id: string | null
          drip_next_at: string | null
          drip_sequence_id: string | null
          drip_step_index: number | null
          email: string | null
          first_name: string | null
          id: string
          intent: string | null
          job_id: string | null
          last_name: string | null
          lsa_booked_notified: boolean | null
          lsa_category: string | null
          lsa_charged: boolean | null
          lsa_lead_id: string | null
          lsa_lead_type: string | null
          notes: string | null
          phone: string | null
          raw_payload: Json | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          contacted_at?: string | null
          converted_at?: string | null
          created_at?: string
          customer_id?: string | null
          drip_next_at?: string | null
          drip_sequence_id?: string | null
          drip_step_index?: number | null
          email?: string | null
          first_name?: string | null
          id?: string
          intent?: string | null
          job_id?: string | null
          last_name?: string | null
          lsa_booked_notified?: boolean | null
          lsa_category?: string | null
          lsa_charged?: boolean | null
          lsa_lead_id?: string | null
          lsa_lead_type?: string | null
          notes?: string | null
          phone?: string | null
          raw_payload?: Json | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          contacted_at?: string | null
          converted_at?: string | null
          created_at?: string
          customer_id?: string | null
          drip_next_at?: string | null
          drip_sequence_id?: string | null
          drip_step_index?: number | null
          email?: string | null
          first_name?: string | null
          id?: string
          intent?: string | null
          job_id?: string | null
          last_name?: string | null
          lsa_booked_notified?: boolean | null
          lsa_category?: string | null
          lsa_charged?: boolean | null
          lsa_lead_id?: string | null
          lsa_lead_type?: string | null
          notes?: string | null
          phone?: string | null
          raw_payload?: Json | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_drip_sequence_id_fkey"
            columns: ["drip_sequence_id"]
            isOneToOne: false
            referencedRelation: "message_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      line_item_templates: {
        Row: {
          auto_add_for: string[]
          base_price: number
          category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          kind: string
          name: string
          rules: Json
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          auto_add_for?: string[]
          base_price?: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          rules?: Json
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          auto_add_for?: string[]
          base_price?: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          rules?: Json
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      live_transcripts: {
        Row: {
          created_at: string
          id: string
          is_final: boolean
          speaker: string
          text: string
          twilio_sid: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_final?: boolean
          speaker?: string
          text?: string
          twilio_sid: string
        }
        Update: {
          created_at?: string
          id?: string
          is_final?: boolean
          speaker?: string
          text?: string
          twilio_sid?: string
        }
        Relationships: []
      }
      maintenance_plan_templates: {
        Row: {
          color: string
          created_at: string
          description: string | null
          frequency: string
          id: string
          is_active: boolean
          name: string
          perks: Json
          plan_type: string
          price: number
          sort_order: number
          tier: string
          value_comparison: Json | null
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          name: string
          perks?: Json
          plan_type?: string
          price?: number
          sort_order?: number
          tier?: string
          value_comparison?: Json | null
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          name?: string
          perks?: Json
          plan_type?: string
          price?: number
          sort_order?: number
          tier?: string
          value_comparison?: Json | null
        }
        Relationships: []
      }
      manufacturer_brochures: {
        Row: {
          brand: string
          created_at: string
          description: string | null
          file_path: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          brand?: string
          created_at?: string
          description?: string | null
          file_path: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          brand?: string
          created_at?: string
          description?: string | null
          file_path?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      message_sequences: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          job_type: string | null
          name: string
          steps: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          job_type?: string | null
          name: string
          steps?: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          job_type?: string | null
          name?: string
          steps?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      meta_audience_syncs: {
        Row: {
          audience_id: string
          created_at: string
          customers_synced: number
          error_message: string | null
          id: string
          status: string
        }
        Insert: {
          audience_id: string
          created_at?: string
          customers_synced?: number
          error_message?: string | null
          id?: string
          status?: string
        }
        Update: {
          audience_id?: string
          created_at?: string
          customers_synced?: number
          error_message?: string | null
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_audience_syncs_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "meta_audiences"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_audiences: {
        Row: {
          created_at: string
          filter_rules: Json
          id: string
          last_sync_count: number | null
          last_synced_at: string | null
          meta_audience_id: string | null
          name: string
          status: string
        }
        Insert: {
          created_at?: string
          filter_rules?: Json
          id?: string
          last_sync_count?: number | null
          last_synced_at?: string | null
          meta_audience_id?: string | null
          name: string
          status?: string
        }
        Update: {
          created_at?: string
          filter_rules?: Json
          id?: string
          last_sync_count?: number | null
          last_synced_at?: string | null
          meta_audience_id?: string | null
          name?: string
          status?: string
        }
        Relationships: []
      }
      oncall_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          dedup_key: string
          dedup_until: string
          details: Json | null
          id: string
          notification_error: string | null
          notification_status: string
          notified_phone: string | null
          related_error_id: string | null
          resolved_at: string | null
          service: string
          severity: string
          summary: string
          triggered_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          dedup_key: string
          dedup_until?: string
          details?: Json | null
          id?: string
          notification_error?: string | null
          notification_status?: string
          notified_phone?: string | null
          related_error_id?: string | null
          resolved_at?: string | null
          service: string
          severity: string
          summary: string
          triggered_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          dedup_key?: string
          dedup_until?: string
          details?: Json | null
          id?: string
          notification_error?: string | null
          notification_status?: string
          notified_phone?: string | null
          related_error_id?: string | null
          resolved_at?: string | null
          service?: string
          severity?: string
          summary?: string
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "oncall_alerts_related_error_id_fkey"
            columns: ["related_error_id"]
            isOneToOne: false
            referencedRelation: "system_error_log"
            referencedColumns: ["id"]
          },
        ]
      }
      order_patterns: {
        Row: {
          avg_quantity: number | null
          avg_unit_price: number | null
          category: string
          description: string | null
          frequency: number | null
          id: string
          image_url: string | null
          item_number: string | null
          job_type: string | null
          mfr_number: string | null
          orientation: string | null
          system_type: string | null
          total_jobs_in_category: number | null
          updated_at: string | null
        }
        Insert: {
          avg_quantity?: number | null
          avg_unit_price?: number | null
          category: string
          description?: string | null
          frequency?: number | null
          id?: string
          image_url?: string | null
          item_number?: string | null
          job_type?: string | null
          mfr_number?: string | null
          orientation?: string | null
          system_type?: string | null
          total_jobs_in_category?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_quantity?: number | null
          avg_unit_price?: number | null
          category?: string
          description?: string | null
          frequency?: number | null
          id?: string
          image_url?: string | null
          item_number?: string | null
          job_type?: string | null
          mfr_number?: string | null
          orientation?: string | null
          system_type?: string | null
          total_jobs_in_category?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      outbound_drafts: {
        Row: {
          alert_sent: boolean
          body: string
          body_html: string | null
          channel: string
          created_at: string
          id: string
          job_id: string | null
          metadata: Json | null
          recipient: string
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          status: string
          subject: string | null
        }
        Insert: {
          alert_sent?: boolean
          body: string
          body_html?: string | null
          channel?: string
          created_at?: string
          id?: string
          job_id?: string | null
          metadata?: Json | null
          recipient: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          subject?: string | null
        }
        Update: {
          alert_sent?: boolean
          body?: string
          body_html?: string | null
          channel?: string
          created_at?: string
          id?: string
          job_id?: string | null
          metadata?: Json | null
          recipient?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outbound_drafts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      part_supply_house_numbers: {
        Row: {
          id: string
          notes: string | null
          part_id: string
          part_number: string
          supply_house_id: string
          unit_cost: number | null
        }
        Insert: {
          id?: string
          notes?: string | null
          part_id: string
          part_number: string
          supply_house_id: string
          unit_cost?: number | null
        }
        Update: {
          id?: string
          notes?: string | null
          part_id?: string
          part_number?: string
          supply_house_id?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "part_supply_house_numbers_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_supply_house_numbers_supply_house_id_fkey"
            columns: ["supply_house_id"]
            isOneToOne: false
            referencedRelation: "supply_houses"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_catalog: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      parts_orders: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          expected_arrival: string | null
          id: string
          job_id: string
          ordered_at: string | null
          picked_up_at: string | null
          po_number: string | null
          status: string
          supply_house_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          expected_arrival?: string | null
          id?: string
          job_id: string
          ordered_at?: string | null
          picked_up_at?: string | null
          po_number?: string | null
          status?: string
          supply_house_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          expected_arrival?: string | null
          id?: string
          job_id?: string
          ordered_at?: string | null
          picked_up_at?: string | null
          po_number?: string | null
          status?: string
          supply_house_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parts_orders_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_orders_supply_house_id_fkey"
            columns: ["supply_house_id"]
            isOneToOne: false
            referencedRelation: "supply_houses"
            referencedColumns: ["id"]
          },
        ]
      }
      pay_rates: {
        Row: {
          id: string
          job_type: string
          rate: number
          rate_type: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          job_type: string
          rate?: number
          rate_type?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          job_type?: string
          rate?: number
          rate_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payment_plan_rules: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          job_type: string
          max_amount: number | null
          max_installments: number
          min_amount: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          job_type?: string
          max_amount?: number | null
          max_installments?: number
          min_amount?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          job_type?: string
          max_amount?: number | null
          max_installments?: number
          min_amount?: number
        }
        Relationships: []
      }
      paysheet_entries: {
        Row: {
          amount: number
          commission_amount: number | null
          created_at: string
          employee_id: string
          hourly_amount: number | null
          hours_worked: number | null
          id: string
          job_id: string
          pay_category: string | null
          pay_week_end: string
          pay_week_start: string
          rate_type: string | null
          status: string
          tech_form_id: string | null
        }
        Insert: {
          amount?: number
          commission_amount?: number | null
          created_at?: string
          employee_id: string
          hourly_amount?: number | null
          hours_worked?: number | null
          id?: string
          job_id: string
          pay_category?: string | null
          pay_week_end: string
          pay_week_start: string
          rate_type?: string | null
          status?: string
          tech_form_id?: string | null
        }
        Update: {
          amount?: number
          commission_amount?: number | null
          created_at?: string
          employee_id?: string
          hourly_amount?: number | null
          hours_worked?: number | null
          id?: string
          job_id?: string
          pay_category?: string | null
          pay_week_end?: string
          pay_week_start?: string
          rate_type?: string | null
          status?: string
          tech_form_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paysheet_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paysheet_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paysheet_entries_tech_form_id_fkey"
            columns: ["tech_form_id"]
            isOneToOne: false
            referencedRelation: "tech_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_vendor_contacts: {
        Row: {
          created_at: string
          first_seen_at: string
          id: string
          last_seen_at: string
          occurrence_count: number
          phone_guess: string | null
          resolved_at: string | null
          resolved_by: string | null
          sender_domain: string | null
          sender_email: string
          sender_name: string | null
          source_email_id: string | null
          status: string
          suggested_vendor_id: string | null
          suggested_vendor_name: string | null
        }
        Insert: {
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          occurrence_count?: number
          phone_guess?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sender_domain?: string | null
          sender_email: string
          sender_name?: string | null
          source_email_id?: string | null
          status?: string
          suggested_vendor_id?: string | null
          suggested_vendor_name?: string | null
        }
        Update: {
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          occurrence_count?: number
          phone_guess?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sender_domain?: string | null
          sender_email?: string
          sender_name?: string | null
          source_email_id?: string | null
          status?: string
          suggested_vendor_id?: string | null
          suggested_vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_vendor_contacts_suggested_vendor_id_fkey"
            columns: ["suggested_vendor_id"]
            isOneToOne: false
            referencedRelation: "supply_houses"
            referencedColumns: ["id"]
          },
        ]
      }
      permit_applications: {
        Row: {
          approved_at: string | null
          authority_id: string
          automation_log: Json | null
          confirmation_number: string | null
          created_at: string
          id: string
          inspection_scheduled_at: string | null
          inspection_status: string | null
          job_id: string
          notes: string | null
          permit_number: string | null
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          authority_id: string
          automation_log?: Json | null
          confirmation_number?: string | null
          created_at?: string
          id?: string
          inspection_scheduled_at?: string | null
          inspection_status?: string | null
          job_id: string
          notes?: string | null
          permit_number?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          authority_id?: string
          automation_log?: Json | null
          confirmation_number?: string | null
          created_at?: string
          id?: string
          inspection_scheduled_at?: string | null
          inspection_status?: string | null
          job_id?: string
          notes?: string | null
          permit_number?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permit_applications_authority_id_fkey"
            columns: ["authority_id"]
            isOneToOne: false
            referencedRelation: "permit_authorities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permit_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      permit_authorities: {
        Row: {
          contact_email: string | null
          created_at: string
          id: string
          inspection_phone: string | null
          inspection_scheduling_url: string | null
          inspection_url: string | null
          is_active: boolean
          jurisdiction_type: string
          name: string
          notes: string | null
          permit_portal_url: string | null
          portal_config: Json | null
          updated_at: string
          zip_codes: string[] | null
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          id?: string
          inspection_phone?: string | null
          inspection_scheduling_url?: string | null
          inspection_url?: string | null
          is_active?: boolean
          jurisdiction_type?: string
          name: string
          notes?: string | null
          permit_portal_url?: string | null
          portal_config?: Json | null
          updated_at?: string
          zip_codes?: string[] | null
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          id?: string
          inspection_phone?: string | null
          inspection_scheduling_url?: string | null
          inspection_url?: string | null
          is_active?: boolean
          jurisdiction_type?: string
          name?: string
          notes?: string | null
          permit_portal_url?: string | null
          portal_config?: Json | null
          updated_at?: string
          zip_codes?: string[] | null
        }
        Relationships: []
      }
      plan_perk_usage: {
        Row: {
          agreement_id: string
          applied_discount: number | null
          created_at: string
          customer_id: string
          description: string
          id: string
          job_id: string | null
          perk_type: string
        }
        Insert: {
          agreement_id: string
          applied_discount?: number | null
          created_at?: string
          customer_id: string
          description?: string
          id?: string
          job_id?: string | null
          perk_type: string
        }
        Update: {
          agreement_id?: string
          applied_discount?: number | null
          created_at?: string
          customer_id?: string
          description?: string
          id?: string
          job_id?: string | null
          perk_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_perk_usage_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "service_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_perk_usage_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_perk_usage_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_requests: {
        Row: {
          created_at: string
          customer_id: string
          details: string
          id: string
          request_type: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          details?: string
          id?: string
          request_type?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          details?: string
          id?: string
          request_type?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      preinstall_photos: {
        Row: {
          created_at: string
          extracted_model: string | null
          extracted_serial: string | null
          extraction_status: string
          file_path: string
          id: string
          photo_category: string
          survey_id: string
        }
        Insert: {
          created_at?: string
          extracted_model?: string | null
          extracted_serial?: string | null
          extraction_status?: string
          file_path: string
          id?: string
          photo_category?: string
          survey_id: string
        }
        Update: {
          created_at?: string
          extracted_model?: string | null
          extracted_serial?: string | null
          extraction_status?: string
          file_path?: string
          id?: string
          photo_category?: string
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preinstall_photos_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "preinstall_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      preinstall_surveys: {
        Row: {
          created_at: string
          id: string
          job_id: string
          notes: string | null
          submitted_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          notes?: string | null
          submitted_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          notes?: string | null
          submitted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "preinstall_surveys_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preinstall_surveys_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      presentation_sections: {
        Row: {
          body_html: string
          created_at: string
          id: string
          is_active: boolean
          items: Json
          section_key: string
          sort_order: number
          subtitle: string
          title: string
          updated_at: string
        }
        Insert: {
          body_html?: string
          created_at?: string
          id?: string
          is_active?: boolean
          items?: Json
          section_key: string
          sort_order?: number
          subtitle?: string
          title?: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          created_at?: string
          id?: string
          is_active?: boolean
          items?: Json
          section_key?: string
          sort_order?: number
          subtitle?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      pricing_formulas: {
        Row: {
          brand: string
          cash_rebate: number
          created_at: string
          finance_rate: number
          id: string
          labor_fee: number
          materials_fee: number
          profit_fee: number
          tax_rate: number
          tier: string | null
          updated_at: string
        }
        Insert: {
          brand: string
          cash_rebate?: number
          created_at?: string
          finance_rate?: number
          id?: string
          labor_fee?: number
          materials_fee?: number
          profit_fee?: number
          tax_rate?: number
          tier?: string | null
          updated_at?: string
        }
        Update: {
          brand?: string
          cash_rebate?: number
          created_at?: string
          finance_rate?: number
          id?: string
          labor_fee?: number
          materials_fee?: number
          profit_fee?: number
          tax_rate?: number
          tier?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          copilot_position: Json | null
          created_at: string
          employee_id: string | null
          full_name: string | null
          id: string
          jarvis_enabled: boolean | null
          preferred_model: string | null
        }
        Insert: {
          copilot_position?: Json | null
          created_at?: string
          employee_id?: string | null
          full_name?: string | null
          id: string
          jarvis_enabled?: boolean | null
          preferred_model?: string | null
        }
        Update: {
          copilot_position?: Json | null
          created_at?: string
          employee_id?: string | null
          full_name?: string | null
          id?: string
          jarvis_enabled?: boolean | null
          preferred_model?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_kpi_targets: {
        Row: {
          category: string
          created_at: string
          id: string
          min_margin_pct: number
          notes: string | null
          target_margin_pct: number
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          min_margin_pct?: number
          notes?: string | null
          target_margin_pct?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          min_margin_pct?: number
          notes?: string | null
          target_margin_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      prompt_sections: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          is_active: boolean
          is_locked: boolean
          route_scope: string[] | null
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_locked?: boolean
          route_scope?: string[] | null
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_locked?: boolean
          route_scope?: string[] | null
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      property_data: {
        Row: {
          address: string
          bathrooms: number | null
          bedrooms: number | null
          created_at: string | null
          estimated_value: number | null
          fetched_at: string | null
          id: string
          lat: number | null
          lng: number | null
          lot_size: string | null
          property_type: string | null
          screenshot_url: string | null
          source: string | null
          sqft: number | null
          street_view_url: string | null
          year_built: number | null
          zillow_url: string | null
        }
        Insert: {
          address: string
          bathrooms?: number | null
          bedrooms?: number | null
          created_at?: string | null
          estimated_value?: number | null
          fetched_at?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          lot_size?: string | null
          property_type?: string | null
          screenshot_url?: string | null
          source?: string | null
          sqft?: number | null
          street_view_url?: string | null
          year_built?: number | null
          zillow_url?: string | null
        }
        Update: {
          address?: string
          bathrooms?: number | null
          bedrooms?: number | null
          created_at?: string | null
          estimated_value?: number | null
          fetched_at?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          lot_size?: string | null
          property_type?: string | null
          screenshot_url?: string | null
          source?: string | null
          sqft?: number | null
          street_view_url?: string | null
          year_built?: number | null
          zillow_url?: string | null
        }
        Relationships: []
      }
      push_delivery_log: {
        Row: {
          body: string | null
          data: Json | null
          delivery_status: string
          device_token: string | null
          fcm_error: string | null
          fcm_message_id: string | null
          http_status: number | null
          id: string
          metadata: Json | null
          sent_at: string
          source_function: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          body?: string | null
          data?: Json | null
          delivery_status: string
          device_token?: string | null
          fcm_error?: string | null
          fcm_message_id?: string | null
          http_status?: number | null
          id?: string
          metadata?: Json | null
          sent_at?: string
          source_function?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string | null
          data?: Json | null
          delivery_status?: string
          device_token?: string | null
          fcm_error?: string | null
          fcm_message_id?: string | null
          http_status?: number | null
          id?: string
          metadata?: Json | null
          sent_at?: string
          source_function?: string | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string | null
          id: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          platform?: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      quick_link_categories: {
        Row: {
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      quick_link_logos: {
        Row: {
          fetched_at: string | null
          id: string
          logo_url: string | null
          url: string
        }
        Insert: {
          fetched_at?: string | null
          id?: string
          logo_url?: string | null
          url: string
        }
        Update: {
          fetched_at?: string | null
          id?: string
          logo_url?: string | null
          url?: string
        }
        Relationships: []
      }
      quick_links: {
        Row: {
          category: string
          created_at: string
          href: string
          icon_name: string
          id: string
          label: string
          sort_order: number
          sub: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          href: string
          icon_name?: string
          id?: string
          label: string
          sort_order?: number
          sub?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          href?: string
          icon_name?: string
          id?: string
          label?: string
          sort_order?: number
          sub?: string
          updated_at?: string
        }
        Relationships: []
      }
      quick_quote_links: {
        Row: {
          approved_at: string | null
          auto_create_result: Json | null
          auto_create_status: string | null
          company_snapshot: Json | null
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          estimate_id: string | null
          first_viewed_at: string | null
          hcp_job_id: string | null
          id: string
          job_id: string | null
          last_viewed_at: string | null
          matchup_snapshot: Json
          rendered_snapshot: Json | null
          selected_payment: string | null
          token: string
          updated_at: string
          view_count: number
        }
        Insert: {
          approved_at?: string | null
          auto_create_result?: Json | null
          auto_create_status?: string | null
          company_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          estimate_id?: string | null
          first_viewed_at?: string | null
          hcp_job_id?: string | null
          id?: string
          job_id?: string | null
          last_viewed_at?: string | null
          matchup_snapshot: Json
          rendered_snapshot?: Json | null
          selected_payment?: string | null
          token?: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          approved_at?: string | null
          auto_create_result?: Json | null
          auto_create_status?: string | null
          company_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          estimate_id?: string | null
          first_viewed_at?: string | null
          hcp_job_id?: string | null
          id?: string
          job_id?: string | null
          last_viewed_at?: string | null
          matchup_snapshot?: Json
          rendered_snapshot?: Json | null
          selected_payment?: string | null
          token?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "quick_quote_links_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_options: {
        Row: {
          id: string
          is_selected: boolean | null
          matchup_id: string | null
          notes: string | null
          price_override: number | null
          quote_id: string
          sort_order: number | null
          tier: string
        }
        Insert: {
          id?: string
          is_selected?: boolean | null
          matchup_id?: string | null
          notes?: string | null
          price_override?: number | null
          quote_id: string
          sort_order?: number | null
          tier: string
        }
        Update: {
          id?: string
          is_selected?: boolean | null
          matchup_id?: string | null
          notes?: string | null
          price_override?: number | null
          quote_id?: string
          sort_order?: number | null
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_options_matchup_id_fkey"
            columns: ["matchup_id"]
            isOneToOne: false
            referencedRelation: "equipment_matchups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_options_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          address: string | null
          application: string | null
          brand: string | null
          created_at: string
          created_by: string | null
          customer_name: string | null
          estimate_id: string | null
          id: string
          job_id: string | null
          notes: string | null
          status: string
          system_type: string | null
          tonnage: number | null
        }
        Insert: {
          address?: string | null
          application?: string | null
          brand?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          estimate_id?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          status?: string
          system_type?: string | null
          tonnage?: number | null
        }
        Update: {
          address?: string | null
          application?: string | null
          brand?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          estimate_id?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          status?: string
          system_type?: string | null
          tonnage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      rag_feedback: {
        Row: {
          chunk_id: string | null
          created_at: string
          details: string | null
          feedback_type: string
          id: string
          query_text: string | null
          session_id: string | null
        }
        Insert: {
          chunk_id?: string | null
          created_at?: string
          details?: string | null
          feedback_type?: string
          id?: string
          query_text?: string | null
          session_id?: string | null
        }
        Update: {
          chunk_id?: string | null
          created_at?: string
          details?: string | null
          feedback_type?: string
          id?: string
          query_text?: string | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rag_feedback_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "knowledge_chunks"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          bonus_type: string
          code: string
          created_at: string
          customer_id: string
          id: string
          is_active: boolean
        }
        Insert: {
          bonus_type?: string
          code: string
          created_at?: string
          customer_id: string
          id?: string
          is_active?: boolean
        }
        Update: {
          bonus_type?: string
          code?: string
          created_at?: string
          customer_id?: string
          id?: string
          is_active?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "referral_codes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          bonus_awarded: boolean
          created_at: string
          id: string
          notes: string | null
          referred_address: string | null
          referred_email: string | null
          referred_name: string
          referred_phone: string | null
          referrer_code: string
          service_needed: string | null
          status: string
        }
        Insert: {
          bonus_awarded?: boolean
          created_at?: string
          id?: string
          notes?: string | null
          referred_address?: string | null
          referred_email?: string | null
          referred_name: string
          referred_phone?: string | null
          referrer_code: string
          service_needed?: string | null
          status?: string
        }
        Update: {
          bonus_awarded?: boolean
          created_at?: string
          id?: string
          notes?: string | null
          referred_address?: string | null
          referred_email?: string | null
          referred_name?: string
          referred_phone?: string | null
          referrer_code?: string
          service_needed?: string | null
          status?: string
        }
        Relationships: []
      }
      repair_catalog: {
        Row: {
          base_price: number
          category: string
          consequences: string
          created_at: string
          customer_description: string
          default_labor_hours: number
          default_severity: string
          flat_rate: boolean
          id: string
          image_url: string | null
          importance: string
          is_active: boolean
          keywords: string[]
          manual_price_override: boolean
          member_price: number | null
          name: string
          parts_cost: number
          tech_description: string
        }
        Insert: {
          base_price?: number
          category?: string
          consequences?: string
          created_at?: string
          customer_description?: string
          default_labor_hours?: number
          default_severity?: string
          flat_rate?: boolean
          id?: string
          image_url?: string | null
          importance?: string
          is_active?: boolean
          keywords?: string[]
          manual_price_override?: boolean
          member_price?: number | null
          name: string
          parts_cost?: number
          tech_description?: string
        }
        Update: {
          base_price?: number
          category?: string
          consequences?: string
          created_at?: string
          customer_description?: string
          default_labor_hours?: number
          default_severity?: string
          flat_rate?: boolean
          id?: string
          image_url?: string | null
          importance?: string
          is_active?: boolean
          keywords?: string[]
          manual_price_override?: boolean
          member_price?: number | null
          name?: string
          parts_cost?: number
          tech_description?: string
        }
        Relationships: []
      }
      repair_pricing_formulas: {
        Row: {
          category: string
          created_at: string
          flat_rate_multiplier: number
          id: string
          margin_floor: number
          member_discount: number
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          flat_rate_multiplier?: number
          id?: string
          margin_floor?: number
          member_discount?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          flat_rate_multiplier?: number
          id?: string
          margin_floor?: number
          member_discount?: number
          updated_at?: string
        }
        Relationships: []
      }
      retry_queue: {
        Row: {
          attempts: number
          created_at: string
          dead_lettered_at: string | null
          id: string
          last_attempt_at: string | null
          last_error: string | null
          max_attempts: number
          next_attempt_at: string
          operation_type: string
          payload: Json
          related_id: string | null
          source_function: string | null
          status: string
          succeeded_at: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          dead_lettered_at?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          operation_type: string
          payload: Json
          related_id?: string | null
          source_function?: string | null
          status?: string
          succeeded_at?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          dead_lettered_at?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          operation_type?: string
          payload?: Json
          related_id?: string | null
          source_function?: string | null
          status?: string
          succeeded_at?: string | null
        }
        Relationships: []
      }
      route_travel_cache: {
        Row: {
          calculated_at: string
          distance_miles: number | null
          employee_id: string
          from_address: string | null
          from_job_id: string | null
          from_label: string | null
          id: string
          leg_order: number
          scheduled_date: string
          to_address: string | null
          to_job_id: string | null
          travel_minutes: number | null
        }
        Insert: {
          calculated_at?: string
          distance_miles?: number | null
          employee_id: string
          from_address?: string | null
          from_job_id?: string | null
          from_label?: string | null
          id?: string
          leg_order: number
          scheduled_date: string
          to_address?: string | null
          to_job_id?: string | null
          travel_minutes?: number | null
        }
        Update: {
          calculated_at?: string
          distance_miles?: number | null
          employee_id?: string
          from_address?: string | null
          from_job_id?: string | null
          from_label?: string | null
          id?: string
          leg_order?: number
          scheduled_date?: string
          to_address?: string | null
          to_job_id?: string | null
          travel_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "route_travel_cache_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      service_agreements: {
        Row: {
          agreement_discount_percent: number
          created_at: string
          customer_id: string
          end_date: string
          frequency: string
          id: string
          notes: string | null
          plan_name: string
          plan_source: string
          plan_type: string
          price: number
          start_date: string
          status: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          total_visits: number
          updated_at: string
          visits_used: number
        }
        Insert: {
          agreement_discount_percent?: number
          created_at?: string
          customer_id: string
          end_date: string
          frequency?: string
          id?: string
          notes?: string | null
          plan_name?: string
          plan_source?: string
          plan_type?: string
          price?: number
          start_date?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          total_visits?: number
          updated_at?: string
          visits_used?: number
        }
        Update: {
          agreement_discount_percent?: number
          created_at?: string
          customer_id?: string
          end_date?: string
          frequency?: string
          id?: string
          notes?: string | null
          plan_name?: string
          plan_source?: string
          plan_type?: string
          price?: number
          start_date?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          total_visits?: number
          updated_at?: string
          visits_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_agreements_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_health_snapshots: {
        Row: {
          endpoint: string | null
          error_message: string | null
          http_status: number | null
          id: string
          latency_ms: number | null
          metadata: Json | null
          recorded_at: string
          service: string
          status: string
        }
        Insert: {
          endpoint?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          metadata?: Json | null
          recorded_at?: string
          service: string
          status: string
        }
        Update: {
          endpoint?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          metadata?: Json | null
          recorded_at?: string
          service?: string
          status?: string
        }
        Relationships: []
      }
      service_pricebook: {
        Row: {
          base_price: number
          category: string
          cost: number | null
          created_at: string | null
          description: string | null
          icon_emoji: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
        }
        Insert: {
          base_price?: number
          category: string
          cost?: number | null
          created_at?: string | null
          description?: string | null
          icon_emoji?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
        }
        Update: {
          base_price?: number
          category?: string
          cost?: number | null
          created_at?: string | null
          description?: string | null
          icon_emoji?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      service_repair_items: {
        Row: {
          approved: boolean
          catalog_item_id: string | null
          consequences: string | null
          created_at: string
          customer_description: string | null
          description: string
          final_price: number
          id: string
          importance: string | null
          job_id: string
          labor_cost: number
          parts_cost: number
          pay_category: string | null
          severity: string
          source: string
          suggested_price: number
          updated_at: string
        }
        Insert: {
          approved?: boolean
          catalog_item_id?: string | null
          consequences?: string | null
          created_at?: string
          customer_description?: string | null
          description: string
          final_price?: number
          id?: string
          importance?: string | null
          job_id: string
          labor_cost?: number
          parts_cost?: number
          pay_category?: string | null
          severity?: string
          source?: string
          suggested_price?: number
          updated_at?: string
        }
        Update: {
          approved?: boolean
          catalog_item_id?: string | null
          consequences?: string | null
          created_at?: string
          customer_description?: string | null
          description?: string
          final_price?: number
          id?: string
          importance?: string | null
          job_id?: string
          labor_cost?: number
          parts_cost?: number
          pay_category?: string | null
          severity?: string
          source?: string
          suggested_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_repair_items_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "repair_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_repair_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_intake_sessions: {
        Row: {
          collected_data: Json
          created_at: string
          current_step: string
          id: string
          phone_number: string
          updated_at: string
        }
        Insert: {
          collected_data?: Json
          created_at?: string
          current_step?: string
          id?: string
          phone_number: string
          updated_at?: string
        }
        Update: {
          collected_data?: Json
          created_at?: string
          current_step?: string
          id?: string
          phone_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      sms_log: {
        Row: {
          body: string
          client_id: string | null
          contact_name: string | null
          contact_type: string
          created_at: string
          delivery_status: string | null
          direction: string
          error_code: string | null
          error_message: string | null
          from_city: string | null
          from_state: string | null
          from_zip: string | null
          id: string
          is_read: boolean
          media_urls: Json | null
          num_segments: number | null
          phone_number: string
          related_job_id: string | null
          related_vendor_id: string | null
          source_function: string | null
          starred: boolean
          status: string | null
          template_key: string | null
          to_number: string | null
          twilio_sid: string | null
        }
        Insert: {
          body: string
          client_id?: string | null
          contact_name?: string | null
          contact_type?: string
          created_at?: string
          delivery_status?: string | null
          direction: string
          error_code?: string | null
          error_message?: string | null
          from_city?: string | null
          from_state?: string | null
          from_zip?: string | null
          id?: string
          is_read?: boolean
          media_urls?: Json | null
          num_segments?: number | null
          phone_number: string
          related_job_id?: string | null
          related_vendor_id?: string | null
          source_function?: string | null
          starred?: boolean
          status?: string | null
          template_key?: string | null
          to_number?: string | null
          twilio_sid?: string | null
        }
        Update: {
          body?: string
          client_id?: string | null
          contact_name?: string | null
          contact_type?: string
          created_at?: string
          delivery_status?: string | null
          direction?: string
          error_code?: string | null
          error_message?: string | null
          from_city?: string | null
          from_state?: string | null
          from_zip?: string | null
          id?: string
          is_read?: boolean
          media_urls?: Json | null
          num_segments?: number | null
          phone_number?: string
          related_job_id?: string | null
          related_vendor_id?: string | null
          source_function?: string | null
          starred?: boolean
          status?: string | null
          template_key?: string | null
          to_number?: string | null
          twilio_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_log_related_job_id_fkey"
            columns: ["related_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_log_related_vendor_id_fkey"
            columns: ["related_vendor_id"]
            isOneToOne: false
            referencedRelation: "supply_houses"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "sms_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "v_sms_log_with_day"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_templates: {
        Row: {
          category: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string | null
          template_body: string
          updated_at: string | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug?: string | null
          template_body: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string | null
          template_body?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      sms_thread_settings: {
        Row: {
          conversation_status: string | null
          muted_until: string | null
          phone_last10: string
          pinned: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_status?: string | null
          muted_until?: string | null
          phone_last10: string
          pinned?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_status?: string | null
          muted_until?: string | null
          phone_last10?: string
          pinned?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_thread_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          amount: number | null
          created_at: string
          currency: string | null
          customer_email: string | null
          description: string | null
          event_type: string
          id: string
          invoice_id: string | null
          job_id: string | null
          metadata: Json | null
          status: string | null
          stripe_event_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          customer_email?: string | null
          description?: string | null
          event_type: string
          id?: string
          invoice_id?: string | null
          job_id?: string | null
          metadata?: Json | null
          status?: string | null
          stripe_event_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          customer_email?: string | null
          description?: string | null
          event_type?: string
          id?: string
          invoice_id?: string | null
          job_id?: string | null
          metadata?: Json | null
          status?: string | null
          stripe_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "customer_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_house_locations: {
        Row: {
          account_number: string | null
          address: string | null
          branch_name: string
          city: string | null
          created_at: string
          email: string | null
          fax: string | null
          hours: string | null
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          phone: string | null
          rep_name: string | null
          rep_phone: string | null
          state: string | null
          supply_house_id: string
          website_url: string | null
          zip: string | null
        }
        Insert: {
          account_number?: string | null
          address?: string | null
          branch_name: string
          city?: string | null
          created_at?: string
          email?: string | null
          fax?: string | null
          hours?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          phone?: string | null
          rep_name?: string | null
          rep_phone?: string | null
          state?: string | null
          supply_house_id: string
          website_url?: string | null
          zip?: string | null
        }
        Update: {
          account_number?: string | null
          address?: string | null
          branch_name?: string
          city?: string | null
          created_at?: string
          email?: string | null
          fax?: string | null
          hours?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          phone?: string | null
          rep_name?: string | null
          rep_phone?: string | null
          state?: string | null
          supply_house_id?: string
          website_url?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supply_house_locations_supply_house_id_fkey"
            columns: ["supply_house_id"]
            isOneToOne: false
            referencedRelation: "supply_houses"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_houses: {
        Row: {
          account_number: string | null
          brand_affinity: string[] | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          ordering_url: string | null
          text_support_phone: string | null
          website_url: string | null
        }
        Insert: {
          account_number?: string | null
          brand_affinity?: string[] | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          ordering_url?: string | null
          text_support_phone?: string | null
          website_url?: string | null
        }
        Update: {
          account_number?: string | null
          brand_affinity?: string[] | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          ordering_url?: string | null
          text_support_phone?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      system_error_log: {
        Row: {
          alerted: boolean
          context: Json | null
          error_message: string
          http_status: number | null
          id: string
          occurred_at: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          source_name: string
          source_type: string
          stack_trace: string | null
        }
        Insert: {
          alerted?: boolean
          context?: Json | null
          error_message: string
          http_status?: number | null
          id?: string
          occurred_at?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source_name: string
          source_type: string
          stack_trace?: string | null
        }
        Update: {
          alerted?: boolean
          context?: Json | null
          error_message?: string
          http_status?: number | null
          id?: string
          occurred_at?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source_name?: string
          source_type?: string
          stack_trace?: string | null
        }
        Relationships: []
      }
      system_trace_events: {
        Row: {
          call_sid: string | null
          entity_id: string | null
          entity_type: string | null
          event_kind: string
          id: string
          metadata: Json
          occurred_at: string
          parent_call_sid: string | null
          reason: string | null
          severity: string
          source_name: string
          source_type: string
          summary: string
          trace_group: string | null
        }
        Insert: {
          call_sid?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_kind: string
          id?: string
          metadata?: Json
          occurred_at?: string
          parent_call_sid?: string | null
          reason?: string | null
          severity?: string
          source_name: string
          source_type: string
          summary: string
          trace_group?: string | null
        }
        Update: {
          call_sid?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_kind?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          parent_call_sid?: string | null
          reason?: string | null
          severity?: string
          source_name?: string
          source_type?: string
          summary?: string
          trace_group?: string | null
        }
        Relationships: []
      }
      tech_form_fields: {
        Row: {
          condition: string | null
          created_at: string
          field_type: string
          id: string
          is_required: boolean
          job_type: string
          label: string
          options: Json | null
          sort_order: number
          step_group: string | null
        }
        Insert: {
          condition?: string | null
          created_at?: string
          field_type?: string
          id?: string
          is_required?: boolean
          job_type: string
          label: string
          options?: Json | null
          sort_order?: number
          step_group?: string | null
        }
        Update: {
          condition?: string | null
          created_at?: string
          field_type?: string
          id?: string
          is_required?: boolean
          job_type?: string
          label?: string
          options?: Json | null
          sort_order?: number
          step_group?: string | null
        }
        Relationships: []
      }
      tech_form_photos: {
        Row: {
          created_at: string
          extracted_discharge: string | null
          extracted_filter_condition: string | null
          extracted_filter_size: string | null
          extracted_items: Json | null
          extracted_model: string | null
          extracted_reading_unit: string | null
          extracted_reading_value: string | null
          extracted_serial: string | null
          extracted_suction: string | null
          extracted_supply_house: string | null
          extracted_total: number | null
          extracted_uf: string | null
          extracted_vac: string | null
          extraction_status: string | null
          file_path: string
          id: string
          job_invoice_id: string | null
          photo_latitude: number | null
          photo_longitude: number | null
          photo_taken_at: string | null
          photo_type: string | null
          tech_form_id: string
        }
        Insert: {
          created_at?: string
          extracted_discharge?: string | null
          extracted_filter_condition?: string | null
          extracted_filter_size?: string | null
          extracted_items?: Json | null
          extracted_model?: string | null
          extracted_reading_unit?: string | null
          extracted_reading_value?: string | null
          extracted_serial?: string | null
          extracted_suction?: string | null
          extracted_supply_house?: string | null
          extracted_total?: number | null
          extracted_uf?: string | null
          extracted_vac?: string | null
          extraction_status?: string | null
          file_path: string
          id?: string
          job_invoice_id?: string | null
          photo_latitude?: number | null
          photo_longitude?: number | null
          photo_taken_at?: string | null
          photo_type?: string | null
          tech_form_id: string
        }
        Update: {
          created_at?: string
          extracted_discharge?: string | null
          extracted_filter_condition?: string | null
          extracted_filter_size?: string | null
          extracted_items?: Json | null
          extracted_model?: string | null
          extracted_reading_unit?: string | null
          extracted_reading_value?: string | null
          extracted_serial?: string | null
          extracted_suction?: string | null
          extracted_supply_house?: string | null
          extracted_total?: number | null
          extracted_uf?: string | null
          extracted_vac?: string | null
          extraction_status?: string | null
          file_path?: string
          id?: string
          job_invoice_id?: string | null
          photo_latitude?: number | null
          photo_longitude?: number | null
          photo_taken_at?: string | null
          photo_type?: string | null
          tech_form_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tech_form_photos_job_invoice_id_fkey"
            columns: ["job_invoice_id"]
            isOneToOne: false
            referencedRelation: "job_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_form_photos_tech_form_id_fkey"
            columns: ["tech_form_id"]
            isOneToOne: false
            referencedRelation: "tech_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      tech_form_responses: {
        Row: {
          created_at: string
          field_id: string
          id: string
          tech_form_id: string
          value: string | null
        }
        Insert: {
          created_at?: string
          field_id: string
          id?: string
          tech_form_id: string
          value?: string | null
        }
        Update: {
          created_at?: string
          field_id?: string
          id?: string
          tech_form_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tech_form_responses_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "tech_form_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_form_responses_tech_form_id_fkey"
            columns: ["tech_form_id"]
            isOneToOne: false
            referencedRelation: "tech_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      tech_form_versions: {
        Row: {
          created_at: string
          id: string
          responses: Json
          snapshot_reason: string
          tech_form_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          responses?: Json
          snapshot_reason?: string
          tech_form_id: string
        }
        Update: {
          created_at?: string
          id?: string
          responses?: Json
          snapshot_reason?: string
          tech_form_id?: string
        }
        Relationships: []
      }
      tech_forms: {
        Row: {
          created_at: string
          employee_id: string
          equipment_model: string | null
          equipment_serial: string | null
          id: string
          is_service_agreement: boolean
          job_id: string
          latitude: number | null
          location_accuracy: number | null
          longitude: number | null
          notes: string | null
          status: string
          submitted_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          equipment_model?: string | null
          equipment_serial?: string | null
          id?: string
          is_service_agreement?: boolean
          job_id: string
          latitude?: number | null
          location_accuracy?: number | null
          longitude?: number | null
          notes?: string | null
          status?: string
          submitted_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          equipment_model?: string | null
          equipment_serial?: string | null
          id?: string
          is_service_agreement?: boolean
          job_id?: string
          latitude?: number | null
          location_accuracy?: number | null
          longitude?: number | null
          notes?: string | null
          status?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tech_forms_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_forms_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      tech_location_events: {
        Row: {
          created_at: string | null
          employee_id: string
          estimate_id: string | null
          event_type: string
          id: string
          job_id: string | null
          lat: number | null
          lng: number | null
          location_name: string | null
          supply_house_location_id: string | null
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          estimate_id?: string | null
          event_type: string
          id?: string
          job_id?: string | null
          lat?: number | null
          lng?: number | null
          location_name?: string | null
          supply_house_location_id?: string | null
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          estimate_id?: string | null
          event_type?: string
          id?: string
          job_id?: string | null
          lat?: number | null
          lng?: number | null
          location_name?: string | null
          supply_house_location_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tech_location_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_location_events_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_location_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_location_events_supply_house_location_id_fkey"
            columns: ["supply_house_location_id"]
            isOneToOne: false
            referencedRelation: "supply_house_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      tech_locations: {
        Row: {
          accuracy: number | null
          employee_id: string
          id: string
          lat: number
          lng: number
          speed: number | null
          updated_at: string
        }
        Insert: {
          accuracy?: number | null
          employee_id: string
          id?: string
          lat: number
          lng: number
          speed?: number | null
          updated_at?: string
        }
        Update: {
          accuracy?: number | null
          employee_id?: string
          id?: string
          lat?: number
          lng?: number
          speed?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tech_locations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      tier_presets: {
        Row: {
          created_at: string
          display_order: number
          id: string
          label: string | null
          matchup_id: string
          scope: string
          tier: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          label?: string | null
          matchup_id: string
          scope: string
          tier: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          label?: string | null
          matchup_id?: string
          scope?: string
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tier_presets_matchup_id_fkey"
            columns: ["matchup_id"]
            isOneToOne: false
            referencedRelation: "equipment_matchups"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          arrived_at: string
          clock_in: string | null
          clock_out: string | null
          created_at: string
          departed_at: string | null
          drive_time_min: number | null
          employee_id: string
          id: string
          job_id: string
          override_note: string | null
          source: string
          tech_form_id: string
          time_on_site_min: number | null
          total_hours: number | null
          work_date: string
        }
        Insert: {
          arrived_at: string
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          departed_at?: string | null
          drive_time_min?: number | null
          employee_id: string
          id?: string
          job_id: string
          override_note?: string | null
          source?: string
          tech_form_id: string
          time_on_site_min?: number | null
          total_hours?: number | null
          work_date: string
        }
        Update: {
          arrived_at?: string
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          departed_at?: string | null
          drive_time_min?: number | null
          employee_id?: string
          id?: string
          job_id?: string
          override_note?: string | null
          source?: string
          tech_form_id?: string
          time_on_site_min?: number | null
          total_hours?: number | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
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
      vendor_contacts: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          is_primary: boolean | null
          name: string
          notes: string | null
          phone: string | null
          supply_house_id: string
          title: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          name: string
          notes?: string | null
          phone?: string | null
          supply_house_id: string
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          name?: string
          notes?: string | null
          phone?: string | null
          supply_house_id?: string
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_contacts_supply_house_id_fkey"
            columns: ["supply_house_id"]
            isOneToOne: false
            referencedRelation: "supply_houses"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_notes: {
        Row: {
          author_id: string | null
          author_name: string | null
          body: string
          created_at: string
          id: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          body: string
          created_at?: string
          id?: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          body?: string
          created_at?: string
          id?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_notes_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "supply_houses"
            referencedColumns: ["id"]
          },
        ]
      }
      voicemails: {
        Row: {
          call_log_id: string | null
          contact_name: string | null
          contact_type: string
          created_at: string
          duration_seconds: number | null
          id: string
          is_read: boolean
          phone_number: string
          recording_sid: string | null
          recording_url: string | null
          transcription: string | null
        }
        Insert: {
          call_log_id?: string | null
          contact_name?: string | null
          contact_type?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_read?: boolean
          phone_number: string
          recording_sid?: string | null
          recording_url?: string | null
          transcription?: string | null
        }
        Update: {
          call_log_id?: string | null
          contact_name?: string | null
          contact_type?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_read?: boolean
          phone_number?: string
          recording_sid?: string | null
          recording_url?: string | null
          transcription?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voicemails_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voicemails_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "v_call_log_with_day"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_registrations: {
        Row: {
          confirmation_number: string | null
          created_at: string
          id: string
          job_id: string
          notes: string | null
          registered_at: string | null
          status: string
        }
        Insert: {
          confirmation_number?: string | null
          created_at?: string
          id?: string
          job_id: string
          notes?: string | null
          registered_at?: string | null
          status?: string
        }
        Update: {
          confirmation_number?: string | null
          created_at?: string
          id?: string
          job_id?: string
          notes?: string | null
          registered_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranty_registrations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_forecast_cache: {
        Row: {
          business_hours_rain: boolean
          condition: string
          feels_like_high: number | null
          feels_like_low: number | null
          fetched_at: string
          forecast_date: string
          heat_warning: boolean
          humidity_avg: number | null
          humidity_max: number | null
          precip_chance: number
          precip_inches: number
          raw: Json | null
          summary: string | null
          temp_high: number | null
          temp_low: number | null
          wind_max_mph: number | null
        }
        Insert: {
          business_hours_rain?: boolean
          condition?: string
          feels_like_high?: number | null
          feels_like_low?: number | null
          fetched_at?: string
          forecast_date: string
          heat_warning?: boolean
          humidity_avg?: number | null
          humidity_max?: number | null
          precip_chance?: number
          precip_inches?: number
          raw?: Json | null
          summary?: string | null
          temp_high?: number | null
          temp_low?: number | null
          wind_max_mph?: number | null
        }
        Update: {
          business_hours_rain?: boolean
          condition?: string
          feels_like_high?: number | null
          feels_like_low?: number | null
          fetched_at?: string
          forecast_date?: string
          heat_warning?: boolean
          humidity_avg?: number | null
          humidity_max?: number | null
          precip_chance?: number
          precip_inches?: number
          raw?: Json | null
          summary?: string | null
          temp_high?: number | null
          temp_low?: number | null
          wind_max_mph?: number | null
        }
        Relationships: []
      }
      weather_sms_codes: {
        Row: {
          code: string
          created_at: string
          discount_amount: number
          forecast_date: string
          jobs_targeted: number
          redeemed_at: string | null
          redeemed_job_id: string | null
          valid_until: string
        }
        Insert: {
          code: string
          created_at?: string
          discount_amount?: number
          forecast_date: string
          jobs_targeted?: number
          redeemed_at?: string | null
          redeemed_job_id?: string | null
          valid_until?: string
        }
        Update: {
          code?: string
          created_at?: string
          discount_amount?: number
          forecast_date?: string
          jobs_targeted?: number
          redeemed_at?: string | null
          redeemed_job_id?: string | null
          valid_until?: string
        }
        Relationships: []
      }
      workflow_alerts: {
        Row: {
          alert_type: string
          created_at: string | null
          details: string | null
          id: string
          job_id: string | null
          missing_fields: string[] | null
          resolved_at: string | null
          step_id: string
        }
        Insert: {
          alert_type: string
          created_at?: string | null
          details?: string | null
          id?: string
          job_id?: string | null
          missing_fields?: string[] | null
          resolved_at?: string | null
          step_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string | null
          details?: string | null
          id?: string
          job_id?: string | null
          missing_fields?: string[] | null
          resolved_at?: string | null
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_alerts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_definitions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          job_type: string
          steps: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          job_type: string
          steps?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          job_type?: string
          steps?: Json
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_call_log_with_day: {
        Row: {
          ai_summary: string | null
          answered_by: string | null
          call_extraction: Json | null
          contact_name: string | null
          contact_type: string | null
          created_at: string | null
          day_ct: string | null
          direction: string | null
          duration_seconds: number | null
          ended_at: string | null
          extracted_data: Json | null
          hcp_note_synced: boolean | null
          id: string | null
          is_read: boolean | null
          phone_number: string | null
          recording_url: string | null
          related_customer_id: string | null
          related_job_id: string | null
          related_vendor_id: string | null
          started_at: string | null
          status: string | null
          stir_status: string | null
          time_ct: string | null
          transcription: string | null
          twilio_sid: string | null
        }
        Insert: {
          ai_summary?: string | null
          answered_by?: string | null
          call_extraction?: Json | null
          contact_name?: string | null
          contact_type?: string | null
          created_at?: string | null
          day_ct?: never
          direction?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          extracted_data?: Json | null
          hcp_note_synced?: boolean | null
          id?: string | null
          is_read?: boolean | null
          phone_number?: string | null
          recording_url?: string | null
          related_customer_id?: string | null
          related_job_id?: string | null
          related_vendor_id?: string | null
          started_at?: string | null
          status?: string | null
          stir_status?: string | null
          time_ct?: never
          transcription?: string | null
          twilio_sid?: string | null
        }
        Update: {
          ai_summary?: string | null
          answered_by?: string | null
          call_extraction?: Json | null
          contact_name?: string | null
          contact_type?: string | null
          created_at?: string | null
          day_ct?: never
          direction?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          extracted_data?: Json | null
          hcp_note_synced?: boolean | null
          id?: string | null
          is_read?: boolean | null
          phone_number?: string | null
          recording_url?: string | null
          related_customer_id?: string | null
          related_job_id?: string | null
          related_vendor_id?: string | null
          started_at?: string | null
          status?: string | null
          stir_status?: string | null
          time_ct?: never
          transcription?: string | null
          twilio_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_log_related_job_id_fkey"
            columns: ["related_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_log_related_vendor_id_fkey"
            columns: ["related_vendor_id"]
            isOneToOne: false
            referencedRelation: "supply_houses"
            referencedColumns: ["id"]
          },
        ]
      }
      v_sms_log_with_day: {
        Row: {
          body: string | null
          client_id: string | null
          contact_name: string | null
          contact_type: string | null
          created_at: string | null
          day_ct: string | null
          delivery_status: string | null
          direction: string | null
          error_code: string | null
          from_city: string | null
          from_state: string | null
          from_zip: string | null
          id: string | null
          is_read: boolean | null
          media_urls: Json | null
          num_segments: number | null
          phone_number: string | null
          related_job_id: string | null
          related_vendor_id: string | null
          time_ct: string | null
          to_number: string | null
          twilio_sid: string | null
        }
        Insert: {
          body?: string | null
          client_id?: string | null
          contact_name?: string | null
          contact_type?: string | null
          created_at?: string | null
          day_ct?: never
          delivery_status?: string | null
          direction?: string | null
          error_code?: string | null
          from_city?: string | null
          from_state?: string | null
          from_zip?: string | null
          id?: string | null
          is_read?: boolean | null
          media_urls?: Json | null
          num_segments?: number | null
          phone_number?: string | null
          related_job_id?: string | null
          related_vendor_id?: string | null
          time_ct?: never
          to_number?: string | null
          twilio_sid?: string | null
        }
        Update: {
          body?: string | null
          client_id?: string | null
          contact_name?: string | null
          contact_type?: string | null
          created_at?: string | null
          day_ct?: never
          delivery_status?: string | null
          direction?: string | null
          error_code?: string | null
          from_city?: string | null
          from_state?: string | null
          from_zip?: string | null
          id?: string | null
          is_read?: boolean | null
          media_urls?: Json | null
          num_segments?: number | null
          phone_number?: string | null
          related_job_id?: string | null
          related_vendor_id?: string | null
          time_ct?: never
          to_number?: string | null
          twilio_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_log_related_job_id_fkey"
            columns: ["related_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_log_related_vendor_id_fkey"
            columns: ["related_vendor_id"]
            isOneToOne: false
            referencedRelation: "supply_houses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      begin_cron_run: {
        Args: { p_job_name: string; p_metadata?: Json }
        Returns: string
      }
      cleanup_stale_chunks: { Args: { months_old?: number }; Returns: number }
      enqueue_retry: {
        Args: {
          p_initial_delay_seconds?: number
          p_max_attempts?: number
          p_operation_type: string
          p_payload: Json
          p_related_id?: string
          p_source_function?: string
        }
        Returns: string
      }
      find_customer_by_phone: {
        Args: { digits: string }
        Returns: {
          first_name: string
          id: string
          last_name: string
        }[]
      }
      find_duplicate_customers: {
        Args: never
        Returns: {
          created_at: string
          customer_id: string
          email: string
          first_name: string
          group_id: number
          hcp_customer_id: string
          job_count: number
          last_name: string
          mobile_phone: string
          phone: string
        }[]
      }
      find_job_by_phone: {
        Args: { digits: string }
        Returns: {
          customer_name: string
          customer_phone: string
          hcp_job_number: string
          id: string
          job_type: string
          scheduled_date: string
        }[]
      }
      finish_cron_run: {
        Args: {
          p_error_message?: string
          p_metadata?: Json
          p_rows_processed?: number
          p_run_id: string
          p_status?: string
        }
        Returns: undefined
      }
      get_cron_health: {
        Args: never
        Returns: {
          consecutive_failures: number
          is_stale: boolean
          job_name: string
          last_duration_ms: number
          last_run_at: string
          last_status: string
        }[]
      }
      get_customer_enrichment: {
        Args: never
        Returns: {
          agreement_end_date: string
          agreement_plan_name: string
          agreement_plan_source: string
          agreement_status: string
          customer_id: string
          has_install: boolean
          job_count: number
          last_job_date: string
        }[]
      }
      get_customer_job_counts: {
        Args: never
        Returns: {
          customer_id: string
          job_count: number
          last_job_date: string
        }[]
      }
      get_customer_overview: { Args: { p_customer_id: string }; Returns: Json }
      get_customers_paginated: {
        Args: {
          p_letter?: string
          p_page_num?: number
          p_page_size?: number
          p_search?: string
          p_sort_by?: string
        }
        Returns: {
          address: string
          agreement_end_date: string
          agreement_plan_name: string
          agreement_plan_source: string
          agreement_status: string
          city: string
          company: string
          created_at: string
          email: string
          first_name: string
          has_install: boolean
          hcp_customer_id: string
          id: string
          job_count: number
          last_job_date: string
          last_name: string
          mobile_phone: string
          notes: string
          phone: string
          state: string
          tags: string[]
          total_count: number
          updated_at: string
          zip: string
        }[]
      }
      get_recent_cron_runs: {
        Args: { p_limit?: number }
        Returns: {
          duration_ms: number
          finished_at: string
          job_name: string
          return_message: string
          started_at: string
          status: string
        }[]
      }
      get_revenue_by_month: {
        Args: { months_back?: number }
        Returns: {
          month: string
          revenue: number
        }[]
      }
      get_role_default_tabs: { Args: { _role: string }; Returns: string[] }
      get_tech_dashboard_data: {
        Args: { p_date: string; p_employee_name: string }
        Returns: Json
      }
      get_top_copilot_actions: {
        Args: {
          _context_subtype?: string
          _context_type: string
          _limit?: number
          _user_id: string
        }
        Returns: {
          action_key: string
          action_label: string
          click_count: number
          last_clicked: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_system_error: {
        Args: {
          p_context?: Json
          p_error_message: string
          p_http_status?: number
          p_severity?: string
          p_source_name: string
          p_source_type: string
          p_stack_trace?: string
        }
        Returns: string
      }
      log_system_trace: {
        Args: {
          p_call_sid?: string
          p_entity_id?: string
          p_entity_type?: string
          p_event_kind: string
          p_metadata?: Json
          p_parent_call_sid?: string
          p_reason?: string
          p_severity?: string
          p_source_name: string
          p_source_type: string
          p_summary: string
          p_trace_group?: string
        }
        Returns: string
      }
      match_knowledge:
        | {
            Args: {
              match_count?: number
              match_threshold?: number
              query_embedding: string
            }
            Returns: {
              chunk_text: string
              id: string
              metadata: Json
              similarity: number
              source_id: string
              source_table: string
            }[]
          }
        | {
            Args: {
              filter_source?: string
              keyword_query?: string
              match_count?: number
              match_threshold?: number
              query_embedding: string
            }
            Returns: {
              chunk_text: string
              id: string
              metadata: Json
              similarity: number
              source_id: string
              source_table: string
            }[]
          }
      merge_customers: {
        Args: { keep_id: string; remove_id: string }
        Returns: Json
      }
      resolve_open_job_for_customer: {
        Args: { _customer_id: string }
        Returns: string
      }
      safe_http_post: {
        Args: {
          p_body: Json
          p_extra_headers?: Json
          p_source: string
          p_timeout_ms?: number
          p_url: string
        }
        Returns: number
      }
      snapshot_daily_weather_to_jobs: { Args: never; Returns: Json }
      track_cart_view: { Args: { p_token: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "office" | "tech" | "supervisor"
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
      app_role: ["admin", "office", "tech", "supervisor"],
    },
  },
} as const
