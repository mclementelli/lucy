import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lucy — Personal Life Data Center",
    short_name: "Lucy",
    description: "Tu vida, más clara. Un día a la vez.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbf7f2",
    theme_color: "#123348",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
