
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "contactos": {
                  Row: {
                    "actualizado_en": string,"apellidos": string,"creado_en": string,"email": string,"facebook": string,"id": string,"nombre": string,"propietario_id": string,"telefono": string,"twitter": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actualizado_en"?: string,"apellidos"?: string,"creado_en"?: string,"email"?: string,"facebook"?: string,"id"?: string,"nombre": string,"propietario_id"?: string,"telefono"?: string,"twitter"?: string
                  }
                  Update: {
                    "actualizado_en"?: string,"apellidos"?: string,"creado_en"?: string,"email"?: string,"facebook"?: string,"id"?: string,"nombre"?: string,"propietario_id"?: string,"telefono"?: string,"twitter"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contactos_propietario_id_fkey"
      columns: ["propietario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"contactos_compartidos": {
                  Row: {
                    "contacto_id": string,"creado_en": string,"rol": Database["public"]['Enums']["rol_comparticion"],"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "contacto_id": string,"creado_en"?: string,"rol": Database["public"]['Enums']["rol_comparticion"],"usuario_id": string
                  }
                  Update: {
                    "contacto_id"?: string,"creado_en"?: string,"rol"?: Database["public"]['Enums']["rol_comparticion"],"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contactos_compartidos_contacto_id_fkey"
      columns: ["contacto_id"]
isOneToOne: false
      referencedRelation: "contactos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contactos_compartidos_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"perfiles": {
                  Row: {
                    "creado_en": string,"email": string,"id": string,"nombre": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "creado_en"?: string,"email": string,"id": string,"nombre"?: string | null
                  }
                  Update: {
                    "creado_en"?: string,"email"?: string,"id"?: string,"nombre"?: string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "compartir_contacto":
{ Args: { "p_contacto_id": string,"p_email": string,"p_rol": Database["public"]['Enums']["rol_comparticion"] }; Returns: {
              "contacto_id": string,
"creado_en": string,
"rol": Database["public"]['Enums']["rol_comparticion"],
"usuario_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "contactos_compartidos"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "rol_comparticion": "lector"|"editor"
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
  "public": {
          Enums: {
            "rol_comparticion": ["lector", "editor"]
          }
        }
} as const
