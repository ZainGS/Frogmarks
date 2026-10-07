using AutoMapper;
using Duende.IdentityServer.Extensions;
using Frogmarks.Data;
using Frogmarks.Models;
using Frogmarks.Models.Illustration;
using Frogmarks.Models.Team;
using Frogmarks.Utilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using System.Collections.Generic;
using System.ComponentModel;
using System.Linq;
using System.Security.Claims;
using System.Text.Json;
using System.Threading.Tasks;
using static Microsoft.EntityFrameworkCore.DbLoggerCategory;
using Frogmarks.Models.Dtos;
using Frogmarks.Models.Dtos.Illustration;
using Frogmarks.Services.Interfaces;

namespace Frogmarks.Services
{
    public class IllustrationService : IIllustrationService
    {
        private readonly IApplicationDbContext _context;
        private readonly IMapper _mapper;
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly IBlobStorageProvider _blobStorage;
        private readonly string _containerName;
        private readonly string _celContainerName;
        private readonly string _scene3dContainerName;
        private readonly string _publishedContainerName;

        private readonly IResourceAccessService _access;

        public IllustrationService(IApplicationDbContext context, IMapper mapper, IHttpContextAccessor httpContextAccessor, IBlobStorageProvider blobStorage, IConfiguration configuration, IResourceAccessService access)
        {
            _access = access;
            _context = context;
            _mapper = mapper;
            _httpContextAccessor = httpContextAccessor;
            _blobStorage = blobStorage;
            _containerName          = configuration["BlobStorage:IllustrationThumbnailContainer"]  ?? "illustration-thumbnails-dev";
            _celContainerName       = configuration["BlobStorage:IllustrationCelContainer"]        ?? "illustration-cels-dev";
            _scene3dContainerName   = configuration["BlobStorage:IllustrationScene3dContainer"]    ?? "illustration-scene3d-dev";
            _publishedContainerName = configuration["BlobStorage:IllustrationPublishedContainer"]  ?? "illustration-published-dev";
        }

        public async Task<ResultModel<IEnumerable<Illustration>>> GetAllIllustrations()
        {
            try
            {
                var illustrations = await (await _access.AccessibleIllustrations(_context.Illustrations)).ToListAsync();   // was every illustration
                return new ResultModel<IEnumerable<Illustration>>(ResultType.Success, resultObject: illustrations);
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                throw;
            }
        }

        public async Task<ResultModel<IllustrationDto>> GetIllustrationById(long id)
        {
            if (!(await _access.CanAccessIllustrationAsync(id))) return new ResultModel<IllustrationDto>(ResultType.NotFound, "Not found.");   // owner / team / collaborator only (audit Phase 1.2)
            try
            {
                var illustration = await _context.Illustrations
                    .AsNoTracking()
                    .FirstOrDefaultAsync(x => x.Id == id);

                if (illustration == null)
                {
                    return new ResultModel<IllustrationDto>(ResultType.NotFound, "Illustration not found");
                }

                var userId = GetCurrentUserId();
                if (!string.IsNullOrEmpty(userId))
                {
                    // Fetch TeamUserIds in one query (add AsNoTracking for speed)
                    var teamUserIds = await _context.TeamUsers
                        .AsNoTracking()
                        .Where(tu => tu.ApplicationUserId == userId)
                        .Select(tu => tu.Id)
                        .ToListAsync();

                    if (teamUserIds.Count > 0)
                    {
                        // Fetch all existing logs in 1 query
                        var existingLogs = await _context.IllustrationViewLogs
                            .Where(ivl => ivl.IllustrationId == illustration.Id && teamUserIds.Contains(ivl.TeamUserId))
                            .ToDictionaryAsync(ivl => ivl.TeamUserId);

                        var now = DateTime.UtcNow;

                        foreach (var teamUserId in teamUserIds)
                        {
                            if (existingLogs.TryGetValue(teamUserId, out var log))
                            {
                                log.LastViewed = now;
                                _context.IllustrationViewLogs.Update(log);
                            }
                            else
                            {
                                _context.IllustrationViewLogs.Add(new IllustrationViewLog
                                {
                                    IllustrationId = illustration.Id,
                                    TeamUserId = teamUserId,
                                    LastViewed = now
                                });
                            }
                        }

                        await _context.SaveChangesAsync();
                    }
                }

                return new ResultModel<IllustrationDto>(ResultType.Success, resultObject: _mapper.Map<IllustrationDto>(illustration));
            }
            catch (Exception ex)
            {
                // Optional: log the error here
                throw;
            }
        }

        public async Task<ResultModel<IllustrationDto>> GetIllustrationByUid(Guid uid)
        {
            if (!(await _access.CanAccessIllustrationAsync(uid))) return new ResultModel<IllustrationDto>(ResultType.NotFound, "Not found.");   // owner / team / collaborator only (audit Phase 1.2)
            try
            {
                var dto = await _context.Illustrations.AsNoTracking()
                    .Where(i => i.UUID == uid)
                    .Select(i => new IllustrationDto
                    {
                        Id = i.Id,
                        UUID = i.UUID,
                        Name = i.Name,
                        Description = i.Description,
                        ThumbnailUrl = i.ThumbnailUrl,
                        IsCustomThumbnail = i.IsCustomThumbnail,
                        TeamId = i.TeamId,
                        IsDraft = i.isDraft,
                        IsFavorite = false,
                        IsArchived = i.IsArchived,
                        Width = i.Width,
                        Height = i.Height,
                    })
                    .FirstOrDefaultAsync();

                if (dto == null)
                    return new ResultModel<IllustrationDto>(ResultType.NotFound, "Illustration not found");

                return new ResultModel<IllustrationDto>(ResultType.Success, resultObject: dto);
            }
            catch (Exception ex)
            {
                throw;
            }
        }

        private string? GetCurrentUserId()
        {
            return _httpContextAccessor.HttpContext?.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        }

        private async Task<ApplicationUser?> GetCurrentUserAsync()
        {
            var id = GetCurrentUserId();
            return id == null ? null : await _context.ApplicationUsers.FindAsync(id);
        }

        /// Increments BlobStorageBytes by <paramref name="delta"/>.
        /// Returns false if the increment would exceed the user's quota.
        /// <summary>Whose storage quota an illustration's blobs count against: its creator (owner); the caller for old rows
        /// without one. Uploads by team members / collaborators used to be charged (and deletes credited) to the caller.</summary>
        private async Task<string?> GetStorageOwnerIdAsync(long illustrationId)
        {
            var ownerId = await _context.Illustrations.AsNoTracking().Where(i => i.Id == illustrationId).Select(i => i.CreatedById).FirstOrDefaultAsync();
            return ownerId ?? GetCurrentUserId();
        }

        private async Task<bool> TryIncrementStorageAsync(string userId, long delta, bool isUserPro)
        {
            if (delta <= 0) return true;
            var quota = isUserPro ? StorageQuotas.ProBytes : StorageQuotas.FreeBytes;
            var user = await _context.ApplicationUsers.FindAsync(userId);
            if (user == null) return false;
            if (user.BlobStorageBytes + delta > quota) return false;
            user.BlobStorageBytes += delta;
            await _context.SaveChangesAsync();
            return true;
        }

        private async Task DecrementStorageAsync(string userId, long bytes)
        {
            if (bytes <= 0) return;
            var user = await _context.ApplicationUsers.FindAsync(userId);
            if (user == null) return;
            user.BlobStorageBytes = Math.Max(0, user.BlobStorageBytes - bytes);
            await _context.SaveChangesAsync();
        }

        public async Task<ResultModel<StorageQuotaDto>> GetStorageQuota()
        {
            var user = await GetCurrentUserAsync();
            if (user == null) return new ResultModel<StorageQuotaDto>(ResultType.Unauthorized, "User not found");
            return new ResultModel<StorageQuotaDto>(ResultType.Success, resultObject: new StorageQuotaDto
            {
                UsedBytes  = user.BlobStorageBytes,
                QuotaBytes = user.StorageQuotaBytes,
                IsPro      = user.IsPro,
            });
        }

        public async Task<ResultModel<Illustration>> CreateIllustration(IllustrationDto illustrationDto)
        {
            try
            {
                var newIllustration = _mapper.Map<Illustration>(illustrationDto);
                newIllustration.UUID = Guid.NewGuid();

                // Add the new illustration to the context
                _context.Illustrations.Add(newIllustration);
                await _context.SaveChangesAsync();

                return new ResultModel<Illustration>(ResultType.Success, resultObject: newIllustration);
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                return new ResultModel<Illustration>(ResultType.Failure, ex.Message);
            }
        }

        public async Task<ResultModel<Illustration>> UpdateIllustration(IllustrationDto illustrationDto)
        {
            if (!(await _access.CanAccessIllustrationAsync(illustrationDto.Id))) return new ResultModel<Illustration>(ResultType.NotFound, "Not found.");   // owner / team / collaborator only (audit Phase 1.2)
            try
            {
                var existingIllustration = await _context.Illustrations.FindAsync(illustrationDto.Id);
                if (existingIllustration == null)
                {
                    return new ResultModel<Illustration>(ResultType.NotFound, "Illustration not found");
                }

                // Map the changes from illustrationDto to the existingIllustration
                // Ownership / sharing fields are not editable through this endpoint (audit Phase 1.2: mass assignment)
                var keepTeamId = existingIllustration.TeamId;
                var keepPermissionsId = existingIllustration.PermissionsId;
                var keepIsPublic = existingIllustration.IsPublic;
                _mapper.Map(illustrationDto, existingIllustration);
                existingIllustration.TeamId = keepTeamId;
                existingIllustration.PermissionsId = keepPermissionsId;
                existingIllustration.IsPublic = keepIsPublic;
                await _context.SaveChangesAsync();


                return new ResultModel<Illustration>(ResultType.Success, resultObject: existingIllustration);
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                throw;
            }
        }

