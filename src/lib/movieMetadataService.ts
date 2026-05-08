import { getAllCachedMovieMetadata } from "@/lib/movieMetadataCache";

export async function getMovieMetadataMap() {
  return getAllCachedMovieMetadata();
}
