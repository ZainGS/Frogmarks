using System.Text.Json.Serialization;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Frogmarks.Models
{
    public class AuditLog: BaseEntity
    {
        public DateTime? DateModified { get; set; }
        public string? ModifiedById { get; set; }

        [ForeignKey("ModifiedById")]
        // Never serialized: it would expose the user record (password hash, tokens) — security audit 2026-10-04, Phase 1.8
        [JsonIgnore]
        public virtual ApplicationUser? ModifiedBy { get; set; }

        public DateTime Created { get; set; }

        [MaxLength(250)]
        public string? UpdatedIp { get; set; }

        [MaxLength(250)]
        public string? CreatedIp { get; set; }

        public string? CreatedById { get; set; } = null;

        [ForeignKey("CreatedById")]
        [JsonIgnore]
        public virtual ApplicationUser? CreatedBy { get; set; }
    }
}
