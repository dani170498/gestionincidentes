type PgError = {
  code?: string;
  constraint?: string;
  detail?: string;
};

export function isUniqueViolation(error: unknown): error is PgError {
  return Boolean(error && typeof error === "object" && (error as PgError).code === "23505");
}

export function getConstraint(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  return (error as PgError).constraint;
}

export function getDuplicateMessage(error: unknown, fallback: string): string {
  if (!isUniqueViolation(error)) return fallback;

  const constraint = getConstraint(error);
  switch (constraint) {
    case "users_username_key":
      return "El nombre de usuario ya existe";
    case "users_email_key":
      return "El correo electrónico ya existe";
    case "incidents_external_id_key":
      return "El external_id ya existe";
    case "catalog_service_types_name_key":
    case "catalog_channels_name_key":
    case "catalog_gerencias_name_key":
    case "catalog_motivos_name_key":
    case "catalog_categorias_name_key":
      return "Ya existe un registro con ese nombre";
    case "password_resets_token_key":
      return "No se pudo generar un token único. Intenta nuevamente";
    default:
      return fallback;
  }
}

