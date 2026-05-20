"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

type FormValues = {
  tipoRegistro: "INCIDENTE" | "SOPORTE";
  solicitante: string;
  tipoServicio: string;
  canalOficina: string;
  gerencia: string;
  motivoServicio: string;
  descripcion: string;
  encargado: string;
  fechaReporte: string;
  horaReporte: string;
};

type Props = {
  defaultTipoRegistro?: "INCIDENTE" | "SOPORTE";
};

type CatalogItem = {
  id: number;
  name: string;
  active: boolean;
};
type MotivoItem = CatalogItem & { service_type_id: number };

export function IncidentForm({ defaultTipoRegistro = "INCIDENTE" }: Props) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      tipoRegistro: defaultTipoRegistro,
    },
  });

  const selectedTipoServicio = watch("tipoServicio");
  const selectedMotivo = watch("motivoServicio");

  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [serviceTypes, setServiceTypes] = useState<CatalogItem[]>([]);
  const [channels, setChannels] = useState<CatalogItem[]>([]);
  const [gerencias, setGerencias] = useState<CatalogItem[]>([]);
  const [motivos, setMotivos] = useState<MotivoItem[]>([]);

  const filteredMotivos = useMemo(() => {
    const selected = serviceTypes.find((s) => s.name === selectedTipoServicio);
    if (!selected) return [];
    return motivos.filter((item) => item.service_type_id === selected.id);
  }, [motivos, serviceTypes, selectedTipoServicio]);

  useEffect(() => {
    if (!selectedTipoServicio) {
      if (selectedMotivo) setValue("motivoServicio", "");
      return;
    }
    if (!selectedMotivo) return;
    if (!filteredMotivos.some((item) => item.name === selectedMotivo)) {
      setValue("motivoServicio", "");
    }
  }, [filteredMotivos, selectedMotivo, selectedTipoServicio, setValue]);

  async function onSubmit(values: FormValues) {
    setSubmitMessage(null);
    const payload = { ...values };
    const res = await fetch("/api/registro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSubmitMessage(data?.error || "No se pudo guardar el registro.");
      return;
    }

    setSubmitMessage("Registro guardado correctamente.");
  }

  useEffect(() => {
    async function loadCatalogs() {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const [tipoRes, canalRes, gerRes, motRes] = await Promise.all([
          fetch("/api/catalogos/tiposervicio"),
          fetch("/api/catalogos/canaloficina"),
          fetch("/api/catalogos/gerencia"),
          fetch("/api/catalogos/motivo"),
        ]);

        if (!tipoRes.ok || !canalRes.ok || !gerRes.ok || !motRes.ok) {
          throw new Error("No se pudieron cargar los catálogos");
        }

        const [tipoData, canalData, gerData, motData] = await Promise.all([
          tipoRes.json(),
          canalRes.json(),
          gerRes.json(),
          motRes.json(),
        ]);

        setServiceTypes(tipoData.items || []);
        setChannels(canalData.items || []);
        setGerencias(gerData.items || []);
        setMotivos(motData.items || []);
      } catch (err) {
        setCatalogError(err instanceof Error ? err.message : "Error al cargar catálogos");
      } finally {
        setCatalogLoading(false);
      }
    }

    void loadCatalogs();
  }, []);

  useEffect(() => {
    async function loadUser() {
      const res = await fetch("/api/auth/me");
      const data = await res.json().catch(() => ({}));
      const name = data?.user?.full_name || data?.user?.username || "";
      setUserName(name);
      if (name) setValue("encargado", name);
    }
    void loadUser();
  }, [setValue]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="form">
      {catalogError && <p className="error">{catalogError}</p>}

      <section className="form-section">
        <div className="form-section__header">
          <h2 className="form-section__title">Contexto del incidente</h2>
          <p className="form-section__copy">Define quién reporta, por dónde entra y cómo debe clasificarse.</p>
        </div>
        <div className="split">
          <div className="field">
            <label className="label">Tipo de registro *</label>
            <select className="select" {...register("tipoRegistro", { required: "Requerido" })}>
              <option value="INCIDENTE">Incidente</option>
              <option value="SOPORTE">Soporte</option>
            </select>
            {errors.tipoRegistro && <span className="error">{errors.tipoRegistro.message}</span>}
          </div>

          <div className="field">
            <label className="label">Usuario solicitante *</label>
            <input className="input" {...register("solicitante", { required: "Requerido" })} />
            {errors.solicitante && <span className="error">{errors.solicitante.message}</span>}
          </div>

          <div className="field">
            <label className="label">Tipo de servicio *</label>
            <select
              className="select"
              {...register("tipoServicio", { required: "Requerido" })}
              disabled={catalogLoading}
            >
              <option value="">Seleccionar...</option>
              {serviceTypes.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
            {errors.tipoServicio && <span className="error">{errors.tipoServicio.message}</span>}
          </div>

          <div className="field">
            <label className="label">Canal/Oficina *</label>
            <select
              className="select"
              {...register("canalOficina", { required: "Requerido" })}
              disabled={catalogLoading}
            >
              <option value="">Seleccionar...</option>
              {channels.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
            {errors.canalOficina && <span className="error">{errors.canalOficina.message}</span>}
          </div>

          <div className="field">
            <label className="label">Gerencia *</label>
            <select className="select" {...register("gerencia", { required: "Requerido" })} disabled={catalogLoading}>
              <option value="">Seleccionar...</option>
              {gerencias.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
            {errors.gerencia && <span className="error">{errors.gerencia.message}</span>}
          </div>

          <div className="field">
            <label className="label">Motivo de servicio *</label>
            <select
              className="select"
              {...register("motivoServicio", { required: "Requerido" })}
              disabled={catalogLoading || !selectedTipoServicio}
            >
              <option value="">
                {selectedTipoServicio ? "Seleccionar..." : "Selecciona un tipo de servicio primero"}
              </option>
              {filteredMotivos.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
            {errors.motivoServicio && <span className="error">{errors.motivoServicio.message}</span>}
          </div>

          <div className="field">
            <label className="label">Encargado del incidente *</label>
            <input
              className="input input--readonly"
              readOnly
              value={userName}
              {...register("encargado", { required: "Requerido" })}
            />
            {errors.encargado && <span className="error">{errors.encargado.message}</span>}
          </div>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section__header">
          <h2 className="form-section__title">Detalle y reporte inicial</h2>
          <p className="form-section__copy">
            Registra lo ocurrido y el momento del reporte. La toma y la resolución se controlan luego desde gestión.
          </p>
        </div>
        <div className="field">
          <label className="label">Descripción del incidente *</label>
          <textarea className="textarea" {...register("descripcion", { required: "Requerido" })} />
          {errors.descripcion && <span className="error">{errors.descripcion.message}</span>}
        </div>

        <div className="split">
          <div className="field">
            <label className="label">Fecha de reporte *</label>
            <input className="input" type="date" {...register("fechaReporte", { required: "Requerido" })} />
            {errors.fechaReporte && <span className="error">{errors.fechaReporte.message}</span>}
          </div>

          <div className="field">
            <label className="label">Hora de reporte *</label>
            <input className="input" type="time" {...register("horaReporte", { required: "Requerido" })} />
            {errors.horaReporte && <span className="error">{errors.horaReporte.message}</span>}
          </div>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section__header">
          <h2 className="form-section__title">Siguiente etapa del ticket</h2>
          <p className="form-section__copy">
            Al guardar, el ticket queda tomado por el usuario actual. Las respuestas se documentan en el historial y la
            fecha de resolución se genera cuando cierres el ticket desde el panel de gestión.
          </p>
        </div>
      </section>

      <div className="actions-row">
        <button type="submit" disabled={isSubmitting} className="button">
          Guardar registro
        </button>
      </div>

      {submitMessage && <p className={submitMessage.includes("correctamente") ? "success" : "error"}>{submitMessage}</p>}
    </form>
  );
}
