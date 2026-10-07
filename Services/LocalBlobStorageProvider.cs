using Frogmarks.Services.Interfaces;

namespace Frogmarks.Services
{
    /// <summary>
    /// Local filesystem implementation of <see cref="IBlobStorageProvider"/>.
    /// Stores blobs under wwwroot/blob-storage/{containerName}/{blobName} so they
    /// can be served directly by the static-files middleware during development.
    /// </summary>
    public class LocalBlobStorageProvider : IBlobStorageProvider
    {
        private readonly string _rootPath;
        private readonly string _requestPathBase;

        /// <param name="webRootPath">The wwwroot path (from <see cref="IWebHostEnvironment.WebRootPath"/>).</param>
        /// <param name="requestPathBase">The URL prefix the frontend uses to reach these files (e.g. "/blob-storage").</param>
        public LocalBlobStorageProvider(string webRootPath, string requestPathBase = "/blob-storage")
        {
            _rootPath = Path.Combine(webRootPath, "blob-storage");
            _requestPathBase = requestPathBase.TrimEnd('/');
            Directory.CreateDirectory(_rootPath);
        }

        private string GetFilePath(string containerName, string blobName)
        {
            var path = Path.GetFullPath(Path.Combine(_rootPath, containerName, blobName.Replace('/', Path.DirectorySeparatorChar)));
            // Backstop for path traversal (audit Phase 1.9): the resolved path must stay inside the storage root.
            var root = Path.GetFullPath(_rootPath).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if (!path.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                throw new ArgumentException("Blob name resolves outside the storage root.", nameof(blobName));
            return path;
        }

        public Task<bool> ExistsAsync(string containerName, string blobName)
        {
            return Task.FromResult(File.Exists(GetFilePath(containerName, blobName)));
        }

        public async Task UploadAsync(string containerName, string blobName, Stream content, bool overwrite = true)
        {
            var filePath = GetFilePath(containerName, blobName);
            var directory = Path.GetDirectoryName(filePath)!;
            Directory.CreateDirectory(directory);

            if (!overwrite && File.Exists(filePath))
                return;

            using var fs = new FileStream(filePath, FileMode.Create, FileAccess.Write, FileShare.None);
            await content.CopyToAsync(fs);
        }

        public async Task<byte[]> DownloadAsync(string containerName, string blobName)
        {
            var filePath = GetFilePath(containerName, blobName);
            return await File.ReadAllBytesAsync(filePath);
        }

        public Task DeleteAsync(string containerName, string blobName)
        {
            var filePath = GetFilePath(containerName, blobName);
            if (File.Exists(filePath))
                File.Delete(filePath);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<string>> ListAsync(string containerName, string prefix)
        {
            var names = new List<string>();
            var containerRoot = GetFilePath(containerName, "");
            // Only walk the prefix's folder ("123/mesh/" → <container>/123/mesh), not the whole container
            var slash = prefix.LastIndexOf('/');
            var searchRoot = slash > 0 ? GetFilePath(containerName, prefix.Substring(0, slash)) : containerRoot;
            if (Directory.Exists(searchRoot))
            {
                var rootWithSep = containerRoot.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                foreach (var file in Directory.EnumerateFiles(searchRoot, "*", SearchOption.AllDirectories))
                {
                    var name = file.Substring(rootWithSep.Length).Replace(Path.DirectorySeparatorChar, '/');
                    if (name.StartsWith(prefix, StringComparison.Ordinal)) names.Add(name);
                }
            }
            return Task.FromResult<IReadOnlyList<string>>(names);
        }

        public Task<string> GetReadUrlAsync(string containerName, string blobName)
        {
            var filePath = GetFilePath(containerName, blobName);
            if (!File.Exists(filePath))
                return Task.FromResult(string.Empty);

            // Return a relative URL that the static-files middleware will serve
            var url = $"{_requestPathBase}/{containerName}/{blobName}";
            return Task.FromResult(url);
        }
    }
}