        public async Task<ResultModel<string>> SaveIllustrationCanvas(long illustrationId, string canvasData)
        {
            if (!(await _access.CanAccessIllustrationAsync(illustrationId))) return new ResultModel<string>(ResultType.NotFound, "Not found.");   // owner / team / collaborator only (audit Phase 1.2)
            var illustration = await _context.Illustrations.FirstOrDefaultAsync(i => i.Id == illustrationId);
            if (illustration == null) return new ResultModel<string>(ResultType.NotFound, "Illustration not found.");

            illustration.CanvasData = canvasData;
            illustration.DateModified = DateTime.UtcNow;

            await _context.SaveChangesAsync();
            return new ResultModel<string>(ResultType.Success, "Illustration saved.");
        }

        public async Task<ResultModel<string>> LoadIllustrationCanvas(long illustrationId)
        {
            if (!(await _access.CanAccessIllustrationAsync(illustrationId))) return new ResultModel<string>(ResultType.NotFound, "Not found.");   // owner / team / collaborator only (audit Phase 1.2)
            var illustration = await _context.Illustrations
                .Where(i => i.Id == illustrationId)
                .Select(i => i.CanvasData)
                .FirstOrDefaultAsync();

            if (illustration == null) return new ResultModel<string>(ResultType.NotFound, "Illustration not found.");

            return new ResultModel<string>(ResultType.Success, illustration);
        }

        public async Task<ResultModel<Illustration>> FavoritedIllustration(IllustrationDto illustrationDto)
        {
            if (!(await _access.CanAccessIllustrationAsync(illustrationDto.Id))) return new ResultModel<Illustration>(ResultType.NotFound, "Not found.");   // owner / team / collaborator only (audit Phase 1.2)
            try
            {
                var existingIllustration = await _context.Illustrations.FindAsync(illustrationDto.Id);
                if (existingIllustration == null)
                {
                    return new ResultModel<Illustration>(ResultType.NotFound, "Illustration not found");
                }

                // Map the changes from illustrationDto to the existingIllustration
                // Ownership / sharing fields are not editable through this endpoint (audit Phase 1.2: mass assignment)
                var keepTeamId = existingIllustration.TeamId;
                var keepPermissionsId = existingIllustration.PermissionsId;
                var keepIsPublic = existingIllustration.IsPublic;
                _mapper.Map(illustrationDto, existingIllustration);
                existingIllustration.TeamId = keepTeamId;
                existingIllustration.PermissionsId = keepPermissionsId;
                existingIllustration.IsPublic = keepIsPublic;

                var userId = GetCurrentUserId();

                // One membership per team: SingleOrDefault threw as soon as the user was in two teams (audit Phase 2.5).
                // Favorite on the membership of the team the client is showing, else the item's team, else any.
                var memberships = await _context.TeamUsers.Where(tu => tu.ApplicationUserId == userId).ToListAsync();
                var teamUser = memberships.FirstOrDefault(tu => tu.TeamId == illustrationDto.TeamId)
                    ?? memberships.FirstOrDefault(tu => tu.TeamId == existingIllustration.TeamId)
                    ?? memberships.FirstOrDefault();

                if (illustrationDto.IsFavorite)
                {
                    if (teamUser != null && !teamUser.FavoriteIllustrations.Contains(existingIllustration))
                    {
                        teamUser.FavoriteIllustrations.Add(existingIllustration);
                    }
                }
                else
                {
                    teamUser?.FavoriteIllustrations.Remove(existingIllustration);
                }

                await _context.SaveChangesAsync();

                return new ResultModel<Illustration>(ResultType.Success, resultObject: existingIllustration);
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                return new ResultModel<Illustration>(ResultType.Failure, ex.Message);
            }
        }

        public async Task<ResultModel<Illustration>> DeleteIllustration(long id)
        {
            if (!(await _access.CanAccessIllustrationAsync(id))) return new ResultModel<Illustration>(ResultType.NotFound, "Not found.");   // owner / team / collaborator only (audit Phase 1.2)
            try
            {
                var illustration = await _context.Illustrations
                    .Include(i => i.Layers).ThenInclude(l => l.Cels)
                    .FirstOrDefaultAsync(i => i.Id == id);

                if (illustration == null)
                    return new ResultModel<Illustration>(ResultType.NotFound, "Illustration not found");

                var userId = await GetStorageOwnerIdAsync(id);   // quota belongs to the owner, not the uploader (audit Phase 1.10)

                // Delete layer and cel blobs, accumulate freed bytes
                long freedBytes = 0;
                foreach (var layer in illustration.Layers)
                {
                    if (!string.IsNullOrEmpty(layer.PixelDataUrl))
                        await TryDeleteBlobAsync(_celContainerName, $"{id}/{layer.LayerId}.{layer.PixelFormat ?? "webp"}");
                    freedBytes += layer.BlobSizeBytes;

                    foreach (var cel in layer.Cels)
                    {
                        await TryDeleteBlobAsync(_celContainerName, $"{id}/{cel.CelId}.{cel.PixelFormat ?? "webp"}");
                        freedBytes += cel.BlobSizeBytes;
                    }
                }

                // Delete fixed-name blobs (thumbnail, scene3d)
                if (illustration.UUID != Guid.Empty)
                    await TryDeleteBlobAsync(_containerName, $"{illustration.UUID}.png");
                await TryDeleteBlobAsync(_scene3dContainerName, $"{id}/scene3d-nodes.gz");
                await TryDeleteBlobAsync(_scene3dContainerName, $"{id}/texture-library.gz");

                _context.Illustrations.Remove(illustration);
                await _context.SaveChangesAsync();

                if (userId != null && freedBytes > 0)
                    await DecrementStorageAsync(userId, freedBytes);

                return new ResultModel<Illustration>(ResultType.Success, resultObject: illustration);
            }
            catch (Exception ex)
            {
                throw;
            }
        }

        public async Task<ResultModel<IEnumerable<IllustrationDto>>> SearchIllustrations(
            string name, long teamId, bool favorites, string sortBy, string sortDirection,
            int pageIndex, int pageSize, HashSet<long> cachedThumbnailIllustrationIds, bool isArchived)
        {
            try
            {
                var userId = GetCurrentUserId();
                if (string.IsNullOrEmpty(userId))
                {
                    return new ResultModel<IEnumerable<IllustrationDto>>(ResultType.Unauthorized, "User not found");
                }

                var query = (await _access.AccessibleIllustrations(_context.Illustrations.AsNoTracking()))   // was everyone's illustrations
                    .Where(i => teamId <= 0 || i.TeamId == teamId);

                query = query.Where(i => i.IsArchived == isArchived);

                if (favorites)
                {
                    query = query.Where(i =>
                        _context.TeamUsers
                            .Where(tu => tu.ApplicationUserId == userId)
                            .SelectMany(tu => tu.FavoriteIllustrations)
                            .Select(fi => fi.Id)
                            .Contains(i.Id));
                }

                if (!string.IsNullOrEmpty(name))
                {
                    query = query.Where(i => i.Name.StartsWith(name));
                }

                query = sortBy.ToLower() switch
                {
                    "alphabetical" => sortDirection.ToLower() == "desc"
                        ? query.OrderByDescending(i => i.Name)
                        : query.OrderBy(i => i.Name),
                    _ => sortDirection.ToLower() == "desc"
                        ? query.OrderByDescending(i => i.Created)
                        : query.OrderBy(i => i.Created)
                };

                // Step 1: Fetch minimal illustration data
                var illustrationDtos = await query
                    .Skip(pageIndex * pageSize)
                    .Take(pageSize)
                    .Select(i => new IllustrationDto
                    {
                        Id = i.Id,
                        UUID = i.UUID,
                        Name = i.Name,
                        IsArchived = i.IsArchived,
                        Created = i.Created,
                        DateModified = i.DateModified,
                        IsCustomThumbnail = i.IsCustomThumbnail
                    })
                    .ToListAsync();

                // Step 2: Append thumbnails only for non-cached illustrations
                var uncachedIllustrations = illustrationDtos
                    .Where(dto => !cachedThumbnailIllustrationIds.Contains(dto.Id))
                    .ToList();

                var thumbnailTasks = uncachedIllustrations.ToDictionary(
                    dto => dto.Id,
                    dto => GetThumbnailSasUrl(new Illustration { Id = dto.Id, UUID = dto.UUID })
                );

                var thumbnailResults = await Task.WhenAll(thumbnailTasks.Values);
                var thumbnailLookup = thumbnailTasks.Keys.Zip(thumbnailResults, (id, url) => new { id, url })
                                                         .ToDictionary(x => x.id, x => x.url);

                foreach (var dto in illustrationDtos)
                {
                    dto.ThumbnailUrl = thumbnailLookup.TryGetValue(dto.Id, out var url) ? url : string.Empty;
                }

                // Step 3: Append favorites if applicable
                if (favorites)
                {
                    var favoriteIds = await _context.TeamUsers
                        .Where(tu => tu.ApplicationUserId == userId)
                        .SelectMany(tu => tu.FavoriteIllustrations)
                        .Select(fi => fi.Id)
                        .ToListAsync();

                    var favoriteSet = new HashSet<long>(favoriteIds);
                    foreach (var dto in illustrationDtos)
                    {
                        dto.IsFavorite = favoriteSet.Contains(dto.Id);
                    }
                }

                return new ResultModel<IEnumerable<IllustrationDto>>(ResultType.Success, "Success", illustrationDtos);
            }
            catch (Exception ex)
            {
                return new ResultModel<IEnumerable<IllustrationDto>>(ResultType.Failure, ex.Message);
            }
        }

