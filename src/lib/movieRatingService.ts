import { getAllEloRatings } from "@/lib/eloRatingCache";

export async function getMovieRatingMap() {
  return getAllEloRatings();
}
