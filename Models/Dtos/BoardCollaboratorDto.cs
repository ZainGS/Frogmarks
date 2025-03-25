using Frogmarks.Models.Board;

namespace Frogmarks.Models.Dtos
{
    public class BoardCollaboratorDto
    {
        public long Id { get; set; }
        public long TeamUserId { get; set; }
        public TeamUserDto? TeamUser { get; set; }
        public List<BoardRole> BoardRoles { get; set; } = new();
    }
}
