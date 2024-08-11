using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Frogmarks.Models
{
    public class AuditLog: BaseEntity
    {
        public DateTime? DateModified { get; set; }
        public string? ModifiedById { get; set; }

        [ForeignKey("ModifiedById")]
        public virtual ApplicationUser? ModifiedBy { get; set; }

        public DateTime Created { get; set; }

        [MaxLength(250)]
        public string? UpdatedIp { get; set; }

        [MaxLength(250)]
        public string? CreatedIp { get; set; }

        public string? CreatedById { get; set; } = null;

        [ForeignKey("CreatedById")]
        public virtual ApplicationUser? CreatedBy { get; set; }
    }
}
