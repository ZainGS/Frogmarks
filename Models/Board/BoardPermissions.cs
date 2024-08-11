using Frogmarks.Models.Logging;
using System.ComponentModel.DataAnnotations.Schema;

namespace Frogmarks.Models.Board
{
    public class BoardPermissions 
    {
        public long Id { get; set; }
        public long BoardId { get; set; }
        public virtual Board? Board { get; set; }

        public bool CanNonCollaboratorsView { get; set; } = true;
        public bool CanNonCollaboratorsEdit { get; set; } = false;
    }
}
