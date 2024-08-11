using Frogmarks.Models.Email;
using Frogmarks.Utilities;

namespace Frogmarks.Services
{
    public interface IEmailService
    {
        Task<ResultModel<string>> SendSignInEmail(string email);
        Task<ResultModel<string>> ValidateEmailToken(string token);
    }
}