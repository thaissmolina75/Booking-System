
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "audit_log": {
                  Row: {
                    "action": string,"business_id": string | null,"created_at": string,"details": NonNullable<Json>,"entity": string,"entity_id": string | null,"id": number,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"business_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"entity": string,"entity_id"?: string | null,"id"?: never,"user_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"business_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"entity"?: string,"entity_id"?: string | null,"id"?: never,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"availability_overrides": {
                  Row: {
                    "business_id": string,"created_at": string,"date": string,"id": string,"is_blocked": boolean,"note": string | null,"seats": number | null,"tour_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"date": string,"id"?: string,"is_blocked"?: boolean,"note"?: string | null,"seats"?: number | null,"tour_id": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"date"?: string,"id"?: string,"is_blocked"?: boolean,"note"?: string | null,"seats"?: number | null,"tour_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "availability_overrides_tour_id_business_id_fkey"
      columns: ["tour_id","business_id"]
isOneToOne: false
      referencedRelation: "tours"
      referencedColumns: ["id","business_id"]
    }
                  ]
                },"booking_counters": {
                  Row: {
                    "business_id": string,"last_number": number
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"last_number"?: number
                  }
                  Update: {
                    "business_id"?: string,"last_number"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_counters_business_id_fkey"
      columns: ["business_id"]
isOneToOne: true
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"bookings": {
                  Row: {
                    "adults": number,"business_id": string,"children": number,"code": string,"created_at": string,"customer_name": string,"customer_phone": string | null,"date": string,"decided_at": string | null,"decided_by": string | null,"id": string,"notes": string | null,"pickup_location": string | null,"source": Database["public"]['Enums']["booking_source"],"status": Database["public"]['Enums']["booking_status"],"total_amount": number,"tour_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "adults": number,"business_id": string,"children"?: number,"code": string,"created_at"?: string,"customer_name": string,"customer_phone"?: string | null,"date": string,"decided_at"?: string | null,"decided_by"?: string | null,"id"?: string,"notes"?: string | null,"pickup_location"?: string | null,"source": Database["public"]['Enums']["booking_source"],"status"?: Database["public"]['Enums']["booking_status"],"total_amount"?: number,"tour_id": string
                  }
                  Update: {
                    "adults"?: number,"business_id"?: string,"children"?: number,"code"?: string,"created_at"?: string,"customer_name"?: string,"customer_phone"?: string | null,"date"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"id"?: string,"notes"?: string | null,"pickup_location"?: string | null,"source"?: Database["public"]['Enums']["booking_source"],"status"?: Database["public"]['Enums']["booking_status"],"total_amount"?: number,"tour_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_tour_id_business_id_fkey"
      columns: ["tour_id","business_id"]
isOneToOne: false
      referencedRelation: "tours"
      referencedColumns: ["id","business_id"]
    }
                  ]
                },"businesses": {
                  Row: {
                    "booking_prefix": string,"commission_type": Database["public"]['Enums']["commission_type"],"commission_value": number,"created_at": string,"currency": string,"id": string,"instagram_handle": string | null,"name": string,"slug": string,"status": Database["public"]['Enums']["business_status"],"timezone": string,"trial_ends_at": string | null,"whatsapp_phone": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_prefix": string,"commission_type"?: Database["public"]['Enums']["commission_type"],"commission_value"?: number,"created_at"?: string,"currency"?: string,"id"?: string,"instagram_handle"?: string | null,"name": string,"slug": string,"status"?: Database["public"]['Enums']["business_status"],"timezone"?: string,"trial_ends_at"?: string | null,"whatsapp_phone"?: string | null
                  }
                  Update: {
                    "booking_prefix"?: string,"commission_type"?: Database["public"]['Enums']["commission_type"],"commission_value"?: number,"created_at"?: string,"currency"?: string,"id"?: string,"instagram_handle"?: string | null,"name"?: string,"slug"?: string,"status"?: Database["public"]['Enums']["business_status"],"timezone"?: string,"trial_ends_at"?: string | null,"whatsapp_phone"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"invites": {
                  Row: {
                    "accepted_at": string | null,"business_id": string,"created_at": string,"created_by": string | null,"email": string,"expires_at": string,"id": string,"role": Database["public"]['Enums']["membership_role"],"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"business_id": string,"created_at"?: string,"created_by"?: string | null,"email": string,"expires_at"?: string,"id"?: string,"role": Database["public"]['Enums']["membership_role"],"token"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"business_id"?: string,"created_at"?: string,"created_by"?: string | null,"email"?: string,"expires_at"?: string,"id"?: string,"role"?: Database["public"]['Enums']["membership_role"],"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invites_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "business_id": string,"created_at": string,"id": string,"role": Database["public"]['Enums']["membership_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"id"?: string,"role": Database["public"]['Enums']["membership_role"],"user_id": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"id"?: string,"role"?: Database["public"]['Enums']["membership_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_admins": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"full_name": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"full_name"?: string | null,"user_id": string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"full_name"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"tours": {
                  Row: {
                    "business_id": string,"created_at": string,"default_seats_per_day": number,"description": string | null,"duration_text": string | null,"id": string,"is_active": boolean,"name": string,"pickup_zones": (string)[],"price_adult": number,"price_child": number,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"default_seats_per_day"?: number,"description"?: string | null,"duration_text"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"pickup_zones"?: (string)[],"price_adult"?: number,"price_child"?: number,"sort_order"?: number
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"default_seats_per_day"?: number,"description"?: string | null,"duration_text"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"pickup_zones"?: (string)[],"price_adult"?: number,"price_child"?: number,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "tours_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invite":
{ Args: { "p_token": string }; Returns: {
              "business_id": string,
"created_at": string,
"id": string,
"role": Database["public"]['Enums']["membership_role"],
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "memberships"
        isOneToOne: true
        isSetofReturn: false
      } },
"cancel_booking":
{ Args: { "p_booking_id": string }; Returns: {
              "adults": number,
"business_id": string,
"children": number,
"code": string,
"created_at": string,
"customer_name": string,
"customer_phone": string | null,
"date": string,
"decided_at": string | null,
"decided_by": string | null,
"id": string,
"notes": string | null,
"pickup_location": string | null,
"source": Database["public"]['Enums']["booking_source"],
"status": Database["public"]['Enums']["booking_status"],
"total_amount": number,
"tour_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "bookings"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_booking":
{ Args: { "p_adults": number,"p_business_id": string,"p_children": number,"p_customer_name": string,"p_customer_phone": string,"p_date": string,"p_notes"?: string,"p_pickup_location": string,"p_source": Database["public"]['Enums']["booking_source"],"p_tour_id": string }; Returns: {
              "adults": number,
"business_id": string,
"children": number,
"code": string,
"created_at": string,
"customer_name": string,
"customer_phone": string | null,
"date": string,
"decided_at": string | null,
"decided_by": string | null,
"id": string,
"notes": string | null,
"pickup_location": string | null,
"source": Database["public"]['Enums']["booking_source"],
"status": Database["public"]['Enums']["booking_status"],
"total_amount": number,
"tour_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "bookings"
        isOneToOne: true
        isSetofReturn: false
      } },
"decide_booking":
{ Args: { "p_booking_id": string,"p_decision": Database["public"]['Enums']["booking_status"] }; Returns: {
              "adults": number,
"business_id": string,
"children": number,
"code": string,
"created_at": string,
"customer_name": string,
"customer_phone": string | null,
"date": string,
"decided_at": string | null,
"decided_by": string | null,
"id": string,
"notes": string | null,
"pickup_location": string | null,
"source": Database["public"]['Enums']["booking_source"],
"status": Database["public"]['Enums']["booking_status"],
"total_amount": number,
"tour_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "bookings"
        isOneToOne: true
        isSetofReturn: false
      } },
"get_commission_report":
{ Args: { "p_month": string }; Returns: {
              "approved_instagram": number,"approved_manual": number,"approved_total": number,"approved_whatsapp": number,"bot_revenue": number,"business_id": string,"business_name": string,"commission_owed": number,"commission_type": Database["public"]['Enums']["commission_type"],"commission_value": number,"currency": string,"status": Database["public"]['Enums']["business_status"],"trial_ends_at": string
            }[]
                           },
"get_invite_preview":
{ Args: { "p_token": string }; Returns: {
              "business_name": string,"email": string,"role": Database["public"]['Enums']["membership_role"],"state": string
            }[]
                           },
"get_month_availability":
{ Args: { "p_business_id": string,"p_month": string }; Returns: {
              "approved_count": number,"capacity": number,"date": string,"is_blocked": boolean,"pending_count": number,"seats_left": number,"taken": number,"tour_id": string,"tour_name": string
            }[]
                           },
"has_role":
{ Args: { "p_business_id": string,"p_role": Database["public"]['Enums']["membership_role"] }; Returns: boolean
                           },
"is_member":
{ Args: { "p_business_id": string }; Returns: boolean
                           },
"is_platform_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"local_date":
{ Args: { "p_at": string,"p_timezone": string }; Returns: string
                           },
"lock_tour_day":
{ Args: { "p_date": string,"p_tour_id": string }; Returns: undefined
                           },
"reset_day_availability":
{ Args: { "p_date": string,"p_tour_id": string }; Returns: undefined
                           },
"set_day_availability":
{ Args: { "p_date": string,"p_is_blocked": boolean,"p_note"?: string,"p_seats": number,"p_tour_id": string }; Returns: {
              "business_id": string,
"created_at": string,
"date": string,
"id": string,
"is_blocked": boolean,
"note": string | null,
"seats": number | null,
"tour_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "availability_overrides"
        isOneToOne: true
        isSetofReturn: false
      } },
"write_audit":
{ Args: { "p_action": string,"p_business_id": string,"p_details": Json,"p_entity": string,"p_entity_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "booking_source": "bot_whatsapp"|"bot_instagram"|"manual","booking_status": "pending"|"approved"|"declined"|"cancelled","business_status": "trial"|"active"|"suspended","commission_type": "percent"|"fixed_per_booking","membership_role": "owner"|"staff"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "booking_source": ["bot_whatsapp", "bot_instagram", "manual"],"booking_status": ["pending", "approved", "declined", "cancelled"],"business_status": ["trial", "active", "suspended"],"commission_type": ["percent", "fixed_per_booking"],"membership_role": ["owner", "staff"]
          }
        }
} as const
