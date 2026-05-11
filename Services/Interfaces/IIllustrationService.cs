using Frogmarks.Models.Illustration;
using Frogmarks.Models.Dtos.Illustration;
using Frogmarks.Utilities;

namespace Frogmarks.Services
{
    public interface IIllustrationService
    {
        Task<ResultModel<IEnumerable<Illustration>>> GetAllIllustrations();
        Task<ResultModel<IllustrationDto>> GetIllustrationById(long id);
        Task<ResultModel<IllustrationDto>> GetIllustrationByUid(Guid uid);
        Task<ResultModel<Illustration>> CreateIllustration(IllustrationDto illustration);
        Task<ResultModel<Illustration>> UpdateIllustration(IllustrationDto illustration);
        Task<ResultModel<string>> SaveIllustrationCanvas(long illustrationId, string canvasData);
        Task<ResultModel<string>> LoadIllustrationCanvas(long illustrationId);
        Task<ResultModel<Illustration>> DeleteIllustration(long id);
        Task<ResultModel<IEnumerable<IllustrationDto>>> SearchIllustrations(string name, long teamId, bool favorites, string sortBy, string sortDirection, int pageIndex, int pageSize, HashSet<long> cachedThumbnailIllustrationIds, bool isArchived);
        Task<ResultModel<Illustration>> FavoritedIllustration(IllustrationDto illustrationDto);
        Task<ResultModel<string>> UploadThumbnail(string illustrationUid, IFormFile thumbnail, bool? setCustom);
        Task<ResultModel<IllustrationDto>> DuplicateIllustration(
            long sourceIllustrationId,
            string? nameOverride,
            long? targetTeamId,
            bool copyThumbnail
        );
        Task<ResultModel<IllustrationDto>> RenameIllustration(long illustrationId, string newName);

        // V2 state endpoints
        Task<ResultModel<IllustrationStateDto>> SaveIllustrationState(long illustrationId, IllustrationStateDto stateDto);
        Task<ResultModel<IllustrationStateDto>> LoadIllustrationState(long illustrationId);
        Task<long?> GetStateSavedAt(long illustrationId);
        Task<ResultModel<string>> UploadCelPixelData(long illustrationId, string celId, IFormFile pixelData, int? width, int? height, string? format);
        Task<ResultModel<string>> UploadLayerPixelData(long illustrationId, string layerId, IFormFile pixelData, int? width, int? height, string? format);
        Task<ResultModel<string>> DeleteCel(long illustrationId, string celId);
        Task<ResultModel<Dictionary<string, CelStatusItemDto>>> GetCelStatus(long illustrationId, List<string> celIds);

        // Per-mesh + texture-library binary blob endpoints (v3 save path)
        Task<ResultModel<string>> UploadMeshBlob(long illustrationId, string meshId, IFormFile meshData);
        Task<ResultModel<string>> UploadTextureLibraryBlob(long illustrationId, IFormFile texLibData);
        Task<ResultModel<Dictionary<string, string>>> GetMeshReadUrls(long illustrationId, List<string> meshIds);

        // Publishing
        Task<ResultModel<IllustrationDto>> PublishIllustration(long illustrationId, IFormFile bundle, string? publishedTitle);
        Task<ResultModel<string>> UnpublishIllustration(long illustrationId);
        Task<ResultModel<IllustrationViewDto>> GetPublicView(Guid uid);
        Task<ResultModel<byte[]>> DownloadPublicBundle(Guid uid);

        // Storage quota
        Task<ResultModel<StorageQuotaDto>> GetStorageQuota();
    }
}