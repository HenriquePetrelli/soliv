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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      access_logs: {
        Row: {
          created_at: string
          email: string | null
          event: string
          id: number
          ip_address: unknown
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          event: string
          id?: never
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          event?: string
          id?: never
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: Json
          id: string
          target_id: string | null
          target_name: string | null
          target_type: string
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_name?: string | null
          target_type: string
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_name?: string | null
          target_type?: string
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          created_at: string
          granted_at: string
          granted_by: string | null
          id: string
          is_active: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          environment: string
          id: boolean
          updated_at: string
        }
        Insert: {
          environment?: string
          id?: boolean
          updated_at?: string
        }
        Update: {
          environment?: string
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      appointment_private_notes: {
        Row: {
          appointment_id: string
          created_at: string
          note: string
          psychologist_id: string
          updated_at: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          note?: string
          psychologist_id: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          note?: string
          psychologist_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_private_notes_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_problem_reports: {
        Row: {
          appointment_id: string
          created_at: string
          details: string | null
          id: string
          refunded: boolean
          reported_by: string
          reporter_type: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          details?: string | null
          id?: string
          refunded?: boolean
          reported_by: string
          reporter_type: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          details?: string | null
          id?: string
          refunded?: boolean
          reported_by?: string
          reporter_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_problem_reports_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_reminders_sent: {
        Row: {
          appointment_id: string
          kind: string
          sent_at: string
        }
        Insert: {
          appointment_id: string
          kind: string
          sent_at?: string
        }
        Update: {
          appointment_id?: string
          kind?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_reminders_sent_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_type: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          duration: number | null
          extra_credit_id: string | null
          id: string
          notes: string | null
          patient_id: string
          proposal_notes: string | null
          proposed_scheduled_at: string | null
          psychologist_id: string | null
          psychologist_name: string | null
          scheduled_at: string
          session_summary: string | null
          status: string
          updated_at: string
          video_room_id: string | null
        }
        Insert: {
          appointment_type?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          duration?: number | null
          extra_credit_id?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          proposal_notes?: string | null
          proposed_scheduled_at?: string | null
          psychologist_id?: string | null
          psychologist_name?: string | null
          scheduled_at: string
          session_summary?: string | null
          status?: string
          updated_at?: string
          video_room_id?: string | null
        }
        Update: {
          appointment_type?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          duration?: number | null
          extra_credit_id?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          proposal_notes?: string | null
          proposed_scheduled_at?: string | null
          psychologist_id?: string | null
          psychologist_name?: string | null
          scheduled_at?: string
          session_summary?: string | null
          status?: string
          updated_at?: string
          video_room_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_extra_credit_id_fkey"
            columns: ["extra_credit_id"]
            isOneToOne: false
            referencedRelation: "extra_credits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_psychologist_fk"
            columns: ["psychologist_id"]
            isOneToOne: false
            referencedRelation: "psychologists"
            referencedColumns: ["user_id"]
          },
        ]
      }
      archived_psychologist_payouts: {
        Row: {
          archived_at: string
          cpf: string | null
          crp: string | null
          email: string | null
          former_psychologist_id: string
          full_name: string | null
          id: string
          payment_logs: Json
          payment_summary: Json | null
          payout_items: Json
          pix_key: string | null
          pix_type: string | null
          purge_after: string
        }
        Insert: {
          archived_at?: string
          cpf?: string | null
          crp?: string | null
          email?: string | null
          former_psychologist_id: string
          full_name?: string | null
          id?: string
          payment_logs?: Json
          payment_summary?: Json | null
          payout_items?: Json
          pix_key?: string | null
          pix_type?: string | null
          purge_after?: string
        }
        Update: {
          archived_at?: string
          cpf?: string | null
          crp?: string | null
          email?: string | null
          former_psychologist_id?: string
          full_name?: string | null
          id?: string
          payment_logs?: Json
          payment_summary?: Json | null
          payout_items?: Json
          pix_key?: string | null
          pix_type?: string | null
          purge_after?: string
        }
        Relationships: []
      }
      brazilian_cities: {
        Row: {
          id: number
          latitude: number | null
          longitude: number | null
          name: string
          state: string
        }
        Insert: {
          id?: number
          latitude?: number | null
          longitude?: number | null
          name: string
          state: string
        }
        Update: {
          id?: number
          latitude?: number | null
          longitude?: number | null
          name?: string
          state?: string
        }
        Relationships: []
      }
      brazilian_states: {
        Row: {
          abbreviation: string
          id: number
          latitude: number
          longitude: number
          name: string
          region: string
          uf_code: number
        }
        Insert: {
          abbreviation: string
          id?: number
          latitude: number
          longitude: number
          name: string
          region: string
          uf_code: number
        }
        Update: {
          abbreviation?: string
          id?: number
          latitude?: number
          longitude?: number
          name?: string
          region?: string
          uf_code?: number
        }
        Relationships: []
      }
      care_record_archive: {
        Row: {
          archived_at: string
          data: Json
          former_patient_id: string | null
          id: string
          occurred_at: string
          patient_email: string | null
          patient_name: string | null
          psychologist_id: string | null
          record_type: string
          retain_until: string
          source_id: string
        }
        Insert: {
          archived_at?: string
          data: Json
          former_patient_id?: string | null
          id?: string
          occurred_at: string
          patient_email?: string | null
          patient_name?: string | null
          psychologist_id?: string | null
          record_type: string
          retain_until: string
          source_id: string
        }
        Update: {
          archived_at?: string
          data?: Json
          former_patient_id?: string | null
          id?: string
          occurred_at?: string
          patient_email?: string | null
          patient_name?: string | null
          psychologist_id?: string | null
          record_type?: string
          retain_until?: string
          source_id?: string
        }
        Relationships: []
      }
      conversas: {
        Row: {
          created_at: string
          data_fim: string | null
          data_inicio: string
          id: string
          oculta_paciente_em: string | null
          oculta_psicologo_em: string | null
          paciente_id: string
          psicologo_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          id?: string
          oculta_paciente_em?: string | null
          oculta_psicologo_em?: string | null
          paciente_id: string
          psicologo_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          id?: string
          oculta_paciente_em?: string | null
          oculta_psicologo_em?: string | null
          paciente_id?: string
          psicologo_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      crp_verifications: {
        Row: {
          cfp_inscricao: string | null
          cfp_nome: string | null
          cfp_regiao: string | null
          cfp_registro: string | null
          cfp_situacao: string | null
          context: string
          crp_number: string
          id: string
          notes: string | null
          psychologist_id: string
          status: string
          verified_at: string
          verified_by: string | null
        }
        Insert: {
          cfp_inscricao?: string | null
          cfp_nome?: string | null
          cfp_regiao?: string | null
          cfp_registro?: string | null
          cfp_situacao?: string | null
          context: string
          crp_number: string
          id?: string
          notes?: string | null
          psychologist_id: string
          status: string
          verified_at?: string
          verified_by?: string | null
        }
        Update: {
          cfp_inscricao?: string | null
          cfp_nome?: string | null
          cfp_regiao?: string | null
          cfp_registro?: string | null
          cfp_situacao?: string | null
          context?: string
          crp_number?: string
          id?: string
          notes?: string | null
          psychologist_id?: string
          status?: string
          verified_at?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crp_verifications_psychologist_id_fkey"
            columns: ["psychologist_id"]
            isOneToOne: false
            referencedRelation: "psychologists"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_contacts: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          name: string
          patient_id: string
          phone: string
          plan_id: string
          relationship: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          name: string
          patient_id: string
          phone: string
          plan_id: string
          relationship?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          name?: string
          patient_id?: string
          phone?: string
          plan_id?: string
          relationship?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_contacts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "safety_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_requests: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          channel: string
          created_at: string
          crisis_resolved: boolean | null
          duration: number | null
          end_notes: string | null
          end_reason: string | null
          ended_at: string | null
          ended_by: string | null
          ended_by_type: string | null
          expires_at: string | null
          extra_credit_id: string | null
          id: string
          patient_details: Json
          patient_id: string
          room_url: string | null
          started_at: string | null
          status: string
          time_limit_seconds: number
          triage: string[]
          updated_at: string
          video_room_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          channel?: string
          created_at?: string
          crisis_resolved?: boolean | null
          duration?: number | null
          end_notes?: string | null
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          ended_by_type?: string | null
          expires_at?: string | null
          extra_credit_id?: string | null
          id?: string
          patient_details?: Json
          patient_id: string
          room_url?: string | null
          started_at?: string | null
          status?: string
          time_limit_seconds?: number
          triage?: string[]
          updated_at?: string
          video_room_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          channel?: string
          created_at?: string
          crisis_resolved?: boolean | null
          duration?: number | null
          end_notes?: string | null
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          ended_by_type?: string | null
          expires_at?: string | null
          extra_credit_id?: string | null
          id?: string
          patient_details?: Json
          patient_id?: string
          room_url?: string | null
          started_at?: string | null
          status?: string
          time_limit_seconds?: number
          triage?: string[]
          updated_at?: string
          video_room_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emergency_requests_extra_credit_id_fkey"
            columns: ["extra_credit_id"]
            isOneToOne: false
            referencedRelation: "extra_credits"
            referencedColumns: ["id"]
          },
        ]
      }
      extra_credits: {
        Row: {
          amount_cents: number
          appointment_id: string | null
          consumed_at: string | null
          created_at: string
          emergency_request_id: string | null
          id: string
          kind: string
          price_tier: string
          status: string
          stripe_payment_intent_id: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          appointment_id?: string | null
          consumed_at?: string | null
          created_at?: string
          emergency_request_id?: string | null
          id?: string
          kind: string
          price_tier: string
          status?: string
          stripe_payment_intent_id: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          appointment_id?: string | null
          consumed_at?: string | null
          created_at?: string
          emergency_request_id?: string | null
          id?: string
          kind?: string
          price_tier?: string
          status?: string
          stripe_payment_intent_id?: string
          user_id?: string
        }
        Relationships: []
      }
      fcm_tokens: {
        Row: {
          created_at: string
          device_info: Json | null
          id: string
          is_active: boolean | null
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_info?: Json | null
          id?: string
          is_active?: boolean | null
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_info?: Json | null
          id?: string
          is_active?: boolean | null
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      group_favorites: {
        Row: {
          favoritado_em: string
          group_id: string
          id: string
          user_id: string
        }
        Insert: {
          favoritado_em?: string
          group_id: string
          id?: string
          user_id: string
        }
        Update: {
          favoritado_em?: string
          group_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_favorites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "support_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_testimonial_likes: {
        Row: {
          criado_em: string
          id: string
          testimonial_id: string
          tipo: Database["public"]["Enums"]["like_type"]
          user_id: string
        }
        Insert: {
          criado_em?: string
          id?: string
          testimonial_id: string
          tipo: Database["public"]["Enums"]["like_type"]
          user_id: string
        }
        Update: {
          criado_em?: string
          id?: string
          testimonial_id?: string
          tipo?: Database["public"]["Enums"]["like_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_testimonial_likes_testimonial_id_fkey"
            columns: ["testimonial_id"]
            isOneToOne: false
            referencedRelation: "group_testimonials"
            referencedColumns: ["id"]
          },
        ]
      }
      group_testimonial_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          testimonial_id: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          testimonial_id: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          testimonial_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_testimonial_reports_testimonial_id_fkey"
            columns: ["testimonial_id"]
            isOneToOne: false
            referencedRelation: "group_testimonials"
            referencedColumns: ["id"]
          },
        ]
      }
      group_testimonials: {
        Row: {
          anonimo: boolean
          criado_em: string
          group_id: string
          humor: number
          id: string
          likes_negativos: number
          likes_positivos: number
          sintoma_id: string | null
          sintoma_texto: string | null
          texto: string
          user_id: string
        }
        Insert: {
          anonimo?: boolean
          criado_em?: string
          group_id: string
          humor: number
          id?: string
          likes_negativos?: number
          likes_positivos?: number
          sintoma_id?: string | null
          sintoma_texto?: string | null
          texto: string
          user_id: string
        }
        Update: {
          anonimo?: boolean
          criado_em?: string
          group_id?: string
          humor?: number
          id?: string
          likes_negativos?: number
          likes_positivos?: number
          sintoma_id?: string | null
          sintoma_texto?: string | null
          texto?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_testimonials_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "support_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_testimonials_sintoma_id_fkey"
            columns: ["sintoma_id"]
            isOneToOne: false
            referencedRelation: "transtornos_sintomas"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_events: {
        Row: {
          amount: number | null
          details: Json
          habit_id: string
          id: string
          kind: string
          local_date: string
          occurred_at: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          details?: Json
          habit_id: string
          id?: string
          kind: string
          local_date: string
          occurred_at?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          details?: Json
          habit_id?: string
          id?: string
          kind?: string
          local_date?: string
          occurred_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_events_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "user_habits"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_secrets: {
        Row: {
          created_at: string
          name: string
          value: string
        }
        Insert: {
          created_at?: string
          name: string
          value: string
        }
        Update: {
          created_at?: string
          name?: string
          value?: string
        }
        Relationships: []
      }
      legal_acceptances: {
        Row: {
          accepted_at: string
          document: string
          id: string
          user_agent: string | null
          user_id: string
          version: string
        }
        Insert: {
          accepted_at?: string
          document: string
          id?: string
          user_agent?: string | null
          user_id: string
          version: string
        }
        Update: {
          accepted_at?: string
          document?: string
          id?: string
          user_agent?: string | null
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      mensagens: {
        Row: {
          autor_id: string
          conteudo: string | null
          conversa_id: string
          created_at: string
          id: string
          imagem_url: string | null
          lida_em: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          autor_id: string
          conteudo?: string | null
          conversa_id: string
          created_at?: string
          id?: string
          imagem_url?: string | null
          lida_em?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          autor_id?: string
          conteudo?: string | null
          conversa_id?: string
          created_at?: string
          id?: string
          imagem_url?: string | null
          lida_em?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      mental_health_screenings: {
        Row: {
          answers: number[]
          created_at: string
          id: string
          instrument: string
          score: number
          self_harm_flag: boolean
          severity: string
          shared_with_psychologist: boolean
          user_id: string
        }
        Insert: {
          answers: number[]
          created_at?: string
          id?: string
          instrument: string
          score?: number
          self_harm_flag?: boolean
          severity?: string
          shared_with_psychologist?: boolean
          user_id: string
        }
        Update: {
          answers?: number[]
          created_at?: string
          id?: string
          instrument?: string
          score?: number
          self_harm_flag?: boolean
          severity?: string
          shared_with_psychologist?: boolean
          user_id?: string
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          body: string
          created_at: string
          fcm_response: Json | null
          id: string
          recipient_count: number | null
          title: string
          topic: string | null
          user_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          fcm_response?: Json | null
          id?: string
          recipient_count?: number | null
          title: string
          topic?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          fcm_response?: Json | null
          id?: string
          recipient_count?: number | null
          title?: string
          topic?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          appointment_id: string | null
          created_at: string | null
          id: string
          link: string | null
          message: string
          patient_id: string
          push: boolean
          push_attempts: number
          push_claimed_at: string | null
          push_sent_at: string | null
          push_text: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string | null
          id?: string
          link?: string | null
          message: string
          patient_id: string
          push?: boolean
          push_attempts?: number
          push_claimed_at?: string | null
          push_sent_at?: string | null
          push_text?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          appointment_id?: string | null
          created_at?: string | null
          id?: string
          link?: string | null
          message?: string
          patient_id?: string
          push?: boolean
          push_attempts?: number
          push_claimed_at?: string | null
          push_sent_at?: string | null
          push_text?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          access_until: string | null
          id: string
          joined_at: string
          organization_id: string
          removed_at: string | null
          removed_by: string | null
          role: string
          status: string
          user_id: string
        }
        Insert: {
          access_until?: string | null
          id?: string
          joined_at?: string
          organization_id: string
          removed_at?: string | null
          removed_by?: string | null
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          access_until?: string | null
          id?: string
          joined_at?: string
          organization_id?: string
          removed_at?: string | null
          removed_by?: string | null
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          allowed_email_domain: string | null
          billing_day: number | null
          cnpj: string | null
          contact_email: string | null
          contact_name: string | null
          created_at: string
          ends_on: string | null
          id: string
          invite_code: string
          name: string
          notes: string | null
          plan_tier: string
          price_per_seat: number | null
          seats: number
          starts_on: string
          status: string
          updated_at: string
        }
        Insert: {
          allowed_email_domain?: string | null
          billing_day?: number | null
          cnpj?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          invite_code?: string
          name: string
          notes?: string | null
          plan_tier: string
          price_per_seat?: number | null
          seats: number
          starts_on?: string
          status?: string
          updated_at?: string
        }
        Update: {
          allowed_email_domain?: string | null
          billing_day?: number | null
          cnpj?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          invite_code?: string
          name?: string
          notes?: string | null
          plan_tier?: string
          price_per_seat?: number | null
          seats?: number
          starts_on?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      participant_presence: {
        Row: {
          created_at: string
          id: string
          last_seen: string
          media_changed_at: string
          media_connected: boolean
          session_id: string
          updated_at: string
          user_id: string
          user_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen?: string
          media_changed_at?: string
          media_connected?: boolean
          session_id: string
          updated_at?: string
          user_id: string
          user_type: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen?: string
          media_changed_at?: string
          media_connected?: boolean
          session_id?: string
          updated_at?: string
          user_id?: string
          user_type?: string
        }
        Relationships: []
      }
      patient_achievements: {
        Row: {
          achieved: boolean
          achieved_at: string | null
          created_at: string
          description: string
          icon: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          achieved?: boolean
          achieved_at?: string | null
          created_at?: string
          description: string
          icon: string
          id?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          achieved?: boolean
          achieved_at?: string | null
          created_at?: string
          description?: string
          icon?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      patient_mood_logs: {
        Row: {
          created_at: string
          id: string
          logged_date: string
          mood_value: number
          patient_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          logged_date: string
          mood_value: number
          patient_id: string
        }
        Update: {
          created_at?: string
          id?: string
          logged_date?: string
          mood_value?: number
          patient_id?: string
        }
        Relationships: []
      }
      patient_progress: {
        Row: {
          anxiety_level: number | null
          created_at: string
          id: string
          mood_rating: number | null
          notes: string | null
          patient_id: string
          session_date: string
          session_duration: number | null
          stress_level: number | null
          technique_used: string | null
        }
        Insert: {
          anxiety_level?: number | null
          created_at?: string
          id?: string
          mood_rating?: number | null
          notes?: string | null
          patient_id: string
          session_date?: string
          session_duration?: number | null
          stress_level?: number | null
          technique_used?: string | null
        }
        Update: {
          anxiety_level?: number | null
          created_at?: string
          id?: string
          mood_rating?: number | null
          notes?: string | null
          patient_id?: string
          session_date?: string
          session_duration?: number | null
          stress_level?: number | null
          technique_used?: string | null
        }
        Relationships: []
      }
      patient_statistics: {
        Row: {
          created_at: string
          id: string
          last_active_date: string | null
          patient_id: string
          quarterly_activities: Json[] | null
          recent_activities: Json[] | null
          streak_days: number
          total_emergency_consultations: number
          total_guided_breathing_time: number
          total_scheduled_consultations: number
          total_therapeutic_sound_time: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_active_date?: string | null
          patient_id: string
          quarterly_activities?: Json[] | null
          recent_activities?: Json[] | null
          streak_days?: number
          total_emergency_consultations?: number
          total_guided_breathing_time?: number
          total_scheduled_consultations?: number
          total_therapeutic_sound_time?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_active_date?: string | null
          patient_id?: string
          quarterly_activities?: Json[] | null
          recent_activities?: Json[] | null
          streak_days?: number
          total_emergency_consultations?: number
          total_guided_breathing_time?: number
          total_scheduled_consultations?: number
          total_therapeutic_sound_time?: number
          updated_at?: string
        }
        Relationships: []
      }
      patient_weekly_goals: {
        Row: {
          completed: boolean | null
          created_at: string | null
          goal_id: string
          id: string
          last_progress_date: string | null
          progress: number | null
          target: number
          updated_at: string | null
          user_id: string
          week_end_date: string
          week_start_date: string
        }
        Insert: {
          completed?: boolean | null
          created_at?: string | null
          goal_id: string
          id?: string
          last_progress_date?: string | null
          progress?: number | null
          target: number
          updated_at?: string | null
          user_id: string
          week_end_date: string
          week_start_date: string
        }
        Update: {
          completed?: boolean | null
          created_at?: string | null
          goal_id?: string
          id?: string
          last_progress_date?: string | null
          progress?: number | null
          target?: number
          updated_at?: string | null
          user_id?: string
          week_end_date?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_weekly_goals_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "weekly_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          blocked_at: string | null
          blocked_reason: string | null
          blocked_until: string | null
          city: string
          cpf: string
          created_at: string | null
          daily_mood_count: number | null
          daily_mood_enabled: boolean
          daily_mood_sum: number | null
          email: string
          full_name: string
          id: string
          is_blocked: boolean
          last_mood_date: string | null
          last_mood_value: number | null
          phone: string | null
          show_goal_modal: boolean | null
          show_weekly_goal_modal: boolean | null
          sintomas_selecionados: string[] | null
          state: string
          updated_at: string | null
          user_id: string | null
          weekly_goals: string[] | null
        }
        Insert: {
          blocked_at?: string | null
          blocked_reason?: string | null
          blocked_until?: string | null
          city: string
          cpf: string
          created_at?: string | null
          daily_mood_count?: number | null
          daily_mood_enabled?: boolean
          daily_mood_sum?: number | null
          email: string
          full_name: string
          id?: string
          is_blocked?: boolean
          last_mood_date?: string | null
          last_mood_value?: number | null
          phone?: string | null
          show_goal_modal?: boolean | null
          show_weekly_goal_modal?: boolean | null
          sintomas_selecionados?: string[] | null
          state: string
          updated_at?: string | null
          user_id?: string | null
          weekly_goals?: string[] | null
        }
        Update: {
          blocked_at?: string | null
          blocked_reason?: string | null
          blocked_until?: string | null
          city?: string
          cpf?: string
          created_at?: string | null
          daily_mood_count?: number | null
          daily_mood_enabled?: boolean
          daily_mood_sum?: number | null
          email?: string
          full_name?: string
          id?: string
          is_blocked?: boolean
          last_mood_date?: string | null
          last_mood_value?: number | null
          phone?: string | null
          show_goal_modal?: boolean | null
          show_weekly_goal_modal?: boolean | null
          sintomas_selecionados?: string[] | null
          state?: string
          updated_at?: string | null
          user_id?: string | null
          weekly_goals?: string[] | null
        }
        Relationships: []
      }
      payment_logs: {
        Row: {
          action: string
          admin_id: string
          amount_paid: number | null
          created_at: string | null
          details: Json | null
          emergency_count: number | null
          id: string
          psychologist_id: string
          scheduled_count: number | null
        }
        Insert: {
          action: string
          admin_id: string
          amount_paid?: number | null
          created_at?: string | null
          details?: Json | null
          emergency_count?: number | null
          id?: string
          psychologist_id: string
          scheduled_count?: number | null
        }
        Update: {
          action?: string
          admin_id?: string
          amount_paid?: number | null
          created_at?: string | null
          details?: Json | null
          emergency_count?: number | null
          id?: string
          psychologist_id?: string
          scheduled_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_logs_psychologist_id_fkey"
            columns: ["psychologist_id"]
            isOneToOne: false
            referencedRelation: "psychologists"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_items: {
        Row: {
          amount: number
          backfilled: boolean
          counted_at: string
          occurred_at: string
          paid_at: string | null
          payment_log_id: string | null
          psychologist_user_id: string
          source_id: string
          source_type: string
        }
        Insert: {
          amount: number
          backfilled?: boolean
          counted_at?: string
          occurred_at: string
          paid_at?: string | null
          payment_log_id?: string | null
          psychologist_user_id: string
          source_id: string
          source_type: string
        }
        Update: {
          amount?: number
          backfilled?: boolean
          counted_at?: string
          occurred_at?: string
          paid_at?: string | null
          payment_log_id?: string | null
          psychologist_user_id?: string
          source_id?: string
          source_type?: string
        }
        Relationships: []
      }
      private_journals: {
        Row: {
          atualizado_em: string
          criado_em: string
          humor: number
          id: string
          texto: string
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          humor: number
          id?: string
          texto: string
          user_id: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          humor?: number
          id?: string
          texto?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cpf: string | null
          created_at: string
          crp: string | null
          full_name: string
          id: string
          registration_status: string | null
          specialty: string | null
          updated_at: string
          user_id: string
          user_type: Database["public"]["Enums"]["user_type"]
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          crp?: string | null
          full_name: string
          id?: string
          registration_status?: string | null
          specialty?: string | null
          updated_at?: string
          user_id: string
          user_type: Database["public"]["Enums"]["user_type"]
        }
        Update: {
          cpf?: string | null
          created_at?: string
          crp?: string | null
          full_name?: string
          id?: string
          registration_status?: string | null
          specialty?: string | null
          updated_at?: string
          user_id?: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Relationships: []
      }
      psychologist_availability: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_available: boolean
          psychologist_id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_available?: boolean
          psychologist_id: string
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_available?: boolean
          psychologist_id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      psychologist_availability_overrides: {
        Row: {
          created_at: string
          date: string
          end_time: string
          id: string
          psychologist_id: string
          start_time: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          end_time: string
          id?: string
          psychologist_id: string
          start_time: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          end_time?: string
          id?: string
          psychologist_id?: string
          start_time?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      psychologist_booking_rules: {
        Row: {
          buffer_minutes: number
          max_advance_days: number
          min_notice_hours: number
          psychologist_id: string
          updated_at: string
        }
        Insert: {
          buffer_minutes?: number
          max_advance_days?: number
          min_notice_hours?: number
          psychologist_id: string
          updated_at?: string
        }
        Update: {
          buffer_minutes?: number
          max_advance_days?: number
          min_notice_hours?: number
          psychologist_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      psychologist_payments: {
        Row: {
          cpf: string | null
          created_at: string | null
          crp: string | null
          email: string
          emergency_paid_count: number | null
          emergency_pending_count: number | null
          id: string
          name: string
          pix_key: string | null
          pix_type: string | null
          psychologist_id: string
          scheduled_paid_count: number | null
          scheduled_pending_count: number | null
          total_paid_amount: number | null
          total_pending_amount: number | null
          updated_at: string | null
        }
        Insert: {
          cpf?: string | null
          created_at?: string | null
          crp?: string | null
          email: string
          emergency_paid_count?: number | null
          emergency_pending_count?: number | null
          id?: string
          name: string
          pix_key?: string | null
          pix_type?: string | null
          psychologist_id: string
          scheduled_paid_count?: number | null
          scheduled_pending_count?: number | null
          total_paid_amount?: number | null
          total_pending_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          cpf?: string | null
          created_at?: string | null
          crp?: string | null
          email?: string
          emergency_paid_count?: number | null
          emergency_pending_count?: number | null
          id?: string
          name?: string
          pix_key?: string | null
          pix_type?: string | null
          psychologist_id?: string
          scheduled_paid_count?: number | null
          scheduled_pending_count?: number | null
          total_paid_amount?: number | null
          total_pending_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "psychologist_payments_psychologist_id_fkey"
            columns: ["psychologist_id"]
            isOneToOne: true
            referencedRelation: "psychologists"
            referencedColumns: ["id"]
          },
        ]
      }
      psychologist_presence: {
        Row: {
          created_at: string
          current_emergency_id: string | null
          emergency_accepted_count: number
          emergency_rejected_count: number
          last_online: string | null
          psychologist_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_emergency_id?: string | null
          emergency_accepted_count?: number
          emergency_rejected_count?: number
          last_online?: string | null
          psychologist_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_emergency_id?: string | null
          emergency_accepted_count?: number
          emergency_rejected_count?: number
          last_online?: string | null
          psychologist_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "psychologist_presence_current_emergency_id_fkey"
            columns: ["current_emergency_id"]
            isOneToOne: false
            referencedRelation: "emergency_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "psychologist_presence_psychologist_id_fkey"
            columns: ["psychologist_id"]
            isOneToOne: true
            referencedRelation: "psychologists"
            referencedColumns: ["user_id"]
          },
        ]
      }
      psychologist_registrations: {
        Row: {
          created_at: string
          id: string
          rejected_at: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["registration_status"]
          submitted_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["registration_status"]
          submitted_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["registration_status"]
          submitted_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      psychologist_vacations: {
        Row: {
          created_at: string
          end_date: string
          id: string
          psychologist_id: string
          start_date: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          psychologist_id: string
          start_date: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          psychologist_id?: string
          start_date?: string
        }
        Relationships: []
      }
      psychologists: {
        Row: {
          address: string | null
          approval_status: string | null
          approved: boolean | null
          area_atendimento: string | null
          average_rating: number | null
          bio: string | null
          blocked_at: string | null
          blocked_reason: string | null
          blocked_until: string | null
          city: string | null
          cpf: string | null
          created_at: string | null
          crp_number: string
          crp_situacao: string | null
          crp_status: string | null
          crp_verified_at: string | null
          crp_verified_by: string | null
          document_url: string | null
          documents: string[] | null
          email: string
          full_name: string
          id: string
          is_blocked: boolean
          pix_key: string | null
          pix_type: string | null
          ratings_count: number | null
          rejected_at: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          specialization: string | null
          state: string | null
          submitted_at: string | null
          total_appointments: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          approval_status?: string | null
          approved?: boolean | null
          area_atendimento?: string | null
          average_rating?: number | null
          bio?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          blocked_until?: string | null
          city?: string | null
          cpf?: string | null
          created_at?: string | null
          crp_number: string
          crp_situacao?: string | null
          crp_status?: string | null
          crp_verified_at?: string | null
          crp_verified_by?: string | null
          document_url?: string | null
          documents?: string[] | null
          email: string
          full_name: string
          id?: string
          is_blocked?: boolean
          pix_key?: string | null
          pix_type?: string | null
          ratings_count?: number | null
          rejected_at?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          specialization?: string | null
          state?: string | null
          submitted_at?: string | null
          total_appointments?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          approval_status?: string | null
          approved?: boolean | null
          area_atendimento?: string | null
          average_rating?: number | null
          bio?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          blocked_until?: string | null
          city?: string | null
          cpf?: string | null
          created_at?: string | null
          crp_number?: string
          crp_situacao?: string | null
          crp_status?: string | null
          crp_verified_at?: string | null
          crp_verified_by?: string | null
          document_url?: string | null
          documents?: string[] | null
          email?: string
          full_name?: string
          id?: string
          is_blocked?: boolean
          pix_key?: string | null
          pix_type?: string | null
          ratings_count?: number | null
          rejected_at?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          specialization?: string | null
          state?: string | null
          submitted_at?: string | null
          total_appointments?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      safety_plan_suggestions: {
        Row: {
          coping_strategies: string[]
          created_at: string
          decided_at: string | null
          delivered_at: string | null
          distractions: string[]
          id: string
          patient_id: string
          psychologist_id: string | null
          psychologist_name: string
          reasons_to_live: string[]
          safe_environment: string[]
          saved_plan_id: string | null
          source_id: string
          source_type: string
          status: string
          title: string
          updated_at: string
          warning_signs: string[]
        }
        Insert: {
          coping_strategies?: string[]
          created_at?: string
          decided_at?: string | null
          delivered_at?: string | null
          distractions?: string[]
          id?: string
          patient_id: string
          psychologist_id?: string | null
          psychologist_name: string
          reasons_to_live?: string[]
          safe_environment?: string[]
          saved_plan_id?: string | null
          source_id: string
          source_type: string
          status?: string
          title: string
          updated_at?: string
          warning_signs?: string[]
        }
        Update: {
          coping_strategies?: string[]
          created_at?: string
          decided_at?: string | null
          delivered_at?: string | null
          distractions?: string[]
          id?: string
          patient_id?: string
          psychologist_id?: string | null
          psychologist_name?: string
          reasons_to_live?: string[]
          safe_environment?: string[]
          saved_plan_id?: string | null
          source_id?: string
          source_type?: string
          status?: string
          title?: string
          updated_at?: string
          warning_signs?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "safety_plan_suggestions_saved_plan_id_fkey"
            columns: ["saved_plan_id"]
            isOneToOne: false
            referencedRelation: "safety_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_plans: {
        Row: {
          coping_strategies: string[]
          created_at: string
          distractions: string[]
          id: string
          patient_edited_at: string | null
          patient_id: string
          reasons_to_live: string[]
          recommended_by: string | null
          safe_environment: string[]
          source_suggestion_id: string | null
          title: string
          updated_at: string
          warning_signs: string[]
        }
        Insert: {
          coping_strategies?: string[]
          created_at?: string
          distractions?: string[]
          id?: string
          patient_edited_at?: string | null
          patient_id: string
          reasons_to_live?: string[]
          recommended_by?: string | null
          safe_environment?: string[]
          source_suggestion_id?: string | null
          title?: string
          updated_at?: string
          warning_signs?: string[]
        }
        Update: {
          coping_strategies?: string[]
          created_at?: string
          distractions?: string[]
          id?: string
          patient_edited_at?: string | null
          patient_id?: string
          reasons_to_live?: string[]
          recommended_by?: string | null
          safe_environment?: string[]
          source_suggestion_id?: string | null
          title?: string
          updated_at?: string
          warning_signs?: string[]
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      session_feedback: {
        Row: {
          appointment_id: string | null
          clinical_notes: string | null
          comment: string | null
          complaint_categories: string[]
          complaint_description: string | null
          created_at: string | null
          emergency_request_id: string | null
          felt_heard: string | null
          has_complaint: boolean
          id: string
          problem_resolved: string | null
          psychologist_id: string | null
          rating: number
          requires_admin_review: boolean
          resolution_status: string | null
          session_id: string
          symptoms: string[]
          updated_at: string | null
          user_id: string
          user_type: string
        }
        Insert: {
          appointment_id?: string | null
          clinical_notes?: string | null
          comment?: string | null
          complaint_categories?: string[]
          complaint_description?: string | null
          created_at?: string | null
          emergency_request_id?: string | null
          felt_heard?: string | null
          has_complaint?: boolean
          id?: string
          problem_resolved?: string | null
          psychologist_id?: string | null
          rating: number
          requires_admin_review?: boolean
          resolution_status?: string | null
          session_id: string
          symptoms?: string[]
          updated_at?: string | null
          user_id: string
          user_type: string
        }
        Update: {
          appointment_id?: string | null
          clinical_notes?: string | null
          comment?: string | null
          complaint_categories?: string[]
          complaint_description?: string | null
          created_at?: string | null
          emergency_request_id?: string | null
          felt_heard?: string | null
          has_complaint?: boolean
          id?: string
          problem_resolved?: string | null
          psychologist_id?: string | null
          rating?: number
          requires_admin_review?: boolean
          resolution_status?: string | null
          session_id?: string
          symptoms?: string[]
          updated_at?: string | null
          user_id?: string
          user_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_feedback_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      sos_chat_state: {
        Row: {
          away_nudged_at: string | null
          first_reply_at: string | null
          last_patient_message_at: string | null
          last_psychologist_message_at: string | null
          patient_id: string
          patient_messages: number
          patient_nudged_for: string | null
          patient_read_at: string | null
          patient_seen_at: string | null
          psychologist_id: string | null
          psychologist_read_at: string | null
          psychologist_replies: number
          psychologist_seen_at: string | null
          request_id: string
          updated_at: string
          wait_nudged_for: string | null
        }
        Insert: {
          away_nudged_at?: string | null
          first_reply_at?: string | null
          last_patient_message_at?: string | null
          last_psychologist_message_at?: string | null
          patient_id: string
          patient_messages?: number
          patient_nudged_for?: string | null
          patient_read_at?: string | null
          patient_seen_at?: string | null
          psychologist_id?: string | null
          psychologist_read_at?: string | null
          psychologist_replies?: number
          psychologist_seen_at?: string | null
          request_id: string
          updated_at?: string
          wait_nudged_for?: string | null
        }
        Update: {
          away_nudged_at?: string | null
          first_reply_at?: string | null
          last_patient_message_at?: string | null
          last_psychologist_message_at?: string | null
          patient_id?: string
          patient_messages?: number
          patient_nudged_for?: string | null
          patient_read_at?: string | null
          patient_seen_at?: string | null
          psychologist_id?: string | null
          psychologist_read_at?: string | null
          psychologist_replies?: number
          psychologist_seen_at?: string | null
          request_id?: string
          updated_at?: string
          wait_nudged_for?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sos_chat_state_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "emergency_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      sos_followups_sent: {
        Row: {
          request_id: string
          sent_at: string
        }
        Insert: {
          request_id: string
          sent_at?: string
        }
        Update: {
          request_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sos_followups_sent_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "emergency_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      sos_messages: {
        Row: {
          body: string
          client_id: string
          created_at: string
          id: string
          request_id: string
          sender_id: string | null
          sender_type: string
        }
        Insert: {
          body: string
          client_id: string
          created_at?: string
          id?: string
          request_id: string
          sender_id?: string | null
          sender_type: string
        }
        Update: {
          body?: string
          client_id?: string
          created_at?: string
          id?: string
          request_id?: string
          sender_id?: string | null
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sos_messages_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "emergency_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      sos_trace_events: {
        Row: {
          actor_type: string
          actor_user_id: string | null
          created_at: string
          emergency_request_id: string | null
          event_type: string
          id: string
          message: string | null
          metadata: Json
          session_id: string | null
          trace_id: string
        }
        Insert: {
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          emergency_request_id?: string | null
          event_type: string
          id?: string
          message?: string | null
          metadata?: Json
          session_id?: string | null
          trace_id: string
        }
        Update: {
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          emergency_request_id?: string | null
          event_type?: string
          id?: string
          message?: string | null
          metadata?: Json
          session_id?: string | null
          trace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sos_trace_events_emergency_request_id_fkey"
            columns: ["emergency_request_id"]
            isOneToOne: false
            referencedRelation: "emergency_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sos_trace_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "webrtc_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_customer_state: {
        Row: {
          state: Json
          stripe_customer_id: string | null
          synced_at: string
          user_id: string
        }
        Insert: {
          state: Json
          stripe_customer_id?: string | null
          synced_at?: string
          user_id: string
        }
        Update: {
          state?: Json
          stripe_customer_id?: string | null
          synced_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscribers: {
        Row: {
          appointments_last_used: string | null
          appointments_used_this_month: boolean
          cancel_at_period_end: boolean
          created_at: string
          current_usage: Json | null
          email: string
          entitlement_source: string | null
          id: string
          organization_id: string | null
          plan_limits: Json | null
          sos_last_used: string | null
          sos_used_this_month: boolean
          stripe_customer_id: string | null
          subscribed: boolean
          subscription_end: string | null
          subscription_tier: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          appointments_last_used?: string | null
          appointments_used_this_month?: boolean
          cancel_at_period_end?: boolean
          created_at?: string
          current_usage?: Json | null
          email: string
          entitlement_source?: string | null
          id?: string
          organization_id?: string | null
          plan_limits?: Json | null
          sos_last_used?: string | null
          sos_used_this_month?: boolean
          stripe_customer_id?: string | null
          subscribed?: boolean
          subscription_end?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          appointments_last_used?: string | null
          appointments_used_this_month?: boolean
          cancel_at_period_end?: boolean
          created_at?: string
          current_usage?: Json | null
          email?: string
          entitlement_source?: string | null
          id?: string
          organization_id?: string | null
          plan_limits?: Json | null
          sos_last_used?: string | null
          sos_used_this_month?: boolean
          stripe_customer_id?: string | null
          subscribed?: boolean
          subscription_end?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscribers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      suporte_psicologo: {
        Row: {
          created_at: string | null
          descricao: string
          email_retorno: string
          id: string
          psicologo_id: string | null
          telefone_retorno: string | null
        }
        Insert: {
          created_at?: string | null
          descricao: string
          email_retorno: string
          id?: string
          psicologo_id?: string | null
          telefone_retorno?: string | null
        }
        Update: {
          created_at?: string | null
          descricao?: string
          email_retorno?: string
          id?: string
          psicologo_id?: string | null
          telefone_retorno?: string | null
        }
        Relationships: []
      }
      support_groups: {
        Row: {
          criado_em: string
          descricao: string
          id: string
          nome: string
        }
        Insert: {
          criado_em?: string
          descricao: string
          id?: string
          nome: string
        }
        Update: {
          criado_em?: string
          descricao?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          created_at: string | null
          description: string
          email: string
          id: string
          phone: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          email: string
          id?: string
          phone?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          email?: string
          id?: string
          phone?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      testimonial_bans: {
        Row: {
          blocked_by: string | null
          blocked_until: string | null
          created_at: string
          reason: string | null
          user_id: string
        }
        Insert: {
          blocked_by?: string | null
          blocked_until?: string | null
          created_at?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          blocked_by?: string | null
          blocked_until?: string | null
          created_at?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      transtornos_sintomas: {
        Row: {
          created_at: string
          id: string
          sintomas: string[]
          transtorno: string
        }
        Insert: {
          created_at?: string
          id?: string
          sintomas: string[]
          transtorno: string
        }
        Update: {
          created_at?: string
          id?: string
          sintomas?: string[]
          transtorno?: string
        }
        Relationships: []
      }
      user_habits: {
        Row: {
          archived_at: string | null
          best_streak_seconds: number
          created_at: string
          daily_goal: number | null
          id: string
          kind: string
          last_reminder_at: string | null
          quit_started_at: string | null
          reminder_end: string
          reminder_interval_minutes: number | null
          reminder_start: string
          reminders_enabled: boolean
          settings: Json
          timezone: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          best_streak_seconds?: number
          created_at?: string
          daily_goal?: number | null
          id?: string
          kind: string
          last_reminder_at?: string | null
          quit_started_at?: string | null
          reminder_end?: string
          reminder_interval_minutes?: number | null
          reminder_start?: string
          reminders_enabled?: boolean
          settings?: Json
          timezone?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          best_streak_seconds?: number
          created_at?: string
          daily_goal?: number | null
          id?: string
          kind?: string
          last_reminder_at?: string | null
          quit_started_at?: string | null
          reminder_end?: string
          reminder_interval_minutes?: number | null
          reminder_start?: string
          reminders_enabled?: boolean
          settings?: Json
          timezone?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          background_blur: boolean | null
          camera_device_id: string | null
          id: string
          mic_device_id: string | null
          speaker_device_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          background_blur?: boolean | null
          camera_device_id?: string | null
          id?: string
          mic_device_id?: string | null
          speaker_device_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          background_blur?: boolean | null
          camera_device_id?: string | null
          id?: string
          mic_device_id?: string | null
          speaker_device_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webrtc_sessions: {
        Row: {
          answer: Json | null
          connected_at: string | null
          created_at: string
          emergency_request_id: string | null
          end_reason: string | null
          ended_at: string | null
          ended_by: string | null
          ended_by_type: string | null
          expires_at: string | null
          ice_candidates: Json[] | null
          id: string
          media_seconds: number
          media_tick_at: string | null
          media_tracked: boolean
          offer: Json | null
          patient_camera_off: boolean | null
          patient_id: string | null
          patient_media_at: string | null
          patient_muted: boolean | null
          psychologist_camera_off: boolean | null
          psychologist_id: string | null
          psychologist_media_at: string | null
          psychologist_muted: boolean | null
          renegotiate_requested_at: string | null
          status: string | null
          time_left_seconds: number | null
          timer_paused: boolean
          timer_updated_at: string | null
          updated_at: string
        }
        Insert: {
          answer?: Json | null
          connected_at?: string | null
          created_at?: string
          emergency_request_id?: string | null
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          ended_by_type?: string | null
          expires_at?: string | null
          ice_candidates?: Json[] | null
          id?: string
          media_seconds?: number
          media_tick_at?: string | null
          media_tracked?: boolean
          offer?: Json | null
          patient_camera_off?: boolean | null
          patient_id?: string | null
          patient_media_at?: string | null
          patient_muted?: boolean | null
          psychologist_camera_off?: boolean | null
          psychologist_id?: string | null
          psychologist_media_at?: string | null
          psychologist_muted?: boolean | null
          renegotiate_requested_at?: string | null
          status?: string | null
          time_left_seconds?: number | null
          timer_paused?: boolean
          timer_updated_at?: string | null
          updated_at?: string
        }
        Update: {
          answer?: Json | null
          connected_at?: string | null
          created_at?: string
          emergency_request_id?: string | null
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          ended_by_type?: string | null
          expires_at?: string | null
          ice_candidates?: Json[] | null
          id?: string
          media_seconds?: number
          media_tick_at?: string | null
          media_tracked?: boolean
          offer?: Json | null
          patient_camera_off?: boolean | null
          patient_id?: string | null
          patient_media_at?: string | null
          patient_muted?: boolean | null
          psychologist_camera_off?: boolean | null
          psychologist_id?: string | null
          psychologist_media_at?: string | null
          psychologist_muted?: boolean | null
          renegotiate_requested_at?: string | null
          status?: string | null
          time_left_seconds?: number | null
          timer_paused?: boolean
          timer_updated_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webrtc_sessions_emergency_request_id_fkey"
            columns: ["emergency_request_id"]
            isOneToOne: false
            referencedRelation: "emergency_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_goals: {
        Row: {
          active: boolean | null
          category: string
          created_at: string | null
          description: string
          id: string
          target: number
          title: string
          type: string
        }
        Insert: {
          active?: boolean | null
          category: string
          created_at?: string | null
          description: string
          id?: string
          target?: number
          title: string
          type: string
        }
        Update: {
          active?: boolean | null
          category?: string
          created_at?: string | null
          description?: string
          id?: string
          target?: number
          title?: string
          type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      abrir_conversa: { Args: { p_psicologo_id: string }; Returns: string }
      accept_safety_plan_suggestion: {
        Args: {
          p_coping_strategies?: string[]
          p_distractions?: string[]
          p_reasons_to_live?: string[]
          p_replace_plan_id?: string
          p_safe_environment?: string[]
          p_suggestion_id: string
          p_title?: string
          p_warning_signs?: string[]
        }
        Returns: string
      }
      access_logs_filtered: {
        Args: {
          p_event: string
          p_from: string
          p_search: string
          p_to: string
        }
        Returns: {
          created_at: string
          email: string | null
          event: string
          id: number
          ip_address: unknown
          user_agent: string | null
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "access_logs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      account_block_status: {
        Args: { p_email: string; p_password: string }
        Returns: Json
      }
      add_patient_activity: {
        Args: {
          p_activity_date?: string
          p_activity_name: string
          p_patient_id: string
        }
        Returns: undefined
      }
      add_patient_activity_unchecked: {
        Args: {
          p_activity_date?: string
          p_activity_name: string
          p_patient_id: string
        }
        Returns: undefined
      }
      add_quarterly_activity: {
        Args: {
          p_activity_date?: string
          p_activity_name: string
          p_patient_id: string
        }
        Returns: undefined
      }
      add_quarterly_activity_unchecked: {
        Args: {
          p_activity_date?: string
          p_activity_name: string
          p_patient_id: string
        }
        Returns: undefined
      }
      admin_add_organization_manager: {
        Args: { p_email: string; p_org: string }
        Returns: Json
      }
      admin_archive_conversa: {
        Args: { p_conversa_id: string }
        Returns: undefined
      }
      admin_block_testimonials: {
        Args: {
          p_amount?: number
          p_reason?: string
          p_unit: string
          p_user_id: string
        }
        Returns: Json
      }
      admin_delete_testimonial: {
        Args: { p_testimonial_id: string }
        Returns: undefined
      }
      admin_dismiss_testimonial_reports: {
        Args: { p_testimonial_id: string }
        Returns: undefined
      }
      admin_export_access_logs: {
        Args: {
          p_event?: string
          p_from?: string
          p_reason: string
          p_search?: string
          p_to?: string
        }
        Returns: {
          created_at: string
          email: string
          event: string
          id: number
          ip_address: string
          user_agent: string
          user_id: string
          user_name: string
        }[]
      }
      admin_get_access_logs: {
        Args: {
          p_event?: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_to?: string
        }
        Returns: {
          created_at: string
          email: string
          event: string
          id: number
          ip_address: string
          total_count: number
          user_agent: string
          user_id: string
          user_name: string
        }[]
      }
      admin_list_organization_members: {
        Args: { p_org: string }
        Returns: {
          access_until: string
          email: string
          full_name: string
          joined_at: string
          member_id: string
          role: string
          status: string
          user_id: string
        }[]
      }
      admin_mfa_required: { Args: never; Returns: boolean }
      admin_revoke_user_sessions: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      admin_unblock_testimonials: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      admin_update_testimonial: {
        Args: { p_testimonial_id: string; p_texto: string }
        Returns: undefined
      }
      append_webrtc_ice_candidates: {
        Args: { p_candidates: Json; p_session_id: string }
        Returns: undefined
      }
      appointment_call_connected: {
        Args: { p_video_room_id: string }
        Returns: boolean
      }
      archive_patient_care_records: {
        Args: { p_patient_id: string }
        Returns: number
      }
      archive_psychologist_payouts: {
        Args: { p_psychologist_id: string }
        Returns: string
      }
      assert_caller_is: { Args: { p_user_id: string }; Returns: undefined }
      call_clock: { Args: { p_session_id: string }; Returns: Json }
      call_time_limit_seconds: {
        Args: { p_session_id: string }
        Returns: number
      }
      can_use_sos: {
        Args: { p_user_id: string }
        Returns: {
          can_use: boolean
          plan_type: string
          reason: string
        }[]
      }
      cancel_appointment: {
        Args: { p_appointment_id: string; p_reason?: string }
        Returns: Json
      }
      cancel_appointments_after_plan_loss:
        | { Args: { p_user_id: string }; Returns: number }
        | { Args: { p_reason: string; p_user_id: string }; Returns: number }
      check_organization_code: { Args: { p_code: string }; Returns: Json }
      check_rate_limit: {
        Args: {
          p_key: string
          p_max_requests: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      claim_due_habit_reminders: {
        Args: never
        Returns: {
          daily_goal: number
          due_slot: string
          habit_id: string
          kind: string
          quit_started_at: string
          settings: Json
          title: string
          today_total: number
          user_id: string
        }[]
      }
      claim_pending_pushes: {
        Args: never
        Returns: {
          id: string
          link: string
          message: string
          title: string
          user_id: string
        }[]
      }
      clean_safety_plan_items: {
        Args: { p_items: string[] }
        Returns: string[]
      }
      cleanup_quarterly_activities: { Args: never; Returns: undefined }
      confirm_psychologist_payout: {
        Args: {
          p_admin_email: string
          p_admin_id: string
          p_expected_amount: number
          p_pix_e2e_id: string
          p_psychologist_id: string
          p_receipt_path: string
        }
        Returns: Json
      }
      consume_extra_credit: {
        Args: {
          p_appointment_id?: string
          p_emergency_request_id?: string
          p_kind: string
          p_user_id: string
        }
        Returns: string
      }
      count_available_psychologists: { Args: never; Returns: number }
      create_psychologist_profile: {
        Args: {
          p_address?: string
          p_area_atendimento?: string
          p_bio: string
          p_city: string
          p_cpf?: string
          p_crp_number: string
          p_document_url?: string
          p_email: string
          p_full_name: string
          p_specialization: string
          p_state: string
          p_user_id: string
        }
        Returns: Json
      }
      create_psychologist_profile_unchecked: {
        Args: {
          p_address?: string
          p_area_atendimento?: string
          p_bio: string
          p_city: string
          p_cpf?: string
          p_crp_number: string
          p_document_url?: string
          p_email: string
          p_full_name: string
          p_specialization: string
          p_state: string
          p_user_id: string
        }
        Returns: Json
      }
      current_user_has_paid_plan: { Args: never; Returns: boolean }
      deliver_post_crisis_plan: {
        Args: { p_suggestion_id: string }
        Returns: undefined
      }
      deliver_stale_post_crisis_plans: { Args: never; Returns: number }
      detach_psychologist_from_appointments: {
        Args: { p_user_id: string }
        Returns: number
      }
      dismiss_safety_plan_suggestion: {
        Args: { p_suggestion_id: string }
        Returns: undefined
      }
      ensure_week_goals: { Args: { p_local_date: string }; Returns: string }
      expire_cancelled_subscriptions: { Args: never; Returns: number }
      expire_organization_entitlements: { Args: never; Returns: number }
      finalize_stale_appointments: { Args: never; Returns: number }
      finalize_stale_emergency_sessions: {
        Args: never
        Returns: {
          abandoned_count: number
          expired_count: number
          timed_out_count: number
        }[]
      }
      finish_pushes: {
        Args: { p_failed: string[]; p_sent: string[] }
        Returns: undefined
      }
      format_br_datetime: { Args: { p_at: string }; Returns: string }
      gerenciar_expiracao_conversas: { Args: never; Returns: undefined }
      get_admin_audit_log: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          action: string
          admin_id: string
          admin_name: string
          created_at: string
          details: Json
          id: string
          target_id: string
          target_name: string
          target_type: string
        }[]
      }
      get_admin_conversas_overview: {
        Args: never
        Returns: {
          conversa_id: string
          created_at: string
          last_message_at: string
          last_message_tipo: string
          mensagens_count: number
          paciente_nome: string
          psicologo_nome: string
          status: string
          updated_at: string
        }[]
      }
      get_admin_group_testimonials: {
        Args: never
        Returns: {
          anonimo: boolean
          autor_bloqueado: boolean
          autor_bloqueado_ate: string
          autor_email: string
          autor_nome: string
          autor_user_id: string
          criado_em: string
          flagged: boolean
          group_id: string
          group_nome: string
          humor: number
          likes_negativos: number
          likes_positivos: number
          pending_reports: number
          report_reasons: string[]
          testimonial_id: string
          texto: string
        }[]
      }
      get_admin_metrics: {
        Args: never
        Returns: {
          active_psychologists: number
          active_subscribers: number
          appointments_last_30_days: number
          pending_psychologists: number
          sos_requests_last_30_days: number
          total_patients: number
        }[]
      }
      get_chat_usage_metrics: { Args: { p_days?: number }; Returns: Json }
      get_group_testimonials: {
        Args: { p_group_id: string; p_only_mine?: boolean }
        Returns: {
          anonimo: boolean
          autor_nome: string
          criado_em: string
          group_id: string
          humor: number
          id: string
          is_mine: boolean
          likes_negativos: number
          likes_positivos: number
          reported_by_me: boolean
          sintoma_id: string
          sintoma_texto: string
          texto: string
          under_review: boolean
          user_like: string
        }[]
      }
      get_login_state: { Args: never; Returns: Json }
      get_my_psychologist_private: {
        Args: never
        Returns: {
          cpf: string
          email: string
          pix_key: string
          pix_type: string
        }[]
      }
      get_my_testimonial_block: { Args: never; Returns: Json }
      get_or_create_appointment_webrtc_session: {
        Args: { p_appointment_id: string }
        Returns: string
      }
      get_organization_dashboard: { Args: { p_org: string }; Returns: Json }
      get_patient_statistics_unchecked: {
        Args: { patient_user_id: string }
        Returns: {
          average_rating: number
          consultation_count: number
          sos_count: number
        }[]
      }
      get_post_crisis_plan: {
        Args: { p_source_id: string; p_source_type: string }
        Returns: {
          coping_strategies: string[]
          delivered: boolean
          distractions: string[]
          editable: boolean
          id: string
          reasons_to_live: string[]
          safe_environment: string[]
          title: string
          updated_at: string
          warning_signs: string[]
        }[]
      }
      get_psychologist_busy_times: {
        Args: { p_from: string; p_psychologist_id: string; p_to: string }
        Returns: {
          duration_minutes: number
          starts_at: string
        }[]
      }
      get_psychologist_rejection_status: {
        Args: { p_user_id: string }
        Returns: {
          is_rejected: boolean
          rejected_at: string
          rejection_reason: string
          should_cleanup: boolean
          should_show_rejection_message: boolean
        }[]
      }
      get_psychologist_rejection_status_unchecked: {
        Args: { p_user_id: string }
        Returns: {
          is_rejected: boolean
          rejected_at: string
          rejection_reason: string
          should_cleanup: boolean
          should_show_rejection_message: boolean
        }[]
      }
      get_psychologists_public_stats: {
        Args: { p_user_ids: string[] }
        Returns: {
          average_rating: number
          consultation_count: number
          ratings_count: number
          sos_count: number
          user_id: string
        }[]
      }
      get_routines_health: {
        Args: never
        Returns: {
          active: boolean
          failures_24h: number
          jobname: string
          last_error: string
          last_start: string
          last_status: string
          schedule: string
        }[]
      }
      get_sos_metrics: { Args: { p_days?: number }; Returns: Json }
      get_sos_patient_context: { Args: { p_request_id: string }; Returns: Json }
      get_sos_safety_plan: { Args: { p_request_id: string }; Returns: Json }
      get_user_type: { Args: { user_id_param: string }; Returns: string }
      grant_extra_credit: {
        Args: {
          p_amount_cents: number
          p_kind: string
          p_payment_intent: string
          p_price_tier: string
          p_user_id: string
        }
        Returns: string
      }
      handle_psychologist_approval: {
        Args: { admin_id: string; psychologist_id: string }
        Returns: undefined
      }
      handle_psychologist_rejection: {
        Args: {
          admin_id: string
          psychologist_id: string
          rejection_reason?: string
        }
        Returns: undefined
      }
      has_paid_plan: { Args: { p_user_id: string }; Returns: boolean }
      increment_emergency_accepted: {
        Args: { p_psychologist_id: string }
        Returns: undefined
      }
      increment_emergency_accepted_unchecked: {
        Args: { p_psychologist_id: string }
        Returns: undefined
      }
      increment_emergency_rejected: {
        Args: { p_psychologist_id: string }
        Returns: undefined
      }
      increment_emergency_rejected_unchecked: {
        Args: { p_psychologist_id: string }
        Returns: undefined
      }
      initialize_patient_achievements: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      initialize_patient_achievements_unchecked: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      internal_cron_secret: { Args: never; Returns: string }
      is_organization_manager: { Args: { p_org: string }; Returns: boolean }
      is_sos_participant: { Args: { p_request_id: string }; Returns: boolean }
      is_super_admin: { Args: { user_id_param?: string }; Returns: boolean }
      is_valid_timezone: { Args: { p_tz: string }; Returns: boolean }
      join_organization: { Args: { p_code: string }; Returns: Json }
      join_organization_for_user: {
        Args: { p_code: string; p_user_id: string }
        Returns: Json
      }
      leave_organization: { Args: never; Returns: undefined }
      list_open_emergency_requests: { Args: never; Returns: Json }
      listar_conversas: {
        Args: never
        Returns: {
          created_at: string
          data_inicio: string
          id: string
          nao_lidas: number
          outro_nome: string
          paciente_id: string
          psicologo_id: string
          status: string
          ultima_autor_id: string
          ultima_conteudo: string
          ultima_em: string
          ultima_tipo: string
          updated_at: string
        }[]
      }
      log_mood: {
        Args: { p_local_date: string; p_value: number }
        Returns: Json
      }
      marcar_mensagens_como_lidas: {
        Args: { p_conversa_id: string }
        Returns: undefined
      }
      my_psychologist_documents_locked: { Args: never; Returns: boolean }
      normalize_invite_code: { Args: { p_code: string }; Returns: string }
      normalize_plan_tier: { Args: { p_tier: string }; Returns: string }
      notify_consultation_waiting: {
        Args: { p_appointment_id: string }
        Returns: Json
      }
      ocultar_conversa: { Args: { p_conversa_id: string }; Returns: undefined }
      organization_code_attempt_allowed: { Args: never; Returns: boolean }
      organization_entitlement: {
        Args: { p_user_id: string }
        Returns: {
          ends_on: string
          organization_id: string
          organization_name: string
          tier: string
        }[]
      }
      organization_entitlement_internal: {
        Args: { p_user_id: string }
        Returns: {
          ends_on: string
          organization_id: string
          organization_name: string
          tier: string
        }[]
      }
      plan_sos_quota: {
        Args: { p_user_id: string }
        Returns: {
          can_use: boolean
          plan_type: string
          reason: string
        }[]
      }
      plan_tier_has_appointments: { Args: { p_tier: string }; Returns: boolean }
      plan_tier_limits: { Args: { p_tier: string }; Returns: Json }
      plan_tier_rank: { Args: { p_tier: string }; Returns: number }
      pode_criar_conversa: {
        Args: { p_paciente_id: string; p_psicologo_id: string }
        Returns: boolean
      }
      pode_enviar_imagem_chat: { Args: { p_name: string }; Returns: boolean }
      pode_ver_imagem_chat: { Args: { p_name: string }; Returns: boolean }
      post_crisis_plan_source: {
        Args: {
          p_psychologist_id: string
          p_source_id: string
          p_source_type: string
        }
        Returns: Record<string, unknown>
      }
      progress_local_date: { Args: { p_local_date: string }; Returns: string }
      promote_to_admin: {
        Args: { target_user_email: string }
        Returns: boolean
      }
      prune_stale_psychologist_presence: { Args: never; Returns: number }
      psychologist_can_attend: {
        Args: { p_user_id?: string }
        Returns: boolean
      }
      psychologist_in_consultation: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      purge_access_logs: { Args: never; Returns: number }
      purge_archived_psychologist_payouts: { Args: never; Returns: number }
      purge_cron_history: { Args: never; Returns: number }
      purge_expired_care_records: { Args: never; Returns: Json }
      purge_old_notifications: { Args: never; Returns: number }
      purge_old_sos_messages: { Args: never; Returns: number }
      queue_appointment_reminders: { Args: never; Returns: number }
      queue_sos_followups: { Args: never; Returns: number }
      react_to_testimonial: {
        Args: { p_testimonial_id: string; p_tipo: string }
        Returns: Json
      }
      recompute_psychologist_pending: {
        Args: { p_psychologist_user_id: string }
        Returns: undefined
      }
      record_goal_progress: {
        Args: { p_category: string; p_local_date: string }
        Returns: {
          completed_now: boolean
          goal_id: string
          title: string
        }[]
      }
      refresh_subscriber_entitlement: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      register_access: { Args: never; Returns: boolean }
      register_habit_relapse: {
        Args: { p_habit_id: string; p_local_date: string; p_note?: string }
        Returns: string
      }
      register_push_token: {
        Args: { p_device_info?: Json; p_token: string }
        Returns: undefined
      }
      release_appointment_quota: {
        Args: { p_appointment_id: string }
        Returns: boolean
      }
      release_habit_reminders: {
        Args: { p_habit_ids: string[] }
        Returns: undefined
      }
      remove_organization_member_by_email: {
        Args: { p_email: string; p_org: string }
        Returns: Json
      }
      report_call_media: {
        Args: { p_connected: boolean; p_session_id: string }
        Returns: Json
      }
      report_consultation_problem: {
        Args: { p_appointment_id: string; p_details?: string }
        Returns: Json
      }
      report_group_testimonial: {
        Args: { p_details?: string; p_reason: string; p_testimonial_id: string }
        Returns: undefined
      }
      request_client_ip: { Args: never; Returns: unknown }
      reset_weekly_goals: { Args: never; Returns: undefined }
      return_extra_credit: { Args: { p_credit_id: string }; Returns: boolean }
      rotate_organization_invite_code: {
        Args: { p_org: string }
        Returns: string
      }
      safe_inet: { Args: { p_value: string }; Returns: unknown }
      safety_plan_items_ok: { Args: { p_items: string[] }; Returns: boolean }
      save_post_crisis_plan: {
        Args: {
          p_coping_strategies: string[]
          p_distractions: string[]
          p_reasons_to_live: string[]
          p_safe_environment: string[]
          p_source_id: string
          p_source_type: string
          p_title: string
          p_warning_signs: string[]
        }
        Returns: string
      }
      save_safety_plan: {
        Args: {
          p_contacts?: Json
          p_coping_strategies: string[]
          p_distractions: string[]
          p_expected_updated_at?: string
          p_new_id?: string
          p_plan_id: string
          p_reasons_to_live: string[]
          p_safe_environment: string[]
          p_title: string
          p_warning_signs: string[]
        }
        Returns: string
      }
      send_sos_message: {
        Args: { p_body: string; p_client_id: string; p_request_id: string }
        Returns: {
          body: string
          client_id: string
          created_at: string
          id: string
          request_id: string
          sender_id: string | null
          sender_type: string
        }
        SetofOptions: {
          from: "*"
          to: "sos_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_psychologist_availability: {
        Args: { p_blocks: Json }
        Returns: undefined
      }
      set_psychologist_vacation: {
        Args: {
          p_cancel_appointments?: boolean
          p_end: string
          p_start: string
        }
        Returns: Json
      }
      set_week_goals: {
        Args: { p_goal_ids: string[]; p_local_date: string }
        Returns: string
      }
      sos_call_connected: { Args: { p_request_id: string }; Returns: boolean }
      sos_call_payable: { Args: { p_request_id: string }; Returns: boolean }
      sos_chat_heartbeat: {
        Args: { p_read?: boolean; p_request_id: string }
        Returns: Json
      }
      sos_request_other_psychologist: {
        Args: { p_request_id: string }
        Returns: Json
      }
      sos_text_nudges: { Args: never; Returns: number }
      sos_text_psychologist_unresponsive: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      sync_psychologist_payments: { Args: never; Returns: undefined }
      testimonial_ban_active: { Args: { p_user_id: string }; Returns: boolean }
      testimonial_like_totals: {
        Args: { p_testimonial_id: string }
        Returns: Json
      }
      update_patient_activity_time: {
        Args: {
          p_activity_type: string
          p_duration_minutes: number
          p_patient_id: string
        }
        Returns: undefined
      }
      update_patient_activity_time_unchecked: {
        Args: {
          p_activity_type: string
          p_duration_minutes: number
          p_patient_id: string
        }
        Returns: undefined
      }
      update_patient_streak: { Args: { p_patient_id: string }; Returns: Json }
      vacation_conflicts: {
        Args: { p_end: string; p_start: string }
        Returns: {
          id: string
          patient_name: string
          starts_at: string
          status: string
        }[]
      }
      validate_unique_crp: {
        Args: { crp_input: string; exclude_id?: string }
        Returns: boolean
      }
      warn_appointments_before_plan_end: { Args: never; Returns: number }
    }
    Enums: {
      like_type: "positivo" | "negativo"
      registration_status: "pending" | "approved" | "rejected"
      user_type: "patient" | "psychologist" | "admin"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      like_type: ["positivo", "negativo"],
      registration_status: ["pending", "approved", "rejected"],
      user_type: ["patient", "psychologist", "admin"],
    },
  },
} as const
