using AutoMapper;
using Duende.IdentityServer.Extensions;
using Frogmarks.Data;
using Frogmarks.Models;
using Frogmarks.Models.Dtos;
using Frogmarks.Models.Team;
using Frogmarks.Utilities;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Frogmarks.Services
{
    public class TeamService : ITeamService
    {
        private readonly ApplicationDbContext _context;
        private readonly IMapper _mapper;

        public TeamService(ApplicationDbContext context, IMapper mapper)
        {
            _context = context;
            _mapper = mapper;
        }

        // Get all teams
        public async Task<ResultModel<IEnumerable<TeamDto>>> GetAllTeams()
        {
            try
            {
                var teams = await _context.Teams.ToListAsync();
                return new ResultModel<IEnumerable<TeamDto>>(ResultType.Success, resultObject: _mapper.Map<List<TeamDto>>(teams));
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                return new ResultModel<IEnumerable<TeamDto>>(ResultType.Failure, ex.Message);
            }
        }

        // Get team by ID
        public async Task<ResultModel<TeamDto>> GetTeamById(long id)
        {
            try
            {
                var team = await _context.Teams.FindAsync(id);
                if (team == null)
                {
                    return new ResultModel<TeamDto>(ResultType.NotFound, "Team not found");
                }
                return new ResultModel<TeamDto>(ResultType.Success, resultObject: _mapper.Map<TeamDto>(team));
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                return new ResultModel<TeamDto>(ResultType.Failure, ex.Message);
            }
        }

        // Create a new team
        public async Task<ResultModel<TeamDto>> CreateTeam(Team team)
        {
            try
            {
                _context.Teams.Add(team);
                await _context.SaveChangesAsync();
                return new ResultModel<TeamDto>(ResultType.Success, resultObject: _mapper.Map<TeamDto>(team));
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                return new ResultModel<TeamDto>(ResultType.Failure, ex.Message);
            }
        }

        // Update an existing team
        public async Task<ResultModel<TeamDto>> UpdateTeam(Team team)
        {
            try
            {
                var existingTeam = await _context.Teams.FindAsync(team.Id);
                if (existingTeam == null)
                {
                    return new ResultModel<TeamDto>(ResultType.NotFound, "Team not found");
                }

                // Update team properties
                existingTeam.Name = team.Name;
                existingTeam.Description = team.Description;
                // Add other properties as needed

                _context.Teams.Update(existingTeam);
                await _context.SaveChangesAsync();
                return new ResultModel<TeamDto>(ResultType.Success, resultObject: _mapper.Map<TeamDto>(existingTeam));
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                return new ResultModel<TeamDto>(ResultType.Failure, ex.Message);
            }
        }

        // Delete a team
        public async Task<ResultModel<TeamDto>> DeleteTeam(long id)
        {
            try
            {
                var team = await _context.Teams.FindAsync(id);
                if (team == null)
                {
                    return new ResultModel<TeamDto>(ResultType.NotFound, "Team not found");
                }

                _context.Teams.Remove(team);
                await _context.SaveChangesAsync();
                return new ResultModel<TeamDto>(ResultType.Success, resultObject: _mapper.Map<TeamDto>(team));
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                return new ResultModel<TeamDto>(ResultType.Failure, ex.Message);
            }
        }

        // Search teams with filtering, sorting, and pagination
        public async Task<ResultModel<IEnumerable<TeamDto>>> SearchTeams(string filterQuery, string sortBy, string sortDirection, int pageIndex, int pageSize)
        {
            try
            {
                var query = _context.Teams.AsQueryable();

                // Filtering
                if (!string.IsNullOrEmpty(filterQuery))
                {
                    query = query.Where(t => t.Name.Contains(filterQuery) || t.Description.Contains(filterQuery));
                }

                // Sorting by sortBy
                switch (sortBy.ToLower())
                {
                    case "name":
                        query = query.OrderBy(t => t.Name);
                        break;
                    case "description":
                        query = query.OrderBy(t => t.Description);
                        break;
                    default:
                        query = query.OrderBy(t => t.Name);
                        break;
                }

                // Sorting by sortDirection
                switch (sortDirection.ToLower())
                {
                    case "asc":
                        // No change needed, already ordered by ascending in the first switch case
                        break;
                    case "desc":
                        query = sortBy.ToLower() switch
                        {
                            "name" => query.OrderByDescending(t => t.Name),
                            "description" => query.OrderByDescending(t => t.Description),
                            _ => query.OrderByDescending(t => t.Name)
                        };
                        break;
                    default:
                        // No change needed, already ordered by ascending in the first switch case
                        break;
                }

                // Pagination
                var result = await query.Skip(pageIndex * pageSize).Take(pageSize).ToListAsync();

                return new ResultModel<IEnumerable<TeamDto>>(ResultType.Success, resultObject: _mapper.Map<List<TeamDto>>(result));
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                return new ResultModel<IEnumerable<TeamDto>>(ResultType.Failure, ex.Message);
            }
        }

        public async Task<ResultModel<IEnumerable<TeamDto>>> GetTeamsByApplicationUserId(string userId)
        {
            try
            {
                List<Team> teams = await _context.TeamUsers.Include(x => x.Team)
                    .Where(tu => tu.ApplicationUserId == userId)
                    .Select(tu => tu.Team)
                    .ToListAsync();

                if (teams == null || !teams.Any())
                {
                    var userData = await _context.ApplicationUsers.FindAsync(userId);
                    if (userData != null)
                    {
                        // Create new default team  
                        var defaultTeam = new Team
                        {
                            Name = !string.IsNullOrEmpty(userData.FirstName) ? $"{userData.FirstName}'s Team" : "My Team",
                            Description = string.Empty
                        };

                        _context.Teams.Add(defaultTeam);
                        await _context.SaveChangesAsync(); // Ensure the team is saved and has an ID

                        // Create new TeamUser
                        var newTeamUser = new TeamUser
                        {
                            ApplicationUserId = userId,
                            TeamId = defaultTeam.Id // Use the ID of the saved team
                        };

                        _context.TeamUsers.Add(newTeamUser);
                        await _context.SaveChangesAsync();

                        teams.Add(defaultTeam);
                    }
                    else
                    {
                        return new ResultModel<IEnumerable<TeamDto>>(ResultType.Failure, "User does not exist.");
                    }
                }

                return new ResultModel<IEnumerable<TeamDto>>(ResultType.Success, resultObject: _mapper.Map<List<TeamDto>>(teams));
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                return new ResultModel<IEnumerable<TeamDto>>(ResultType.Failure, ex.Message);
            }
        }

    }
}