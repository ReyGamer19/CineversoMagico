"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Movie } from "../lib/types";
import { defaultMovies } from "../data/movies";
import { adminPost } from "../lib/adminApi";

type UseCatalogOptions = {
  isAdmin: boolean;
  flashToast: (msg: string) => void;
};

export function useCatalog({ isAdmin, flashToast }: UseCatalogOptions) {
  // Estados del formulario del panel admin
  const [newMovieTitle, setNewMovieTitle] = useState("");
  const [newMovieDesc, setNewMovieDesc] = useState("");
  const [newMovieCategory, setNewMovieCategory] = useState("Acción");
  const [newMovieType, setNewMovieType] = useState<"pelicula" | "serie">("pelicula");
  const [newMovieImage, setNewMovieImage] = useState("");
  const [newMovieVideoUrl, setNewMovieVideoUrl] = useState("");
  const [editingMovieId, setEditingMovieId] = useState<number | string | null>(null);

  const [customMovies, setCustomMovies] = useState<Movie[]>(defaultMovies);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    try {
      const saved = localStorage.getItem("cineverso_custom_movies");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Las películas por defecto SIEMPRE usan la versión del código (así los enlaces
          // corregidos llegan a todos los dispositivos). Solo se conservan las agregadas
          // por el admin que no son de las películas por defecto.
          const defaultIds = new Set(defaultMovies.map((m) => String(m.id)));
          const extras = parsed.filter((m: Movie) => !defaultIds.has(String(m.id)));
          setCustomMovies([...defaultMovies, ...extras]);
        }
      }
    } catch (e) {
      console.error("Error cargando localStorage:", e);
    }

    // Catálogo compartido: se carga del servidor para que todos los dispositivos vean lo mismo
    const loadFromServer = async () => {
      try {
        const res = await fetch("/api/catalog", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.movies) && data.movies.length > 0) {
          setCustomMovies(data.movies);
        }
      } catch {
        // Sin conexión al servidor: se queda con el catálogo local
      }
    };
    loadFromServer();
    const onVisible = () => {
      if (document.visibilityState === "visible") loadFromServer();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(loadFromServer, 60000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);

  // Copia local del catálogo
  useEffect(() => {
    if (!isMounted) return;
    try {
      if (customMovies.length > 0) {
        localStorage.setItem("cineverso_custom_movies", JSON.stringify(customMovies));
      }
    } catch (e) {
      console.error("Error guardando en localStorage:", e);
    }
  }, [customMovies, isMounted]);

  // Guarda el catálogo completo en el servidor (requiere clave de administrador)
  const saveCatalog = (list: Movie[]): Promise<boolean> =>
    adminPost(
      "/api/catalog",
      { movies: list },
      "No se pudo guardar en el servidor. Revisa la configuración de Supabase."
    );

  const clearForm = () => {
    setNewMovieTitle("");
    setNewMovieDesc("");
    setNewMovieImage("");
    setNewMovieVideoUrl("");
  };

  const handleSaveMovie = async (e: FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      alert("Acceso denegado. Solo el administrador puede gestionar películas.");
      return;
    }
    if (!newMovieTitle || !newMovieVideoUrl) {
      alert("Por favor ingresa al menos el título y el enlace del vídeo.");
      return;
    }

    if (editingMovieId) {
      const updatedList = customMovies.map((m) =>
        m.id === editingMovieId
          ? {
              ...m,
              title: newMovieTitle,
              tag: newMovieCategory,
              type: newMovieType,
              desc: newMovieDesc || m.desc,
              bgImage: newMovieImage || m.bgImage,
              img: newMovieImage || m.img,
              videoUrl: newMovieVideoUrl,
            }
          : m
      );

      if (!(await saveCatalog(updatedList))) return;
      setCustomMovies(updatedList);
      flashToast("¡Contenido actualizado y guardado correctamente!");
      setEditingMovieId(null);
    } else {
      const createdMovie: Movie = {
        id: Date.now(),
        title: newMovieTitle,
        rating: "8.5",
        year: "2026",
        tag: newMovieCategory,
        type: newMovieType,
        desc: newMovieDesc || "Contenido añadido desde el panel de administración.",
        bgImage: newMovieImage || "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=800&auto=format&fit=crop",
        img: newMovieImage || "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=800&auto=format&fit=crop",
        videoUrl: newMovieVideoUrl,
        backupVideoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        duration: "1 h 50 min",
        genres: [newMovieCategory],
        cast: "Elenco Estelar",
        director: "Director Principal",
        production: "Cineverso Studio",
        originalLanguage: "ES",
      };

      const newList = [createdMovie, ...customMovies];
      if (!(await saveCatalog(newList))) return;
      setCustomMovies(newList);
      flashToast("¡Película publicada y respaldada con éxito!");
    }

    clearForm();
  };

  const handleEditClick = (movie: Movie) => {
    setEditingMovieId(movie.id);
    setNewMovieTitle(movie.title);
    setNewMovieDesc(movie.desc);
    setNewMovieCategory(movie.tag || "Acción");
    setNewMovieType(movie.type || "pelicula");
    setNewMovieImage(movie.bgImage || "");
    setNewMovieVideoUrl(movie.videoUrl || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteMovie = async (id: number | string) => {
    if (confirm("¿Estás seguro de eliminar este contenido del catálogo?")) {
      const filtered = customMovies.filter((m) => m.id !== id);
      if (!(await saveCatalog(filtered))) return;
      setCustomMovies(filtered);
      if (editingMovieId === id) {
        setEditingMovieId(null);
        clearForm();
      }
      flashToast("Contenido eliminado correctamente.");
    }
  };

  return {
    customMovies,
    setCustomMovies,
    saveCatalog,
    newMovieTitle, setNewMovieTitle,
    newMovieDesc, setNewMovieDesc,
    newMovieCategory, setNewMovieCategory,
    newMovieType, setNewMovieType,
    newMovieImage, setNewMovieImage,
    newMovieVideoUrl, setNewMovieVideoUrl,
    editingMovieId, setEditingMovieId,
    handleSaveMovie,
    handleEditClick,
    handleDeleteMovie,
  };
}
