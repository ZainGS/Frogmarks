using Azure.Storage.Blobs.Models;
using Azure.Storage.Blobs;
using Frogmarks.Models.Dtos;
using Frogmarks.Services;
using Frogmarks.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Frogmarks.Utilities;
using Frogmarks.Models.Illustration;
using Frogmarks.Models.Dtos.Illustration;

namespace Frogmarks.Controllers
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class IllustrationController : BaseController
    {
        private readonly IIllustrationService _illustrationService;
        public IllustrationController(IIllustrationService illustrationService, IErrorService errorService) : base(errorService)
        {
            _illustrationService = illustrationService;
        }

        // GET: api/<IllustrationController>
        [HttpGet]
        public async Task<IActionResult> GetIllustrations()
        {
            try
            {
                var result = await _illustrationService.GetAllIllustrations();
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        [HttpGet("search")]
        public async Task<IActionResult> SearchIllustrations(
            [FromQuery] string name = "",
            [FromQuery] long teamId = 0,
            [FromQuery] bool favorites = false,
            [FromQuery] string sortBy = "name",
            [FromQuery] string sortDirection = "desc",
            [FromQuery] int pageIndex = 0,
            [FromQuery] int pageSize = 10,
            [FromQuery] string cachedThumbnailIllustrationIds = "",
            [FromQuery] bool isArchived = false)
        {
            try
            {
                // Pre-allocate the HashSet length and then assign values to avoid internal HashSet resizing.
                var splitIds = cachedThumbnailIllustrationIds?.Split(',') ?? Array.Empty<string>();
                var illustrationIds = new HashSet<long>(splitIds.Length);
                foreach (var id in splitIds)
                {
                    if (long.TryParse(id, out var longId))
                    {
                        illustrationIds.Add(longId);
                    }
                }
                var illustrations = await _illustrationService.SearchIllustrations(name, teamId, favorites, sortBy, sortDirection, pageIndex, pageSize, illustrationIds, isArchived);
                return Ok(illustrations);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        [HttpGet("explore")]
        public async Task<IActionResult> Explore(
            [FromQuery] string name = "",
            [FromQuery] long teamId = 0,
            [FromQuery] bool favorites = false,
            [FromQuery] string sortBy = "name",
            [FromQuery] string sortDirection = "desc",
            [FromQuery] int pageIndex = 0,
            [FromQuery] int pageSize = 10,
            [FromQuery] string cachedThumbnailIllustrationIds = "",
            [FromQuery] bool isArchived = false)
        {
            try
            {
                // Pre-allocate the HashSet length and then assign values to avoid internal HashSet resizing.
                var splitIds = cachedThumbnailIllustrationIds?.Split(',') ?? Array.Empty<string>();
                var illustrationIds = new HashSet<long>(splitIds.Length);
                foreach (var id in splitIds)
                {
                    if (long.TryParse(id, out var longId))
                    {
                        illustrationIds.Add(longId);
                    }
                }
                var illustrations = await _illustrationService.SearchIllustrations(name, teamId, favorites, sortBy, sortDirection, pageIndex, pageSize, illustrationIds, isArchived);
                return Ok(illustrations);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        // GET api/<IllustrationController>/5
        [HttpGet("{id}")]
        public async Task<IActionResult> GetIllustrationById(long id)
        {
            try
            {
                var result = await _illustrationService.GetIllustrationById(id);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        [HttpGet("GetIllustrationByUid/{uid}")]
        public async Task<IActionResult> GetIllustrationByUid(Guid uid)
        {
            try
            {
                var result = await _illustrationService.GetIllustrationByUid(uid);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        // POST api/<IllustrationController>
        [HttpPost]
        public async Task<IActionResult> CreateIllustration([FromBody] IllustrationDto illustration)
        {
            try
            {
                var result = await _illustrationService.CreateIllustration(illustration);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        // PUT api/<IllustrationController>/5
        /// <summary>
        /// Updates illustration-level metadata (name, permissions, etc.), may trigger audit logs or versioning, less frequent than autosaves.
        /// </summary>
        /// <param name="illustration"></param>
        /// <returns></returns>
        [HttpPut]
        public async Task<IActionResult> UpdateIllustration([FromBody] IllustrationDto illustration)
        {
            try
            {
                var result = await _illustrationService.UpdateIllustration(illustration);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        /// <summary>
        /// Handles frequent canvas updates, stores only canvas-related changes, used for background autosaving.
        /// </summary>
        /// <param name="request"></param>
        /// <returns></returns>
        [HttpPost("save")]
        public async Task<IActionResult> SaveIllustration([FromBody] IllustrationRequestDto request)
        {
            try
            {
                var result = await _illustrationService.SaveIllustrationCanvas(request.IllustrationId, request.CanvasData);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        /// <summary>
        /// Loads the saved canvasData for a given illustration ID.
        /// </summary>
        /// <param name="illustrationId"></param>
        /// <returns></returns>
        [HttpGet("load")]
        public async Task<IActionResult> LoadIllustration([FromQuery] long illustrationId)
        {
            try
            {
                var canvasData = await _illustrationService.LoadIllustrationCanvas(illustrationId);
                if (canvasData == null)
                {
                    return NotFound(new { error = "Illustration not found or no canvasData available." });
                }
                return Ok(canvasData);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        [HttpPut("favorite")]
        public async Task<IActionResult> FavoritedIllustration([FromBody] IllustrationDto illustration)
        {
            try
            {
                var result = await _illustrationService.FavoritedIllustration(illustration);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        // DELETE api/<IllustrationController>/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteIllustration(long id)
        {
            try
            {
                var result = await _illustrationService.DeleteIllustration(id);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        [HttpPost("thumbnails/{illustrationUid}")]
        public async Task<IActionResult> UploadThumbnail(string illustrationUid, [FromForm] IFormFile thumbnail, [FromQuery] bool? isCustom = null)
        {
            try
            {
                var result = await _illustrationService.UploadThumbnail(illustrationUid, thumbnail, isCustom);
                return GenerateResponseActionResult(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        //[HttpGet("thumbnails/{illustrationUid}")]
        //public IActionResult GetThumbnailSas(string illustrationUid)
        //{
        //    try
        //    {
        //        var sasUrl = _illustrationService.GetThumbnailSasUrl(illustrationUid);
        //        return Ok(new { url = sasUrl });
        //    }
        //    catch (Exception ex)
        //    {
        //        return HandleErrorActionResult(ex);
        //    }
        //}

        //[HttpGet("thumbnails/{illustrationUid}")]
        //public async Task<IActionResult> GetThumbnail(string illustrationUid)
        //{
        //    try
        //    {
        //        var result = await _illustrationService.GetThumbnail(illustrationUid);
        //        if (result.ResultType == ResultType.Success)
        //        {
        //            return File(result.ResultObject, "image/png");
        //        }
        //        return GenerateResponseActionResult(result);
        //    }
        //    catch (Exception ex)
        //    {
        //        return HandleErrorActionResult(ex);
        //    }
        //}

        [HttpPost("duplicate/{id:long}")]
        public async Task<IActionResult> DuplicateIllustration(long id, [FromBody] DuplicateIllustrationRequestDto request)
        {
            try
            {
                var result = await _illustrationService.DuplicateIllustration(
                    id,
                    request?.Name,
                    request?.TeamId,
                    request?.CopyThumbnail ?? false
                );
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        [HttpPut("rename/{id:long}")]
        public async Task<IActionResult> RenameIllustration(long id, [FromBody] RenameIllustrationRequestDto request)
        {
            try
            {
                var result = await _illustrationService.RenameIllustration(id, request.NewName);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        // ──────────────────────────────────────────────────────────────
        //  V2 State Endpoints
        // ──────────────────────────────────────────────────────────────

        /// <summary>
        /// Saves the full illustration state (scene graph, animation config, layers, cels metadata).
        /// Replaces POST /api/illustration/save for v2 illustrations.
        /// </summary>
        [HttpPut("{id:long}/state")]
        public async Task<IActionResult> SaveIllustrationState(long id, [FromBody] IllustrationStateDto stateDto)
        {
            try
            {
                var result = await _illustrationService.SaveIllustrationState(id, stateDto);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        /// <summary>
        /// Returns just the savedAt timestamp for OPFS freshness comparison — much lighter than loading the full state.
        /// </summary>
        [HttpGet("{id:long}/state/savedAt")]
        public async Task<IActionResult> GetStateSavedAt(long id)
        {
            try
            {
                var savedAt = await _illustrationService.GetStateSavedAt(id);
                return Ok(new { savedAt = savedAt ?? 0 });
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        /// <summary>
        /// Loads the full illustration state with SAS URLs for pixel data.
        /// Replaces GET /api/illustration/load for v2 illustrations.
        /// </summary>
        [HttpGet("{id:long}/state")]
        public async Task<IActionResult> LoadIllustrationState(long id)
        {
            try
            {
                var result = await _illustrationService.LoadIllustrationState(id);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        /// <summary>
        /// Uploads pixel data for a specific animation cel.
        /// </summary>
        [HttpPut("{id:long}/cel/{celId}")]
        public async Task<IActionResult> UploadCelPixelData(long id, string celId, [FromForm] IFormFile pixelData, [FromQuery] int? width, [FromQuery] int? height, [FromQuery] string? format)
        {
            try
            {
                var result = await _illustrationService.UploadCelPixelData(id, celId, pixelData, width, height, format);
                return GenerateResponseActionResult(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        /// <summary>
        /// Uploads pixel data for a non-animated (static) layer.
        /// </summary>
        [HttpPut("{id:long}/layer/{layerId}")]
        public async Task<IActionResult> UploadLayerPixelData(long id, string layerId, [FromForm] IFormFile pixelData, [FromQuery] int? width, [FromQuery] int? height, [FromQuery] string? format)
        {
            try
            {
                var result = await _illustrationService.UploadLayerPixelData(id, layerId, pixelData, width, height, format);
                return GenerateResponseActionResult(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        /// <summary>
        /// Uploads gzip binary for a single 3D mesh. Called per dirty mesh instead of embedding base64 in the state DTO.
        /// </summary>
        [HttpPut("{id:long}/mesh/{meshId}")]
        public async Task<IActionResult> UploadMeshBlob(long id, string meshId, [FromForm] IFormFile meshData)
        {
            try
            {
                var result = await _illustrationService.UploadMeshBlob(id, meshId, meshData);
                return GenerateResponseActionResult(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        /// <summary>
        /// Uploads gzip binary for the texture library snapshot.
        /// </summary>
        [HttpPut("{id:long}/texture-library")]
        public async Task<IActionResult> UploadTextureLibraryBlob(long id, [FromForm] IFormFile texLibData)
        {
            try
            {
                var result = await _illustrationService.UploadTextureLibraryBlob(id, texLibData);
                return GenerateResponseActionResult(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        /// <summary>
        /// Returns fresh read SAS URLs for a set of mesh blob IDs. Used by the OPFS load path to get non-expired URLs.
        /// </summary>
        [HttpGet("{id:long}/mesh-read-urls")]
        public async Task<IActionResult> GetMeshReadUrls(long id, [FromQuery] string meshIds)
        {
            try
            {
                var ids = (meshIds ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries).ToList();
                var result = await _illustrationService.GetMeshReadUrls(id, ids);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        /// <summary>
        /// Deletes a specific cel and its pixel data from blob storage.
        /// </summary>
        [HttpDelete("{id:long}/cel/{celId}")]
        public async Task<IActionResult> DeleteCel(long id, string celId)
        {
            try
            {
                var result = await _illustrationService.DeleteCel(id, celId);
                return GenerateResponseActionResult(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        /// <summary>
        /// Returns existence and content hash for a batch of cel IDs (for delta save detection).
        /// </summary>
        [HttpPost("{id:long}/cel-status")]
        public async Task<IActionResult> GetCelStatus(long id, [FromBody] CelStatusRequestDto request)
        {
            try
            {
                var result = await _illustrationService.GetCelStatus(id, request.CelIds);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        /// <summary>
        /// Publishes the illustration as a public bundle. Accepts a multipart form with the packed .frogmarks file.
        /// </summary>
        [HttpPost("{id:long}/publish")]
        public async Task<IActionResult> PublishIllustration(long id, IFormFile bundle, [FromForm] string? publishedTitle = null)
        {
            try
            {
                var result = await _illustrationService.PublishIllustration(id, bundle, publishedTitle);
                return GenerateResponseActionResult(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        /// <summary>
        /// Unpublishes the illustration, making it private again.
        /// </summary>
        [HttpPost("{id:long}/unpublish")]
        public async Task<IActionResult> UnpublishIllustration(long id)
        {
            try
            {
                var result = await _illustrationService.UnpublishIllustration(id);
                return GenerateResponseActionResult(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        /// <summary>
        /// Returns the current user's storage usage and quota.
        /// </summary>
        [HttpGet("quota")]
        public async Task<IActionResult> GetStorageQuota()
        {
            try
            {
                var result = await _illustrationService.GetStorageQuota();
                return GenerateResponseActionResult(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        /// <summary>
        /// Returns metadata and a bundle URL for viewing a published illustration. No authentication required.
        /// Relative bundle URLs (local dev) are rewritten to an absolute API endpoint so the client can
        /// fetch them cross-origin without CORS issues.
        /// </summary>
        [AllowAnonymous]
        [HttpGet("view/{uid:guid}")]
        public async Task<IActionResult> GetPublicView(Guid uid)
        {
            try
            {
                var result = await _illustrationService.GetPublicView(uid);
                if (result.ResultType == ResultType.Success && result.ResultObject != null)
                {
                    var dto = result.ResultObject;
                    // If the blob provider returned a relative path (local dev), rewrite to the
                    // bundle-download API endpoint so the browser can fetch it cross-origin.
                    if (!string.IsNullOrEmpty(dto.BundleUrl) && dto.BundleUrl.StartsWith("/"))
                    {
                        dto.BundleUrl = $"{Request.Scheme}://{Request.Host}/api/illustration/view/{uid}/bundle";
                    }
                    return Ok(dto);
                }
                return GenerateResponseActionResult(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        /// <summary>
        /// Downloads the published bundle bytes for a public illustration. No authentication required.
        /// Used in local dev where blob storage URLs are not directly accessible from the client origin.
        /// </summary>
        [AllowAnonymous]
        [HttpGet("view/{uid:guid}/bundle")]
        public async Task<IActionResult> GetPublicViewBundle(Guid uid)
        {
            try
            {
                var result = await _illustrationService.DownloadPublicBundle(uid);
                if (result.ResultType == ResultType.Success && result.ResultObject != null)
                    return File(result.ResultObject, "application/octet-stream", "illustration.frogmarks");
                return NotFound();
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }
    }
}