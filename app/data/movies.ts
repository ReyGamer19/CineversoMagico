import type { Movie } from "../lib/types";

// Catálogo base por defecto (siempre se usa la versión del código)
export const defaultMovies: Movie[] = [
  {
    id: "def-1",
    title: "El Caballero Oscuro",
    rating: "9.0",
    year: "2008",
    tag: "Acción",
    type: "pelicula",
    desc: "Batman se enfrenta al Caos encarnado por el Joker en una de las mejores adaptaciones cinematográficas de superhéroes de la historia.",
    bgImage: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=800&auto=format&fit=crop",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    duration: "2 h 32 min",
    genres: ["Acción", "Crimen", "Drama"],
    cast: "Christian Bale, Heath Ledger, Aaron Eckhart",
    director: "Christopher Nolan",
    production: "Warner Bros. Pictures",
    originalLanguage: "EN"
  },
  {
    id: "def-2",
    title: "Wildwood",
    rating: "8.4",
    year: "2025",
    tag: "Aventura",
    type: "pelicula",
    desc: "Una joven se adentra en un bosque secreto repleto de magia, criaturas místicas y peligros inimaginables para rescatar a su hermano menor.",
    bgImage: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    duration: "1 h 58 min",
    genres: ["Aventura", "Fantasía", "Animación"],
    cast: "Carey Mulligan, Mahershala Ali, Peyton Elizabeth Lee",
    director: "Travis Knight",
    production: "Laika Studios",
    originalLanguage: "EN"
  },
  {
    id: "def-3",
    title: "HOPE",
    subtitle: "EL PRIMER IMPACTO",
    rating: "8.8",
    year: "2026",
    tag: "Ciencia ficción",
    type: "pelicula",
    desc: "Los refuerzos se han desviado para combatir los incendios forestales y se han cortado todas las comunicaciones. El jefe del puesto policial de Hope, Bum-seok, y la agente Sung-ae luchan por defender un pueblo de ancianos, mientras que en las montañas, Sung-ki y los lugareños que se han lanzado a la búsqueda de la bestia se ven, por el contrario, acosados por ella. Lo que comienza como ignorancia siembra la semilla del desastre, que se intensifica a través del conflicto humano hasta convertirse en una tragedia de proporciones cósmicas.",
    bgImage: "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=800&auto=format&fit=crop",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    duration: "2 h 37 min",
    genres: ["Ciencia ficción", "Misterio", "Acción"],
    cast: "황정민, 조인성, 정호연, Alicia Vikander",
    director: "Na Hong-jin",
    production: "Forged Films",
    originalLanguage: "KO"
  },
  {
    id: "def-4",
    title: "Toy Story 5",
    rating: "9.1",
    year: "2026",
    tag: "Animación",
    type: "pelicula",
    desc: "Woody, Buzz y el resto de la pandilla enfrentan los nuevos desafíos de la tecnología moderna y los dispositivos electrónicos en las manos de los niños.",
    bgImage: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=800&auto=format&fit=crop",
    videoUrl: "https://archive.org/download/toy-story-5-2026-pelisde-rey/Toy%20Story%205%20%282026%25",
    duration: "1 h 45 min",
    genres: ["Animación", "Comedia", "Familia"],
    cast: "Tom Hanks, Tim Allen, Joan Cusack",
    director: "Andrew Stanton",
    production: "Pixar Animation Studios",
    originalLanguage: "EN"
  }
];
