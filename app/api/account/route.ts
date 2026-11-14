import { NextResponse, connection } from "next/server";
import { cookies } from "next/headers";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SECRET_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ""; // clave secreta (solo servidor)
const ANON_KEY = process.env.SUPABASE_ANON_KEY || ""; // clave publicable (sb_publishable_...)
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();

const ACCESS_COOKIE = "cv_access";
const REFRESH_COOKIE = "cv_refresh";

const noStore = { "Cache-Control": "no-store, max-age=0" };

type SbUser = { id: string; email?: string };
type Session = { access_token: string; refresh_token: string; user?: SbUser };
type CookieStore = Awaited<ReturnType<typeof cookies>>;

const configured = () => !!(SUPABASE_URL && SECRET_KEY && ANON_KEY);

// Cabeceras para Supabase. Las claves antiguas (eyJ...) también van como Bearer; las nuevas no.
const headersFor = (key: string, bearer?: string): Record<string, string> => {
  const h: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (bearer) h.Authorization = `Bearer ${bearer}`;
  else if (key.startsWith("eyJ")) h.Authorization = `Bearer ${key}`;
  return h;
};

const publicUser = (u: SbUser) => ({
  id: u.id,
  email: u.email || "",
  isAdmin: !!ADMIN_EMAIL && (u.email || "").toLowerCase() === ADMIN_EMAIL,
});

type LoginResult = { session: Session | null; reason: string };

async function passwordLogin(email: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: headersFor(ANON_KEY),
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  if (res.ok) return { session: (await res.json()) as Session, reason: "" };
  const err = await res.json().catch(() => ({}));
  return { session: null, reason: `${err?.error_code || ""} ${err?.msg || err?.message || ""}` };
}

// Llamada simple a un endpoint de autenticación de Supabase con la clave publicable
async function authCall(path: string, payload: unknown) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: headersFor(ANON_KEY),
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function refreshLogin(refreshToken: string): Promise<Session | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: headersFor(ANON_KEY),
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as Session;
}

async function getUser(accessToken: string): Promise<SbUser | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: headersFor(ANON_KEY, accessToken),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const u = await res.json();
  return u && u.id ? { id: u.id, email: u.email } : null;
}

function setSessionCookies(store: CookieStore, s: Session) {
  const base = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
  store.set(ACCESS_COOKIE, s.access_token, { ...base, maxAge: 60 * 60 });
  store.set(REFRESH_COOKIE, s.refresh_token, { ...base, maxAge: 60 * 60 * 24 * 30 });
}