        public async Task<ResultModel<IEnumerable<IllustrationDto>>> GetIllustrationsSortedByLastViewed(long teamId, string sortDirection, int pageIndex, int pageSize)
        {
            try
            {
                var userId = GetCurrentUserId();

                if (string.IsNullOrEmpty(userId))
                {
                    return new ResultModel<IEnumerable<IllustrationDto>>(ResultType.Unauthorized, "User not found");
                }

                var illustrationViewLogs = _context.IllustrationViewLogs
                    .Where(ivl => ivl.ApplicationUserId == userId)
                    .Select(ivl => new { ivl.IllustrationId, ivl.LastViewed });

                IQueryable<IllustrationWithLastViewed> query;

                if (teamId != 0)
                {
                    query = from illustration in _context.Illustrations
                            join ivl in illustrationViewLogs on illustration.Id equals ivl.IllustrationId into ivlGroup
                            from ivl in ivlGroup.DefaultIfEmpty()
                            where illustration.Team != null && illustration.Team.Id == teamId
                            select new IllustrationWithLastViewed
                            {
                                Illustration = illustration,
                                LastViewed = ivl.LastViewed
                            };
                }
                else
                {
                    query = from illustration in _context.Illustrations
                            join ivl in illustrationViewLogs on illustration.Id equals ivl.IllustrationId into ivlGroup
                            from ivl in ivlGroup.DefaultIfEmpty()
                            select new IllustrationWithLastViewed
                            {
                                Illustration = illustration,
                                LastViewed = ivl.LastViewed
                            };
                }

                IQueryable<Illustration> sortedQuery;
                if (sortDirection == "asc")
                {
                    sortedQuery = query.OrderBy(i => i.LastViewed).Select(i => i.Illustration);
                }
                else
                {
                    sortedQuery = query.OrderByDescending(i => i.LastViewed).Select(i => i.Illustration);
                }

                var result = await sortedQuery.Skip(pageIndex * pageSize).Take(pageSize)
                    .Select(i => new IllustrationDto
                    {
                        UUID = i.UUID,
                        Name = i.Name,
                        Description = i.Description,
                        ThumbnailUrl = i.ThumbnailUrl,
                        IsCustomThumbnail = i.IsCustomThumbnail,
                        Width = i.Width,
                        Height = i.Height,
                        Collaborators = i.Collaborators.Select(c => new IllustrationCollaboratorDto
                        {
                            Id = c.Id,
                            TeamUserId = c.TeamUserId,
                            TeamUser = new TeamUserDto
                            {
                                Id = c.TeamUser.Id,
                                TeamId = c.TeamUser.TeamId,
                                ApplicationUserId = c.TeamUser.ApplicationUserId
                            },
                            IllustrationRoles = c.IllustrationRoles.Select(r => new IllustrationRole
                            {
                                Id = r.Id,
                                RoleName = r.RoleName
                            }).ToList()
                        }).ToList(),
                        Team = i.Team == null ? null : new TeamDto
                        {
                            Name = i.Team.Name,
                            Description = i.Team.Description
                        },
                        PreferencesId = i.PreferencesId,
                        Preferences = i.Preferences,
                        ProjectId = i.ProjectId,
                        Project = i.Project,
                        PermissionsId = i.PermissionsId,
                        Permissions = i.Permissions,
                        LastViewed = _context.IllustrationViewLogs.Where(log => log.ApplicationUserId == userId && log.IllustrationId == i.Id).Select(x => x.LastViewed).SingleOrDefault()
                    }).ToListAsync();

                return new ResultModel<IEnumerable<IllustrationDto>>(ResultType.Success, resultObject: result);
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                return new ResultModel<IEnumerable<IllustrationDto>>(ResultType.Failure, ex.Message);
            }
        }

        public async Task<ResultModel<string>> UploadThumbnail(string illustrationUid, IFormFile thumbnail, bool? isCustom = null)
        {
            if (!(Guid.TryParse(illustrationUid, out var illustrationGuid) && await _access.CanAccessIllustrationAsync(illustrationGuid))) return new ResultModel<string>(ResultType.NotFound, "Not found.");   // owner / team / collaborator only (audit Phase 1.2)
            try
            {
                if (!BlobNames.IsSafeSegment(illustrationUid))
                    return new ResultModel<string>(ResultType.BadRequest, "Invalid id.");
                if (thumbnail == null || thumbnail.Length == 0)
                    return new ResultModel<string>(ResultType.Failure, "Invalid file upload.");

                var blobName = $"{illustrationUid}.png";
                using (var stream = thumbnail.OpenReadStream())
                {
                    await _blobStorage.UploadAsync(_containerName, blobName, stream, overwrite: true);
                }

                if (isCustom.HasValue && Guid.TryParse(illustrationUid, out var uuid))
                {
                    var illustration = await _context.Illustrations.FirstOrDefaultAsync(i => i.UUID == uuid);
                    if (illustration != null)
                    {
                        illustration.IsCustomThumbnail = isCustom.Value;
                        illustration.DateModified = DateTime.UtcNow;
                        await _context.SaveChangesAsync();
                    }
                }

                var url = await _blobStorage.GetReadUrlAsync(_containerName, blobName);
                return new ResultModel<string>(ResultType.Success, url);
            }
            catch (Exception ex)
            {
                return new ResultModel<string>(ResultType.Failure, ex.Message);
            }
        }

        public async Task<string> GetThumbnailSasUrl(Illustration illustration)
        {
            try
            {
                return await _blobStorage.GetReadUrlAsync(_containerName, $"{illustration.UUID}.png");
            }
            catch
            {
                return "";
            }
        }

        public async Task<ResultModel<IllustrationDto>> DuplicateIllustration(
            long sourceIllustrationId,
            string? nameOverride,
            long? targetTeamId,
            bool copyThumbnail)
        {
            if (!(await _access.CanAccessIllustrationAsync(sourceIllustrationId) && (targetTeamId == null || await _access.IsMemberOfTeamAsync(targetTeamId.Value)))) return new ResultModel<IllustrationDto>(ResultType.NotFound, "Not found.");   // owner / team / collaborator only (audit Phase 1.2)
            var source = await _context.Illustrations
                .Include(i => i.Layers)
                    .ThenInclude(l => l.Cels)
                .FirstOrDefaultAsync(i => i.Id == sourceIllustrationId);

            if (source == null)
                return new ResultModel<IllustrationDto>(ResultType.NotFound, "Source illustration not found.");

            // The copy carries EVERYTHING the server stores for the source — what SaveIllustrationState and the blob
            // uploads write: the extended state (canvas settings, dither, document size, 3D global settings, the mesh
            // list, groups / frame-link buckets / packaging), the per-mesh + texture-library blobs, the layers with
            // their dither / frame-link JSON, the cels and every pixel blob. It used to copy the raster layers only
            // (mobile-parity 7.2). (The vector-shape scene graph is not stored server-side at all, so it can't be.)
            ExtendedState? ext = null;
            if (!string.IsNullOrEmpty(source.ExtendedStateJson))
                try { ext = JsonSerializer.Deserialize<ExtendedState>(source.ExtendedStateJson); } catch { }

            // Quota: the copy's blobs count against the duplicating user's storage, like uploading the same bytes (the
            // copy also records their sizes, so deleting it later credits them back). Charged up front from the
            // source's recorded sizes; whatever fails to copy is refunded at the end.
            var userId = GetCurrentUserId();
            var user = userId != null ? await _context.ApplicationUsers.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId) : null;
            long recordedBytes = source.Layers.Sum(l => l.BlobSizeBytes + l.Cels.Sum(c => c.BlobSizeBytes))
                + (ext?.MeshBlobSizes?.Values.Sum() ?? 0) + (ext?.TexLibBlobSize ?? 0);
            long chargedBytes = 0, copiedBytes = 0;
            if (user != null && recordedBytes > 0)
            {
                if (!await TryIncrementStorageAsync(userId!, recordedBytes, user.IsPro))
                    return new ResultModel<IllustrationDto>(ResultType.Failure, "Storage quota exceeded.");
                chargedBytes = recordedBytes;
            }

            var teamId = targetTeamId ?? source.TeamId;
            var newIllustration = new Illustration
            {
                UUID = Guid.NewGuid(),
                Name = string.IsNullOrWhiteSpace(nameOverride) ? $"Copy of {source.Name}" : nameOverride,
                Description = source.Description,
                TeamId = teamId,
                ProjectId = teamId == source.TeamId ? source.ProjectId : null,   // a project belongs to its team
                isDraft = source.isDraft,
                // copy canvas data & look preferences
                CanvasData = source.CanvasData,
                Width = source.Width,
                Height = source.Height,
                PreferencesId = source.PreferencesId, // or deep copy Preferences entity if needed
                PermissionsId = source.PermissionsId, // ditto if you want a separate permissions row
                Created = DateTime.UtcNow,
                DateModified = DateTime.UtcNow,
                IsArchived = false,
                // Only with the thumbnail: a "custom" flag without one stops the editor making an automatic thumbnail
                IsCustomThumbnail = copyThumbnail && source.IsCustomThumbnail,
                // V2 fields
                SceneVersion = source.SceneVersion,
                SavedAt = source.SavedAt,
                SyncMode = source.SyncMode,
                AnimationEnabled = source.AnimationEnabled,
                FrameCount = source.FrameCount,
                Fps = source.Fps,
                LoopMode = source.LoopMode,
                PlayRangeStart = source.PlayRangeStart,
                PlayRangeEnd = source.PlayRangeEnd,
                OnionSkinConfig = source.OnionSkinConfig
            };

