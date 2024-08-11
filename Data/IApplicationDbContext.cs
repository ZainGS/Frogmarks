using Duende.IdentityServer.EntityFramework.Entities;
using Frogmarks.Models;
using Frogmarks.Models.Auth;
using Frogmarks.Models.Board;
using Frogmarks.Models.Team;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using System.Data.Common;

namespace Frogmarks.Data
{
    public interface IApplicationDbContext
    {
        DbCommand CreateCommand();
        Task<DbConnection> OpenConnectionAsync();
        EntityEntry<TEntity> Entry<TEntity>(TEntity entity) where TEntity : class;
        int SaveChanges();
        Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);


        DbSet<DeviceFlowCodes> DeviceFlowCodes { get; set; }
        DbSet<PersistedGrant> PersistedGrants { get; set; }
        DbSet<Key> Keys { get; set; }

        // BASE
        DbSet<ApplicationUser> ApplicationUsers { get; set; }
        DbSet<Team> Teams { get; set; }
        DbSet<TeamUser> TeamUsers { get; set; }
        DbSet<TeamProject> TeamProjects { get; set; }
        DbSet<Board> Boards { get; set; }
        DbSet<BoardCollaborator> BoardsCollaborators { get; set; }
        DbSet<BoardItem> BoardItems { get; set; }
        DbSet<BoardViewLog> BoardViewLogs { get; set; }

        // AUTH
        DbSet<EmailToken> EmailTokens { get; set; }

    }
}