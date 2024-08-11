using AutoMapper;
using Frogmarks.Models.Board;

namespace Frogmarks.Data
{
    public class AutoMapperProfile : Profile
    {
        public AutoMapperProfile()
        {
            CreateMap<BoardDto, Board>()
                .ForMember(dest => dest.Team, opt => opt.Ignore()) // Ignore the Team property if needed
                .ReverseMap();
        }
    }
}