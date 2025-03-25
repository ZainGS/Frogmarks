using System;

namespace Frogmarks.Models.Dtos
{
    public class TeamDto
    {
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;

        // Optional: you can add simplified versions of TeamProjects, Boards, or Users later if needed
        // public List<TeamProjectDto>? TeamProjects { get; set; }
        // public List<BoardDto>? Boards { get; set; }
        // public List<TeamUserDto>? Users { get; set; }
    }
}
