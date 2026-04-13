using Frogmarks.Models.Board;
using Frogmarks.Models.Illustration;

namespace Frogmarks.Models.Dtos.Illustration
{
    public class IllustrationCollaboratorDto
    {
        public long Id { get; set; }
        public long TeamUserId { get; set; }
        public TeamUserDto? TeamUser { get; set; }
        public List<IllustrationRole> IllustrationRoles { get; set; } = new();
    }
}
