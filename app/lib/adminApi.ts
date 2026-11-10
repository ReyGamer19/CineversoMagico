// Envío de datos al servidor con la clave de administrador.
// La clave se pide una vez y se guarda solo en esta pestaña (sessionStorage).
const ADMIN_KEY_STORAGE = "cineverso_admin_key";

export async function adminPost(
  url: string,
  payload: Record<string, unknown>,
  serverErrorMessage: string
): Promise<boolean> {
  try {
    let key = sessionStorage.getItem(ADMIN_KEY_STORAGE) || "";
    if (!key) key = window.prompt("Clave de administrador:") || "";
    if (!key) {
      alert("Se necesita la clave de administrador para guardar.");
      return false;
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: key, ...payload }),
    });
    if (res.status === 401) {
      sessionStorage.removeItem(ADMIN_KEY_STORAGE);
      alert("Clave de administrador incorrecta.");
      return false;
    }
    if (!res.ok) {
      alert(serverErrorMessage);
      return false;
    }
    sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
    return true;
  } catch {
    alert("Error de conexión al guardar. Intenta de nuevo.");
    return false;
  }
}