            _context.Illustrations.Add(newIllustration);
            await _context.SaveChangesAsync();

            // 3D scene: the per-mesh blobs (+ their recorded sizes), the texture library, the legacy whole-scene blob
            if (ext != null)
            {
                var meshIds = new HashSet<string>(ext.MeshIds ?? new List<string>());
                if (ext.MeshBlobSizes != null) meshIds.UnionWith(ext.MeshBlobSizes.Keys);
                var sizes = new Dictionary<string, long>();
                foreach (var meshId in meshIds)
                {
                    if (!BlobNames.IsSafeSegment(meshId)) continue;
                    if (!await TryCopyBlobAsync(_scene3dContainerName, $"{source.Id}/mesh/{meshId}.gz", $"{newIllustration.Id}/mesh/{meshId}.gz")) continue;
                    var size = ext.MeshBlobSizes?.GetValueOrDefault(meshId, 0L) ?? 0L;
                    if (ext.MeshBlobSizes?.ContainsKey(meshId) == true) sizes[meshId] = size;
                    copiedBytes += size;
                }
                ext.MeshBlobSizes = sizes.Count > 0 ? sizes : null;
            }
            var texLibCopied = await TryCopyBlobAsync(_scene3dContainerName, $"{source.Id}/texture-library.gz", $"{newIllustration.Id}/texture-library.gz");
            await TryCopyBlobAsync(_scene3dContainerName, $"{source.Id}/scene3d-nodes.gz", $"{newIllustration.Id}/scene3d-nodes.gz");
            if (ext != null)
            {
                if (texLibCopied) copiedBytes += ext.TexLibBlobSize; else ext.TexLibBlobSize = 0;
                ext.Revision = 0;   // a new record: its own optimistic-concurrency counter
                newIllustration.ExtendedStateJson = JsonSerializer.Serialize(ext);
                await _context.SaveChangesAsync();
            }

            // Copy layers, cels, and pixel data blobs
            if (source.Layers.Count > 0)
            {
                foreach (var srcLayer in source.Layers)
                {
                    var newLayer = new IllustrationLayer
                    {
                        IllustrationId = newIllustration.Id,
                        LayerId = srcLayer.LayerId,
                        Name = srcLayer.Name,
                        SortOrder = srcLayer.SortOrder,
                        Visible = srcLayer.Visible,
                        Locked = srcLayer.Locked,
                        BlendMode = srcLayer.BlendMode,
                        Opacity = srcLayer.Opacity,
                        Clipped = srcLayer.Clipped,
                        LockTransparency = srcLayer.LockTransparency,
                        Animated = srcLayer.Animated,
                        PixelWidth = srcLayer.PixelWidth,
                        PixelHeight = srcLayer.PixelHeight,
                        PixelFormat = srcLayer.PixelFormat,
                        DitherConfigJson = srcLayer.DitherConfigJson,
                        FrameLinkAnimationJson = srcLayer.FrameLinkAnimationJson,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    };

                    // Copy static layer pixel data blob
                    if (!srcLayer.Animated && !string.IsNullOrEmpty(srcLayer.PixelDataUrl))
                    {
                        var fmt = srcLayer.PixelFormat ?? "webp";
                        var dstBlobName = $"{newIllustration.Id}/{srcLayer.LayerId}.{fmt}";
                        if (await TryCopyBlobAsync(_celContainerName, $"{source.Id}/{srcLayer.LayerId}.{fmt}", dstBlobName))
                        {
                            newLayer.BlobSizeBytes = srcLayer.BlobSizeBytes;
                            copiedBytes += srcLayer.BlobSizeBytes;
                            try { newLayer.PixelDataUrl = await _blobStorage.GetReadUrlAsync(_celContainerName, dstBlobName); }
                            catch { /* the load path regenerates the read URL */ }
                        }
                    }

                    _context.IllustrationLayers.Add(newLayer);
                    await _context.SaveChangesAsync(); // Save to get newLayer.Id for cel FK

                    foreach (var srcCel in srcLayer.Cels)
                    {
                        var newCel = new IllustrationCel
                        {
                            LayerDbId = newLayer.Id,
                            CelId = srcCel.CelId,
                            Frame = srcCel.Frame,
                            Duration = srcCel.Duration,
                            IsKey = srcCel.IsKey,
                            CelType = srcCel.CelType,
                            PixelWidth = srcCel.PixelWidth,
                            PixelHeight = srcCel.PixelHeight,
                            PixelFormat = srcCel.PixelFormat,
                            ContentHash = srcCel.ContentHash,
                            CreatedAt = DateTime.UtcNow,
                            UpdatedAt = DateTime.UtcNow
                        };

                        // Copy cel pixel data blob
                        if (!string.IsNullOrEmpty(srcCel.PixelDataUrl))
                        {
                            var fmt = srcCel.PixelFormat ?? "webp";
                            var dstBlobName = $"{newIllustration.Id}/{srcCel.CelId}.{fmt}";
                            if (await TryCopyBlobAsync(_celContainerName, $"{source.Id}/{srcCel.CelId}.{fmt}", dstBlobName))
                            {
                                newCel.BlobSizeBytes = srcCel.BlobSizeBytes;
                                copiedBytes += srcCel.BlobSizeBytes;
                                try { newCel.PixelDataUrl = await _blobStorage.GetReadUrlAsync(_celContainerName, dstBlobName); }
                                catch { /* the load path regenerates the read URL */ }
                            }
                        }

                        _context.IllustrationCels.Add(newCel);
                    }

                    await _context.SaveChangesAsync();
                }
            }

            if (copyThumbnail)
            {
                try
                {
                    var srcBlobName = $"{source.UUID}.png";
                    var dstBlobName = $"{newIllustration.UUID}.png";

                    if (await _blobStorage.ExistsAsync(_containerName, srcBlobName))
                    {
                        var data = await _blobStorage.DownloadAsync(_containerName, srcBlobName);
                        using var ms = new MemoryStream(data);
                        await _blobStorage.UploadAsync(_containerName, dstBlobName, ms, overwrite: true);
                    }
                }
                catch
                {
                    // swallow or log; thumbnail can be regenerated later by frontend
                }
            }

            // Refund the recorded bytes of blobs that didn't copy (missing at the source, or a failed copy)
            if (chargedBytes > copiedBytes)
                await DecrementStorageAsync(userId!, chargedBytes - copiedBytes);

            var dto = _mapper.Map<IllustrationDto>(newIllustration);
            dto.ThumbnailUrl = await GetThumbnailSasUrl(newIllustration);
            return new ResultModel<IllustrationDto>(ResultType.Success, resultObject: dto);
        }

        public async Task<ResultModel<IllustrationDto>> RenameIllustration(long illustrationId, string newName)
        {
            if (!(await _access.CanAccessIllustrationAsync(illustrationId))) return new ResultModel<IllustrationDto>(ResultType.NotFound, "Not found.");   // owner / team / collaborator only (audit Phase 1.2)
            var illustration = await _context.Illustrations.FindAsync(illustrationId);
            if (illustration == null)
                return new ResultModel<IllustrationDto>(ResultType.NotFound, "Illustration not found");

            if (string.IsNullOrWhiteSpace(newName))
                return new ResultModel<IllustrationDto>(ResultType.Failure, "New name cannot be empty.");

            illustration.Name = newName.Trim();
            illustration.DateModified = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            var dto = _mapper.Map<IllustrationDto>(illustration);
            return new ResultModel<IllustrationDto>(ResultType.Success, resultObject: dto);
        }

        // ──────────────────────────────────────────────────────────────
        //  V2 State Endpoints
        // ──────────────────────────────────────────────────────────────

