import fs from "fs/promises";
import path from "path";
import { devWithTimestamp } from "@/utils/logger";
import { MovieFile, scanMovieDirectory } from "@/lib/movieScanner";
import { getAllCachedMovieMetadata } from "@/lib/movieMetadataCache";
import { getAllEloRatings } from "@/lib/eloRatingCache";
import { getAllPlaybackHistory } from "@/lib/playbackHistoryCache";

const SCAN_CACHE_TTL_MS = 5 * 60 * 1000;

let scanCache:
  | {
      directory: string;
      scannedAt: number;
      movies: MovieFile[];
    }
  | null = null;

const inFlightScans = new Map<string, Promise<MovieFile[]>>();

async function filterExistingMovies(movies: MovieFile[]): Promise<MovieFile[]> {
  const results = await Promise.all(
    movies.map(async (movie) => {
      try {
        await fs.access(movie.absolutePath);
        return movie;
      } catch {
        return null;
      }
    })
  );
  return results.filter((movie): movie is MovieFile => movie !== null)
    .map((movie) => ({ ...movie }));
}

async function getScannedMovies(directoryPath: string, forceRescan: boolean): Promise<MovieFile[]> {
  const normalizedDirectory = path.resolve(directoryPath);
  const cacheIsFresh =
    scanCache &&
    scanCache.directory === normalizedDirectory &&
    Date.now() - scanCache.scannedAt < SCAN_CACHE_TTL_MS;

  if (!forceRescan && cacheIsFresh) {
    devWithTimestamp(`[movieLibraryService] Using scan cache: ${scanCache!.movies.length}`);
    return filterExistingMovies(scanCache!.movies);
  }

  const existingScan = inFlightScans.get(normalizedDirectory);
  if (!forceRescan && existingScan) {
    const movies = await existingScan;
    return filterExistingMovies(movies);
  }

  const scanPromise = scanMovieDirectory(directoryPath)
    .then((movies) => {
      scanCache = {
        directory: normalizedDirectory,
        scannedAt: Date.now(),
        movies,
      };
      return movies;
    })
    .finally(() => {
      inFlightScans.delete(normalizedDirectory);
    });

  inFlightScans.set(normalizedDirectory, scanPromise);
  const movies = await scanPromise;
  return filterExistingMovies(movies);
}

export async function getMovieLibrary(directoryPath: string, forceRescan: boolean) {
  const [moviesFromDisk, metadataCache, eloRatingsCache, playbackHistory] = await Promise.all([
    getScannedMovies(directoryPath, forceRescan),
    getAllCachedMovieMetadata(),
    getAllEloRatings(),
    getAllPlaybackHistory(),
  ]);

  const mergedMovies = moviesFromDisk
    .filter((movie) => movie.code)
    .map((movie) => {
      let mergedMovie: any = { ...movie };

      if (movie.code) {
        const cachedDetails = metadataCache.get(movie.code);
        if (cachedDetails) {
          mergedMovie = {
            ...mergedMovie,
            ...cachedDetails,
            title: cachedDetails.title || mergedMovie.title,
          };
        }

        const eloRating = eloRatingsCache.get(movie.code);
        if (eloRating) {
          mergedMovie = { ...mergedMovie, ...eloRating };
        }
      }

      const history = playbackHistory.get(movie.absolutePath);
      if (history) {
        mergedMovie = {
          ...mergedMovie,
          lastPlayedAt: history.lastPlayedAt,
          playCount: history.playCount,
          completedCount: history.completedCount,
          lastPlaybackTime: history.currentTime,
          playbackDuration: history.duration,
          playbackProgress: history.progress,
          watched: history.watched,
        };
      }

      return mergedMovie;
    })
    .sort((a, b) => b.modifiedAt - a.modifiedAt);

  return mergedMovies;
}
