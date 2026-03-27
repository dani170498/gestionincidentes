export function buildOpenApiSpec(baseUrl: string) {
  return {
    openapi: "3.0.3",
    info: {
      title: "API Gestion Incidentes",
      version: "1.0.0",
      description: "Documentacion base para integraciones externas de tickets y soporte.",
    },
    servers: [{ url: baseUrl }],
    components: {
      securitySchemes: {
        apiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
        },
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "auth_token",
        },
      },
      schemas: {
        SoporteSolicitudInput: {
          type: "object",
          required: ["tipoServicio", "canalOficina", "descripcion"],
          properties: {
            solicitante: { type: "string", example: "Integracion ERP" },
            tipoServicio: { type: "string", example: "Soporte TI" },
            canalOficina: { type: "string", example: "Oficina Central" },
            descripcion: { type: "string", example: "No puedo acceder al sistema." },
          },
        },
        ExternalTicketInput: {
          type: "object",
          required: [
            "external_id",
            "tipo_registro",
            "solicitante",
            "tipo_servicio",
            "canal_oficina",
            "gerencia",
            "motivo_servicio",
            "descripcion",
            "encargado",
            "fecha_reporte",
            "hora_reporte",
            "fecha_respuesta",
            "hora_respuesta",
            "accion_tomada",
            "primer_contacto",
          ],
          properties: {
            external_id: { type: "string", example: "EXT-2026-001" },
            tipo_registro: { type: "string", enum: ["INCIDENTE", "SOPORTE"], example: "SOPORTE" },
            solicitante: { type: "string", example: "Integracion ERP" },
            tipo_servicio: { type: "number", example: 1 },
            canal_oficina: { type: "number", example: 1 },
            gerencia: { type: "number", example: 1 },
            motivo_servicio: { type: "number", example: 2 },
            descripcion: { type: "string", example: "Error al registrar orden." },
            encargado: { type: "string", example: "SIN_ASIGNAR" },
            fecha_reporte: { type: "string", format: "date", example: "2026-03-27" },
            hora_reporte: { type: "string", example: "09:30" },
            fecha_respuesta: { type: "string", format: "date", example: "2026-03-27" },
            hora_respuesta: { type: "string", example: "10:15" },
            accion_tomada: { type: "string", example: "Escalado a mesa de ayuda" },
            primer_contacto: { type: "boolean", example: false },
            estado: { type: "string", example: "REGISTRADO" },
          },
        },
      },
    },
    paths: {
      "/api/soporte/solicitud": {
        post: {
          summary: "Crear solicitud de soporte",
          description:
            "Permite crear ticket de soporte usando sesion web (cookie) o integracion externa (x-api-key).",
          security: [{ apiKeyAuth: [] }, { cookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SoporteSolicitudInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Solicitud creada",
              content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } },
            },
            "400": { description: "Datos invalidos" },
            "401": { description: "No autorizado" },
          },
        },
      },
      "/api/external/tickets": {
        post: {
          summary: "Crear ticket externo",
          description:
            "Endpoint de integracion externa para alta completa de tickets con x-api-key o sesion web.",
          security: [{ apiKeyAuth: [] }, { cookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ExternalTicketInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Ticket creado",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      id: { type: "number" },
                    },
                  },
                },
              },
            },
            "400": { description: "Datos invalidos" },
            "401": { description: "No autorizado" },
            "409": { description: "Duplicado" },
          },
        },
      },
    },
  };
}
