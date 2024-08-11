using System.ComponentModel.DataAnnotations.Schema;

namespace Frogmarks.Models
{
    public class BaseEntity
    {
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long Id { get; set; }

    }
}
