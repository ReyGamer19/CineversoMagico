"use client";

import { useEffect } from "react";

type Dir = "left" | "right" | "up" | "down";

const NATIVE = "button, a[href], input, select, textarea";
const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex="0"]';

function isVisible(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  return window.getComputedStyle(el).visibility !== "hidden";
}

function getFocusables(): HTMLElement[] {
  // Si hay un modal/reproductor abierto, solo se navega dentro de él
  const overlay = document.querySelector<HTMLElement>(".fixed.inset-0");
  const root: ParentNode = overlay || document;
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !(el as HTMLButtonElement).disabled && el.tabIndex >= 0 && isVisible(el)
  );
}

function makeClickablesFocusable() {
  document.querySelectorAll<HTMLElement>(".cursor-pointer").forEach((el) => {
    if (el.matches(NATIVE) || el.hasAttribute("tabindex")) return;
    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "button");
  });
}

function move(dir: Dir): boolean {
  const list = getFocusables();
  if (list.length === 0) return false;

  const cur = document.activeElement as HTMLElement | null;
  if (!cur || !list.includes(cur)) {
    focusEl(list[0]);
    return true;
  }

  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;

  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const el of list) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const dx = b.left + b.width / 2 - ax;
    const dy = b.top + b.height / 2 - ay;

    let primary = 0;
    let secondary = 0;
    if (dir === "right") { primary = dx; secondary = Math.abs(dy); }
    if (dir === "left") { primary = -dx; secondary = Math.abs(dy); }
    if (dir === "down") { primary = dy; secondary = Math.abs(dx); }
    if (dir === "up") { primary = -dy; secondary = Math.abs(dx); }

    if (primary <= 1) continue;
    const score = primary + secondary * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  if (best) {
    focusEl(best);
    return true;
  }
  return false;
}

function focusEl(el: HTMLElement) {
  el.focus();
  try {
    el.scrollIntoView({ block: "center", inline: "center" });
  } catch {
    el.scrollIntoView();
  }
}

function goBack(): boolean {
  const overlay = document.querySelector<HTMLElement>(".fixed.inset-0");
  if (overlay) {
    // El primer botón de cada modal/reproductor es "volver" o "cerrar"
    const first = overlay.querySelector<HTMLElement>("button");
    if (first) {
      first.click();
      return true;
    }
  }
  const home = Array.from(document.querySelectorAll<HTMLElement>("button")).find(
    (b) => b.textContent?.trim() === "Inicio" && isVisible(b)
  );
  // Si ya estamos en Inicio (botón activo en negrita), dejamos salir de la app
  if (home && !home.className.includes("font-bold")) {
    home.click();
    return true;
  }
  return false;
}

export default function TvSupport() {
  useEffect(() => {
    const html = document.documentElement;

    if (/Web0S|webOS|SMART-TV|SmartTV|Tizen|NetCast|HbbTV|Android TV|AFTM|AFTT/i.test(navigator.userAgent)) {
      html.classList.add("tv");
    }

    // Detectar si el navegador no soporta "gap" en flex
    try {
      const box = document.createElement("div");
      box.style.cssText = "display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden";
      box.appendChild(document.createElement("div"));
      box.appendChild(document.createElement("div"));
      document.body.appendChild(box);
      const supported = box.scrollHeight === 1;
      document.body.removeChild(box);
      if (!supported) html.classList.add("no-flex-gap");
    } catch {}

    makeClickablesFocusable();
    const observer = new MutationObserver(makeClickablesFocusable);
    observer.observe(document.body, { childList: true, subtree: true });

    const onKey = (e: KeyboardEvent) => {
      const k = e.keyCode;
      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA";
      const isSelect = tag === "SELECT";

      // Teclas de atrás: webOS 461, Tizen 10009, Escape 27, Backspace 8 (fuera de inputs)
      if (k === 461 || k === 10009 || k === 27 || (k === 8 && !typing)) {
        html.classList.add("using-keys");
        if (goBack()) e.preventDefault();
        return;
      }

      const dirs: Record<number, Dir> = { 37: "left", 38: "up", 39: "right", 40: "down" };
      const dir = dirs[k];

      if (dir) {
        if (isSelect) return;
        if (typing && (dir === "left" || dir === "right")) return;
        html.classList.add("using-keys");
        if (move(dir)) e.preventDefault();
        return;
      }

      // OK / Enter sobre elementos que no son botones nativos
      if (k === 13) {
        html.classList.add("using-keys");
        if (target && !target.matches(NATIVE) && target.getAttribute("role") === "button") {
          e.preventDefault();
          target.click();
        }
      }
    };

    const onMouse = () => html.classList.remove("using-keys");

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouse);
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouse);
    };
  }, []);

  return null;
}