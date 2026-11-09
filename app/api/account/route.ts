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

async function passwordLogin(email: string, password: string): Promise<Session | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: headersFor(ANON_KEY),
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as Session;
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

  if (action !== "login" && action !== "register") return fail("Acción inválida", 400);

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return fail("Ingresa un correo válido", 400);
  if (password.length < 6 || password.length > 72) return fail("La contraseña debe tener entre 6 y 72 caracteres", 400);

  try {
    if (action === "register") {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: "POST",
        headers: headersFor(SECRET_KEY),
        body: JSON.stringify({ email, password, email_confirm: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const text = `${err?.error_code || ""} ${err?.msg || err?.message || ""}`;
        if (/exists|already|registered/i.test(text)) return fail("Ese correo ya tiene una cuenta. Inicia sesión.", 409);
        if (/weak/i.test(text)) return fail("La contraseña es muy débil. Usa una más larga o con números.", 422);
        return fail("No se pudo crear la cuenta. Inténtalo de nuevo.", 502);
      }
    }

    const session = await passwordLogin(email, password);
    if (!session || !session.access_token) {
      return fail(action === "login" ? "Correo o contraseña incorrectos" : "Cuenta creada, pero no se pudo iniciar sesión. Intenta entrar.", 401);
    }
    setSessionCookies(store, session);

    const user: SbUser = session.user && session.user.id ? { id: session.user.id, email: session.user.email } : { id: "", email };
    const data = user.id ? await loadUserData(user.id) : null;
    return NextResponse.json({ user: publicUser(user), data }, { headers: noStore });
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