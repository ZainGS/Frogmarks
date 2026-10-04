using System.Text.RegularExpressions;

namespace Frogmarks.Utilities
{
    /// <summary>
    /// Validation for client-supplied pieces of blob names (security audit 2026-10-04, Phase 1.9). Route values and the
    /// pixel-format query string used to be interpolated straight into blob paths, so "../" (or "\" on Windows) could
    /// reach other illustrations' blobs or files outside the storage root.
    /// </summary>
    public static class BlobNames
    {
        // Every id the client sends is a UUID, a nanoid, or "layer-N" / "mesh-N"-style (Salsa).
        private static readonly Regex Segment = new(@"^[A-Za-z0-9_-]{1,128}$", RegexOptions.Compiled);

        // Salsa's PixelFormat: 'raw' | 'png' | 'webp' | 'avif'.
        private static readonly HashSet<string> PixelFormats = new(StringComparer.Ordinal) { "raw", "png", "webp", "avif" };

        /// <summary>True when the value is safe to use as one segment of a blob name (no separators, dots or spaces).</summary>
        public static bool IsSafeSegment(string? value) => value != null && Segment.IsMatch(value);

        /// <summary>True for a known pixel format, or null (callers default to webp).</summary>
        public static bool IsValidPixelFormat(string? format) => format == null || PixelFormats.Contains(format);
    }
}
