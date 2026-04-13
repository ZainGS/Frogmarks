using Duende.IdentityServer.EntityFramework.Interfaces;
using Microsoft.EntityFrameworkCore;
using Frogmarks.Models;
using Frogmarks.Models.Auth;
using Frogmarks.Models.Board;
using Frogmarks.Models.Team;
using System.Data.Common;
using System.Threading;
using System.Threading.Tasks;
using Duende.IdentityServer.EntityFramework.Entities;
using Microsoft.AspNetCore.Http;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Frogmarks.Models.Illustration;

namespace Frogmarks.Data
{
    public class ApplicationDbContext : DbContext, IApplicationDbContext, IPersistedGrantDbContext
    {
        private readonly IHttpContextAccessor _httpContextAccessor;

        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options, IHttpContextAccessor httpContextAccessor) : base(options)
        {
            _httpContextAccessor = httpContextAccessor;
        }

        public EntityEntry<TEntity> Entry<TEntity>(TEntity entity) where TEntity : class
        {
            return base.Entry(entity);
        }

        // BASE
        public DbSet<ApplicationUser> ApplicationUsers { get; set; }
        public DbSet<Team> Teams { get; set; }
        public DbSet<TeamUser> TeamUsers { get; set; }
        public DbSet<TeamProject> TeamProjects { get; set; }

        // BOARDS
        public DbSet<Board> Boards { get; set; }
        public DbSet<BoardCollaborator> BoardsCollaborators { get; set; }
        public DbSet<BoardItem> BoardItems { get; set; }
        public DbSet<BoardViewLog> BoardViewLogs { get; set; }

        // ILLUSTRATIONS
        public DbSet<Illustration> Illustrations { get; set; }
        public DbSet<IllustrationCollaborator> IllustrationCollaborators { get; set; }
        // public DbSet<BoardItem> BoardItems { get; set; }
        public DbSet<IllustrationViewLog> IllustrationViewLogs { get; set; }
        public DbSet<IllustrationLayer> IllustrationLayers { get; set; }
        public DbSet<IllustrationCel> IllustrationCels { get; set; }

        // AUTH
        public DbSet<EmailToken> EmailTokens { get; set; }

        // IPersistedGrantDbContext implementation
        public DbSet<PersistedGrant> PersistedGrants { get; set; }
        public DbSet<DeviceFlowCodes> DeviceFlowCodes { get; set; }
        public DbSet<Key> Keys { get; set; }

        // IApplicationDbContext implementation

        public DbCommand CreateCommand()
        {
            return Database.GetDbConnection().CreateCommand();
        }

        public async Task<DbConnection> OpenConnectionAsync()
        {
            var connection = Database.GetDbConnection();
            await connection.OpenAsync();
            return connection;
        }

        public override int SaveChanges()
        {
            UpdateAuditLogProperties();
            return base.SaveChanges();
        }

        public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            UpdateAuditLogProperties();
            return base.SaveChangesAsync(cancellationToken);
        }

        Task<int> IPersistedGrantDbContext.SaveChangesAsync()
        {
            return base.SaveChangesAsync();
        }

        private void UpdateAuditLogProperties()
        {
            var entries = ChangeTracker.Entries()
                .Where(e => e.Entity is AuditLog &&
                            (e.State == EntityState.Added || e.State == EntityState.Modified));

            foreach (var entry in entries)
            {
                var now = DateTime.UtcNow;
                var userId = GetCurrentUserId();
                var auditLogEntity = (AuditLog)entry.Entity;

                if (entry.State == EntityState.Added)
                {
                    auditLogEntity.Created = now;
                    auditLogEntity.CreatedById = userId;
                    auditLogEntity.CreatedIp = GetCurrentIpAddress();
                }
                else
                {
                    // Ensure Created is not set to null on update
                    entry.Property(nameof(AuditLog.Created)).IsModified = false;
                    entry.Property(nameof(AuditLog.CreatedById)).IsModified = false;
                    entry.Property(nameof(AuditLog.CreatedIp)).IsModified = false;
                }

                auditLogEntity.DateModified = now;
                auditLogEntity.ModifiedById = userId;
                auditLogEntity.UpdatedIp = GetCurrentIpAddress();
            }
        }

        private string? GetCurrentUserId()
        {
            return _httpContextAccessor.HttpContext?.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            
        }

        private string? GetCurrentIpAddress()
        {
            return _httpContextAccessor.HttpContext?.Connection?.RemoteIpAddress?.ToString();
        }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Configure primary keys for Duende IdentityServer entities
            modelBuilder.Entity<DeviceFlowCodes>().HasKey(x => x.UserCode);
            modelBuilder.Entity<PersistedGrant>().HasKey(x => x.Key);
            modelBuilder.Entity<Key>().HasKey(x => x.Id);

            // Configure the relationship between ApplicationUser and TeamUser
            modelBuilder.Entity<TeamUser>()
                .HasOne(tu => tu.ApplicationUser)
                .WithMany(au => au.TeamUserScopes)
                .HasForeignKey(tu => tu.ApplicationUserId)
                .OnDelete(DeleteBehavior.Restrict);

            // Configure the relationship between TeamUser and BoardCollaborator
            modelBuilder.Entity<BoardCollaborator>()
                .HasOne(bc => bc.TeamUser)
                .WithMany()
                .HasForeignKey(bc => bc.TeamUserId)
                .OnDelete(DeleteBehavior.Restrict);

            // Configure the relationship between Board and TeamUser for CreatedBy
            modelBuilder.Entity<Board>()
                .HasOne(b => b.CreatedBy)
                .WithMany()
                .HasForeignKey(b => b.CreatedById)
                .OnDelete(DeleteBehavior.Restrict);

            // IllustrationLayer: unique (IllustrationId, LayerId)
            modelBuilder.Entity<IllustrationLayer>()
                .HasIndex(l => new { l.IllustrationId, l.LayerId })
                .IsUnique();

            modelBuilder.Entity<IllustrationLayer>()
                .HasOne(l => l.Illustration)
                .WithMany(i => i.Layers)
                .HasForeignKey(l => l.IllustrationId)
                .OnDelete(DeleteBehavior.Cascade);

            // IllustrationCel: unique (LayerDbId, CelId)
            modelBuilder.Entity<IllustrationCel>()
                .HasIndex(c => new { c.LayerDbId, c.CelId })
                .IsUnique();

            modelBuilder.Entity<IllustrationCel>()
                .HasOne(c => c.Layer)
                .WithMany(l => l.Cels)
                .HasForeignKey(c => c.LayerDbId)
                .OnDelete(DeleteBehavior.Cascade);

            // Apply configuration to all entities that inherit from AuditLog
            foreach (var entityType in modelBuilder.Model.GetEntityTypes())
            {
                if (typeof(AuditLog).IsAssignableFrom(entityType.ClrType))
                {
                    modelBuilder.Entity(entityType.ClrType).Property<DateTime>("Created")
                        .ValueGeneratedOnAdd()
                        .HasDefaultValueSql("GETUTCDATE()");
                }
            }
        }
    }
}