using AutoMapper;
using Frogmarks.Models;
using Frogmarks.Models.Board;
using Frogmarks.Models.Dtos;
using Frogmarks.Models.Dtos.Board;
using Frogmarks.Models.Dtos.Illustration;
using Frogmarks.Models.Illustration;
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
            // entity -> dto
            .ForMember(d => d.BoardItems, o => o.Ignore())
            .ForMember(d => d.Team, o => o.Ignore())
            .ForMember(d => d.Preferences, o => o.Ignore())
            .ForMember(d => d.Project, o => o.Ignore())
            .ForMember(d => d.Permissions, o => o.Ignore())
            .ForMember(d => d.ModifiedBy, o => o.Ignore())
            .ForMember(d => d.CreatedBy, o => o.Ignore())
            .ReverseMap()
            // dto -> entity
            .ForMember(d => d.BoardItems, o => o.Ignore())
            .ForMember(d => d.Team, o => o.Ignore())
            .ForMember(d => d.Preferences, o => o.Ignore())
            .ForMember(d => d.Project, o => o.Ignore())
            .ForMember(d => d.Permissions, o => o.Ignore())
            .ForMember(d => d.ModifiedBy, o => o.Ignore())
            .ForMember(d => d.CreatedBy, o => o.Ignore())
            // prevent nulls from stomping existing values
            .ForAllMembers(o => o.Condition((src, dest, srcMember) => srcMember != null));

            CreateMap<BoardCollaborator, BoardCollaboratorDto>().ReverseMap();
            //CreateMap<BoardRole, BoardRoleDto>().ReverseMap();
            CreateMap<Team, TeamDto>().ReverseMap();
            CreateMap<TeamUser, TeamUserDto>().ReverseMap();

            CreateMap<Illustration, IllustrationDto>()
            // entity -> dto
			.ForMember(d => d.SceneGraphData, o => o.MapFrom(s => s.CanvasData))
            .ForMember(d => d.Team, o => o.Ignore())
            .ForMember(d => d.Preferences, o => o.Ignore())
            .ForMember(d => d.Project, o => o.Ignore())
            .ForMember(d => d.Permissions, o => o.Ignore())
            .ForMember(d => d.CreatedBy, o => o.Ignore())
            .ForMember(d => d.ModifiedBy, o => o.Ignore())
            .ReverseMap()
            // dto -> entity
            .ForMember(d => d.CanvasData, o => o.MapFrom(s => s.SceneGraphData))
            .ForMember(d => d.Team, o => o.Ignore())
            .ForMember(d => d.Preferences, o => o.Ignore())
            .ForMember(d => d.Project, o => o.Ignore())
            .ForMember(d => d.Permissions, o => o.Ignore())
            .ForMember(d => d.CreatedBy, o => o.Ignore())
            .ForMember(d => d.ModifiedBy, o => o.Ignore())
            // don’t stomp existing values with nulls on updates
            .ForAllMembers(o => o.Condition((src, dest, srcMember) => srcMember != null));
        }
    }
}