function clearSessionCookies(store: CookieStore) {
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

// Devuelve el usuario de la sesión actual (renueva la sesión si el acceso venció)
async function resolveUser(store: CookieStore): Promise<SbUser | null> {
  const access = store.get(ACCESS_COOKIE)?.value;
  if (access) {
    const u = await getUser(access);
    if (u) return u;
  }
  const refresh = store.get(REFRESH_COOKIE)?.value;
  if (refresh) {
    const s = await refreshLogin(refresh);
    if (s && s.access_token) {
      setSessionCookies(store, s);
      return s.user && s.user.id ? { id: s.user.id, email: s.user.email } : await getUser(s.access_token);
    }
    clearSessionCookies(store);
  }
  return null;
}

async function loadUserData(userId: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_data?id=eq.${encodeURIComponent(userId)}&select=data`, {
      headers: headersFor(SECRET_KEY),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows[0] ? rows[0].data : null;
  } catch {
    return null;
  }
}

const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });

// SESIÓN ACTUAL + DATOS DE LA CUENTA
export async function GET() {
  await connection();
  if (!configured()) return fail("Servidor sin configurar", 503);
  try {
    const store = await cookies();
    const user = await resolveUser(store);
    if (!user) return NextResponse.json({ user: null }, { headers: noStore });
    const data = await loadUserData(user.id);
    return NextResponse.json({ user: publicUser(user), data }, { headers: noStore });
  } catch {
    return fail("Error de conexión", 502);
  }
}

// REGISTRO, INICIO Y CIERRE DE SESIÓN
export async function POST(req: Request) {
  if (!configured()) return fail("Servidor sin configurar", 503);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail("Solicitud inválida", 400);
  }

  const action = body?.action;
  const store = await cookies();

  if (action === "logout") {
    clearSessionCookies(store);
    return NextResponse.json({ ok: true }, { headers: noStore });
  }

  // Cambia la contraseña de una sesión de recuperación
  const changePassword = async (accessToken: string, newPassword: string): Promise<string> => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "PUT",
      headers: headersFor(ANON_KEY, accessToken),
      body: JSON.stringify({ password: newPassword }),
      cache: "no-store",
    });
    if (res.ok) return "";
    const j = await res.json().catch(() => ({}));
    const t = `${j?.error_code || ""} ${j?.msg || j?.message || ""}`;
    if (/same|different/i.test(t)) return "Usa una contraseña distinta a la anterior.";
    if (/weak/i.test(t)) return "La contraseña es muy débil. Usa una más larga o con números.";
    return "No se pudo cambiar la contraseña. Inténtalo de nuevo.";
  };
  const newPassword = typeof body.password === "string" ? body.password : "";

  // Recuperación desde el enlace del correo (el navegador trae el token de recuperación)
  if (action === "reset_link") {
    if (newPassword.length < 6 || newPassword.length > 72) return fail("La contraseña debe tener entre 6 y 72 caracteres", 400);
    const at = typeof body.accessToken === "string" ? body.accessToken : "";
    const rt = typeof body.refreshToken === "string" ? body.refreshToken : "";
    try {
      const u = at ? await getUser(at) : null;
      if (!u) return fail("El enlace venció. Pide uno nuevo con ¿Olvidaste tu contraseña?", 401);
      const err = await changePassword(at, newPassword);
      if (err) return fail(err, 422);
      setSessionCookies(store, { access_token: at, refresh_token: rt });
      const data = await loadUserData(u.id);
      return NextResponse.json({ user: publicUser(u), data }, { headers: noStore });
    } catch {
      return fail("Error de conexión", 502);
    }
  }

  if (!["login", "register", "verify", "resend", "recover", "reset"].includes(action)) return fail("Acción inválida", 400);

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return fail("Ingresa un correo válido", 400);

  // Termina el inicio de sesión: guarda las cookies y devuelve usuario + datos
  const finish = async (session: Session) => {
    setSessionCookies(store, session);
    const user: SbUser = session.user && session.user.id ? { id: session.user.id, email: session.user.email } : { id: "", email };
    const data = user.id ? await loadUserData(user.id) : null;
    return NextResponse.json({ user: publicUser(user), data }, { headers: noStore });
  };

  try {
    // Reenviar el código de verificación
    if (action === "resend") {
      const { res } = await authCall("resend", { type: "signup", email });
      if (!res.ok) {
        if (res.status === 429) return fail("Espera un minuto antes de pedir otro código.", 429);
        return fail("No se pudo reenviar el código. Inténtalo de nuevo.", 502);
      }
      return NextResponse.json({ ok: true }, { headers: noStore });
    }

    // Olvidé mi contraseña: Supabase envía el correo de recuperación
    if (action === "recover") {
      let origin = "";
      try { origin = new URL(req.url).origin; } catch {}
      const path = origin ? `recover?redirect_to=${encodeURIComponent(origin + "/")}` : "recover";
      const { res } = await authCall(path, { email });
      if (res.status === 429) return fail("Espera un minuto antes de pedir otro correo.", 429);
      // No revelamos si el correo existe o no
      return NextResponse.json({ ok: true }, { headers: noStore });
    }

    // Código de recuperación + contraseña nueva
    if (action === "reset") {
      const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
      if (!/^\d{6,8}$/.test(code)) return fail("Escribe el código que te llegó al correo", 400);
      if (newPassword.length < 6 || newPassword.length > 72) return fail("La contraseña debe tener entre 6 y 72 caracteres", 400);
      const { res, json } = await authCall("verify", { type: "recovery", email, token: code });
      if (!res.ok || !json?.access_token) return fail("Código incorrecto o vencido. Pide uno nuevo.", 401);
      const err = await changePassword(json.access_token, newPassword);
      if (err) return fail(err, 422);
      return await finish(json as Session);
    }

    // Confirmar el código de 6 dígitos que llegó al correo
    if (action === "verify") {
      const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
      if (!/^\d{6,8}$/.test(code)) return fail("Escribe el código de 6 dígitos", 400);
      const { res, json } = await authCall("verify", { type: "signup", email, token: code });
      if (!res.ok || !json?.access_token) return fail("Código incorrecto o vencido. Pide uno nuevo.", 401);
      return await finish(json as Session);
    }

    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < 6 || password.length > 72) return fail("La contraseña debe tener entre 6 y 72 caracteres", 400);

    // Crear cuenta: Supabase envía el código de verificación al correo
    if (action === "register") {
      const { res, json } = await authCall("signup", { email, password });
      if (!res.ok) {
        const text = `${json?.error_code || ""} ${json?.msg || json?.message || ""}`;
        if (res.status === 429 || /rate|seconds|too many/i.test(text)) {
          return fail("Se enviaron muchos correos. Espera un minuto e inténtalo de nuevo.", 429);
        }
        if (/weak/i.test(text)) return fail("La contraseña es muy débil. Usa una más larga o con números.", 422);
        if (/exists|already|registered/i.test(text)) return fail("Ese correo ya tiene una cuenta. Inicia sesión.", 409);
        if (/invalid/i.test(text) && /email/i.test(text)) return fail("Ese correo no es válido.", 400);
        return fail("No se pudo crear la cuenta. Inténtalo de nuevo.", 502);
      }
      // Correo que ya tiene una cuenta confirmada: Supabase responde sin identidades
      const identities = json?.identities ?? json?.user?.identities;
      if (Array.isArray(identities) && identities.length === 0) {
        return fail("Ese correo ya tiene una cuenta. Inicia sesión.", 409);
      }
      // Si la confirmación estuviera desactivada, ya viene la sesión
      if (json?.access_token) return await finish(json as Session);
      return NextResponse.json({ pending: true, email }, { headers: noStore });
    }

    // Iniciar sesión
    const { session, reason } = await passwordLogin(email, password);
    if (!session || !session.access_token) {
      if (/email_not_confirmed|not confirmed/i.test(reason)) {
        await authCall("resend", { type: "signup", email }).catch(() => null);
        return NextResponse.json(
          { error: "Tu correo aún no está verificado. Te enviamos un código.", needsVerification: true, email },
          { status: 403, headers: noStore }
        );
      }
      return fail("Correo o contraseña incorrectos", 401);
    }
    return await finish(session);
  } catch {
    return fail("Error de conexión", 502);
  }
}

// GUARDAR LOS DATOS DE LA CUENTA (perfiles, Mi Lista, Continuar viendo)
export async function PUT(req: Request) {
  if (!configured()) return fail("Servidor sin configurar", 503);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail("Solicitud inválida", 400);
  }

  const d = body?.data;
  if (!d || typeof d !== "object" || Array.isArray(d)) return fail("Datos inválidos", 400);

  const clean = {
    v: 1,
    profiles: Array.isArray(d.profiles) ? d.profiles.slice(0, 10) : [],
    activeProfileId: typeof d.activeProfileId === "string" ? d.activeProfileId.slice(0, 64) : "",
    myList: Array.isArray(d.myList) ? d.myList.filter((x: unknown) => typeof x === "string").slice(0, 500) : [],
    progress: Array.isArray(d.progress) ? d.progress.slice(0, 50) : [],
    // 👍/👎 por película: { "idPelicula": 1 | -1 }
    ratings: (() => {
      const out: Record<string, number> = {};
      if (d.ratings && typeof d.ratings === "object" && !Array.isArray(d.ratings)) {
        for (const k of Object.keys(d.ratings).slice(0, 1000)) {
          const v = d.ratings[k];
          if ((v === 1 || v === -1) && k.length <= 80) out[k] = v;
        }
      }
      return out;
    })(),
    // Última vez que vio las notificaciones (milisegundos)
    notifSeen: typeof d.notifSeen === "number" && isFinite(d.notifSeen) ? d.notifSeen : 0,
    // Historial de lo que vio (para recomendaciones y retos): { id, at, pct, mins }
    history: Array.isArray(d.history)
      ? d.history
          .filter((h: any) => h && (typeof h.id === "string" || typeof h.id === "number") && typeof h.at === "number" && isFinite(h.at))
          .slice(0, 400)
          .map((h: any) => ({ id: String(h.id).slice(0, 80), at: h.at, pct: Math.max(0, Math.min(100, Number(h.pct) || 0)), mins: Math.max(0, Math.min(100000, Number(h.mins) || 0)) }))
      : [],
    // Sagas y géneros que sigue
    follows: (() => {
      const f = d.follows && typeof d.follows === "object" ? d.follows : {};
      const arr = (a: any, n: number) => (Array.isArray(a) ? a.filter((x: unknown) => typeof x === "string" && x).map((x: string) => x.slice(0, 60)).slice(0, n) : []);
      return { sagas: arr(f.sagas, 50), genres: arr(f.genres, 30) };
    })(),
    // Insignias de los retos del mes ("AAAA-MM")
    seasonBadges: Array.isArray(d.seasonBadges) ? d.seasonBadges.filter((x: unknown) => typeof x === "string" && /^\d{4}-\d{2}$/.test(x)).slice(0, 240) : [],
    // Retos sueltos completados ("AAAA-MM:reto")
    challengesDone: Array.isArray(d.challengesDone) ? d.challengesDone.filter((x: unknown) => typeof x === "string" && /^\d{4}-\d{2}:[a-z]{2,20}$/.test(x)).slice(0, 720) : [],
  };
  if (JSON.stringify(clean).length > 300_000) return fail("Datos demasiado grandes", 413);

  try {
    const store = await cookies();
    const user = await resolveUser(store);
    if (!user) return fail("Sesión no iniciada", 401);

    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_data?on_conflict=id`, {
      method: "POST",
      headers: { ...headersFor(SECRET_KEY), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: user.id, data: clean, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) return fail("No se pudo guardar", 502);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch {
    return fail("Error de conexión", 502);
  }
}