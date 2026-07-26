function leerVariableCss(nombre, fallback) {
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  return valor || fallback;
}

export const TIPOS_AGENTE = ["Institución", "Población Completa", "Población Indígena Completa"];

export const PALETA_TIPO = {
  "Institución": leerVariableCss("--tipo-institucion", "#2f6f76"),
  "Población Completa": leerVariableCss("--tipo-poblacion-completa", "#c98a3b"),
  "Población Indígena Completa": leerVariableCss("--tipo-poblacion-indigena", "#7a3b1e"),
};

export function grupoDeTipo(tipo) {
  return tipo === "Institución" ? "Instituciones" : "Poblaciones";
}

export const PALETA_GRUPO = {
  "Instituciones": PALETA_TIPO["Institución"],
  "Poblaciones": PALETA_TIPO["Población Completa"],
};

export const PALETA_GENERO = {
  "Mujer": leerVariableCss("--genero-mujer", "#ffa600"),
  "Hombre": leerVariableCss("--genero-hombre", "#bb4e99"),
  "Sin información": leerVariableCss("--genero-sin-info", "#003f5c"),
};

export const SIGLOS = ["Siglo XVI", "Siglo XVII", "Siglo XVIII", "Siglo XIX"];

export function getSiglo(año) {
  if (año <= 1599) return "Siglo XVI";
  if (año <= 1699) return "Siglo XVII";
  if (año <= 1799) return "Siglo XVIII";
  return "Siglo XIX";
}
