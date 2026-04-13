using Frogmarks.Models.Base;
using Frogmarks.Models.Logging;
using System.ComponentModel.DataAnnotations.Schema;

namespace Frogmarks.Models.Board
{
    /// <summary>
    /// You can think of this as a Board-Scoped User.
    /// </summary>
    public class BoardCollaborator : Collaborator
    {
        public virtual List<BoardRole> BoardRoles { get; set; } = new List<BoardRole>();
    }
}
