using Frogmarks.Data;
using Frogmarks.Models;
using Frogmarks.Utilities;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Frogmarks.Services
{
    public class TeamUserService : ITeamUserService
    {
        private readonly ApplicationDbContext _context;

        public TeamUserService(ApplicationDbContext context)
        {
            _context = context;
        }

        // Get all TeamUsers
        public async Task<ResultModel<IEnumerable<TeamUser>>> GetAllTeamUsers()
        {
            try
            {
                var TeamUsers = await _context.TeamUsers.ToListAsync();
                return new ResultModel<IEnumerable<TeamUser>>(ResultType.Success, resultObject: TeamUsers);
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                return new ResultModel<IEnumerable<TeamUser>>(ResultType.Failure, ex.Message);
            }
        }

        // Get TeamUser by ID
        public async Task<ResultModel<TeamUser>> GetTeamUserById(long id)
        {
            try
            {
                var TeamUser = await _context.TeamUsers.FindAsync(id);
                if (TeamUser == null)
                {
                    return new ResultModel<TeamUser>(ResultType.NotFound, "TeamUser not found");
                }
                return new ResultModel<TeamUser>(ResultType.Success, resultObject: TeamUser);
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                return new ResultModel<TeamUser>(ResultType.Failure, ex.Message);
            }
        }

        // Create a new TeamUser
        public async Task<ResultModel<TeamUser>> CreateTeamUser(TeamUser TeamUser)
        {
            try
            {
                _context.TeamUsers.Add(TeamUser);
                await _context.SaveChangesAsync();
                return new ResultModel<TeamUser>(ResultType.Success, resultObject: TeamUser);
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                return new ResultModel<TeamUser>(ResultType.Failure, ex.Message);
            }
        }

        // Update an existing TeamUser
        public async Task<ResultModel<TeamUser>> UpdateTeamUser(TeamUser TeamUser)
        {
            try
            {
                var existingTeamUser = await _context.TeamUsers.FindAsync(TeamUser.Id);
                if (existingTeamUser == null)
                {
                    return new ResultModel<TeamUser>(ResultType.NotFound, "TeamUser not found");
                }

                // Update TeamUser properties
                //existingTeamUser.Name = TeamUser.Name;
                //existingTeamUser.Description = TeamUser.Description;
                // Add other properties as needed

                _context.TeamUsers.Update(existingTeamUser);
                await _context.SaveChangesAsync();
                return new ResultModel<TeamUser>(ResultType.Success, resultObject: existingTeamUser);
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                return new ResultModel<TeamUser>(ResultType.Failure, ex.Message);
            }
        }

        // Delete a TeamUser
        public async Task<ResultModel<TeamUser>> DeleteTeamUser(long id)
        {
            try
            {
                var TeamUser = await _context.TeamUsers.FindAsync(id);
                if (TeamUser == null)
                {
                    return new ResultModel<TeamUser>(ResultType.NotFound, "TeamUser not found");
                }

                _context.TeamUsers.Remove(TeamUser);
                await _context.SaveChangesAsync();
                return new ResultModel<TeamUser>(ResultType.Success, resultObject: TeamUser);
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                return new ResultModel<TeamUser>(ResultType.Failure, ex.Message);
            }
        }

        // Search TeamUsers with filtering, sorting, and pagination
        public async Task<ResultModel<IEnumerable<TeamUser>>> SearchTeamUsers(string filterQuery, string sortBy, string sortDirection, int pageIndex, int pageSize)
        {
            try
            {
                var query = _context.TeamUsers.Include(x => x.ApplicationUser).AsQueryable();

                // Filtering
                if (!string.IsNullOrEmpty(filterQuery))
                {
                    query = query.Where(t => t.ApplicationUser.FirstName.Contains(filterQuery));
                }

                // Sorting by sortBy
                switch (sortBy.ToLower())
                {
                    case "name":
                        query = query.OrderBy(t => t.ApplicationUser.FirstName);
                        break;
                    default:
                        query = query.OrderBy(t => t.ApplicationUser.FirstName);
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
                            "name" => query.OrderByDescending(t => t.ApplicationUser.FirstName),
                            _ => query.OrderByDescending(t => t.ApplicationUser.FirstName)
                        };
                        break;
                    default:
                        // No change needed, already ordered by ascending in the first switch case
                        break;
                }

                // Pagination
                var result = await query.Skip(pageIndex * pageSize).Take(pageSize).ToListAsync();

                return new ResultModel<IEnumerable<TeamUser>>(ResultType.Success, resultObject: result);
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                return new ResultModel<IEnumerable<TeamUser>>(ResultType.Failure, ex.Message);
            }
        }
    }
}