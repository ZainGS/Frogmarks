using Frogmarks.Models.Base;
using Frogmarks.Models.Board;

namespace Frogmarks.Models.Illustration
{
    public class IllustrationCollaborator : Collaborator
    {
        public virtual List<IllustrationRole> IllustrationRoles { get; set; } = new List<IllustrationRole>();
    }
}