        public async Task<ResultModel<IllustrationStateDto>> SaveIllustrationState(long illustrationId, IllustrationStateDto stateDto)
        {
            if (!(await _access.CanAccessIllustrationAsync(illustrationId))) return new ResultModel<IllustrationStateDto>(ResultType.NotFound, "Not found.");   // owner / team / collaborator only (audit Phase 1.2)
            try
            {
                var illustration = await _context.Illustrations
                    .Include(i => i.Layers)
                        .ThenInclude(l => l.Cels)
                    .FirstOrDefaultAsync(i => i.Id == illustrationId);

                if (illustration == null)
                    return new ResultModel<IllustrationStateDto>(ResultType.NotFound, "Illustration not found.");

                // Optimistic concurrency (audit Phase 2.5): the save deletes layers / cels missing from the payload, so a
                // stale tab used to silently wipe newer work. The revision lives in ExtendedStateJson (no migration).
                long currentRevision = 0;
                if (!string.IsNullOrEmpty(illustration.ExtendedStateJson))
                    try { currentRevision = JsonSerializer.Deserialize<ExtendedState>(illustration.ExtendedStateJson)?.Revision ?? 0; } catch { }
                if (stateDto.BaseRevision.HasValue && stateDto.BaseRevision.Value != currentRevision)
                    return new ResultModel<IllustrationStateDto>(ResultType.AlreadyExist,
                        "This illustration was saved from another tab or device since it was loaded here.",
                        new IllustrationStateDto { Revision = currentRevision });

                // Update illustration-level fields
                illustration.SceneVersion = stateDto.Version;
                illustration.SavedAt = stateDto.SavedAt > 0 ? stateDto.SavedAt : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                if (stateDto.Animation != null)
                {
                    illustration.AnimationEnabled = stateDto.Animation.Enabled;
                    illustration.FrameCount = stateDto.Animation.FrameCount;
                    illustration.Fps = stateDto.Animation.Fps;
                    illustration.LoopMode = stateDto.Animation.LoopMode;
                    illustration.PlayRangeStart = stateDto.Animation.PlayRangeStart;
                    illustration.PlayRangeEnd = stateDto.Animation.PlayRangeEnd;
                    illustration.OnionSkinConfig = stateDto.Animation.OnionSkin != null
                        ? JsonSerializer.Serialize(stateDto.Animation.OnionSkin)
                        : null;
                }
                else
                {
                    illustration.AnimationEnabled = false;
                    illustration.OnionSkinConfig = null;
                }

                // Legacy: old clients send base64 blobs in the DTO; upload them if present.
                // New clients upload mesh blobs separately via PUT /mesh/{meshId} before calling this.
                if (!string.IsNullOrEmpty(stateDto.Scene3dNodesGzip))
                    await UploadBase64BlobAsync(_scene3dContainerName, $"{illustrationId}/scene3d-nodes.gz", stateDto.Scene3dNodesGzip);
                if (!string.IsNullOrEmpty(stateDto.TextureLibrary3dGzip))
                    await UploadBase64BlobAsync(_scene3dContainerName, $"{illustrationId}/texture-library.gz", stateDto.TextureLibrary3dGzip);

                // Store extended state — MeshIds tells the load path which per-mesh blobs to fetch
                // Preserve blob size tracking fields so upload endpoints can compute deltas
                ExtendedState? prevExt = null;
                if (!string.IsNullOrEmpty(illustration.ExtendedStateJson))
                    try { prevExt = JsonSerializer.Deserialize<ExtendedState>(illustration.ExtendedStateJson); } catch { }

                var extended = new ExtendedState
                {
                    DitherConfig = stateDto.DitherConfig,
                    DocumentSize = stateDto.DocumentSize,
                    BgColor = stateDto.BgColor,
                    DotColor = stateDto.DotColor,
                    PaperGrain = stateDto.PaperGrain,
                    Scene3dGlobalSettings = stateDto.Scene3dGlobalSettings,
                    ExtraFields = stateDto.ExtraFields,
                    MeshIds = stateDto.MeshIds,
                    MeshBlobSizes = prevExt?.MeshBlobSizes,
                    TexLibBlobSize = prevExt?.TexLibBlobSize ?? 0,
                    Revision = currentRevision + 1,
                };
                illustration.ExtendedStateJson = JsonSerializer.Serialize(extended);

                illustration.DateModified = DateTime.UtcNow;

                // Build lookup of existing layers by LayerId
                var existingLayers = illustration.Layers.ToDictionary(l => l.LayerId);
                var incomingLayerIds = new HashSet<string>(stateDto.Layers.Select(l => l.LayerId));

                // Remove layers no longer present
                var layersToRemove = illustration.Layers
                    .Where(l => !incomingLayerIds.Contains(l.LayerId))
                    .ToList();
                foreach (var layer in layersToRemove)
                {
                    _context.IllustrationCels.RemoveRange(layer.Cels);
                    _context.IllustrationLayers.Remove(layer);
                }

                // Upsert layers
                foreach (var layerDto in stateDto.Layers)
                {
                    IllustrationLayer layer;
                    if (existingLayers.TryGetValue(layerDto.LayerId, out var existing))
                    {
                        layer = existing;
                    }
                    else
                    {
                        layer = new IllustrationLayer
                        {
                            IllustrationId = illustrationId,
                            LayerId = layerDto.LayerId,
                            CreatedAt = DateTime.UtcNow
                        };
                        _context.IllustrationLayers.Add(layer);
                        illustration.Layers.Add(layer);
                    }

                    layer.Name = layerDto.Name;
                    layer.SortOrder = layerDto.Order;
                    layer.Visible = layerDto.Visible;
                    layer.Locked = layerDto.Locked;
                    layer.BlendMode = layerDto.BlendMode;
                    layer.Opacity = layerDto.Opacity;
                    layer.Clipped = layerDto.Clipped;
                    layer.LockTransparency = layerDto.LockTransparency;
                    layer.Animated = layerDto.Animated;
                    layer.DitherConfigJson = layerDto.DitherConfig != null ? JsonSerializer.Serialize(layerDto.DitherConfig) : null;
                    layer.FrameLinkAnimationJson = layerDto.FrameLinkAnimation != null ? JsonSerializer.Serialize(layerDto.FrameLinkAnimation) : null;
                    layer.UpdatedAt = DateTime.UtcNow;

                    // Upsert cels for this layer
                    var existingCels = layer.Cels.ToDictionary(c => c.CelId);
                    var incomingCelIds = new HashSet<string>(layerDto.Cels.Select(c => c.CelId));

                    // Remove cels no longer present
                    var celsToRemove = layer.Cels
                        .Where(c => !incomingCelIds.Contains(c.CelId))
                        .ToList();
                    foreach (var cel in celsToRemove)
                    {
                        _context.IllustrationCels.Remove(cel);
                    }

                    foreach (var celDto in layerDto.Cels)
                    {
                        IllustrationCel cel;
                        if (existingCels.TryGetValue(celDto.CelId, out var existingCel))
                        {
                            cel = existingCel;
                        }
                        else
                        {
                            cel = new IllustrationCel
                            {
                                CelId = celDto.CelId,
                                CreatedAt = DateTime.UtcNow
                            };
                            layer.Cels.Add(cel);
                            _context.IllustrationCels.Add(cel);
                        }

                        cel.Frame = celDto.Frame;
                        cel.Duration = celDto.Duration;
                        cel.IsKey = celDto.IsKey;
                        cel.CelType = celDto.CelType;
                        cel.UpdatedAt = DateTime.UtcNow;
                    }
                }

                await _context.SaveChangesAsync();
                // Only what the client needs back (this used to echo the whole state, scene graph included)
                return new ResultModel<IllustrationStateDto>(ResultType.Success, resultObject: new IllustrationStateDto
                {
                    Version = stateDto.Version, SavedAt = illustration.SavedAt, Revision = currentRevision + 1,
                });
            }
            catch (Exception ex)
            {
                return new ResultModel<IllustrationStateDto>(ResultType.Failure, ex.Message);
            }
        }

