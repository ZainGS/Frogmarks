using AutoMapper;
using Frogmarks.Models;
using Frogmarks.Models.Board;
using Frogmarks.Models.Dtos;
using Frogmarks.Models.Team;

namespace Frogmarks.Data
{
    public class AutoMapperProfile : Profile
    {
        public AutoMapperProfile()
        {
            //CreateMap<BoardDto, Board>()
            //.ForMember(dest => dest.Team, opt => opt.Ignore())
            //.ForMember(dest => dest.Collaborators, opt => opt.Ignore()) 
            //.ReverseMap()
            //.ForMember(dest => dest.Collaborators, opt => opt.Ignore());

            CreateMap<Board, BoardDto>()
                .ForMember(dest => dest.BoardItems, opt => opt.Ignore())
                .ForMember(dest => dest.Team, opt => opt.Ignore())
                .ForMember(dest => dest.Preferences, opt => opt.Ignore()) // ✅ TODO: Make Dto
                .ForMember(dest => dest.Project, opt => opt.Ignore())     // ✅ TODO: Make Dto
                .ForMember(dest => dest.Permissions, opt => opt.Ignore()) // ✅ TODO: Make Dto
                .ForMember(dest => dest.ModifiedBy, opt => opt.Ignore()) // ✅ TODO: Use Dto
                .ForMember(dest => dest.CreatedBy, opt => opt.Ignore()) // ✅ TODO: Use Dto
                .ReverseMap();
            CreateMap<BoardCollaborator, BoardCollaboratorDto>().ReverseMap();
            //CreateMap<BoardRole, BoardRoleDto>().ReverseMap();
            CreateMap<Team, TeamDto>().ReverseMap();
            CreateMap<TeamUser, TeamUserDto>().ReverseMap();
        }
    }
}