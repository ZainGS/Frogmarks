using Azure.Storage.Blobs;
using Azure.Storage.Sas;
using Frogmarks.Services.Interfaces;

namespace Frogmarks.Services
{
    /// <summary>
    /// Azure Blob Storage implementation of <see cref="IBlobStorageProvider"/>.
    /// </summary>
    public class AzureBlobStorageProvider : IBlobStorageProvider
    {
        private readonly BlobServiceClient _blobServiceClient;

        public AzureBlobStorageProvider(BlobServiceClient blobServiceClient)
        {
            _blobServiceClient = blobServiceClient;
        }

        public async Task<bool> ExistsAsync(string containerName, string blobName)
        {
            var container = _blobServiceClient.GetBlobContainerClient(containerName);
            var blob = container.GetBlobClient(blobName);
            return await blob.ExistsAsync();
        }

        public async Task UploadAsync(string containerName, string blobName, Stream content, bool overwrite = true)
        {
            var container = _blobServiceClient.GetBlobContainerClient(containerName);
            await container.CreateIfNotExistsAsync();
            var blob = container.GetBlobClient(blobName);
            await blob.UploadAsync(content, overwrite: overwrite);
        }

        public async Task<byte[]> DownloadAsync(string containerName, string blobName)
        {
            var container = _blobServiceClient.GetBlobContainerClient(containerName);
            var blob = container.GetBlobClient(blobName);
            var download = await blob.DownloadContentAsync();
            return download.Value.Content.ToArray();
        }

        public async Task DeleteAsync(string containerName, string blobName)
        {
            var container = _blobServiceClient.GetBlobContainerClient(containerName);
            var blob = container.GetBlobClient(blobName);
            await blob.DeleteIfExistsAsync();
        }

        public async Task<string> GetReadUrlAsync(string containerName, string blobName)
        {
            var container = _blobServiceClient.GetBlobContainerClient(containerName);
            var blob = container.GetBlobClient(blobName);

            if (!(await blob.ExistsAsync()))
                return "";

            var sasBuilder = new BlobSasBuilder
            {
                BlobContainerName = container.Name,
                BlobName = blob.Name,
                ExpiresOn = DateTime.UtcNow.AddHours(1),
                Resource = "b"
            };
            sasBuilder.SetPermissions(BlobSasPermissions.Read);

            return blob.GenerateSasUri(sasBuilder).ToString();
        }
    }
}