        public async Task<ResultModel<IllustrationStateDto>> LoadIllustrationState(long illustrationId)
        {
            if (!(await _access.CanAccessIllustrationAsync(illustrationId))) return new ResultModel<IllustrationStateDto>(ResultType.NotFound, "Not found.");   // owner / team / collaborator only (audit Phase 1.2)
            try
            {
                // Load scalar fields without the large CanvasData (V1 legacy) column
                var illData = await _context.Illustrations
                    .AsNoTracking()
                    .Where(i => i.Id == illustrationId)
                    .Select(i => new {
                        i.Id, i.SceneVersion, i.SavedAt,
                        i.AnimationEnabled, i.FrameCount, i.Fps, i.LoopMode,
                        i.PlayRangeStart, i.PlayRangeEnd,
                        i.OnionSkinConfig, i.ExtendedStateJson
                    })
                    .FirstOrDefaultAsync();

                if (illData == null)
                    return new ResultModel<IllustrationStateDto>(ResultType.NotFound, "Illustration not found.");

                // Load layers and cels in a separate query
                var dbLayers = await _context.IllustrationLayers
                    .AsNoTracking()
                    .Where(l => l.IllustrationId == illustrationId)
                    .OrderBy(l => l.SortOrder)
                    .Include(l => l.Cels.OrderBy(c => c.Frame))
                    .ToListAsync();

                // 3D blob loading is deferred until after ExtendedState deserialization below.

                // Build full state DTO
                OnionSkinDto? onionSkin = null;
                if (!string.IsNullOrEmpty(illData.OnionSkinConfig))
                {
                    try
                    {
                        onionSkin = JsonSerializer.Deserialize<OnionSkinDto>(illData.OnionSkinConfig);
                    }
                    catch
                    {
                        // Malformed JSON — skip
                    }
                }

                // Build all layer/cel DTOs and resolve SAS URLs in parallel (each was an Azure round-trip — now fire-and-forget SAS generation)
                var layerTasks = dbLayers.Select(async layer =>
                {
                    var layerDto = new LayerStateDto
                    {
                        LayerId = layer.LayerId,
                        Name = layer.Name ?? "",
                        Order = layer.SortOrder,
                        Visible = layer.Visible,
                        Locked = layer.Locked,
                        BlendMode = layer.BlendMode,
                        Opacity = layer.Opacity,
                        Clipped = layer.Clipped,
                        LockTransparency = layer.LockTransparency,
                        Animated = layer.Animated,
                        Cels = new()
                    };

                    // Per-layer dither and frame link animation
                    if (!string.IsNullOrEmpty(layer.DitherConfigJson))
                        try { layerDto.DitherConfig = JsonSerializer.Deserialize<DitherConfigDto>(layer.DitherConfigJson); } catch { }
                    if (!string.IsNullOrEmpty(layer.FrameLinkAnimationJson))
                        try { layerDto.FrameLinkAnimation = JsonSerializer.Deserialize<FrameLinkAnimationDto>(layer.FrameLinkAnimationJson); } catch { }

                    // Kick off layer URL task and all cel URL tasks, then await all in parallel
                    var layerUrlTask = (!layer.Animated && !string.IsNullOrEmpty(layer.PixelDataUrl))
                        ? _blobStorage.GetReadUrlAsync(_celContainerName, $"{illustrationId}/{layer.LayerId}.{layer.PixelFormat ?? "webp"}")
                        : Task.FromResult<string>("");

                    var celTaskList = layer.Cels.Select(cel =>
                    {
                        var celDto = new CelStateDto
                        {
                            CelId = cel.CelId,
                            Frame = cel.Frame,
                            Duration = cel.Duration,
                            IsKey = cel.IsKey,
                            CelType = cel.CelType,
                            Width = cel.PixelWidth,
                            Height = cel.PixelHeight
                        };
                        var urlTask = !string.IsNullOrEmpty(cel.PixelDataUrl)
                            ? _blobStorage.GetReadUrlAsync(_celContainerName, $"{illustrationId}/{cel.CelId}.{cel.PixelFormat ?? "webp"}")
                            : Task.FromResult<string>("");
                        return (celDto, urlTask);
                    }).ToList(); // materialize so tasks start immediately

                    await Task.WhenAll(new[] { layerUrlTask }.Concat(celTaskList.Select(x => x.urlTask)));

                    layerDto.PixelDataUrl = layerUrlTask.Result;
                    foreach (var (celDto, urlTask) in celTaskList)
                    {
                        celDto.PixelDataUrl = urlTask.Result;
                        layerDto.Cels.Add(celDto);
                    }

                    return layerDto;
                }).ToList(); // materialize so all layer tasks start immediately

                var layers = (await Task.WhenAll(layerTasks)).ToList();

                // Deserialize extended state (canvas settings, mesh IDs, dither, document size)
                ExtendedState? ext = null;
                if (!string.IsNullOrEmpty(illData.ExtendedStateJson))
                    try { ext = JsonSerializer.Deserialize<ExtendedState>(illData.ExtendedStateJson); } catch { }

                // Resolve 3D blob data: per-mesh SAS URLs (new path) or legacy monolithic base64 download
                Dictionary<string, string>? meshSasUrls = null;
                string? texLibSasUrl = null;
                string? scene3dNodesGzipLegacy = null;
                string? texLibGzipLegacy = null;

                if (ext?.MeshIds != null && ext.MeshIds.Count > 0)
                {
                    // New path: return SAS read URLs so the client downloads mesh blobs directly
                    var meshUrlTasks = ext.MeshIds
                        .Select(meshId => _blobStorage.GetReadUrlAsync(_scene3dContainerName, $"{illustrationId}/mesh/{meshId}.gz")
                            .ContinueWith(t => (meshId, url: t.Result)))
                        .ToList();
                    var texLibUrlTask = _blobStorage.ExistsAsync(_scene3dContainerName, $"{illustrationId}/texture-library.gz")
                        .ContinueWith(t => t.Result
                            ? _blobStorage.GetReadUrlAsync(_scene3dContainerName, $"{illustrationId}/texture-library.gz")
                            : Task.FromResult<string?>(null))
                        .Unwrap();

                    var meshResults = await Task.WhenAll(meshUrlTasks);
                    meshSasUrls = meshResults
                        .Where(x => !string.IsNullOrEmpty(x.url))
                        .ToDictionary(x => x.meshId, x => x.url);
                    texLibSasUrl = await texLibUrlTask;
                }
                else
                {
                    // Legacy path: full monolithic blob — download and return as base64
                    var scene3dTask = TryDownloadBase64BlobAsync(_scene3dContainerName, $"{illustrationId}/scene3d-nodes.gz");
                    var textureLibTask = TryDownloadBase64BlobAsync(_scene3dContainerName, $"{illustrationId}/texture-library.gz");
                    await Task.WhenAll(scene3dTask, textureLibTask);
                    scene3dNodesGzipLegacy = scene3dTask.Result ?? ext?.Scene3dNodesGzip;
                    texLibGzipLegacy = textureLibTask.Result ?? ext?.TextureLibrary3dGzip;
                }

                var state = new IllustrationStateDto
                {
                    Version = illData.SceneVersion,
                    SavedAt = illData.SavedAt,
                    Animation = new AnimationStateDto
                    {
                        Enabled = illData.AnimationEnabled,
                        FrameCount = illData.FrameCount,
                        Fps = illData.Fps,
                        LoopMode = illData.LoopMode,
                        PlayRangeStart = illData.PlayRangeStart,
                        PlayRangeEnd = illData.PlayRangeEnd,
                        OnionSkin = onionSkin
                    },
                    Layers = layers,
                    DitherConfig = ext?.DitherConfig,
                    DocumentSize = ext?.DocumentSize,
                    BgColor = ext?.BgColor,
                    DotColor = ext?.DotColor,
                    PaperGrain = ext?.PaperGrain,
                    Scene3dGlobalSettings = CamelCaseLegacyKeys(ext?.Scene3dGlobalSettings),
                    ExtraFields = ext?.ExtraFields,
                    MeshIds = ext?.MeshIds,
                    MeshSasUrls = meshSasUrls,
                    TexLibSasUrl = texLibSasUrl,
                    Scene3dNodesGzip = scene3dNodesGzipLegacy,
                    TextureLibrary3dGzip = texLibGzipLegacy,
                    Revision = ext?.Revision ?? 0,
                };

                return new ResultModel<IllustrationStateDto>(ResultType.Success, resultObject: state);
            }
            catch (Exception ex)
            {
                return new ResultModel<IllustrationStateDto>(ResultType.Failure, ex.Message);
            }
        }

        public async Task<long?> GetStateSavedAt(long illustrationId)
        {
            if (!(await _access.CanAccessIllustrationAsync(illustrationId))) return null;   // owner / team / collaborator only (audit Phase 1.2)
            var savedAt = await _context.Illustrations
                .AsNoTracking()
                .Where(i => i.Id == illustrationId)
                .Select(i => (long?)i.SavedAt)
                .FirstOrDefaultAsync();
            return savedAt;
        }

        /// <summary>Saves made before the settings were stored raw used the typed DTO, serialized with PascalCase names
        /// ("CameraMode"); the client reads camelCase. Convert such an object's keys once on load.</summary>
        private static JsonElement? CamelCaseLegacyKeys(JsonElement? settings)
        {
            if (settings is not { ValueKind: JsonValueKind.Object } obj) return settings;
            if (!obj.EnumerateObject().Any(p => p.Name.Length > 0 && char.IsUpper(p.Name[0]))) return settings;
            var converted = new Dictionary<string, JsonElement>();
            foreach (var p in obj.EnumerateObject())
                converted[char.ToLowerInvariant(p.Name[0]) + p.Name[1..]] = p.Value.Clone();
            return JsonSerializer.SerializeToElement(converted);
        }

        // Matches the shape of ExtendedStateJson. Legacy inline gzip fields kept for backward-compat reads.
        private class ExtendedState
        {
            public DitherConfigDto? DitherConfig { get; set; }
            public DocumentSizeDto? DocumentSize { get; set; }
            public string? BgColor { get; set; }
            public string? DotColor { get; set; }
            public PaperGrainDto? PaperGrain { get; set; }
            public JsonElement? Scene3dGlobalSettings { get; set; }
            public List<string>? MeshIds { get; set; }  // per-mesh blob IDs (v3+)
            // Client fields the DTO doesn't model (groups, frame-link buckets, packaging, …), stored flat in the JSON
            [System.Text.Json.Serialization.JsonExtensionData]
            public Dictionary<string, JsonElement>? ExtraFields { get; set; }
            // Legacy inline fields — only present in pre-blob-storage saves
            public string? Scene3dNodesGzip { get; set; }
            public string? TextureLibrary3dGzip { get; set; }
            // Quota tracking: persisted so upload endpoints can compute delta without a separate column
            public Dictionary<string, long>? MeshBlobSizes { get; set; }
            public long TexLibBlobSize { get; set; }
            public long Revision { get; set; }   // optimistic-concurrency counter (see SaveIllustrationState)
        }

        private async Task UploadBase64BlobAsync(string container, string blobName, string base64Data)
        {
            var bytes = Convert.FromBase64String(base64Data);
            using var stream = new MemoryStream(bytes);
            await _blobStorage.UploadAsync(container, blobName, stream, overwrite: true);
        }

        private async Task TryDeleteBlobAsync(string container, string blobName)
        {
            try
            {
                if (await _blobStorage.ExistsAsync(container, blobName))
                    await _blobStorage.DeleteAsync(container, blobName);
            }
            catch { }
        }

        /// <summary>Copy one blob within a container (Duplicate). False when the source doesn't exist or the copy failed.</summary>
        private async Task<bool> TryCopyBlobAsync(string container, string srcBlobName, string dstBlobName)
        {
            try
            {
                if (!await _blobStorage.ExistsAsync(container, srcBlobName)) return false;
                var data = await _blobStorage.DownloadAsync(container, srcBlobName);
                using var ms = new MemoryStream(data);
                await _blobStorage.UploadAsync(container, dstBlobName, ms, overwrite: true);
                return true;
            }
            catch
            {
                return false;   // swallowed like before: the copy is still usable, that part can be re-uploaded
            }
        }

        private async Task<string?> TryDownloadBase64BlobAsync(string container, string blobName)
        {
            try
            {
                if (!await _blobStorage.ExistsAsync(container, blobName))
                    return null;
                var bytes = await _blobStorage.DownloadAsync(container, blobName);
                return Convert.ToBase64String(bytes);
            }
            catch { return null; }
        }

