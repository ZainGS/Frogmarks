namespace Frogmarks.Services.Interfaces
{
    /// <summary>
    /// Abstraction over blob storage so services can work against
    /// Azure Blob Storage in production or the local filesystem in development.
    /// </summary>
    public interface IBlobStorageProvider
    {
        Task<bool> ExistsAsync(string containerName, string blobName);
        Task UploadAsync(string containerName, string blobName, Stream content, bool overwrite = true);
        Task<byte[]> DownloadAsync(string containerName, string blobName);
        Task DeleteAsync(string containerName, string blobName);

        /// <summary>
        /// Returns a URL the frontend can use to fetch the blob.
        /// For Azure this is a time-limited SAS URL; for local storage it is a relative path served by static files.
        /// </summary>
        Task<string> GetReadUrlAsync(string containerName, string blobName);
    }
}
