using Frogmarks.Models;
using Frogmarks.Utilities;

namespace Frogmarks.Services
{
    public interface IUserService
    {
        Task<ApplicationUser> GetUserByEmailAsync(string email);
        Task<ApplicationUser> CreateUserAsync(ApplicationUser user, string password = null);
    }
}