        public async Task<ResultModel<string>> UploadMeshBlob(long illustrationId, string meshId, IFormFile meshData)
        {
            if (!(await _access.CanAccessIllustrationAsync(illustrationId))) return new ResultModel<string>(ResultType.NotFound, "Not found.");   // owner / team / collaborator only (audit Phase 1.2)
            try
            {
                if (!BlobNames.IsSafeSegment(meshId))
                    return new ResultModel<string>(ResultType.BadRequest, "Invalid id.");
                if (meshData == null || meshData.Length == 0)
                    return new ResultModel<string>(ResultType.Failure, "Invalid file upload.");

                var illustration = await _context.Illustrations.FirstOrDefaultAsync(i => i.Id == illustrationId);
                if (illustration == null)
                    return new ResultModel<string>(ResultType.NotFound, "Illustration not found.");

                // Quota check with delta tracking stored in ExtendedStateJson
                var userId = await GetStorageOwnerIdAsync(illustrationId);   // quota belongs to the owner, not the uploader (audit Phase 1.10)
                var user = userId != null ? await _context.ApplicationUsers.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId) : null;
                var newBytes = meshData.Length;

                ExtendedState? ext = null;
                if (!string.IsNullOrEmpty(illustration.ExtendedStateJson))
                    try { ext = JsonSerializer.Deserialize<ExtendedState>(illustration.ExtendedStateJson); } catch { }
                ext ??= new ExtendedState();
                ext.MeshBlobSizes ??= new Dictionary<string, long>();

                var oldBytes = ext.MeshBlobSizes.GetValueOrDefault(meshId, 0L);
                var delta = newBytes - oldBytes;

                if (user != null && delta > 0)
                {
                    var ok = await TryIncrementStorageAsync(userId!, delta, user.IsPro);
                    if (!ok) return new ResultModel<string>(ResultType.Failure, "Storage quota exceeded.");
                }

                using var stream = meshData.OpenReadStream();
                await _blobStorage.UploadAsync(_scene3dContainerName, $"{illustrationId}/mesh/{meshId}.gz", stream, overwrite: true);

                ext.MeshBlobSizes[meshId] = newBytes;
                illustration.ExtendedStateJson = JsonSerializer.Serialize(ext);
                await _context.SaveChangesAsync();

                if (user != null && delta < 0)
                    await DecrementStorageAsync(userId!, -delta);

                return new ResultModel<string>(ResultType.Success, "Mesh blob uploaded.");
            }
            catch (Exception ex)
            {
                return new ResultModel<string>(ResultType.Failure, ex.Message);
            }
        }

        public async Task<ResultModel<string>> UploadTextureLibraryBlob(long illustrationId, IFormFile texLibData)
        {
            if (!(await _access.CanAccessIllustrationAsync(illustrationId))) return new ResultModel<string>(ResultType.NotFound, "Not found.");   // owner / team / collaborator only (audit Phase 1.2)
            try
            {
                if (texLibData == null || texLibData.Length == 0)
                    return new ResultModel<string>(ResultType.Failure, "Invalid file upload.");

                var illustration = await _context.Illustrations.FirstOrDefaultAsync(i => i.Id == illustrationId);
                if (illustration == null)
                    return new ResultModel<string>(ResultType.NotFound, "Illustration not found.");

                var userId = await GetStorageOwnerIdAsync(illustrationId);   // quota belongs to the owner, not the uploader (audit Phase 1.10)
                var user = userId != null ? await _context.ApplicationUsers.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId) : null;
                var newBytes = texLibData.Length;

                ExtendedState? ext = null;
                if (!string.IsNullOrEmpty(illustration.ExtendedStateJson))
                    try { ext = JsonSerializer.Deserialize<ExtendedState>(illustration.ExtendedStateJson); } catch { }
                ext ??= new ExtendedState();

                var delta = newBytes - ext.TexLibBlobSize;

                if (user != null && delta > 0)
                {
                    var ok = await TryIncrementStorageAsync(userId!, delta, user.IsPro);
                    if (!ok) return new ResultModel<string>(ResultType.Failure, "Storage quota exceeded.");
                }

                using var stream = texLibData.OpenReadStream();
                await _blobStorage.UploadAsync(_scene3dContainerName, $"{illustrationId}/texture-library.gz", stream, overwrite: true);

                ext.TexLibBlobSize = newBytes;
                illustration.ExtendedStateJson = JsonSerializer.Serialize(ext);
                await _context.SaveChangesAsync();

                if (user != null && delta < 0)
                    await DecrementStorageAsync(userId!, -delta);

                return new ResultModel<string>(ResultType.Success, "Texture library uploaded.");
            }
            catch (Exception ex)
            {
                return new ResultModel<string>(ResultType.Failure, ex.Message);
            }
        }

        public async Task<ResultModel<Dictionary<string, string>>> GetMeshReadUrls(long illustrationId, List<string> meshIds)
        {
            if (!(await _access.CanAccessIllustrationAsync(illustrationId))) return new ResultModel<Dictionary<string, string>>(ResultType.NotFound, "Not found.");   // owner / team / collaborator only (audit Phase 1.2)
            try
            {
                if (meshIds.Any(id => !BlobNames.IsSafeSegment(id)))
                    return new ResultModel<Dictionary<string, string>>(ResultType.BadRequest, "Invalid id.");
                var tasks = meshIds.Select(meshId =>
                    _blobStorage.GetReadUrlAsync(_scene3dContainerName, $"{illustrationId}/mesh/{meshId}.gz")
                        .ContinueWith(t => (meshId, url: t.Result)));
                var results = await Task.WhenAll(tasks);
                return new ResultModel<Dictionary<string, string>>(ResultType.Success,
                    resultObject: results.ToDictionary(x => x.meshId, x => x.url));
            }
            catch (Exception ex)
            {
                return new ResultModel<Dictionary<string, string>>(ResultType.Failure, ex.Message);
            }
        }

        public async Task<ResultModel<string>> UploadCelPixelData(long illustrationId, string celId, IFormFile pixelData, int? width, int? height, string? format)
        {
            if (!(await _access.CanAccessIllustrationAsync(illustrationId))) return new ResultModel<string>(ResultType.NotFound, "Not found.");   // owner / team / collaborator only (audit Phase 1.2)
            try
            {
                if (!BlobNames.IsSafeSegment(celId) || !BlobNames.IsValidPixelFormat(format))
                    return new ResultModel<string>(ResultType.BadRequest, "Invalid id.");
                if (pixelData == null || pixelData.Length == 0)
                    return new ResultModel<string>(ResultType.Failure, "Invalid file upload.");

                var exists = await _context.Illustrations.AnyAsync(i => i.Id == illustrationId);
                if (!exists)
                    return new ResultModel<string>(ResultType.NotFound, "Illustration not found.");

                // Quota check: delta = new size − old stored size
                var userId = await GetStorageOwnerIdAsync(illustrationId);   // quota belongs to the owner, not the uploader (audit Phase 1.10)
                var user = userId != null ? await _context.ApplicationUsers.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId) : null;
                var cel = await _context.IllustrationCels
                    .FirstOrDefaultAsync(c => c.CelId == celId && c.Layer!.IllustrationId == illustrationId);
                var newBytes = pixelData.Length;
                var oldBytes = cel?.BlobSizeBytes ?? 0L;
                var delta = newBytes - oldBytes;

                if (user != null && delta > 0)
                {
                    var ok = await TryIncrementStorageAsync(userId!, delta, user.IsPro);
                    if (!ok) return new ResultModel<string>(ResultType.Failure, "Storage quota exceeded.");
                }

                var ext = format ?? "webp";
                var blobPath = $"{illustrationId}/{celId}.{ext}";

                using (var stream = pixelData.OpenReadStream())
                    await _blobStorage.UploadAsync(_celContainerName, blobPath, stream, overwrite: true);

                if (cel != null)
                {
                    cel.PixelDataUrl = await _blobStorage.GetReadUrlAsync(_celContainerName, blobPath);
                    cel.PixelWidth = width;
                    cel.PixelHeight = height;
                    cel.PixelFormat = ext;
                    cel.BlobSizeBytes = newBytes;
                    cel.UpdatedAt = DateTime.UtcNow;

                    using var hashStream = pixelData.OpenReadStream();
                    using var sha = System.Security.Cryptography.SHA256.Create();
                    var hashBytes = await sha.ComputeHashAsync(hashStream);
                    cel.ContentHash = Convert.ToHexString(hashBytes).ToLowerInvariant();

                    await _context.SaveChangesAsync();
                }

                if (user != null && delta < 0)
                    await DecrementStorageAsync(userId!, -delta);

                var sasUrl = await _blobStorage.GetReadUrlAsync(_celContainerName, blobPath);
                return new ResultModel<string>(ResultType.Success, sasUrl);
            }
            catch (Exception ex)
            {
                return new ResultModel<string>(ResultType.Failure, ex.Message);
            }
        }

        public async Task<ResultModel<string>> UploadLayerPixelData(long illustrationId, string layerId, IFormFile pixelData, int? width, int? height, string? format)
        {
            if (!(await _access.CanAccessIllustrationAsync(illustrationId))) return new ResultModel<string>(ResultType.NotFound, "Not found.");   // owner / team / collaborator only (audit Phase 1.2)
            try
            {
                if (!BlobNames.IsSafeSegment(layerId) || !BlobNames.IsValidPixelFormat(format))
                    return new ResultModel<string>(ResultType.BadRequest, "Invalid id.");
                if (pixelData == null || pixelData.Length == 0)
                    return new ResultModel<string>(ResultType.Failure, "Invalid file upload.");

                var exists = await _context.Illustrations.AnyAsync(i => i.Id == illustrationId);
                if (!exists)
                    return new ResultModel<string>(ResultType.NotFound, "Illustration not found.");

                // Quota check: delta = new size − old stored size
                var userId = await GetStorageOwnerIdAsync(illustrationId);   // quota belongs to the owner, not the uploader (audit Phase 1.10)
                var user = userId != null ? await _context.ApplicationUsers.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId) : null;
                var layer = await _context.IllustrationLayers
                    .FirstOrDefaultAsync(l => l.LayerId == layerId && l.IllustrationId == illustrationId);
                var newBytes = pixelData.Length;
                var oldBytes = layer?.BlobSizeBytes ?? 0L;
                var delta = newBytes - oldBytes;

                if (user != null && delta > 0)
                {
                    var ok = await TryIncrementStorageAsync(userId!, delta, user.IsPro);
                    if (!ok) return new ResultModel<string>(ResultType.Failure, "Storage quota exceeded.");
                }

                var ext = format ?? "webp";
                var blobPath = $"{illustrationId}/{layerId}.{ext}";

                using (var stream = pixelData.OpenReadStream())
                    await _blobStorage.UploadAsync(_celContainerName, blobPath, stream, overwrite: true);

                if (layer != null)
                {
                    layer.PixelDataUrl = await _blobStorage.GetReadUrlAsync(_celContainerName, blobPath);
                    layer.PixelWidth = width;
                    layer.PixelHeight = height;
                    layer.PixelFormat = ext;
                    layer.BlobSizeBytes = newBytes;
                    layer.UpdatedAt = DateTime.UtcNow;
                    await _context.SaveChangesAsync();
                }

                // If blob shrank, free up the difference
                if (user != null && delta < 0)
                    await DecrementStorageAsync(userId!, -delta);

                var sasUrl = await _blobStorage.GetReadUrlAsync(_celContainerName, blobPath);
                return new ResultModel<string>(ResultType.Success, sasUrl);
            }
            catch (Exception ex)
            {
                return new ResultModel<string>(ResultType.Failure, ex.Message);
            }
        }

        public async Task<ResultModel<string>> DeleteCel(long illustrationId, string celId)
        {
            if (!(await _access.CanAccessIllustrationAsync(illustrationId))) return new ResultModel<string>(ResultType.NotFound, "Not found.");   // owner / team / collaborator only (audit Phase 1.2)
            try
            {
                if (!BlobNames.IsSafeSegment(celId))
                    return new ResultModel<string>(ResultType.BadRequest, "Invalid id.");
                var cel = await _context.IllustrationCels
                    .FirstOrDefaultAsync(c => c.CelId == celId && c.Layer!.IllustrationId == illustrationId);

                if (cel == null)
                    return new ResultModel<string>(ResultType.NotFound, "Cel not found.");

                var freedBytes = cel.BlobSizeBytes;
                var userId = await GetStorageOwnerIdAsync(illustrationId);   // quota belongs to the owner, not the uploader (audit Phase 1.10)

                try
                {
                    await _blobStorage.DeleteAsync(_celContainerName, $"{illustrationId}/{celId}.{cel.PixelFormat ?? "webp"}");
                }
                catch { }

                _context.IllustrationCels.Remove(cel);
                await _context.SaveChangesAsync();

                if (userId != null && freedBytes > 0)
                    await DecrementStorageAsync(userId, freedBytes);

                return new ResultModel<string>(ResultType.Success, "Cel deleted.");
            }
            catch (Exception ex)
            {
                return new ResultModel<string>(ResultType.Failure, ex.Message);
            }
        }

        public async Task<ResultModel<Dictionary<string, CelStatusItemDto>>> GetCelStatus(long illustrationId, List<string> celIds)
        {
            if (!(await _access.CanAccessIllustrationAsync(illustrationId))) return new ResultModel<Dictionary<string, CelStatusItemDto>>(ResultType.NotFound, "Not found.");   // owner / team / collaborator only (audit Phase 1.2)
            try
            {
                var cels = await _context.IllustrationCels
                    .AsNoTracking()
                    .Where(c => c.Layer!.IllustrationId == illustrationId && celIds.Contains(c.CelId))
                    .Select(c => new { c.CelId, c.ContentHash })
                    .ToListAsync();

                var lookup = cels.ToDictionary(c => c.CelId);

                var result = new Dictionary<string, CelStatusItemDto>();
                foreach (var id in celIds)
                {
                    if (lookup.TryGetValue(id, out var cel))
                    {
                        result[id] = new CelStatusItemDto { Exists = true, Hash = cel.ContentHash };
                    }
                    else
                    {
                        result[id] = new CelStatusItemDto { Exists = false };
                    }
                }

                return new ResultModel<Dictionary<string, CelStatusItemDto>>(ResultType.Success, resultObject: result);
            }
            catch (Exception ex)
            {
                return new ResultModel<Dictionary<string, CelStatusItemDto>>(ResultType.Failure, ex.Message);
            }
        }

        public async Task<ResultModel<IllustrationDto>> PublishIllustration(long illustrationId, IFormFile bundle, string? publishedTitle)
        {
            if (!(await _access.CanAccessIllustrationAsync(illustrationId))) return new ResultModel<IllustrationDto>(ResultType.NotFound, "Not found.");   // owner / team / collaborator only (audit Phase 1.2)
            try
            {
                if (bundle == null || bundle.Length == 0)
                    return new ResultModel<IllustrationDto>(ResultType.Failure, "Bundle file is required.");

                const long MaxBundleSize = 100 * 1024 * 1024; // 100 MB
                if (bundle.Length > MaxBundleSize)
                    return new ResultModel<IllustrationDto>(ResultType.Failure, "Bundle exceeds the 100 MB size limit.");

                var userId = GetCurrentUserId();
                if (string.IsNullOrEmpty(userId))
                    return new ResultModel<IllustrationDto>(ResultType.Unauthorized, "Not authenticated.");

                var illustration = await _context.Illustrations.FindAsync(illustrationId);
                if (illustration == null)
                    return new ResultModel<IllustrationDto>(ResultType.NotFound, "Illustration not found.");

                var nextVersion = illustration.PublishedVersion + 1;
                var blobName = $"{illustration.UUID}/v{nextVersion}.frogmarks";

                using (var stream = bundle.OpenReadStream())
                {
                    await _blobStorage.UploadAsync(_publishedContainerName, blobName, stream, overwrite: false);
                }

                illustration.IsPublic               = true;
                illustration.PublishedBundleBlobName = blobName;
                illustration.PublishedTitle          = string.IsNullOrWhiteSpace(publishedTitle) ? illustration.Name : publishedTitle;
                illustration.PublishedAt             = DateTime.UtcNow;
                illustration.PublishedVersion        = nextVersion;
                illustration.DateModified            = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                return new ResultModel<IllustrationDto>(ResultType.Success, resultObject: _mapper.Map<IllustrationDto>(illustration));
            }
            catch (Exception ex)
            {
                return new ResultModel<IllustrationDto>(ResultType.Failure, ex.Message);
            }
        }

        public async Task<ResultModel<string>> UnpublishIllustration(long illustrationId)
        {
            if (!(await _access.CanAccessIllustrationAsync(illustrationId))) return new ResultModel<string>(ResultType.NotFound, "Not found.");   // owner / team / collaborator only (audit Phase 1.2)
            try
            {
                var userId = GetCurrentUserId();
                if (string.IsNullOrEmpty(userId))
                    return new ResultModel<string>(ResultType.Unauthorized, "Not authenticated.");

                var illustration = await _context.Illustrations.FindAsync(illustrationId);
                if (illustration == null)
                    return new ResultModel<string>(ResultType.NotFound, "Illustration not found.");

                illustration.IsPublic     = false;
                illustration.DateModified = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                return new ResultModel<string>(ResultType.Success, "Illustration unpublished.");
            }
            catch (Exception ex)
            {
                return new ResultModel<string>(ResultType.Failure, ex.Message);
            }
        }

        public async Task<ResultModel<IllustrationViewDto>> GetPublicView(Guid uid)
        {
            try
            {
                var illustration = await _context.Illustrations
                    .AsNoTracking()
                    .FirstOrDefaultAsync(i => i.UUID == uid);

                if (illustration == null)
                    return new ResultModel<IllustrationViewDto>(ResultType.NotFound, "Illustration not found.");

                if (!illustration.IsPublic || string.IsNullOrEmpty(illustration.PublishedBundleBlobName))
                    return new ResultModel<IllustrationViewDto>(ResultType.NotFound, "Illustration not found.");

                var bundleUrl = await _blobStorage.GetReadUrlAsync(_publishedContainerName, illustration.PublishedBundleBlobName);

                var dto = new IllustrationViewDto
                {
                    BundleUrl        = bundleUrl,
                    Name             = illustration.PublishedTitle ?? illustration.Name,
                    PublishedAt      = illustration.PublishedAt,
                    PublishedVersion = illustration.PublishedVersion
                };

                return new ResultModel<IllustrationViewDto>(ResultType.Success, resultObject: dto);
            }
            catch (Exception ex)
            {
                return new ResultModel<IllustrationViewDto>(ResultType.Failure, ex.Message);
            }
        }

        public async Task<ResultModel<byte[]>> DownloadPublicBundle(Guid uid)
        {
            try
            {
                var illustration = await _context.Illustrations
                    .AsNoTracking()
                    .FirstOrDefaultAsync(i => i.UUID == uid);

                if (illustration == null || !illustration.IsPublic || string.IsNullOrEmpty(illustration.PublishedBundleBlobName))
                    return new ResultModel<byte[]>(ResultType.NotFound, "Illustration not found.");

                var data = await _blobStorage.DownloadAsync(_publishedContainerName, illustration.PublishedBundleBlobName);
                return new ResultModel<byte[]>(ResultType.Success, resultObject: data);
            }
            catch (Exception ex)
            {
                return new ResultModel<byte[]>(ResultType.Failure, ex.Message);
            }
        }

    }

    public class IllustrationWithLastViewed
    {
        public Illustration Illustration { get; set; }
        public DateTime? LastViewed { get; set; }
    }
}