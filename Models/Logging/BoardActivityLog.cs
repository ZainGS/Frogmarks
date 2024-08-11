using System.ComponentModel.DataAnnotations.Schema;

namespace Frogmarks.Models.Logging
{
    public class BoardActivityLog
    {
        public long Id { get; set; }
        public string Action { get; set; } = string.Empty;
        public DateTime CreatedDate { get; set; }
        public DateTime LastActivityDate { get; set; }

        public string CreatedById { get; set; }
        [ForeignKey("CreatedById")]
        public ApplicationUser CreatedBy { get; set; }
        
        public string LastActivityById { get; set; }
        [ForeignKey("LastActivityById")]
        public ApplicationUser LastActivityBy { get; set; }

       
        
    }
}
