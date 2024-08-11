using Frogmarks.Models;
using Frogmarks.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using System.Threading.Tasks;

public class UserService : IUserService
{
    private readonly UserManager<ApplicationUser> _userManager;

    public UserService(UserManager<ApplicationUser> userManager)
    {
        _userManager = userManager;
    }

    public async Task<ApplicationUser> GetUserByEmailAsync(string email)
    {
        return await _userManager.Users.SingleOrDefaultAsync(u => u.Email == email);
    }

    public async Task<ApplicationUser> CreateUserAsync(ApplicationUser user, string password = null)
    {
        var result = password != null
            ? await _userManager.CreateAsync(user, password)
            : await _userManager.CreateAsync(user);

        if (result.Succeeded)
        {
            return user;
        }
        return null;
    }
}