import type { MetadataRoute } from "next";
import { brand } from "../lib/brand";
export default function manifest(): MetadataRoute.Manifest {
  return { name: brand.name, short_name: brand.name, description: brand.description,
    start_url: "/", display: "standalone", background_color: "#f7f7f2", theme_color: "#1c5840" };
}
