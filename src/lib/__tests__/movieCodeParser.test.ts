import { parseMovieFilename } from '@/lib/movieCodeParser';

describe('parseMovieFilename', () => {
  it('extracts standard code like ABC-123', () => {
    const r = parseMovieFilename('ABC-123 Some Title Here.mp4');
    expect(r.code).toBe('ABC-123');
    expect(r.title).toBe('Some Title Here');
  });

  it('handles content after @ symbol', () => {
    const r = parseMovieFilename('random_prefix@XYZ-456 Real Name.mkv');
    expect(r.code).toBe('XYZ-456');
    expect(r.title).toBe('Real Name');
  });

  it('returns undefined code when no pattern matches', () => {
    const r = parseMovieFilename('Just A Random Video.mp4');
    expect(r.code).toBeUndefined();
  });

  it('extracts year when present', () => {
    const r = parseMovieFilename('ABC-123 (2023) Great Film.mp4');
    expect(r.year).toBe('2023');
  });

  it('falls back to filename as title if no code', () => {
    const r = parseMovieFilename('My Home Movie.avi');
    expect(r.title).toBe('My Home Movie');
    expect(r.coverUrl).toBeUndefined();
  });

  it('generates coverUrl for valid codes', () => {
    const r = parseMovieFilename('DEF-789 title.mp4');
    expect(r.coverUrl).toContain('/cover/DEF-789.jpg');
  });

  it('handles lowercase codes and normalizes to uppercase', () => {
    const r = parseMovieFilename('abc-999 film.mp4');
    expect(r.code).toBe('ABC-999');
  });

  it('handles multi-segment codes', () => {
    const r = parseMovieFilename('ABC-DEF-G12 name.mp4');
    expect(r.code).toBeDefined();
  });
});
