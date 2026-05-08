import path from "path";
import os from "os";

export function getAppCachePath(): string {
  if (process.env.APP_CACHE_PATH) {
    return process.env.APP_CACHE_PATH;
  }

  const appName = "AV-Manager";

  if (process.platform === "win32") {
    return path.join(os.homedir(), "AppData", "Local", appName);
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Caches", appName);
  }

  return path.join(os.homedir(), ".cache", appName);
}

export function getUserDataPath(): string {
  if (process.env.USER_DATA_PATH) {
    return process.env.USER_DATA_PATH;
  }

  return path.join(process.cwd(), "userData");
}

export function getMovieDirectoryPath(): string {
  return path.join(getUserDataPath(), "movie-directory.txt");
}

export function getMovieMetadataCachePath(): string {
  return path.join(getUserDataPath(), "movie-metadata-cache.json");
}

export function getEloRatingsCachePath(): string {
  return path.join(getUserDataPath(), "movie-elo-ratings.json");
}

export function getImageCachePath(): string {
  return path.join(getUserDataPath(), "image-cache");
}

export function getPlaybackHistoryCachePath(): string {
  return path.join(getUserDataPath(), "movie-playback-history.json");
}
