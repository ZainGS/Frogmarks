namespace Frogmarks.Models.Dtos
{
    public class TeamUserDto
    {
        public long Id { get; set; }
        public long TeamId { get; set; }

        public string ApplicationUserId { get; set; } = string.Empty;

        // Optional: include these only if needed
        // public TeamDto? Team { get; set; }
        // public List<TeamRoleDto>? TeamRoles { get; set; }
        // public List<long>? FavoriteBoardIds { get; set; }
    }
}
